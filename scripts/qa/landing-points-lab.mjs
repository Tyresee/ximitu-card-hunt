// Local-only integration lab: real platform, game and home HTTP handlers, fresh data.
// Run: MONOPOLY_ISOLATED_POINTS_QA=1 node scripts/qa/landing-points-lab.mjs
// Optional MONOPOLY_LAB_BUILD=0 reuses dist; MONOPOLY_LAB_HTTP_CHECK=0 skips smoke checks.
import assert from 'node:assert/strict';
import {randomBytes,randomInt} from 'node:crypto';
import {createServer,request as httpRequest} from 'node:http';
import {spawn,execFile} from 'node:child_process';
import {mkdtemp,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {promisify} from 'node:util';
import {createGameServer} from '../../standalone/server.mjs';
import {PointsTurnStore} from '../../standalone/points-store.mjs';
import {createPointsPlatformClient} from '../../standalone/points-platform-client.mjs';

if(process.env.MONOPOLY_ISOLATED_POINTS_QA!=='1')throw new Error('Explicit MONOPOLY_ISOLATED_POINTS_QA=1 is required.');
const root=fileURLToPath(new URL('../../',import.meta.url));
const visualPreview=process.env.MONOPOLY_LAB_VISUAL_PREVIEW||'';
if(visualPreview&&visualPreview!=='clay')throw new Error('The isolated visual preview must be clay.');
const platformRoot=resolve(process.env.MONOPOLY_LAB_PLATFORM_ROOT||join(root,'../../排课/voice-word-attack'));
const homeRoot=resolve(process.env.MONOPOLY_LAB_HOME_ROOT||join(root,'../新游戏'));
const port=Number(process.env.MONOPOLY_LAB_PORT||19422);
if(!Number.isInteger(port)||port<1024||port>65535||[19321,19421].includes(port))throw new Error('Use a dedicated fixture port, never 19321 or 19421.');
const origin=`http://127.0.0.1:${port}`;
// Dice are truly random (same randomInt as production) unless a test run opts in with
// MONOPOLY_LAB_FACE_INDEX=0–5. A human using the lab must see real 1–6 rolls.
const fixedFaceRaw=process.env.MONOPOLY_LAB_FACE_INDEX;
const fixedFaceIndex=fixedFaceRaw===undefined||fixedFaceRaw===''?null:Number(fixedFaceRaw);
if(fixedFaceIndex!==null&&(!Number.isInteger(fixedFaceIndex)||fixedFaceIndex<0||fixedFaceIndex>5))throw new Error('Fixture face index must be 0–5.');
const {createStudentHomesService}=await import(pathToFileURL(join(homeRoot,'server/student-homes/app.mjs')));
const {accountCatalog,CATALOG_VERSION}=await import(pathToFileURL(join(homeRoot,'server/student-homes/commerce.mjs')));
const dir=await mkdtemp(join(tmpdir(),'monopoly-landing-lab-'));
const credentials={username:'isolated-landing-teacher',password:'isolated-landing-password-2026'};
const monopolySecret=randomBytes(32).toString('hex'),homeSecret=randomBytes(32).toString('hex');
let platformPort,game,homes,child,closing=false,log='',visualPreviewCookie;
const closeServer=server=>!server?.listening?Promise.resolve():new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
const listen=(server,requestedPort=0)=>new Promise((resolve,reject)=>{
  server.once('error',reject);server.listen(requestedPort,'127.0.0.1',()=>{server.off('error',reject);resolve(server.address().port);});
});
const proxy=createServer((request,response)=>{
  const target=request.url.startsWith('/games/monopoly/')||request.url.startsWith('/games/monopoly-runtime/')
    ?game?.address()?.port:request.url.startsWith('/games/pocket-hop/')?homes?.server.address()?.port:platformPort;
  if(!target){response.writeHead(503);response.end('Isolated fixture starting');return;}
  // Opt-in convenience for this loopback-only, temporary-data fixture. The
  // platform still creates and verifies its real fixture session; production
  // handlers and their authentication contract remain untouched.
  const upstream=httpRequest({hostname:'127.0.0.1',port:target,path:request.url,method:request.method,
    headers:{...request.headers,host:`127.0.0.1:${port}`,
      ...(visualPreview==='clay'&&visualPreviewCookie?{cookie:visualPreviewCookie}:{})}},reply=>{response.writeHead(reply.statusCode,reply.headers);reply.pipe(response);});
  upstream.on('error',()=>{if(!response.headersSent)response.writeHead(502);response.end('Isolated fixture upstream unavailable');});
  request.pipe(upstream);
});
async function close(){
  if(closing)return;closing=true;
  await closeServer(proxy);await closeServer(game);await homes?.close();
  if(child&&child.exitCode===null){
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
    const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await exited;clearTimeout(timer);
  }
  await rm(dir,{recursive:true,force:true});
}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>close().catch(()=>{process.exitCode=1;}));

try{
  // Bind the public port first. An occupied port fails without touching its owner.
  await listen(proxy,port);
  if(process.env.MONOPOLY_LAB_BUILD!=='0')await promisify(execFile)(process.execPath,['scripts/build-standalone-game.mjs'],{cwd:root,maxBuffer:1024*1024});
  await access(join(root,'dist/public/games/monopoly/index.html'));
  const probe=createServer();platformPort=await listen(probe);await closeServer(probe);
  child=spawn(process.execPath,['server/index.js'],{cwd:platformRoot,env:{...process.env,
    NODE_ENV:'development',HOST:'127.0.0.1',PORT:String(platformPort),PUBLIC_ORIGIN:origin,DATA_DIR:join(dir,'platform'),
    AUTH_OWNER_USERNAME:credentials.username,AUTH_BOOTSTRAP_OWNER_PASSWORD:credentials.password,
    PRONUNCIATION_PROVIDER:'mock',ALLOW_QA_CONTROLS:'true',MONOPOLY_POINTS_SIGNING_SECRET:monopolySecret,
    HOME_COMMERCE_SIGNING_SECRET:homeSecret},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',bytes=>{log=(log+bytes).slice(-16000);});child.stderr.on('data',bytes=>{log=(log+bytes).slice(-16000);});
  child.on('error',error=>{log+=`\n${error.message}`;});
  const platformOrigin=`http://127.0.0.1:${platformPort}`;
  let started=false;
  for(let index=0;index<200;index++){
    if(child.exitCode!==null)throw new Error(`Fixture platform exited: ${log}`);
    try{if((await fetch(platformOrigin+'/api/health',{signal:AbortSignal.timeout(800)})).ok){started=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  if(!started)throw new Error(`Fixture platform startup timeout: ${log}`);
  homes=await createStudentHomesService({platformOrigin,publicOrigin:origin,dataDir:join(dir,'homes'),homeCommerceSigningSecret:homeSecret});
  await listen(homes.server);
  const pointsPlatform=createPointsPlatformClient({platformOrigin,publicOrigin:origin,secret:monopolySecret});
  const pointsStore=new PointsTurnStore({dataDir:join(dir,'game','points'),platform:pointsPlatform,random:fixedFaceIndex===null?randomInt:()=>fixedFaceIndex});
  game=createGameServer({root:join(root,'dist/public'),version:'isolated-landing-lab',platformOrigin,
    publicOrigin:origin,dataDir:join(dir,'game'),pointsStore,pointsPlatform,signingSecret:monopolySecret});
  await listen(game);
  let cookie,actor;
  async function api(path,{body,method=body?'POST':'GET',key,allowError=false}={}){
    if(!path.startsWith('/')||path.startsWith('//'))throw new Error('Only same-origin fixture paths allowed.');
    const response=await fetch(origin+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),headers:{origin,
      'content-type':'application/json',...(cookie?{cookie}:{}),...(key?{'idempotency-key':key}:{})},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json();
    if(!response.ok&&!allowError)throw new Error(JSON.stringify({path,status:response.status,data}));
    return {data,response,status:response.status};
  }
  const login=await api('/api/auth/login',{body:credentials});
  cookie=login.response.headers.get('set-cookie').split(';')[0];actor=login.data.user.id;
  if(visualPreview==='clay')visualPreviewCookie=cookie;
  const students=[];
  const studentNames=visualPreview==='clay'?['小森','小月','测试积分链路']:['测试学生小森','测试学生小月','测试积分链路'];
  for(const displayName of studentNames){
    const student=(await api('/api/student-profiles/v1',{body:{expectedUserId:actor,displayName}})).data.student;
    students.push({id:student.id,displayName:student.displayName});
  }
  const info={isolated:true,origin,entry:origin+'/games/monopoly/'+(visualPreview==='clay'?'?visualPreview=clay&demo=1':''),homeEntry:origin+'/games/pocket-hop/student-homes.html',
    login:origin+'/login/?next=%2Fgames%2Fmonopoly%2F',...credentials,actor,students,
    platformPort,gamePort:game.address().port,homePort:homes.server.address().port,
    fixtureDirectory:dir,labPid:process.pid,dice:fixedFaceIndex===null?'random':'fixed',faceIndex:fixedFaceIndex,fixedSteps:fixedFaceIndex===null?null:fixedFaceIndex+1,
    infoPath:join(dir,'fixture-info.json'),checksPath:join(dir,'http-checks.json'),
    ...(visualPreview?{visualPreview,automaticFixtureLogin:true}:{}),
    notes:'Fresh temporary accounts only. Server dice are random unless MONOPOLY_LAB_FACE_INDEX is set; mock pronunciation is fixture-only. Production and port 19321 untouched.'};
  await writeFile(info.infoPath,JSON.stringify({...info,cookie},null,2),{mode:0o600});
  console.log(JSON.stringify({...info,phase:'ready'},null,2));

  if(process.env.MONOPOLY_LAB_HTTP_CHECK!=='0'){
    // A separate fixture-only pupil leaves the first two pupils fresh for browser QA.
    const studentId=students[2].id,externalSessionId='fixture-http-new-game',apiBase='/games/monopoly/api/points/v1';
    const registered=await api(apiBase+'/sessions',{body:{expectedUserId:actor,externalSessionId,studentIds:[studentId],mode:'teacher-led'},key:'fixture-register-0001'});
    const sessionId=registered.data.session.id,path=`${apiBase}/sessions/${sessionId}`;
    const product=accountCatalog().find(product=>product.skuId==='writingDesk-classic');
    assert.ok(product&&product.price>0);
    let total=0,turnCount=0;const turns=[];
    while(total<product.price){
      assert.ok(turnCount<30,'Earn enough for one real catalog item within the bounded smoke test.');
      const attemptId=`fixture-http-turn-${++turnCount}`;
      const rolled=await api(path+'/roll',{body:{expectedUserId:actor,studentId,attemptId},key:`fixture-roll-${turnCount}`});
      const replayRoll=await api(path+'/roll',{body:{expectedUserId:actor,studentId,attemptId},key:`fixture-roll-${turnCount}`});
      const face=rolled.data.turn.faceIndex;assert.ok(Number.isInteger(face)&&face>=0&&face<=5);
      if(fixedFaceIndex!==null)assert.equal(face,fixedFaceIndex);
      assert.equal(replayRoll.data.turn.faceIndex,face);assert.equal(rolled.data.turn.steps,replayRoll.data.turn.steps);
      assert.equal(replayRoll.data.duplicate,true);
      const choices={};let planned;
      for(let branch=0;branch<8;branch++){
        const result=await api(`${path}/turns/${attemptId}/plan`,{body:{expectedUserId:actor,routeChoicesByWorldInstance:choices},key:`fixture-plan-${turnCount}-${branch}`,allowError:true});
        if(result.status===200){planned=result.data;break;}
        assert.equal(result.status,409);assert.equal(result.data.error,'points_route_choice_required');
        const detail=result.data.details;assert.ok(detail.options.length);
        (choices[detail.worldInstanceId]??={})[detail.junctionNodeId]=detail.options[0].edgeId;
      }
      assert.ok(planned,'A complete server route was returned.');
      const claimed=await api(`${path}/turns/${attemptId}/claim`,{body:{expectedUserId:actor},key:`fixture-claim-${turnCount}`});
      const duplicate=await api(`${path}/turns/${attemptId}/claim`,{body:{expectedUserId:actor},key:`fixture-claim-replay-${turnCount}`});
      assert.equal(duplicate.data.duplicate,true);
      assert.equal(claimed.data.receipt.landing.amount,planned.turn.points);
      total+=planned.turn.points;
      const wallet=(await api(`/games/pocket-hop/api/v1/students/${studentId}/wallet`)).data.wallet;
      assert.equal(wallet.balance,total,'Game rewards enter the same wallet read by the home.');
      turns.push({attemptId,steps:rolled.data.turn.steps,nodeId:planned.turn.finalLocation.nodeId,points:planned.turn.points,balance:wallet.balance});
    }
    const initialHome=(await api(`/games/pocket-hop/api/v1/students/${studentId}/home/init`,{body:{expectedUserId:actor}})).data.home;
    const command={expectedUserId:actor,expectedRevision:initialHome.revision,commandId:'fixture-home-purchase-0001',
      command:{type:'checkout',lines:[{skuId:product.skuId,quantity:1}]},expectedCatalogVersion:CATALOG_VERSION};
    const purchase=(await api(`/games/pocket-hop/api/v1/students/${studentId}/home/commands`,{body:command})).data;
    const duplicatePurchase=(await api(`/games/pocket-hop/api/v1/students/${studentId}/home/commands`,{body:command})).data;
    assert.equal(purchase.receipt.amount,product.price);assert.equal(purchase.wallet.balance,total-product.price);
    assert.equal(duplicatePurchase.duplicate,true);assert.equal(duplicatePurchase.home.commerce.owned.length,1);
    assert.equal(duplicatePurchase.home.commerce.owned[0].skuId,product.skuId);
    const reread=(await api(`/games/pocket-hop/api/v1/students/${studentId}/home`)).data.home;
    assert.equal(reread.commerce.owned.length,1);
    const finalWallet=(await api(`/games/pocket-hop/api/v1/students/${studentId}/wallet`)).data.wallet;
    assert.equal(finalWallet.balance,total-product.price);assert.equal(finalWallet.reserved,0);
    assert.equal(finalWallet.totalSpent,product.price);
    await api(path+'/close',{body:{expectedUserId:actor},key:'fixture-close-0001'});
    const report={isolated:true,passed:true,studentId,sessionId,turns,totalEarned:total,
      purchase:{skuId:product.skuId,catalogVersion:CATALOG_VERSION,price:product.price,ownedCount:reread.commerce.owned.length},
      finalBalance:finalWallet.balance,starterGrantClaimed:false,productionAccessed:false};
    await writeFile(info.checksPath,JSON.stringify(report,null,2),{mode:0o600});
    console.log(JSON.stringify({phase:'http-checks-passed',checksPath:info.checksPath,...report},null,2));
  }
}catch(error){await close();throw error;}
