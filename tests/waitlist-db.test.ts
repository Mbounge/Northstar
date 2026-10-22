import assert from 'node:assert/strict';
import { execFile as callback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
const exec=promisify(callback), pg='/opt/homebrew/opt/postgresql@18/bin';
test('actual SQL: private table, service-only RPC, durable duplicates, atomic spam limit and idempotent migration', async () => {
 const dir=await mkdtemp('/tmp/northstar-waitlist-db-');let started=false;
 const query=async(sql:string)=>(await exec(path.join(pg,'psql'),['-h',dir,'-p','55481','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At','-c',sql])).stdout.trim();
 try {
  await exec(path.join(pg,'initdb'),['-D',dir+'/data','-U','postgres','-A','trust','--no-locale','-E','UTF8']);
  await exec(path.join(pg,'pg_ctl'),['-D',dir+'/data','-l',dir+'/log','-w','-o',`-k ${dir} -p 55481 -c listen_addresses='' -F`,'start']);started=true;
  await query('create role anon;create role authenticated;create role service_role;alter default privileges in schema public grant all on tables to anon,authenticated;');
  const migration=await readFile('db/migrations/20261022_northstar_waitlist.sql','utf8');await query(migration);await query(migration);
  for(const role of ['anon','authenticated']) {
   await assert.rejects(query(`set role ${role}; select * from public.northstar_waitlist`));
   await assert.rejects(query(`set role ${role}; select public.northstar_join_waitlist('a@example.com','direct',repeat('a',64))`));
   assert.equal(await query(`select has_table_privilege('${role}','public.northstar_waitlist','truncate')`),'f');
  }
  assert.match(await query(`set role service_role; select public.northstar_join_waitlist('a@example.com','twitter',repeat('a',64));select public.northstar_join_waitlist('a@example.com','video',repeat('a',64));`),/t\nt$/);
  assert.equal(await query('select count(*) from public.northstar_waitlist'),'1');
  assert.equal(await query("select source from public.northstar_waitlist where email='a@example.com'"),'twitter');
  const results=await Promise.all(Array.from({length:32},(_,i)=>query(`set role service_role;select public.northstar_join_waitlist('concurrent-${i}@example.com','direct',repeat('b',64))`)));
  assert.equal(results.filter(v=>v.endsWith('\nt')).length,30);assert.equal(results.filter(v=>v.endsWith('\nf')).length,2);
  assert.equal(await query("select count(*) from public.northstar_waitlist where email like 'concurrent-%'"),'30');
  await assert.rejects(query(`select public.northstar_join_waitlist('not email','direct',repeat('c',64))`));
  assert.equal(await query("select relrowsecurity from pg_class where oid='public.northstar_waitlist'::regclass"),'t');
 }finally{if(started)await exec(path.join(pg,'pg_ctl'),['-D',dir+'/data','-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
});
