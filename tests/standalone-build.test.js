import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root=new URL('../dist/public/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('../dist/release.json',import.meta.url),'utf8'));
const read=path=>readFileSync(new URL('.'+path,root),'utf8');

test('every emitted module import resolves inside the isolated game artifact',()=>{
  let imports=0;
  for(const [path,hash] of Object.entries(manifest.files)){
    const bytes=readFileSync(new URL('.'+path,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,path);
    assert.match(path,/^\/games\/(monopoly|monopoly-runtime)\//);
    if(!path.endsWith('.js')) continue;
    const source=bytes.toString();
    for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)(["'])([^"']+)\1/g)){
      const specifier=match[2];
      if(!specifier.startsWith('.')&&!specifier.startsWith('/')) continue;
      const target=new URL(specifier,'http://game.local'+path).pathname;
      assert.ok(manifest.files[target],`${path} imports missing ${target}`);imports++;
    }
    assert.doesNotMatch(source,/\/games\/monopoly-runtime\/games\//);
  }
  assert.ok(imports>50,'must exercise the real module graph');
});

test('HTML assets, audio worklet and teacher die resolve at the deployed paths',()=>{
  const html=read('/games/monopoly/index.html');
  for(const match of html.matchAll(/<(?:script|link|img|audio)\b[^>]*?(?:src|href)=["']([^"']+)["']/g)){
    if(/^(https?:|data:|#)/.test(match[1]))continue;
    const path=new URL(match[1],'http://game.local/games/monopoly/').pathname;
    assert.ok(manifest.files[path],`HTML references missing ${path}`);
  }
  assert.match(read('/games/monopoly/teacher-dice.js'),/\.\.\/monopoly-runtime\/js\/lib\/teacher-board-session\.js/);
  assert.match(read('/games/monopoly-runtime/js/bailian-speech.js'),/\/games\/monopoly-runtime\/js\/pcm16-worklet\.js/);
  assert.match(read('/games/monopoly/app.js'),/fetch\("\/api\/auth\/me"/);
  assert.equal(existsSync(new URL('js/game.js',root)),false);
  assert.equal(existsSync(new URL('../server/lib/auth-store.js',root)),false);
});

test('private layout server modules resolve packaged geometry and are never public assets',async()=>{
  const api=await import(new URL('../dist/board-layout-api.mjs',import.meta.url));
  const server=await import(new URL('../dist/server.mjs',import.meta.url));
  assert.equal(typeof api.createGameLayoutHandler,'function');
  assert.equal(typeof server.createGameServer,'function');
  for(const filename of ['board-layout-api.mjs','board-layout-store.mjs']){
    assert.equal(existsSync(new URL('../dist/'+filename,import.meta.url)),true);
    assert.equal(existsSync(new URL('games/monopoly/'+filename,root)),false);
    assert.equal(Object.keys(manifest.files).some(path=>path.endsWith('/'+filename)),false);
  }
});
