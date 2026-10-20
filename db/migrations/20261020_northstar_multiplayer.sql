-- Shared canvas truth is a durable, guarded operation log. Presence is never
-- authoritative and never contains document/media payloads.
begin;
create extension if not exists pgcrypto with schema extensions;

create table public.northstar_canvas_rooms (
 session_id uuid primary key references public.northstar_sessions(id) on delete cascade,
 version bigint not null default 0,
 seed jsonb not null,
 created_at timestamptz not null default now()
);
create table public.northstar_canvas_members (
 session_id uuid not null references public.northstar_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('viewer','editor')),
 display_name text not null check(length(display_name) between 1 and 48),
 joined_at timestamptz not null default now(), primary key(session_id,user_id)
);
create table public.northstar_canvas_cells (
 session_id uuid not null references public.northstar_canvas_rooms(session_id) on delete cascade,
 key text not null check(length(key) between 1 and 600), value text not null,
 version bigint not null default 0, primary key(session_id,key)
);
create table public.northstar_canvas_operations (
 session_id uuid not null references public.northstar_canvas_rooms(session_id) on delete cascade,
 version bigint not null, operation_id uuid not null, client_id uuid not null,
 actor_id uuid not null references auth.users(id), changes jsonb not null,
 label text not null, created_at timestamptz not null default now(),
 primary key(session_id,version), unique(session_id,operation_id)
);
create table public.northstar_canvas_claims (
 session_id uuid not null references public.northstar_canvas_rooms(session_id) on delete cascade,
 object_id text not null check(length(object_id) between 1 and 600),
 user_id uuid not null references auth.users(id), client_id uuid not null,
 expires_at timestamptz not null, primary key(session_id,object_id)
);
create table public.northstar_canvas_invites (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.northstar_canvas_rooms(session_id) on delete cascade,
 token_hash text not null unique, role text not null check(role in ('viewer','editor')),
 expires_at timestamptz not null default now()+interval '7 days', revoked boolean not null default false,
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);

create function public.northstar_canvas_access(sid uuid, editing boolean default false)
 returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(
  select 1 from public.northstar_sessions s where s.id=sid and
   (s.owner_id=auth.uid() or exists(select 1 from public.northstar_canvas_members m where m.session_id=sid and m.user_id=auth.uid() and (not editing or m.role='editor')))
 );
$$;
revoke all on function public.northstar_canvas_access(uuid,boolean) from public,anon;
grant execute on function public.northstar_canvas_access(uuid,boolean) to authenticated;

alter table public.northstar_canvas_rooms enable row level security;
alter table public.northstar_canvas_members enable row level security;
alter table public.northstar_canvas_cells enable row level security;
alter table public.northstar_canvas_operations enable row level security;
alter table public.northstar_canvas_claims enable row level security;
alter table public.northstar_canvas_invites enable row level security;
create policy canvas_rooms_read on public.northstar_canvas_rooms for select to authenticated using(public.northstar_canvas_access(session_id));
create policy canvas_members_read on public.northstar_canvas_members for select to authenticated using(public.northstar_canvas_access(session_id));
create policy canvas_cells_read on public.northstar_canvas_cells for select to authenticated using(public.northstar_canvas_access(session_id));
create policy canvas_operations_read on public.northstar_canvas_operations for select to authenticated using(public.northstar_canvas_access(session_id));
create policy canvas_claims_read on public.northstar_canvas_claims for select to authenticated using(public.northstar_canvas_access(session_id));
create policy canvas_invites_read on public.northstar_canvas_invites for select to authenticated using(exists(select 1 from public.northstar_sessions s where s.id=session_id and s.owner_id=auth.uid()));
-- Hosted defaults may grant TRUNCATE, which bypasses row-level security.
-- Only the guarded functions may write; clear every inherited table grant.
revoke all on public.northstar_canvas_rooms,public.northstar_canvas_members,public.northstar_canvas_cells,public.northstar_canvas_operations,public.northstar_canvas_claims,public.northstar_canvas_invites from public,anon,authenticated;
grant select on public.northstar_canvas_rooms,public.northstar_canvas_members,public.northstar_canvas_cells,public.northstar_canvas_operations,public.northstar_canvas_claims,public.northstar_canvas_invites to authenticated;
create policy northstar_sessions_member_read on public.northstar_sessions for select to authenticated using(public.northstar_canvas_access(id));
-- Legacy snapshot blobs contain the owner's private chat and drafts.
-- Members read shared cells only; Storage keeps its existing owner-only policy.

create function public.northstar_canvas_encode_id(input text)
 returns text language plpgsql immutable set search_path='' as $$
declare bytes bytea=convert_to(input,'UTF8'); result text=''; i integer; code integer;
begin
 for i in 0..length(bytes)-1 loop
  code=get_byte(bytes,i);
  if code between 65 and 90 or code between 97 and 122 or code between 48 and 57 or code in (45,46,95,126) then result=result||chr(code);
  else result=result||'%'||upper(lpad(to_hex(code),2,'0')); end if;
 end loop;
 return result;
end $$;
create function public.northstar_canvas_validate(sid uuid)
 returns void language plpgsql security definer set search_path='' as $$
declare item record; parts jsonb; segment jsonb; target text; edges jsonb='[]'; node_count integer; visited_count integer; invalid boolean;
begin
 if (select count(*) from public.northstar_canvas_cells where session_id=sid and key in ('document:html','document:css','document:javascript'))<>3 then raise exception 'Missing shared document fields'; end if;
 for item in select key,value from public.northstar_canvas_cells where session_id=sid and (key='document:html' or key like 'node:%:body') loop
  parts=item.value::jsonb;
  if jsonb_typeof(parts) is distinct from 'array' or jsonb_array_length(parts)>100000 then raise exception 'Invalid shared object contents'; end if;
  for segment in select value from jsonb_array_elements(parts) loop
   if jsonb_typeof(segment)='string' then continue; end if;
   if jsonb_typeof(segment) is distinct from 'object' or jsonb_typeof(segment->'ref') is distinct from 'string' or (select count(*) from jsonb_object_keys(segment))<>1 or length(segment->>'ref') not between 1 and 256 then raise exception 'Invalid shared object reference'; end if;
   target='node:'||public.northstar_canvas_encode_id(segment->>'ref')||':';
   if (select count(*) from public.northstar_canvas_cells where session_id=sid and key in (target||'open',target||'body',target||'close'))<>3 then raise exception 'Incomplete shared object reference'; end if;
   edges=edges||jsonb_build_array(jsonb_build_object('from',item.key,'to',target||'body'));
  end loop;
 end loop;
 if exists(select 1 from jsonb_array_elements(edges) group by value->>'to' having count(*)>1) then raise exception 'Duplicate shared object reference'; end if;
 select count(*) into node_count from public.northstar_canvas_cells where session_id=sid and key like 'node:%:body';
 with recursive walk(key,path,cycle) as (
  select 'document:html'::text,array['document:html']::text[],false
  union all select edge->>'to',walk.path||(edge->>'to'),edge->>'to'=any(walk.path)
  from walk cross join jsonb_array_elements(edges) edge
  where edge->>'from'=walk.key and not walk.cycle and cardinality(walk.path)<=129
 ) select count(distinct key) filter(where key<>'document:html'),coalesce(bool_or(cycle or cardinality(path)>129),false) into visited_count,invalid from walk;
 if invalid or visited_count<>node_count then raise exception 'Cyclic or orphaned shared object hierarchy'; end if;
 if (select count(*) from public.northstar_canvas_cells where session_id=sid and key like 'node:%')<>node_count*3 then raise exception 'Incomplete shared object'; end if;
 if jsonb_typeof((select value::jsonb from public.northstar_canvas_cells where session_id=sid and key='document:javascript')) not in ('string','null') then raise exception 'Invalid shared script'; end if;
 for item in select key,value from public.northstar_canvas_cells where session_id=sid and key like 'evidence:%' loop
  parts=item.value::jsonb;
  if jsonb_typeof(parts) is distinct from 'object' or jsonb_typeof(parts->'id') is distinct from 'string' or jsonb_typeof(parts->'url') is distinct from 'string' or item.key<>'evidence:'||public.northstar_canvas_encode_id(parts->>'id') then raise exception 'Invalid shared evidence'; end if;
 end loop;
end $$;
revoke all on function public.northstar_canvas_validate(uuid),public.northstar_canvas_encode_id(text) from public,anon,authenticated;

create function public.northstar_canvas_read(sid uuid)
 returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.northstar_canvas_access(sid) then raise exception 'Canvas access denied' using errcode='42501'; end if;
 -- One statement provides a consistent cells+sequence snapshot.
 select jsonb_build_object('version',r.version,'seed',r.seed,'cells',coalesce((select jsonb_object_agg(c.key,c.value) from public.northstar_canvas_cells c where c.session_id=sid),'{}'::jsonb),
  'ownerId',s.owner_id,'role',case when s.owner_id=auth.uid() then 'owner' else (select m.role from public.northstar_canvas_members m where m.session_id=sid and m.user_id=auth.uid()) end,
  'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'name',m.display_name,'role',m.role)) from public.northstar_canvas_members m where m.session_id=sid),'[]'::jsonb)) into result
 from public.northstar_canvas_rooms r join public.northstar_sessions s on s.id=r.session_id where r.session_id=sid;
 return result;
end $$;

create function public.northstar_canvas_enable(sid uuid, initial_cells jsonb, initial_seed jsonb)
 returns jsonb language plpgsql security definer set search_path = '' as $$
declare item record;
begin
 perform 1 from public.northstar_sessions where id=sid and owner_id=auth.uid() for update;
 if not found then raise exception 'Only the owner can enable collaboration' using errcode='42501'; end if;
 if not exists(select 1 from public.northstar_canvas_rooms where session_id=sid) then
  if jsonb_typeof(initial_cells) is distinct from 'object' or (select count(*) from jsonb_object_keys(initial_cells))>10000 or octet_length(initial_cells::text)>125000000 then raise exception 'Invalid initial canvas'; end if;
  if not initial_cells ? 'document:html' or not initial_cells ? 'document:css' then raise exception 'Missing shared document'; end if;
  if jsonb_typeof(initial_seed) is distinct from 'object' or octet_length(initial_seed::text)>1000000 then raise exception 'Invalid shared metadata'; end if;
  insert into public.northstar_canvas_rooms(session_id,seed) values(sid,initial_seed);
  for item in select key,value from jsonb_each(initial_cells) loop
   if jsonb_typeof(item.value) is distinct from 'string' or length(item.key)>600 or item.key!~'^(document:(html|css|javascript)|node:[^:]+:(open|body|close)|evidence:[^:]+)$' then raise exception 'Invalid shared cell'; end if;
   insert into public.northstar_canvas_cells(session_id,key,value) values(sid,item.key,item.value#>>'{}');
  end loop;
  perform public.northstar_canvas_validate(sid);
  insert into public.northstar_canvas_members(session_id,user_id,role,display_name) values(sid,auth.uid(),'editor',left(coalesce(nullif(auth.jwt()->'user_metadata'->>'full_name',''),nullif(auth.jwt()->'user_metadata'->>'name',''),'You'),48));
 end if;
 return public.northstar_canvas_read(sid);
end $$;

create function public.northstar_canvas_commit(sid uuid, oid uuid, cid uuid, edits jsonb, summary text)
 returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_version bigint; previous public.northstar_canvas_operations; change jsonb; stored text; conflicts jsonb='[]'; next_version bigint; object_name text;
begin
 select version into current_version from public.northstar_canvas_rooms where session_id=sid for update;
 -- Check again after acquiring the room lock, including membership revocation.
 if current_version is null or not public.northstar_canvas_access(sid,true) then raise exception 'Canvas editing access denied' using errcode='42501'; end if;
 select * into previous from public.northstar_canvas_operations where session_id=sid and operation_id=oid;
 if found then
  if previous.actor_id<>auth.uid() or previous.client_id<>cid or previous.changes<>edits or previous.label<>left(coalesce(summary,'Edited canvas'),160) then raise exception 'Operation identity was reused'; end if;
  return jsonb_build_object('ok',true,'version',previous.version);
 end if;
 if jsonb_typeof(edits) is distinct from 'array' or jsonb_array_length(edits) not between 1 and 5000 or octet_length(edits::text)>35000000 then raise exception 'Invalid collaborative edit'; end if;
 if (select count(distinct value->>'key') from jsonb_array_elements(edits))<>jsonb_array_length(edits) then raise exception 'Duplicate edit fields'; end if;
 for change in select value from jsonb_array_elements(edits) loop
  if jsonb_typeof(change->'key') is distinct from 'string' or length(change->>'key')>600 or change->>'key'!~'^(document:(html|css|javascript)|node:[^:]+:(open|body|close)|evidence:[^:]+)$'
   or not change ? 'before' or not change ? 'after' or jsonb_typeof(change->'after') not in ('string','null')
   or (jsonb_typeof(change->'before')<>'null' and (jsonb_typeof(change->'before') is distinct from 'string' or change->>'before'!~'^[a-f0-9]{64}$')) then raise exception 'Invalid collaborative field'; end if;
  select value into stored from public.northstar_canvas_cells where session_id=sid and key=change->>'key';
  if (case when stored is null then null else encode(extensions.digest(convert_to(stored,'UTF8'),'sha256'),'hex') end) is distinct from change->>'before' then conflicts=conflicts||jsonb_build_array(change->>'key'); end if;
  -- Cell identity is URI-encoded. Claims use exactly this encoded identity.
  object_name=substring(change->>'key' from '^node:([^:]+):');
  if object_name is not null and exists(select 1 from public.northstar_canvas_claims c where c.session_id=sid and c.object_id=object_name and c.expires_at>clock_timestamp() and (c.user_id<>auth.uid() or c.client_id<>cid)) then conflicts=conflicts||jsonb_build_array(change->>'key'); end if;
 end loop;
 if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts,'version',current_version); end if;
 next_version=current_version+1;
 for change in select value from jsonb_array_elements(edits) loop
  if jsonb_typeof(change->'after')='null' then delete from public.northstar_canvas_cells where session_id=sid and key=change->>'key';
  else insert into public.northstar_canvas_cells(session_id,key,value,version) values(sid,change->>'key',change->>'after',next_version) on conflict(session_id,key) do update set value=excluded.value,version=excluded.version; end if;
 end loop;
 perform public.northstar_canvas_validate(sid);
 insert into public.northstar_canvas_operations(session_id,version,operation_id,client_id,actor_id,changes,label) values(sid,next_version,oid,cid,auth.uid(),edits,left(coalesce(summary,'Edited canvas'),160));
 update public.northstar_canvas_rooms set version=next_version where session_id=sid;
 update public.northstar_sessions set updated_at=now() where id=sid;
 return jsonb_build_object('ok',true,'version',next_version);
end $$;

create function public.northstar_canvas_operations_since(sid uuid, since_version bigint)
 returns jsonb language plpgsql security definer set search_path = '' as $$
begin
 if not public.northstar_canvas_access(sid) then raise exception 'Canvas access denied' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.operation_id,'clientId',o.client_id,'actorId',o.actor_id,'version',o.version,'changes',o.changes,'label',o.label) order by o.version) from (select * from public.northstar_canvas_operations where session_id=sid and version>since_version order by version limit 100) o),'[]'::jsonb);
end $$;

create function public.northstar_canvas_claim(sid uuid,cid uuid,objects text[])
 returns jsonb language plpgsql security definer set search_path = '' as $$
declare object_name text; busy jsonb='[]';
begin
 perform 1 from public.northstar_canvas_rooms where session_id=sid for update;
 if not public.northstar_canvas_access(sid,true) then raise exception 'Canvas editing access denied' using errcode='42501'; end if;
 if coalesce(array_length(objects,1),0)>100 then raise exception 'Select fewer objects'; end if;
 delete from public.northstar_canvas_claims where session_id=sid and user_id=auth.uid() and client_id=cid and not(object_id=any(objects));
 foreach object_name in array objects loop
  if length(object_name) not between 1 and 600 then raise exception 'Invalid object'; end if;
  insert into public.northstar_canvas_claims(session_id,object_id,user_id,client_id,expires_at) values(sid,object_name,auth.uid(),cid,clock_timestamp()+interval '20 seconds')
   on conflict(session_id,object_id) do update set user_id=excluded.user_id,client_id=excluded.client_id,expires_at=excluded.expires_at
   where public.northstar_canvas_claims.expires_at<clock_timestamp() or (public.northstar_canvas_claims.user_id=auth.uid() and public.northstar_canvas_claims.client_id=cid);
  if not found then busy=busy||jsonb_build_array(object_name); end if;
 end loop;
 return jsonb_build_object('busy',busy);
end $$;

create function public.northstar_canvas_invite(sid uuid,access_role text)
 returns jsonb language plpgsql security definer set search_path = '' as $$
declare token text; invite_id uuid;
begin
 if not exists(select 1 from public.northstar_sessions where id=sid and owner_id=auth.uid()) then raise exception 'Only the owner can invite teammates' using errcode='42501'; end if;
 if access_role not in ('viewer','editor') then raise exception 'Invalid role'; end if;
 token=encode(extensions.gen_random_bytes(32),'hex');
 insert into public.northstar_canvas_invites(session_id,token_hash,role,created_by) values(sid,encode(extensions.digest(token,'sha256'),'hex'),access_role,auth.uid()) returning id into invite_id;
 return jsonb_build_object('id',invite_id,'token',token);
end $$;
create function public.northstar_canvas_join(token text)
 returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.northstar_canvas_invites;
begin
 if auth.uid() is null then raise exception 'Sign in to join this canvas' using errcode='42501'; end if;
 if length(token)<>64 then raise exception 'Invalid invitation'; end if;
 select * into invitation from public.northstar_canvas_invites where token_hash=encode(extensions.digest(token,'sha256'),'hex') and not revoked and expires_at>now() for update;
 if not found then raise exception 'This invitation expired or was revoked'; end if;
 -- Reopening a viewer link never downgrades an existing editor membership.
 insert into public.northstar_canvas_members(session_id,user_id,role,display_name) values(invitation.session_id,auth.uid(),invitation.role,left(coalesce(nullif(auth.jwt()->'user_metadata'->>'full_name',''),nullif(auth.jwt()->'user_metadata'->>'name',''),'Teammate'),48))
 on conflict(session_id,user_id) do update set role=case when excluded.role='editor' then 'editor' else public.northstar_canvas_members.role end;
 return invitation.session_id;
end $$;
create function public.northstar_canvas_remove_member(sid uuid,member_id uuid)
 returns void language plpgsql security definer set search_path = '' as $$
begin
 perform 1 from public.northstar_canvas_rooms where session_id=sid for update;
 if not exists(select 1 from public.northstar_sessions where id=sid and owner_id=auth.uid() and owner_id<>member_id) then raise exception 'Only the owner can remove teammates' using errcode='42501'; end if;
 update public.northstar_canvas_invites set revoked=true where session_id=sid;
 delete from public.northstar_canvas_members where session_id=sid and user_id=member_id;
 delete from public.northstar_canvas_claims where session_id=sid and user_id=member_id;
end $$;
create function public.northstar_canvas_revoke_invite(sid uuid,invite_id uuid)
 returns void language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.northstar_sessions where id=sid and owner_id=auth.uid()) then raise exception 'Only the owner can manage invitations' using errcode='42501'; end if;
 update public.northstar_canvas_invites set revoked=true where id=invite_id and session_id=sid;
end $$;

-- Managed Realtime already owns/enables RLS on realtime.messages. Notifications
-- contain only room sequence numbers; clients fetch document ops under fresh RLS.
create policy northstar_canvas_presence_read on realtime.messages for select to authenticated using(
 extension in ('presence','broadcast') and realtime.topic() like 'northstar-canvas:%' and public.northstar_canvas_access(case when substring(realtime.topic() from 18) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substring(realtime.topic() from 18)::uuid end)
);
create policy northstar_canvas_presence_write on realtime.messages for insert to authenticated with check(
 extension in ('presence','broadcast') and realtime.topic() like 'northstar-canvas:%' and public.northstar_canvas_access(case when substring(realtime.topic() from 18) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then substring(realtime.topic() from 18)::uuid end)
);

revoke all on function public.northstar_canvas_read(uuid),public.northstar_canvas_enable(uuid,jsonb,jsonb),public.northstar_canvas_commit(uuid,uuid,uuid,jsonb,text),public.northstar_canvas_operations_since(uuid,bigint),public.northstar_canvas_claim(uuid,uuid,text[]),public.northstar_canvas_invite(uuid,text),public.northstar_canvas_join(text),public.northstar_canvas_remove_member(uuid,uuid),public.northstar_canvas_revoke_invite(uuid,uuid) from public,anon;
grant execute on function public.northstar_canvas_read(uuid),public.northstar_canvas_enable(uuid,jsonb,jsonb),public.northstar_canvas_commit(uuid,uuid,uuid,jsonb,text),public.northstar_canvas_operations_since(uuid,bigint),public.northstar_canvas_claim(uuid,uuid,text[]),public.northstar_canvas_invite(uuid,text),public.northstar_canvas_join(text),public.northstar_canvas_remove_member(uuid,uuid),public.northstar_canvas_revoke_invite(uuid,uuid) to authenticated;
commit;
