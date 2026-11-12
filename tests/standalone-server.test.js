import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createGameServer } from '../standalone/server.mjs';

async function fixture(t, fetchSession, serverOptions={}) {
  const root=await mkdtemp(join(tmpdir(),'monopoly-server-'));
  await mkdir(join(root,'games/monopoly'),{recursive:true});
  await mkdir(join(root,'games/monopoly-runtime/assets'),{recursive:true});
  await writeFile(join(root,'games/monopoly/index.html'),'<h1>game</h1>');
  await writeFile(join(root,'games/monopoly/app.js'),'export const game=true;');
  await writeFile(join(root,'games/monopoly-runtime/assets/scene.svg'),'<svg/>');
  const server=createGameServer({root,version:'test-release',fetchSession,...serverOptions});
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await rm(root,{recursive:true});});
  return Object.assign((path, options={})=>fetch(`http://127.0.0.1:${server.address().port}${path}`,{redirect:'manual',...options}),{root});
}

test('platform authenticated boolean gates all equivalent document paths',async t=>{
  const get=await fixture(t,async()=>Response.json({authenticated:false}));
  for(const path of ['/games/monopoly/?resume=1','/games/monopoly/index.html?resume=1','/games/monopoly/%69ndex.html?resume=1','/games/monopoly//index.html?resume=1']){
    const r=await get(path);
    assert.equal(r.status,302,path);
    assert.equal(r.headers.get('location'),'/login/?next=%2Fgames%2Fmonopoly%2F%3Fresume%3D1');
    assert.equal(r.headers.get('cache-control'),'no-store');
  }
});

test('a valid shared cookie is checked with the platform and never copied to the response',async t=>{
  let calls=0;
  const get=await fixture(t,async(url,opts)=>{
    calls++;
    assert.equal(url,'http://127.0.0.1:19321/api/auth/me');
    assert.equal(opts.headers.cookie,'__Host-vwa_session=fixture');
    assert.equal(opts.redirect,'error');
    return Response.json({authenticated:true});
  });
  const r=await get('/games/monopoly/',{headers:{cookie:'__Host-vwa_session=fixture'}});
  assert.equal(r.status,200); assert.equal(await r.text(),'<h1>game</h1>');
  assert.equal(r.headers.get('set-cookie'),null);
  assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.headers.get('x-game-release'),'test-release');
  const head=await get('/games/monopoly/app.js',{method:'HEAD'});
  assert.equal(head.status,200);assert.equal(await head.text(),'');
  assert.equal(head.headers.get('cache-control'),'no-cache');
  assert.equal(calls,1,'assets must not amplify auth traffic');
});

test('auth service errors fail closed without turning an outage into a logout',async t=>{
  for(const fetchSession of [async()=>{throw new Error('network');},async()=>new Response('bad',{status:500}),async()=>new Response('not JSON')]){
    const get=await fixture(t,fetchSession);
    const r=await get('/games/monopoly/');
    assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);
  }
});

test('the game server does not serve platform paths, traversal, or mutations',async t=>{
  const get=await fixture(t,async()=>Response.json({authenticated:true}));
  for(const path of ['/','/api/auth/me','/js/game.js','/games/monopoly/%2e%2e%2fserver.mjs','/games/monopoly/%5cindex.html','/games/monopoly/.env']) assert.equal((await get(path)).status,404,path);
  assert.equal((await get('/games/monopoly/%')).status,400);
  assert.equal((await get('/games/monopoly/',{method:'POST'})).status,405);
  const health=await get('/games/monopoly/health');
  assert.deepEqual(await health.json(),{service:'ximitu-card-hunt',status:'ok',version:'test-release'});
});

test('release hashes produce strong validators and unchanged GET or HEAD assets return bodyless 304',async t=>{
  const hash=body=>createHash('sha256').update(body).digest('hex');
  const assetHashes={
    '/games/monopoly/app.js':hash('export const game=true;'),
    '/games/monopoly-runtime/assets/scene.svg':hash('<svg/>'),
  };
  let authCalls=0;
  const get=await fixture(t,async()=>{authCalls++;throw new Error('assets do not require auth');},{assetHashes});
  for(const [path,digest] of Object.entries(assetHashes)) {
    const first=await get(path);
    assert.equal(first.status,200);
    assert.equal(first.headers.get('etag'),`"sha256-${digest}"`);
    assert.equal(first.headers.get('cache-control'),'no-cache');
    assert.ok((await first.text()).length>0);
    const etag=first.headers.get('etag');
    for(const method of ['GET','HEAD']) {
      for(const condition of [etag,`W/${etag}`,`"older-release", W/${etag}`,` W/${etag}, "older-release" `,'*']) {
        const hit=await get(path,{method,headers:{'if-none-match':condition}});
        assert.equal(hit.status,304,`${method} ${condition}`);
        assert.equal(await hit.text(),'');
        assert.equal(hit.headers.get('content-length'),null);
        assert.equal(hit.headers.get('etag'),etag);
        for(const name of ['cache-control','x-game-release','x-content-type-options','referrer-policy','x-frame-options','permissions-policy']) {
          assert.equal(hit.headers.get(name),first.headers.get(name),name);
        }
      }
    }
    const stale=await get(path,{headers:{'if-none-match':'"different-release"'}});
    assert.equal(stale.status,200);
    assert.equal(stale.headers.get('etag'),etag);
    assert.ok((await stale.text()).length>0);
    const head=await get(path,{method:'HEAD',headers:{'if-none-match':'"different-release"'}});
    assert.equal(head.status,200);
    assert.equal(await head.text(),'');
    assert.equal(head.headers.get('content-length'),first.headers.get('content-length'));
    assert.equal(head.headers.get('content-type'),first.headers.get('content-type'));
    assert.equal(head.headers.get('etag'),etag);
  }
  assert.equal(authCalls,0);
});

test('fixtures without release hashes use weak stat validators that change when an asset changes',async t=>{
  const get=await fixture(t,async()=>Response.json({authenticated:true}));
  const path='/games/monopoly/app.js';
  const first=await get(path);
  const firstTag=first.headers.get('etag');
  assert.match(firstTag,/^W\/"[^\"]+"$/);
  assert.equal(await first.text(),'export const game=true;');
  const hit=await get(path,{headers:{'if-none-match':firstTag.replace(/^W\//,'')}});
  assert.equal(hit.status,304,'GET uses weak comparison even if the client sends a strong form');
  assert.equal(hit.headers.get('content-length'),null);
  await writeFile(join(get.root,path),'export const game=null;');
  const updated=new Date(Date.now()+2000);
  await utimes(join(get.root,path),updated,updated);
  const changed=await get(path,{headers:{'if-none-match':firstTag}});
  assert.equal(changed.status,200);
  assert.notEqual(changed.headers.get('etag'),firstTag,'a same-size edit must invalidate the old response');
  assert.equal(await changed.text(),'export const game=null;');
  const missing=await get('/games/monopoly/missing.js',{headers:{'if-none-match':'*'}});
  assert.equal(missing.status,404,'a wildcard must not turn a nonexistent resource into a cache hit');
  assert.equal(missing.headers.get('etag'),null);
});

test('content hash validators survive a new release while changed content returns 200',async t=>{
  const path='/games/monopoly/app.js';
  const originalBody='export const game=true;';
  const changedBody='export const game=null;';
  const hash=body=>createHash('sha256').update(body).digest('hex');
  const auth=async()=>Response.json({authenticated:true});
  const original=await fixture(t,auth,{version:'release-one',assetHashes:{[path]:hash(originalBody)}});
  const first=await original(path);
  const etag=first.headers.get('etag');
  await first.text();
  const unchanged=await fixture(t,auth,{version:'release-two',assetHashes:{[path]:hash(originalBody)}});
  const reused=await unchanged(path,{headers:{'if-none-match':etag}});
  assert.equal(reused.status,304,'an unchanged asset need not download after deployment');
  assert.equal(reused.headers.get('etag'),etag);
  assert.equal(reused.headers.get('x-game-release'),'release-two');
  assert.equal(await reused.text(),'');
  const updated=await fixture(t,auth,{version:'release-three',assetHashes:{[path]:hash(changedBody)}});
  await writeFile(join(updated.root,path),changedBody);
  const changed=await updated(path,{headers:{'if-none-match':etag}});
  assert.equal(changed.status,200);
  assert.notEqual(changed.headers.get('etag'),etag);
  assert.equal(changed.headers.get('x-game-release'),'release-three');
  assert.equal(await changed.text(),changedBody);
});

test('document conditional requests still authenticate and never use static asset validators',async t=>{
  let authCalls=0;
  const get=await fixture(t,async()=>{authCalls++;return Response.json({authenticated:true});},{
    assetHashes:{'/games/monopoly/index.html':'a'.repeat(64)},
  });
  for(const method of ['GET','HEAD']) {
    const response=await get('/games/monopoly/',{method,headers:{'if-none-match':'*'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('etag'),null);
    assert.equal(response.headers.get('x-game-release'),'test-release');
    assert.equal(await response.text(),method==='HEAD'?'':'<h1>game</h1>');
  }
  const canonical=await get('/games/monopoly/index.html',{headers:{'if-none-match':'*'}});
  assert.equal(canonical.status,302);
  assert.equal(canonical.headers.get('cache-control'),'no-store');
  assert.equal(canonical.headers.get('etag'),null);
  assert.equal(authCalls,3);
  const anonymous=await fixture(t,async()=>Response.json({authenticated:false}));
  const redirected=await anonymous('/games/monopoly/',{headers:{'if-none-match':'*'}});
  assert.equal(redirected.status,302);
  assert.match(redirected.headers.get('location'),/^\/login\//);
  assert.equal(redirected.headers.get('etag'),null);
  const unavailable=await fixture(t,async()=>{throw new Error('auth down');});
  const failed=await unavailable('/games/monopoly/',{headers:{'if-none-match':'*'}});
  assert.equal(failed.status,503);
  assert.equal(failed.headers.get('cache-control'),'no-store');
  assert.equal(failed.headers.get('etag'),null);
});

test('health and private layout API responses remain uncached despite conditional headers',async t=>{
  const get=await fixture(t,async()=>Response.json({authenticated:false}));
  for(const path of ['/health','/games/monopoly/health']) {
    const response=await get(path,{headers:{'if-none-match':'*'}});
    assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'no-store');
    assert.equal(response.headers.get('etag'),null);
  }
  const privateResponse=await get('/games/monopoly/api/board-layouts/v1',{headers:{'if-none-match':'*'}});
  assert.equal(privateResponse.status,401);
  assert.equal(privateResponse.headers.get('cache-control'),'no-store');
  assert.equal(privateResponse.headers.get('etag'),null);
});
