// Local browser verification only. This file is never included in dist/.
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createGameServer } from '../standalone/server.mjs';
import { DEFAULT_DICE_PACK } from '../public/prototypes/universal-board/dice-pack-core.js';
import { DEFAULT_NODE_REWARD_PACK } from '../public/prototypes/universal-board/node-reward-pack-core.js';
import { DEFAULT_CLASSROOM_EVENT_PROGRAM } from '../public/prototypes/universal-board/classroom-event-program-core.js';

const auth={authenticated:true,user:{id:'local-fixture-owner',role:'owner'}};
const qaEnabled=process.env.LOCAL_GAME_QA==='1';
const missingArt=process.env.LOCAL_GAME_MISSING_ART==='1';
const registryDelayMs=Math.max(0,Math.min(30000,Number(process.env.LOCAL_GAME_REGISTRY_DELAY_MS)||0));
const layoutDataDir=qaEnabled?await mkdtemp(join(tmpdir(),'monopoly-layout-fixture-')):undefined;
const studentLabels=['甲','乙','丙','丁','戊','己','庚','辛'];
const students=studentLabels.slice(0,qaEnabled?8:2).map((label,index)=>({
  id:`fixture-${String.fromCharCode(97+index)}`,
  displayName:`拆分验收${label}`,
  nickname:`测试${label}`,
}));
const syntheticStudentIds=new Set(students.map(student=>student.id));
const api={
  '/api/auth/me':auth,
  '/api/config':{qaEnabled,voiceBoardAssessmentConfigured:false,voiceBoardAsrConfigured:false},
  '/api/board-layouts/v1':{schemaVersion:'board-layout-registry.v1',layouts:[]},
  '/api/dice-packs/v1':{schemaVersion:'dice-pack-registry.v1',dicePack:{status:'default',pack:DEFAULT_DICE_PACK}},
  '/api/node-reward-packs/v1':{schemaVersion:'node-reward-pack-registry.v1',nodeRewardPack:{status:'default',pack:DEFAULT_NODE_REWARD_PACK}},
  '/api/classroom-event-programs/v1':{schemaVersion:'classroom-event-program-registry.v1',classroomEventProgram:{status:'default',program:DEFAULT_CLASSROOM_EVENT_PROGRAM}},
  '/api/student-profiles/v1':{schemaVersion:'student-profile-store.v1',students},
};
const game=createGameServer({root:fileURLToPath(new URL('../dist/public',import.meta.url)),version:'local-browser-fixture',fetchSession:async()=>Response.json(auth),dataDir:layoutDataDir,publicOrigin:'http://127.0.0.1:19422'});
const handler=game.listeners('request')[0];
const fixtureServer=createServer(async(req,res)=>{
  const requestUrl=new URL(req.url,'http://127.0.0.1:19422');
  const pathname=requestUrl.pathname;
  if(req.method==='GET'&&registryDelayMs&&[
    '/api/board-layouts/v1','/games/monopoly/api/board-layouts/v1',
    '/api/dice-packs/v1','/api/node-reward-packs/v1',
  ].includes(pathname)) await delay(registryDelayMs);
  if(pathname.startsWith('/games/monopoly/api/')&&!qaEnabled){
    req.resume();
    res.writeHead(403,{'content-type':'application/json','cache-control':'no-store'});
    return res.end(JSON.stringify({error:'fixture_qa_required',message:'Local layout editing requires LOCAL_GAME_QA=1'}));
  }
  if(pathname==='/prototypes/universal-board'||pathname.startsWith('/prototypes/universal-board/')){
    const destination=pathname.replace('/prototypes/universal-board','/games/monopoly');
    res.writeHead(302,{location:`${destination==='/games/monopoly'?destination+'/':destination}${requestUrl.search}`});return res.end();
  }
  if(missingArt&&pathname.startsWith('/games/monopoly-runtime/assets/board-themes/')){
    res.writeHead(404,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'});
    return res.end('Local fixture: board artwork intentionally unavailable');
  }
  if(pathname.startsWith('/api/')){
    const settlement=pathname.match(/^\/api\/student-profiles\/v1\/(fixture-[a-h])\/asset-settlements$/);
    if(settlement&&syntheticStudentIds.has(settlement[1])&&req.method==='POST'){
      // Acknowledge only this fixture's synthetic students; never forward a write.
      const student=students.find(s=>s.id===settlement[1]);
      req.resume();
      res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});
      return res.end(JSON.stringify({student}));
    }
    const data=api[pathname];
    res.writeHead(data&&req.method==='GET'?200:404,{'content-type':'application/json','cache-control':'no-store'});
    return res.end(JSON.stringify(data||{message:'Local fixture has no such operation'}));
  }
  handler(req,res);
}).listen(19422,'127.0.0.1',()=>console.log(`Local fixture (no real login or speech; QA ${qaEnabled?'on':'off'}; missing art ${missingArt?'on':'off'}): http://127.0.0.1:19422/games/monopoly/`));

let closing=false;
async function closeFixture(){
  if(closing)return;
  closing=true;
  fixtureServer.closeAllConnections();
  await new Promise(resolve=>fixtureServer.close(resolve));
  if(layoutDataDir)await rm(layoutDataDir,{recursive:true,force:true});
  process.exit(0);
}
process.once('SIGINT',closeFixture);
process.once('SIGTERM',closeFixture);
