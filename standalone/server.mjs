import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameLayoutHandler } from './board-layout-api.mjs';
import { createPointsHandler } from './points-api.mjs';

const ENTRY='/games/monopoly/';
const RUNTIME='/games/monopoly-runtime/';
const mime={'.css':'text/css; charset=utf-8','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.wav':'audio/wav'};
const headers={
  'x-content-type-options':'nosniff',
  'referrer-policy':'strict-origin-when-cross-origin',
  'x-frame-options':'DENY',
  'permissions-policy':'microphone=(self), camera=(), geolocation=()',
};
function send(res,status,body='',extra={}) {
  res.writeHead(status,{...headers,'cache-control':'no-store',...extra});res.end(body);
}
function staticETag(path,stat,assetHashes) {
  const hash=Object.hasOwn(assetHashes,path)?assetHashes[path]:null;
  if(typeof hash==='string'&&/^[a-f0-9]{64}$/i.test(hash)) return `"sha256-${hash.toLowerCase()}"`;
  return `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
}
function matchesETag(condition,etag) {
  if(typeof condition!=='string') return false;
  if(condition.trim()==='*') return true;
  const opaque=etag.replace(/^W\//,'');
  return condition.split(',').some(value=>value.trim().replace(/^W\//,'')===opaque);
}
export function createGameServer({root,version='development',platformOrigin='http://127.0.0.1:19321',fetchSession=fetch,dataDir,layoutStore,publicOrigin='https://wordattack.timclass.cn',assetHashes={},pointsStore,pointsPlatform,pointsPlatformOrigin,signingSecret}={}) {
  const handleGameLayout=createGameLayoutHandler({dataDir,layoutStore,platformOrigin,fetchSession,publicOrigin});
  const handlePoints=createPointsHandler({dataDir,pointsStore,pointsPlatform,pointsPlatformOrigin,signingSecret,platformOrigin,fetchSession,publicOrigin});
  return createServer(async(req,res)=>{
    try {
      const url=new URL(req.url||'/', 'http://game.local');
      const decoded=decodeURIComponent(url.pathname);
      if(decoded.includes('\0')||decoded.includes('\\')||decoded.split('/').some(part=>part.startsWith('.'))) return send(res,404,'Not found');
      const pathname=posix.normalize(decoded);
      if(await handleGameLayout(req,res,pathname,send)) return;
      if(await handlePoints(req,res,pathname,send)) return;
      if (!['GET','HEAD'].includes(req.method)) return send(res,405,'Method Not Allowed',{allow:'GET, HEAD'});
      if (pathname==='/health'||pathname===ENTRY+'health') return send(res,200,JSON.stringify({service:'ximitu-card-hunt',status:'ok',version}),{'content-type':mime['.json']});
      if (pathname==='/games/monopoly') return send(res,302,'',{location:ENTRY+url.search});
      if (!pathname.startsWith(ENTRY)&&!pathname.startsWith(RUNTIME)) return send(res,404,'Not found');
      const isDocument=[ENTRY,ENTRY+'index.html'].includes(pathname);
      if(isDocument) {
        let session;
        try {
          const upstream=await fetchSession(platformOrigin+'/api/auth/me',{
            headers:{cookie:req.headers.cookie||''},redirect:'error',signal:AbortSignal.timeout(3000),
          });
          if(!upstream.ok) throw new Error('auth service unavailable');
          session=await upstream.json();
        } catch {return send(res,503,'登录服务暂时不可用，请稍后刷新');}
        if(session?.authenticated!==true) return send(res,302,'',{location:'/login/?next='+encodeURIComponent(ENTRY+url.search)});
        if(pathname!==ENTRY) return send(res,302,'',{location:ENTRY+url.search});
      }
      const path=isDocument?ENTRY+'index.html':pathname;
      const candidate=join(root,path);
      if(relative(root,candidate).startsWith('..')) return send(res,404,'Not found');
      let stat;
      try{stat=await fs.stat(candidate);}catch{return send(res,404,'Not found');}
      if(!stat.isFile()) return send(res,404,'Not found');
      const cacheHeaders={'cache-control':isDocument?'no-store':'no-cache','x-game-release':version};
      if(!isDocument) {
        cacheHeaders.etag=staticETag(path,stat,assetHashes);
        if(matchesETag(req.headers['if-none-match'],cacheHeaders.etag)) {
          res.writeHead(304,{...headers,...cacheHeaders});
          return res.end();
        }
      }
      res.writeHead(200,{...headers,'content-type':mime[extname(candidate)]||'application/octet-stream','content-length':stat.size,
        ...cacheHeaders});
      if(req.method==='HEAD') return res.end();
      createReadStream(candidate).on('error',()=>res.destroy()).pipe(res);
    }catch{if(!res.headersSent)send(res,400,'Invalid request');else res.destroy();}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const base=fileURLToPath(new URL('.',import.meta.url));
  const release=JSON.parse(await fs.readFile(join(base,'release.json'),'utf8'));
  const server=createGameServer({root:join(base,'public'),version:release.version,assetHashes:release.files,platformOrigin:process.env.PLATFORM_ORIGIN||'http://127.0.0.1:19321',dataDir:process.env.GAME_DATA_DIR||join(base,'data'),publicOrigin:process.env.PUBLIC_ORIGIN||'https://wordattack.timclass.cn'});
  server.listen(Number(process.env.PORT||19421),'127.0.0.1',()=>console.log(`ximitu-card-hunt ${release.version} listening on loopback`));
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{
    // Let an in-flight authoritative turn finish its atomic write before a release restarts us.
    server.close(()=>process.exit(0));
    setTimeout(()=>process.exit(1),20000).unref();
  });
}
