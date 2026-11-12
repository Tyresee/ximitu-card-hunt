// Technical sprite extraction only; all character artwork comes from ImageGen.
// Run with a Node environment that provides sharp (or set NODE_PATH).
const sharp = require('sharp');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const source = path.join(__dirname, 'character-atlas.png');
const slugs = ['ximi-rabbit','wave-otter','cloud-cat','spark-fox','bubble-penguin','forest-fawn','tinker-bear','crystal-dragon','pudding-puppy','mochi-hamster','bamboo-panda','maple-red-panda','sleepy-koala','cotton-lamb','honey-tiger','sunshine-lion','starlight-unicorn','mint-dinosaur','moon-raccoon','chestnut-hedgehog'];
const hash = data => crypto.createHash('sha256').update(data).digest('hex');
(async () => {
  const {data,info} = await sharp(source).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const {width:w,height:h} = info;
  const seen = new Uint8Array(w*h), components=[];
  for(let p=0;p<w*h;p++) {
    if(seen[p] || data[p*4+3]<16) continue;
    const queue=[p]; seen[p]=1; let l=w,t=h,r=0,b=0;
    for(let a=0;a<queue.length;a++) {
      const i=queue[a], x=i%w, y=Math.floor(i/w);
      l=Math.min(l,x); r=Math.max(r,x); t=Math.min(t,y); b=Math.max(b,y);
      for(const j of [x>0?i-1:-1,x+1<w?i+1:-1,y>0?i-w:-1,y+1<h?i+w:-1]) {
        if(j>=0&&!seen[j]&&data[j*4+3]>=16) {seen[j]=1;queue.push(j);}
      }
    }
    if(queue.length>4000) components.push({l,t,r,b});
  }
  if(components.length!==20) throw new Error(`Expected 20 separated sprites; got ${components.length}`);
  components.sort((a,b)=>a.t-b.t);
  const ordered=[];
  for(let row=0;row<5;row++) ordered.push(...components.slice(row*4,row*4+4).sort((a,b)=>a.l-b.l));
  const manifest={generator:'OpenAI built-in ImageGen',generatedOn:'2026-09-22',artDirection:'Rounded pastel storybook plush animals, 20 distinct species',source:{file:'character-atlas.png',width:w,height:h,sha256:hash(fs.readFileSync(source))},promptFile:'prompt.txt',topologyDigest:'a848499f0c3c90a8d6b155115ea6a496b96b7e914351fca0bfce824732a76352',sprites:[]};
  for(const [i,b] of ordered.entries()) {
    const left=Math.max(0,b.l-3),top=Math.max(0,b.t-3),right=Math.min(w-1,b.r+3),bottom=Math.min(h-1,b.b+3);
    const crop={left,top,width:right-left+1,height:bottom-top+1};
    const sprite=await sharp(source).extract(crop).png().toBuffer();
    const assets=[];
    for(const [variant,width,height,padding] of [['selection',320,400,18],['hud',256,256,10],['pawns',192,256,12]]) {
      let pipeline=sharp(sprite);
      if(variant==='hud') pipeline=pipeline.extract({left:0,top:0,width:crop.width,height:Math.ceil(crop.height*.76)});
      const resized=await pipeline.resize(width-padding*2,height-padding*2,{fit:'inside'}).png().toBuffer({resolveWithObject:true});
      const image=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:resized.data,left:Math.round((width-resized.info.width)/2),top:variant==='hud'?Math.round((height-resized.info.height)/2):height-padding-resized.info.height}]).png({compressionLevel:9,palette:false}).toBuffer();
      const assetRef=`/assets/characters/ximitu-friends/v3/${variant}/${slugs[i]}-v3.png`;
      const file=path.join(root,'public',assetRef); fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,image);
      assets.push({variant,assetRef,width,height,sha256:hash(image),bytes:image.length});
    }
    manifest.sprites.push({slug:slugs[i],row:Math.floor(i/4),column:i%4,crop,assets});
  }
  fs.writeFileSync(path.join(__dirname,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  console.log(`Extracted ${manifest.sprites.length} sprites / 60 RGBA assets.`);
})();
