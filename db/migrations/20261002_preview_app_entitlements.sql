-- Preview access is explicit and separate from a tenant's research inventory.
-- A NULL tenant_id grants a staged app to all signed-in tenant users; a tenant
-- row grants it only to that organization. No access is granted by this migration.
begin;

create table if not exists public.preview_app_entitlements (
  id uuid primary key default gen_random_uuid(),
  package_name text not null check (length(package_name) between 3 and 200),
  tenant_id uuid references public.customers(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists preview_app_entitlements_global_unique
  on public.preview_app_entitlements (package_name) where tenant_id is null;
create unique index if not exists preview_app_entitlements_tenant_unique
  on public.preview_app_entitlements (tenant_id, package_name) where tenant_id is not null;
create index if not exists preview_app_entitlements_active_tenant
  on public.preview_app_entitlements (tenant_id, package_name) where enabled = true;

alter table public.preview_app_entitlements enable row level security;
revoke all on public.preview_app_entitlements from anon, authenticated;

commit;
