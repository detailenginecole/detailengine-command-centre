import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const a={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',slug:'shop-a',display_name:'Shop A'};
const b={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',slug:'shop-b',display_name:'Shop B'};
const compile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const identity={};new Function('exports',compile(await readFile(new URL('../app/lib/client-identity.ts',import.meta.url),'utf8')))(identity);
async function endpoint(name,rows=[a,b],upstreamClient=b,actor={id:'internal-user',email:'staff@getdetailengine.com',email_confirmed_at:'2026-09-12T00:00:00Z'},failureCount=0,failureStatus=504) {
 let handler;const calls=[];
 const fetch=async (input,options={})=>{
  const url=new URL(input);const body=options.body?JSON.parse(options.body):null;calls.push({url,method:options.method||'GET',body});
  if(url.pathname.endsWith('/client_notes') && failureCount-- > 0) return new Response('Temporary upstream failure',{status:failureStatus});
  let result=[];
  if(url.pathname==='/auth/v1/user')result=actor;
  else if(url.pathname.endsWith('/client_command_centre'))result=rows;
  else if(url.pathname.endsWith('/clients'))result=rows.filter(c=>'eq.'+c.id===url.searchParams.get('id'));
  else if(url.pathname.includes('/functions/'))result={client:upstreamClient};
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 const deno={env:{get:n=>({SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service',DETAILENGINE_SYNC_SECRET:'synthetic-sync'})[n]},serve:h=>{handler=h;}};
 const require=name=>name.includes('client-identity')?identity:{rgb:()=>({})};
 new Function('exports','require','Deno','fetch',compile(await readFile(new URL(`../supabase/functions/${name}/index.ts`,import.meta.url),'utf8')))({},require,deno,fetch);
 return {calls,run:(query='',body,headers={'x-detailengine-secret':'synthetic-sync',Authorization:'Bearer synthetic-user','Content-Type':'application/json'})=>handler(new Request('https://edge.example.test/?'+query,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}))};
}
test('data endpoint resolves UUID B and all selected-account queries retain B',async()=>{
 const e=await endpoint('command-centre-data-staging');const r=await e.run('client_id='+b.id);assert.equal(r.status,200);assert.equal((await r.json()).client.id,b.id);
 const scoped=e.calls.filter(c=>c.url.searchParams.has('client_id'));assert.ok(scoped.length>10);for(const c of scoped)assert.equal(c.url.searchParams.get('client_id'),'eq.'+b.id);
});
test('data endpoint rejects conflicting, unknown and ambiguous selections before loading details',async()=>{
 for(const [query,rows] of [['client_id='+b.id+'&slug='+a.slug,[a,b]],['client_id=cccccccc-cccc-4ccc-8ccc-cccccccccccc',[a,b]],['slug=shop-a',[a,{...b,slug:a.slug}]]]){
  const e=await endpoint('command-centre-data-staging',rows);assert.equal((await e.run(query)).status,404);assert.equal(e.calls.length,1);
 }
});
test('account writes use the submitted UUID, never a slug or default account',async()=>{
 const e=await endpoint('command-centre-admin-staging');assert.equal((await e.run('',{action:'add_note',client_id:b.id,body:'Synthetic note'})).status,201);
 const write=e.calls.find(c=>c.method==='POST'&&c.url.pathname.endsWith('/client_notes'));assert.equal(write.body.client_id,b.id);
 for(const body of [{client_slug:a.slug},{client_id:b.id,client_slug:a.slug},{client_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}]){
  const denied=await endpoint('command-centre-admin-staging');assert.ok((await denied.run('',{action:'add_note',body:'Synthetic note',...body})).status>=400);assert.equal(denied.calls.filter(c=>c.method!=='GET').length,0);
 }
});
test('reports require a UUID and reject an upstream response for another client',async()=>{
 const e=await endpoint('command-centre-report-staging');assert.equal((await e.run('slug=shop-a')).status,400);assert.equal(e.calls.length,0);
 assert.equal((await e.run('client_id='+a.id)).status,502);assert.equal(e.calls[0].url.searchParams.get('client_id'),a.id);
});

test('reports accept verified internal sessions without a proxy sync secret',async()=>{
 for(const name of ['command-centre-report-staging','command-centre-report']){
  const e=await endpoint(name);
  const result=await e.run('client_id='+a.id,undefined,{Authorization:'Bearer synthetic-user'});
  assert.equal(result.status,502); // Verified user reaches the existing wrong-account guard.
  assert.equal(e.calls[0].url.pathname,'/auth/v1/user');
  assert.equal(e.calls[1].url.searchParams.get('client_id'),a.id);
 }
});
test('reports deny missing, unconfirmed and outside-domain sessions before reading client data',async()=>{
 for(const actor of [{},{id:'outside',email:'staff@another.test',email_confirmed_at:'2026-09-12'}, {id:'unconfirmed',email:'staff@getdetailengine.com'}]){
  const e=await endpoint('command-centre-report',undefined,undefined,actor);
  assert.equal((await e.run('client_id='+a.id,undefined,{Authorization:'Bearer synthetic-user'})).status,401);
  assert.equal(e.calls.length,1);
 }
 const missing=await endpoint('command-centre-report');
 assert.equal((await missing.run('client_id='+a.id,undefined,{})).status,401);
 assert.equal(missing.calls.length,0);
});

test('transient read failures retry exactly once with the same client ID',async()=>{
 const e=await endpoint('command-centre-data-production',undefined,undefined,undefined,1);
 assert.equal((await e.run('client_id='+b.id)).status,200);
 const reads=e.calls.filter(c=>c.url.pathname.endsWith('/client_notes'));
 assert.equal(reads.length,2);assert.equal(reads[0].url.href,reads[1].url.href);
 assert.equal(reads[1].url.searchParams.get('client_id'),'eq.'+b.id);
 for(const [count,status,expectedReads] of [[3,504,2],[3,403,1]]){
  const failed=await endpoint('command-centre-data-production',undefined,undefined,undefined,count,status);
  assert.equal((await failed.run('client_id='+b.id)).status,500);
  assert.equal(failed.calls.filter(c=>c.url.pathname.endsWith('/client_notes')).length,expectedReads);
 }
});
