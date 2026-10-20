-- Personal chat belongs to the authenticated person, even on a shared canvas.
-- Requires 20261020_northstar_multiplayer.sql. Blobs retain the existing
-- owner-only Storage policies; no member gets another person's history.
begin;
create table public.northstar_canvas_private_workspaces (
 session_id uuid not null references public.northstar_canvas_rooms(session_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 version bigint not null default 0,
 snapshot_path text,
 updated_at timestamptz not null default now(),
 primary key(session_id,user_id)
);
alter table public.northstar_canvas_private_workspaces enable row level security;
create policy canvas_private_workspace_read on public.northstar_canvas_private_workspaces
 for select to authenticated using(user_id=auth.uid() and public.northstar_canvas_access(session_id));
-- Clear hosted default grants, including TRUNCATE (not covered by RLS).
revoke all on public.northstar_canvas_private_workspaces from public,anon,authenticated;
grant select on public.northstar_canvas_private_workspaces to authenticated;

create function public.northstar_canvas_private_read(sid uuid)
 returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not public.northstar_canvas_access(sid) then raise exception 'Canvas access denied'; end if;
 select jsonb_build_object('version',w.version,'path',w.snapshot_path,'updatedAt',w.updated_at)
 into result from public.northstar_canvas_private_workspaces w
 where w.session_id=sid and w.user_id=auth.uid();
 return result;
end;
$$;

create function public.northstar_canvas_private_save(sid uuid,expected_version bigint,path text)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare current_record public.northstar_canvas_private_workspaces;
begin
 -- Match the document/removal lock order; reauthorize after waiting.
 perform 1 from public.northstar_canvas_rooms r where r.session_id=sid for update;
 if not found or not public.northstar_canvas_access(sid) then raise exception 'Canvas access denied'; end if;
 if expected_version is null or expected_version<0 then raise exception 'Invalid private history version'; end if;
 if path is null or path !~ ('^'||auth.uid()::text||'/'||sid::text||'/private/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$') then
  raise exception 'Invalid private history path';
 end if;
 insert into public.northstar_canvas_private_workspaces(session_id,user_id) values(sid,auth.uid()) on conflict do nothing;
 select * into current_record from public.northstar_canvas_private_workspaces w
 where w.session_id=sid and w.user_id=auth.uid() for update;
 if current_record.snapshot_path=path then
  return jsonb_build_object('ok',true,'version',current_record.version,'path',path);
 end if;
 if current_record.version<>expected_version then
  return jsonb_build_object('ok',false,'version',current_record.version,'path',current_record.snapshot_path);
 end if;
 update public.northstar_canvas_private_workspaces w
 set snapshot_path=path,version=w.version+1,updated_at=now()
 where w.session_id=sid and w.user_id=auth.uid()
 returning * into current_record;
 return jsonb_build_object('ok',true,'version',current_record.version,'path',path);
end;
$$;
revoke all on function public.northstar_canvas_private_read(uuid),public.northstar_canvas_private_save(uuid,bigint,text) from public,anon;
grant execute on function public.northstar_canvas_private_read(uuid),public.northstar_canvas_private_save(uuid,bigint,text) to authenticated;
commit;
