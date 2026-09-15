-- Account-owned sessions. Snapshot blobs contain chat, canvas and media; no public URLs.
begin;
create table if not exists public.northstar_sessions (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null default 'Untitled canvas' check (length(title) between 1 and 120),
 updated_at timestamptz not null default now(), snapshot_path text, version bigint not null default 0,
 archived boolean not null default false, model text not null default 'gpt-5.6-luna', effort text not null default 'high',
 writer_id uuid, writer_until timestamptz
);
alter table public.northstar_sessions enable row level security;
create policy northstar_sessions_read on public.northstar_sessions for select to authenticated using (owner_id = auth.uid());
create policy northstar_sessions_insert on public.northstar_sessions for insert to authenticated with check (owner_id = auth.uid() and version = 0 and snapshot_path is null);
grant select, insert on public.northstar_sessions to authenticated;
revoke update, delete on public.northstar_sessions from authenticated, anon;
create index if not exists northstar_sessions_owner_updated on public.northstar_sessions(owner_id, updated_at desc);
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
 values ('northstar-sessions', 'northstar-sessions', false, 104857600, array['application/json']) on conflict(id) do nothing;
create policy northstar_snapshot_read on storage.objects for select to authenticated using (bucket_id = 'northstar-sessions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy northstar_snapshot_insert on storage.objects for insert to authenticated with check (bucket_id = 'northstar-sessions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy northstar_snapshot_delete on storage.objects for delete to authenticated using (bucket_id = 'northstar-sessions' and (storage.foldername(name))[1] = auth.uid()::text);
create or replace function public.northstar_session_lease(sid uuid, writer uuid, takeover boolean default false)
 returns boolean language plpgsql security definer set search_path = public as $$
begin
 update public.northstar_sessions set writer_id = writer, writer_until = now() + interval '45 seconds'
 where id = sid and owner_id = auth.uid() and (writer_id = writer or writer_until is null or writer_until < now() or takeover);
 return found;
end $$;
create or replace function public.northstar_session_save(sid uuid, writer uuid, expected_version bigint, path text, next_model text, next_effort text)
 returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
 if path is null or path not like auth.uid()::text || '/' || sid::text || '/%' then raise exception 'Invalid snapshot path'; end if;
 -- Retrying the same commit after a lost response is safe and does not increment twice.
 select version into v from public.northstar_sessions where id=sid and owner_id=auth.uid() and writer_id=writer and snapshot_path=path and version=expected_version+1;
 if v is not null then return v; end if;
 update public.northstar_sessions set snapshot_path = path, version = version + 1, updated_at = now(),
 model = next_model, effort = next_effort, writer_until = now() + interval '45 seconds'
 where id = sid and owner_id = auth.uid() and writer_id = writer and writer_until > now() and version = expected_version
 returning version into v;
 if v is null then raise exception 'Session changed in another tab. Reopen it to continue safely.'; end if;
 return v;
end $$;
create or replace function public.northstar_session_archive(sid uuid, value boolean)
 returns void language sql security definer set search_path = public as $$
 update public.northstar_sessions set archived = value where id = sid and owner_id = auth.uid();
$$;
revoke all on function public.northstar_session_lease(uuid,uuid,boolean), public.northstar_session_save(uuid,uuid,bigint,text,text,text), public.northstar_session_archive(uuid,boolean) from public;
grant execute on function public.northstar_session_lease(uuid,uuid,boolean), public.northstar_session_save(uuid,uuid,bigint,text,text,text), public.northstar_session_archive(uuid,boolean) to authenticated;
create or replace function public.northstar_session_release(sid uuid, writer uuid)
 returns void language sql security definer set search_path = public as $$
 update public.northstar_sessions set writer_id = null, writer_until = null where id = sid and owner_id = auth.uid() and writer_id = writer;
$$;
create or replace function public.northstar_session_rename(sid uuid, value text)
 returns void language sql security definer set search_path = public as $$
 update public.northstar_sessions set title = left(coalesce(nullif(trim(value),''),'Untitled canvas'),120) where id = sid and owner_id = auth.uid();
$$;
revoke all on function public.northstar_session_release(uuid,uuid), public.northstar_session_rename(uuid,text) from public;
grant execute on function public.northstar_session_release(uuid,uuid), public.northstar_session_rename(uuid,text) to authenticated;
commit;
