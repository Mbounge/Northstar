-- Read-only catalog verification. No user IDs, emails, tokens, private paths,
-- chat bodies or canvas source are returned. Run after both reviewed migrations.
with
table_names(name) as (values
 ('northstar_canvas_rooms'),('northstar_canvas_members'),('northstar_canvas_cells'),
 ('northstar_canvas_operations'),('northstar_canvas_claims'),('northstar_canvas_invites'),
 ('northstar_canvas_private_workspaces')
),
table_audit as (
 select t.name,c.oid is not null as present,coalesce(c.relrowsecurity,false) as rls,
  coalesce(has_table_privilege('authenticated',c.oid,'SELECT'),false) as authenticated_select,
  coalesce(has_table_privilege('anon',c.oid,'SELECT'),false) as anonymous_select,
  exists(select 1 from (values ('anon'),('authenticated')) roles(name)
   cross join (values ('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) privileges(name)
   where has_table_privilege(roles.name,c.oid,privileges.name)) as unsafe_effective_privilege,
  exists(select 1 from aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where a.grantee=0) as public_acl
 from table_names t left join pg_namespace n on n.nspname='public'
 left join pg_class c on c.relnamespace=n.oid and c.relname=t.name and c.relkind='r'
),
function_names(name,authenticated_execute,security_definer,reviewed_body_md5) as (values
 ('northstar_canvas_access',true,true,'fde714f0e22d3bf3b5191351dbd498fe'),('northstar_canvas_encode_id',false,false,'a6106a69293ac391bae7e645ec3d1680'),
 ('northstar_canvas_validate',false,true,'17d1bda809507fede795a66c46ec8824'),('northstar_canvas_read',true,true,'122867f3eef4ba3ceff55d13a7771b2f'),
 ('northstar_canvas_enable',true,true,'49d21ca473e133a877e518be6246ff92'),('northstar_canvas_commit',true,true,'42efc3cc83fb0f48e0a33a53fa222292'),
 ('northstar_canvas_operations_since',true,true,'afdbe0dd0e9ce605c365fde19b937fd5'),('northstar_canvas_claim',true,true,'f44075e1967f31ba11ace2edf7819311'),
 ('northstar_canvas_invite',true,true,'cd31c1e49a3c973d05abae174093961c'),('northstar_canvas_join',true,true,'a5a321b520457294b071d4f6bce4621c'),
 ('northstar_canvas_remove_member',true,true,'c6400df17a2981ba13ea95a07028ee73'),('northstar_canvas_revoke_invite',true,true,'33fe743fb17f96b8eb47ce75ed88a561'),
 ('northstar_canvas_private_read',true,true,'3175dc528cba7f86a0dd8250cc41ed2e'),('northstar_canvas_private_save',true,true,'7403078fd983016086f81f6c7d555b3f')
),
function_audit as (
 select f.name,p.oid is not null as present,
  pg_get_function_identity_arguments(p.oid) as arguments,p.prorettype::regtype::text as returns,
  p.proargnames as argument_names,p.prosecdef as security_definer,
  coalesce(p.proconfig @> array['search_path=""'],false) as fixed_empty_search_path,
  coalesce(has_function_privilege('anon',p.oid,'EXECUTE'),false) as anonymous_execute,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE'),false) as authenticated_execute,
  exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute,
  md5(p.prosrc) as body_md5,coalesce(md5(p.prosrc)=f.reviewed_body_md5,false) as reviewed_body,
  coalesce(p.prosecdef=f.security_definer,false) as expected_security_definer,
  coalesce(has_function_privilege('authenticated',p.oid,'EXECUTE')=f.authenticated_execute,false) as expected_authenticated_execute
 from function_names f left join pg_namespace n on n.nspname='public'
 left join pg_proc p on p.pronamespace=n.oid and p.proname=f.name
),
policy_names(schema_name,table_name,name) as (values
 ('public','northstar_canvas_rooms','canvas_rooms_read'),
 ('public','northstar_canvas_members','canvas_members_read'),
 ('public','northstar_canvas_cells','canvas_cells_read'),
 ('public','northstar_canvas_operations','canvas_operations_read'),
 ('public','northstar_canvas_claims','canvas_claims_read'),
 ('public','northstar_canvas_invites','canvas_invites_read'),
 ('public','northstar_canvas_private_workspaces','canvas_private_workspace_read'),
 ('public','northstar_sessions','northstar_sessions_member_read'),
 ('realtime','messages','northstar_canvas_presence_read'),
 ('realtime','messages','northstar_canvas_presence_write')
),
policy_audit as (
 select target.schema_name,target.table_name,target.name,p.policyname is not null as present,
  p.cmd,p.roles,p.permissive,md5(coalesce(p.qual,'')||'|'||coalesce(p.with_check,'')) as expression_md5
 from policy_names target left join pg_policies p on p.schemaname=target.schema_name and p.tablename=target.table_name and p.policyname=target.name
)
select jsonb_build_object(
 'knownContractReady',
  (select count(*)=7 and bool_and(present and rls and authenticated_select and not anonymous_select and not unsafe_effective_privilege and not public_acl) from table_audit)
  and (select count(*)=14 and bool_and(present and fixed_empty_search_path and not anonymous_execute and not public_execute and expected_security_definer and expected_authenticated_execute and reviewed_body) from function_audit)
  and (select count(*)=10 and bool_and(present) from policy_audit)
  and coalesce((select not public from storage.buckets where id='northstar-sessions'),false)
  and not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='northstar_snapshot_member_read'),
 'tables',(select jsonb_agg(to_jsonb(t) order by name) from table_audit t),
 'functions',(select jsonb_agg(to_jsonb(f) order by name,arguments) from function_audit f),
 'policies',(select jsonb_agg(to_jsonb(p) order by schema_name,table_name,name) from policy_audit p),
 'privateSnapshotBucket',coalesce((select not public from storage.buckets where id='northstar-sessions'),false),
 'legacySnapshotMemberPolicyAbsent',not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='northstar_snapshot_member_read'),
 'otherRealtimePoliciesRequiringReview',coalesce((select jsonb_agg(policyname order by policyname) from pg_policies where schemaname='realtime' and tablename='messages' and policyname not in ('northstar_canvas_presence_read','northstar_canvas_presence_write')),'[]'::jsonb),
 'otherStoragePoliciesRequiringReview',coalesce((select jsonb_agg(policyname order by policyname) from pg_policies where schemaname='storage' and tablename='objects' and policyname not in ('northstar_snapshot_read','northstar_snapshot_insert','northstar_snapshot_delete')),'[]'::jsonb)
) as verification;
