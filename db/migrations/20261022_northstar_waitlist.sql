-- Email-only public waitlist. No account or product access is granted here.
begin;
create table if not exists public.northstar_waitlist (
  email text primary key check (email = lower(btrim(email)) and length(email) between 3 and 254),
  source text not null default 'direct' check (source in ('direct', 'twitter', 'video')),
  created_at timestamptz not null default now()
);
create index if not exists northstar_waitlist_created on public.northstar_waitlist(created_at desc, email);
create table if not exists public.northstar_waitlist_rate_windows (
  client_key text not null check (length(client_key) = 64),
  window_start timestamptz not null,
  attempts integer not null default 0,
  primary key (client_key, window_start)
);
alter table public.northstar_waitlist enable row level security;
alter table public.northstar_waitlist_rate_windows enable row level security;
revoke all on public.northstar_waitlist, public.northstar_waitlist_rate_windows from public, anon, authenticated;
grant select on public.northstar_waitlist to service_role;

create or replace function public.northstar_join_waitlist(p_email text, p_source text, p_client_key text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare hits integer;
begin
  if p_email is null or p_email <> lower(btrim(p_email)) or length(p_email) > 254
    or length(split_part(p_email, '@', 1)) not between 1 and 64
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or p_source is null or p_source not in ('direct', 'twitter', 'video')
    or p_client_key is null or p_client_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid waitlist request' using errcode = '22023';
  end if;
  delete from public.northstar_waitlist_rate_windows where window_start < now() - interval '2 hours';
  insert into public.northstar_waitlist_rate_windows(client_key, window_start, attempts)
    values(p_client_key, date_trunc('hour', now()), 1)
    on conflict (client_key, window_start) do update
    set attempts = public.northstar_waitlist_rate_windows.attempts + 1
    returning attempts into hits;
  if hits > 30 then return false; end if;
  insert into public.northstar_waitlist(email, source) values (p_email, p_source)
    on conflict (email) do nothing;
  return true;
end;
$$;
revoke all on function public.northstar_join_waitlist(text, text, text) from public, anon, authenticated;
grant execute on function public.northstar_join_waitlist(text, text, text) to service_role;
commit;
