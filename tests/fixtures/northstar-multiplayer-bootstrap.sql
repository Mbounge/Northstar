-- Disposable local PostgreSQL only. Minimal Supabase platform objects allow
-- production migrations and RLS to execute; this does not emulate Auth HTTP,
-- object storage bytes, JWT signing, or managed Realtime websocket behavior.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema storage;
create schema realtime;
create schema extensions;
create extension if not exists pgcrypto with schema extensions;

create table auth.users (id uuid primary key, email text unique);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt()->>'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt()->>'role'
$$;

create table storage.buckets (
  id text primary key, name text not null, public boolean not null default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text not null references storage.buckets(id),
  name text not null, owner uuid, metadata jsonb, unique(bucket_id, name)
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array($1, '/'))[1:array_length(string_to_array($1, '/'), 1)-1]
$$;

create table realtime.messages (
  id bigint generated always as identity primary key, topic text not null,
  extension text not null, payload jsonb, event text, private boolean default true
);
-- Supabase manages this table with RLS already enabled. A production migration
-- must add policies without trying to change managed table ownership or RLS.
alter table realtime.messages enable row level security;
create function realtime.topic() returns text language sql stable as $$
  select current_setting('realtime.topic', true)
$$;

grant usage on schema public, auth, storage, realtime, extensions to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant select, insert on realtime.messages to authenticated;
grant usage on sequence realtime.messages_id_seq to authenticated;

-- Existing Supabase projects may grant new public objects to API roles by
-- default. Exercise inherited privileges too; RLS does not guard TRUNCATE.
alter default privileges for role postgres in schema public grant all on tables to public,anon,authenticated;
alter default privileges for role postgres in schema public grant execute on functions to anon,authenticated;
