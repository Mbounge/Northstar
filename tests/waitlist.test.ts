import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NextRequest } from 'next/server';
import { parseWaitlist, readWaitlistBody, waitlistCsv } from '../lib/waitlist';
import { POST } from '../app/api/waitlist/route';
import { proxy } from '../proxy';

test('waitlist normalizes emails, rejects malformed input and keeps attribution bounded', () => {
  assert.deepEqual(parseWaitlist({email:'  Jane+Studio@EXAMPLE.COM ', source:'twitter'}), {email:'jane+studio@example.com',source:'twitter',bot:false});
  for(const email of ['bad', 'x@y', 'a b@example.com', 'a..b@example.com', '.a@example.com', 'a.@example.com', 'x'.repeat(65)+'@example.com', 'a@-example.com']) assert.equal(parseWaitlist({email}),null,email);
  assert.equal(parseWaitlist({email:'a@example.com',source:'<script>'})?.source,'direct');
  assert.equal(parseWaitlist({website:'https://bot.test'})?.bot,true);
});

test('body limit also rejects chunked input without Content-Length', async () => {
  const body = new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('x'.repeat(2049)));c.close();}});
  await assert.rejects(readWaitlistBody(new Request('https://example.test',{method:'POST',body,duplex:'half'} as RequestInit)));
});

test('CSV neutralizes spreadsheet formulas and quotes fields', () => {
  assert.match(waitlistCsv([{email:'+hello@example.com',created_at:'2026-10-22',source:'twitter'}]), /"'\+hello@example.com"/);
});

test('only exact waitlist routes bypass auth; adjacent private APIs stay protected', async () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    for(const path of ['/waitlist','/waitlist/privacy','/waitlist/opengraph-image','/api/waitlist','/northstar/demo/northstar-demo-20261026.mp4','/northstar/demo/northstar-demo-20261026-720p.mp4']) assert.equal((await proxy(new NextRequest('https://example.test'+path))).headers.get('x-middleware-next'),'1');
    for(const path of ['/api/waitlist/leak','/api/admin/waitlist','/canvas','/northstar/demo/private.mp4','/northstar/demo/northstar-demo-20261026.mp4/private']) assert.notEqual((await proxy(new NextRequest('https://example.test'+path))).headers.get('x-middleware-next'),'1');
  } finally { if(original)process.env.NEXT_PUBLIC_SUPABASE_URL=original; }
});

test('public endpoint is honest about storage failures and makes duplicates indistinguishable', async () => {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,fetch=globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-service-key';
  let result:unknown=true, status=200, calls=0;
  globalThis.fetch=async () => {calls++;return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}})};
  const req=(body:unknown,origin='https://example.test') => new Request('https://example.test/api/waitlist',{method:'POST',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
  try {
    assert.equal((await POST(req({email:'bad'}))).status,400);
    assert.equal((await POST(req({email:'a@example.com'},'https://evil.test'))).status,400);
    assert.equal(calls,0);
    const a=await POST(req({email:'a@example.com'})),b=await POST(req({email:'a@example.com'}));
    assert.equal(a.status,200);assert.deepEqual(await a.json(),await b.json());
    result=false;assert.equal((await POST(req({email:'a@example.com'}))).status,429);
    result={message:'synthetic unavailable database'};status=500;assert.equal((await POST(req({email:'a@example.com'}))).status,503);
    globalThis.fetch=async()=>{throw new Error('synthetic offline')};assert.equal((await POST(req({email:'a@example.com'}))).status,503);
  } finally {globalThis.fetch=fetch;if(url)process.env.NEXT_PUBLIC_SUPABASE_URL=url;else delete process.env.NEXT_PUBLIC_SUPABASE_URL;if(key)process.env.SUPABASE_SERVICE_ROLE_KEY=key;else delete process.env.SUPABASE_SERVICE_ROLE_KEY;}
});
