import * as THREE from './vendor/three.module.js';
import {roofDetailClearance,DETAIL_CLEARANCE_VERSION,DETAIL_CLEARANCE,DETAIL_WALL_GAP} from './roof-detail-clearance.mjs?v=roof-depth-20261106';
import {roofEdgeTrim} from './roof-edge-trim.mjs?v=roof-boundaries-20261106';

export const MATERIAL_VERSION='architectural-pbr-v7';
export const LOOKS=[{id:'auto',zh:'自动匹配建筑',en:'Match building'},{id:'office',zh:'办公玻璃',en:'Office glazing'},{id:'residential',zh:'浅色住宅',en:'Light residential'},{id:'brick',zh:'暖色砖石',en:'Warm masonry'}];
const palettes={
  office:{wall:'#65717a',frame:'#9ba6ad',glass:'#577580',band:'#485a68',width:.94,height:.83,metal:.72},
  residential:{wall:'#d5d0c3',frame:'#deddd5',glass:'#526a73',band:'#b6b1a4',width:.62,height:.70,metal:.30},
  stone:{wall:'#ccc8bd',frame:'#8b9394',glass:'#526b77',band:'#b1afa6',width:.73,height:.76,metal:.53},
  brick:{wall:'#ac7c61',frame:'#d9d2c4',glass:'#4a656a',band:'#94705b',width:.57,height:.71,metal:.12}
};
const rand=(a,b=0,c=0)=>{const v=Math.sin(a*127.1+b*311.7+c*74.7)*43758.5453;return v-Math.floor(v);};
const canvas=(w,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
const pow2=n=>2**Math.ceil(Math.log2(n));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

function openingRatios(style,podium,row,rows,isDoor,pitched){
  const p=palettes[style],width=isDoor ? .65 : podium&&style==='office' ? .83 : p.width;
  let height=isDoor ? .99 : podium&&style==='office' ? .78 : p.height;
  const topRow=pitched&&row===rows-1&&!isDoor;if(topRow)height*=.94;
  return {width,height,top:isDoor?1:topRow ? .5 : .35};
}

function profileHeight(profile,u){
  if(!profile.length)return 0;
  for(let i=1;i<profile.length;i++)if(u<=profile[i].u){const a=profile[i-1],b=profile[i];return a.z+(b.z-a.z)*(u-a.u)/(b.u-a.u);}
  return profile.at(-1).z;
}

export function atticVent(b){
  if(b.part.roof==='flat'||!b.roofProfile?.length)return null;
  const total=b.part.height-b.base,eave=b.base+b.height,width=Math.min(total*.10,b.length*.22),candidates=[b.length/2,...b.roofProfile.map(p=>p.u)];
  let best=null;
  for(const u of candidates){
    if(u<width*.8||u>b.length-width*.8)continue;
    const checks=[u-width/2,u+width/2,...b.roofProfile.filter(p=>p.u>u-width/2&&p.u<u+width/2).map(p=>p.u)];
    const top=Math.min(...checks.map(x=>profileHeight(b.roofProfile,x))),clear=top-eave;
    if(clear<total*.075||best&&clear<=best.clear)continue;
    best={u,z:eave+clear*.49,width,height:Math.min(total*.042,clear*.26),clear};
  }
  return best;
}

export function resolveLook(metadata,choice='auto'){
  if(choice!=='auto')return choice;
  const p=metadata.parameters;
  if(['gabled','hipped'].includes(p.roof))return 'residential';
  if(['podium','twin'].includes(p.family))return 'office';
  if(p.family==='court')return 'brick';
  if(p.family==='bar'&&p.roof!=='flat')return 'residential';
  if(p.family==='bar')return 'residential';
  return 'stone';
}

function texture(c,color=false){const t=new THREE.CanvasTexture(c);t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;t.anisotropy=4;return t;}

function normalFromHeight(height){
  const size=384,c=canvas(size),ctx=c.getContext('2d');ctx.drawImage(height,0,0,size,size);
  const input=ctx.getImageData(0,0,size,size).data,result=ctx.createImageData(size,size),out=result.data;
  const sample=(x,y)=>input[(clamp(y,0,size-1)*size+clamp(x,0,size-1))*4]/255;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(sample(x+1,y)-sample(x-1,y))*2.5,dy=(sample(x,y+1)-sample(x,y-1))*2.5,inv=1/Math.hypot(dx,dy,1),i=(y*size+x)*4;
    out[i]=Math.round((.5-dx*inv*.5)*255);out[i+1]=Math.round((.5+dy*inv*.5)*255);out[i+2]=Math.round((.5+inv*.5)*255);out[i+3]=255;
  }
  ctx.putImageData(result,0,0);return texture(c);
}

function wallAtlas({style,rows,columns,bodyFraction,seed,podium,groundFloor,basis}){
  const width=clamp(pow2(columns*72),256,1024),height=clamp(pow2(rows*72),512,1024),c=canvas(width,height),color=c.getContext('2d'),heightCanvas=canvas(width,height),h=heightCanvas.getContext('2d'),ormCanvas=canvas(width,height),orm=ormCanvas.getContext('2d');
  const palette={...palettes[style]};if(podium&&style==='office'){palette.wall='#c8bfad';palette.band='#b2a997';palette.width=.83;palette.height=.78;}
  color.fillStyle=palette.wall;color.fillRect(0,0,width,height);h.fillStyle='rgb(128,128,128)';h.fillRect(0,0,width,height);orm.fillStyle='rgb(255,213,0)';orm.fillRect(0,0,width,height);
  const cellW=width/columns,bodyTop=height*(1-bodyFraction),cellH=height*bodyFraction/rows;
  if(style==='brick'){
    const brickW=cellW*.48,brickH=cellH/11;
    for(let row=0;row<Math.ceil(height/brickH);row++)for(let col=-1;col<Math.ceil(width/brickW);col++){
      const x=(col+(row%2)*.5)*brickW,y=row*brickH,light=41+rand(row,col,seed)*8;
      color.fillStyle=`hsl(22 28% ${light}%)`;color.fillRect(x+1,y+1,brickW-2,brickH-1.5);
      h.fillStyle='rgb(134,134,134)';h.fillRect(x+1,y+1,brickW-2,brickH-1.5);
    }
  }else{
    // Subtle large panels and mineral variations, with no external image assets.
    for(let i=0;i<columns;i++){color.fillStyle=`rgba(255,255,255,${.015+rand(i,seed)*.035})`;color.fillRect(i*cellW,0,cellW*.97,height);}
    if(style!=='office'||podium){color.strokeStyle='#8f8c8022';color.lineWidth=.7;for(let i=1;i<columns;i++){color.beginPath();color.moveTo(i*cellW,0);color.lineTo(i*cellW,height);color.stroke();}}
  }
  const pitched=basis.part.roof!=='flat';
  // Continue masonry/panel material through the gable. Only openings stop at
  // the common storey line; the attic no longer becomes an untextured patch.
  if(bodyTop>0&&style==='office'){
    color.fillStyle='#78878a';color.fillRect(0,0,width,bodyTop);
    color.strokeStyle='#52646955';color.lineWidth=1;
    for(let x=0;x<width;x+=cellW*.5){color.beginPath();color.moveTo(x,0);color.lineTo(x,bodyTop);color.stroke();}
  }
  for(let row=0;row<rows;row++){
    const y=bodyTop+(rows-row-1)*cellH,band=Math.max(1,cellH*(style==='office'&&!podium ? .10 : .035));
    color.fillStyle=palette.band;color.fillRect(0,y+cellH-band,width,band);h.fillStyle='rgb(140,140,140)';h.fillRect(0,y+cellH-band,width,band);
    for(let column=0;column<columns;column++){
      const variation=rand(row,column,seed),isDoor=groundFloor&&row===0&&column===Math.floor(columns/2),opening=openingRatios(style,podium,row,rows,isDoor,pitched),windowW=cellW*opening.width,windowH=cellH*opening.height;
      const x=column*cellW+(cellW-windowW)/2,wy=y+(cellH-windowH)*opening.top,frame=Math.max(1.1,Math.min(cellW,cellH)*(style==='office' ? .022 : .034)),reveal=Math.max(1,frame*.7);
      color.fillStyle='rgba(35,40,39,.30)';color.fillRect(x-reveal,wy-reveal,windowW+reveal*2,windowH+reveal*2);
      color.fillStyle=palette.frame;color.fillRect(x,wy,windowW,windowH);h.fillStyle='rgb(162,162,162)';h.fillRect(x,wy,windowW,windowH);orm.fillStyle=`rgb(205,115,${Math.round(palette.metal*255)})`;orm.fillRect(x,wy,windowW,windowH);
      const gx=x+frame,gy=wy+frame,gw=windowW-frame*2,gh=windowH-frame*2;
      const base=new THREE.Color(palette.glass);base.multiplyScalar(.83+variation*.30);color.fillStyle='#'+base.getHexString();color.fillRect(gx,gy,gw,gh);
      h.fillStyle='rgb(92,92,92)';h.fillRect(gx,gy,gw,gh);orm.fillStyle=`rgb(220,${Math.round(29+variation*20)},${style==='office'?90:35})`;orm.fillRect(gx,gy,gw,gh);
      if(variation>.77&&!isDoor){
        const blindH=gh*(.28+rand(column,row,seed)*.45);color.fillStyle='rgba(175,169,149,.47)';color.fillRect(gx,gy,gw,blindH);
        color.fillStyle='rgba(35,44,46,.15)';for(let by=gy+2;by<gy+blindH;by+=3)color.fillRect(gx,by,gw,.7);
        orm.fillStyle='rgb(190,95,0)';orm.fillRect(gx,gy,gw,blindH);
      }else if(variation<.07){color.fillStyle='rgba(176,153,105,.25)';color.fillRect(gx,gy,gw,gh);}
      // Interior shadow and a thin sill keep each opening from reading as a sticker.
      const shade=color.createLinearGradient(gx,gy,gx+gw,gy+gh);shade.addColorStop(0,'rgba(0,0,0,.18)');shade.addColorStop(.3,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(21,30,37,.08)');color.fillStyle=shade;color.fillRect(gx,gy,gw,gh);
      if(style!=='office'||isDoor){color.fillStyle=palette.frame;color.fillRect(x+windowW*.5-frame*.35,wy,frame*.7,windowH);orm.fillStyle=`rgb(220,110,${Math.round(palette.metal*255)})`;orm.fillRect(x+windowW*.5-frame*.35,wy,frame*.7,windowH);h.fillStyle='rgb(152,152,152)';h.fillRect(x+windowW*.5-frame*.35,wy,frame*.7,windowH);}
      color.fillStyle='rgba(39,36,28,.22)';color.fillRect(x,wy+windowH,windowW,Math.max(1,frame*.7));
    }
  }
  if(pitched){
    const band=Math.max(2,height*.009),y=bodyTop-band*.35;
    color.fillStyle=style==='office'?'#a3adb0':palette.frame;color.fillRect(0,y,width,band);
    color.fillStyle='#333d3b55';color.fillRect(0,y+band,width,Math.max(1,band*.25));h.fillStyle='rgb(160,160,160)';h.fillRect(0,y,width,band);
    const total=basis.part.height-basis.base,vent=atticVent(basis);
    if(vent){
      const x=(vent.u-vent.width/2)/basis.length*width,y=(1-(vent.z-basis.base+vent.height/2)/total)*height,w=vent.width/basis.length*width,H=vent.height/total*height;
      color.fillStyle=palette.frame;color.fillRect(x-1.5,y-1.5,w+3,H+3);color.fillStyle='#354346';color.fillRect(x,y,w,H);
      orm.fillStyle='rgb(210,130,90)';orm.fillRect(x,y,w,H);h.fillStyle='rgb(108,108,108)';h.fillRect(x,y,w,H);
      color.fillStyle='#8f9a97';for(let i=1;i<6;i++)color.fillRect(x,y+i*H/6,w,Math.max(.8,H*.045));
    }
    if(basis.roofProfile.length){
      color.save();color.lineJoin='round';
      for(const [offset,alpha,lineWidth]of [[4,.08,6],[2,.12,3]]){
        color.beginPath();basis.roofProfile.forEach((p,i)=>{const x=p.u/basis.length*width,y=(1-(p.z-basis.base)/total)*height+offset;(i?color.lineTo:color.moveTo).call(color,x,y);});
        color.strokeStyle=`rgba(28,34,33,${alpha})`;color.lineWidth=lineWidth;color.stroke();
      }
      color.restore();
    }
  }
  const baseShade=color.createLinearGradient(0,height*.82,0,height);baseShade.addColorStop(0,'rgba(28,29,26,0)');baseShade.addColorStop(1,'rgba(28,29,26,.13)');color.fillStyle=baseShade;color.fillRect(0,height*.82,width,height*.18);
  const map=texture(c,true),normal=normalFromHeight(heightCanvas),packed=texture(ormCanvas);
  const material=new THREE.MeshPhysicalMaterial({name:`${MATERIAL_VERSION}/${style}`,map,normalMap:normal,normalScale:new THREE.Vector2(.55,.55),roughness:1,roughnessMap:packed,metalness:1,metalnessMap:packed,aoMap:packed,aoMapIntensity:.45,envMapIntensity:1.15,ior:1.5,specularIntensity:1});
  return {material,textures:[map,normal,packed],info:{style,rows,columns,bodyFraction,width,height,pitched,profileVertices:basis.roofProfile.length,atticVent:Boolean(atticVent(basis))}};
}

function roofAtlas(kind){
  const c=canvas(512),ctx=c.getContext('2d'),hc=canvas(512),h=hc.getContext('2d');ctx.fillStyle=kind==='tile'?'#a7785b':'#717a7e';ctx.fillRect(0,0,512,512);h.fillStyle='rgb(128,128,128)';h.fillRect(0,0,512,512);
  if(kind==='tile'){
    const w=128,H=64;
    for(let row=0;row<8;row++)for(let col=-1;col<4;col++){
      const x=(col+(row%2)*.5)*w,y=row*H,tone=41+rand(row,col,7)*3;
      const gradient=ctx.createLinearGradient(x,y,x+w,y);gradient.addColorStop(0,`hsl(22 28% ${tone-4}%)`);gradient.addColorStop(.45,`hsl(23 29% ${tone+2}%)`);gradient.addColorStop(1,`hsl(21 29% ${tone-2}%)`);ctx.fillStyle=gradient;ctx.fillRect(x,y,w,H);
      const relief=h.createLinearGradient(x,y,x+w,y);relief.addColorStop(0,'rgb(112,112,112)');relief.addColorStop(.5,'rgb(153,153,153)');relief.addColorStop(1,'rgb(112,112,112)');h.fillStyle=relief;h.fillRect(x,y,w,H);
      ctx.fillStyle='rgba(39,26,18,.3)';ctx.fillRect(x,y+H-3,w,3);h.fillStyle='rgb(160,160,160)';h.fillRect(x,y+H-4,w,2);
    }
  }else{
    ctx.fillStyle=kind==='metal'?'#66737b':'#858a88';ctx.fillRect(0,0,512,512);
    ctx.strokeStyle=kind==='metal'?'#434e56':'#6c726f';ctx.lineWidth=kind==='metal'?3:1.5;
    for(let x=0;x<=512;x+=kind==='metal'?64:128){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();h.fillStyle='rgb(150,150,150)';h.fillRect(x-1,0,3,512);}
    if(kind!=='metal')for(let y=0;y<512;y+=128){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(512,y);ctx.stroke();}
  }
  const map=texture(c,true),normal=normalFromHeight(hc);map.wrapS=map.wrapT=normal.wrapS=normal.wrapT=THREE.RepeatWrapping;
  const material=new THREE.MeshStandardMaterial({name:`${MATERIAL_VERSION}/roof-${kind}`,map,normalMap:normal,normalScale:new THREE.Vector2(.25,.25),roughness:kind==='metal' ? .40 : .83,metalness:kind==='metal' ? .65 : .04,envMapIntensity:.75});
  return {material,textures:[map,normal],info:{kind}};
}

export class FacadeMaterials{
  constructor(){this.cache=new Map();this.live=new Set();this.faces=new WeakMap();this.plainWall=new THREE.MeshStandardMaterial({color:0xd2cfc5,roughness:.9});this.plainRoof=new THREE.MeshStandardMaterial({color:0x7f817c,roughness:.9});}
  begin(metadata,choice){this.metadata=metadata;this.style=resolveLook(metadata,choice);this.live.clear();}
  wall(basis){
    const p=basis.part,podium=p.id==='podium',fraction=(p.height-p.roofRise-p.base)/(p.height-p.base),profileKey=basis.roofProfile.map(v=>`${(v.u/basis.length).toFixed(4)},${((v.z-p.base)/(p.height-p.base)).toFixed(4)}`).join(';'),key=`${this.style}/${p.id}/${p.roof}/${basis.edge}/${basis.rows}/${basis.columns}/${fraction.toFixed(5)}/${profileKey}`;
    this.live.add(key);
    if(!this.cache.has(key))this.cache.set(key,wallAtlas({style:this.style,rows:basis.rows,columns:basis.columns,bodyFraction:fraction,seed:basis.edge*17+p.id.length,podium,groundFloor:p.base===0&&(basis.edge===0||basis.edge===2),basis}));
    return this.cache.get(key).material;
  }
  roof(roofType=this.metadata.parameters.roof){const pitched=roofType!=='flat',kind=pitched?(this.style==='residential'||this.style==='brick'?'tile':'metal'):'membrane',key='roof/'+kind;this.live.add(key);if(!this.cache.has(key))this.cache.set(key,roofAtlas(kind));return this.cache.get(key).material;}
  finish(){for(const [key,value] of this.cache)if(!this.live.has(key)){value.textures.forEach(t=>t.dispose());value.material.dispose();this.cache.delete(key);}}
  bind(mesh,material){this.faces.set(mesh,material);}
  setVisible(root,on){root?.traverse(o=>{if(o.isMesh)o.material=on?this.faces.get(o)||this.plainWall:o.userData.role==='roof'?this.plainRoof:this.plainWall;});}
  diagnostics(){return {version:MATERIAL_VERSION,style:this.style,atlases:this.cache.size,materials:[...this.cache.values()].map(v=>v.info)};}
  dispose(){for(const value of this.cache.values()){value.textures.forEach(t=>t.dispose());value.material.dispose();}this.cache.clear();this.plainWall.dispose();this.plainRoof.dispose();}
}

// Shallow display geometry catches real light at the glass surrounds and sills.
// It is kept outside the native mesh/export root and is never a CFD opening.
export function facadeRelief(bases,style,sourceMeshes=[]){
  const group=new THREE.Group();group.name='display-only-facade-relief';group.userData.displayOnly=true;
  const frames=[],sills=[],ventPanels=[],palette=palettes[style],axis=new THREE.Vector3(0,0,1),stats={pitchedWalls:0,cornices:0,eaveSegments:0,gutters:0,atticVents:0,roofClippedInstances:0,roofHiddenInstances:0,clearanceVersion:DETAIL_CLEARANCE_VERSION,clearance:DETAIL_CLEARANCE};
  const add=(list,b,u,z,width,height,depth)=>{
    const normal=b.normal,offset=depth/2+DETAIL_WALL_GAP,position=new THREE.Vector3(b.a[0]+b.tx*u+normal[0]*offset,b.a[1]+b.ty*u+normal[1]*offset,z),rotation=new THREE.Quaternion().setFromAxisAngle(axis,Math.atan2(-normal[0],normal[1]));
    list.push(new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(width,depth,height)));
  };
  for(const b of bases){
    const body=b.height,total=b.part.height-b.base,cellW=b.length/b.columns,cellH=body/b.rows,podium=b.part.id==='podium',pitched=b.part.roof!=='flat';
    const curtain=style==='office'&&!podium,windowW=cellW*palette.width,frame=Math.min(cellW,cellH)*(curtain ? .022 : .034);
    if(curtain){
      for(let col=0;col<b.columns;col++)for(const side of [-1,1])add(frames,b,(col+.5)*cellW+side*(windowW-frame)/2,b.base+body/2,Math.max(.00065,frame),body,.0045);
      for(let row=1;row<=b.rows;row++)add(frames,b,b.length/2,b.base+row*cellH-cellH*.05,b.length,cellH*.025,.003);
    }else{
      for(let row=0;row<b.rows;row++)for(let col=0;col<b.columns;col++){
        const isDoor=b.base===0&&(b.edge===0||b.edge===2)&&row===0&&col===Math.floor(b.columns/2),opening=openingRatios(style,podium,row,b.rows,isDoor,pitched),w=cellW*opening.width,h=cellH*opening.height;
        const u=(col+.5)*cellW,bottom=b.base+row*cellH+(cellH-h)*(1-opening.top);
        const head=Math.max(.00065,frame),jambHeight=h-head-Math.min(2e-5,head*.05);
        for(const side of [-1,1])add(frames,b,u+side*(w-head)/2,bottom+jambHeight/2,head,jambHeight,.0025);
        if(!isDoor)add(sills,b,u,bottom,w+frame*2,Math.max(.0012,cellH*.018),.008);
        add(frames,b,u,bottom+h-head/2,w,head,.0025);
      }
    }
    if(!pitched)continue;
    stats.pitchedWalls++;stats.cornices++;
    const vent=atticVent(b);
    if(vent){
      stats.atticVents++;const f=total*.0022;
      add(ventPanels,b,vent.u,vent.z,vent.width,vent.height,total*.001);
      for(const side of [-1,1]){
        add(sills,b,vent.u+side*vent.width/2,vent.z,f,vent.height-f-4e-5,total*.003);
        add(sills,b,vent.u,vent.z+side*vent.height/2,vent.width+f,f,total*.003);
      }
      for(let i=1;i<6;i++)add(frames,b,vent.u,vent.z-vent.height/2+i*vent.height/6,vent.width-f-4e-5,vent.height*.045,total*.0035);
    }
  }
  const geometry=new THREE.BoxGeometry(1,1,1),indices=[],normal=geometry.getAttribute('normal');
  // The wall closes the attached trim's back. Omitting buried back faces also
  // avoids duplicate rear planes where window surrounds meet sills or panels.
  for(let i=0;i<geometry.index.count;i+=3)if(normal.getY(geometry.index.getX(i))>-.99)indices.push(...[0,1,2].map(k=>geometry.index.getX(i+k)));
  geometry.setIndex(indices);geometry.clearGroups();
  const clearance=roofDetailClearance(sourceMeshes,{openBack:true});let boxUsed=false;
  for(const [name,matrices,color,metalness,roughness] of [['frames',frames,palette.frame,palette.metal,.36],['sills',sills,style==='office'?'#a3a9a6':palette.frame,.06,.78],['vents',ventPanels,'#354346',.12,.70]]){
    if(!matrices.length)continue;
    const ordinary=[],positions=[],normals=[];
    for(const matrix of matrices){const clipped=clearance(matrix);if(!clipped)ordinary.push(matrix);else if(!clipped.positions.length)stats.roofHiddenInstances++;else{stats.roofClippedInstances++;positions.push(...clipped.positions);normals.push(...clipped.normals);}}
    const material=new THREE.MeshStandardMaterial({color,metalness,roughness,envMapIntensity:.85});
    if(ordinary.length){
      boxUsed=true;const mesh=new THREE.InstancedMesh(geometry,material,ordinary.length);mesh.name=name;
      ordinary.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }
    if(positions.length){
      const clippedGeometry=new THREE.BufferGeometry();clippedGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));clippedGeometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
      const mesh=new THREE.Mesh(clippedGeometry,material);mesh.name=name+'-roof-clipped';mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }else if(!ordinary.length)material.dispose();
  }
  if(!boxUsed)geometry.dispose();
  const trim=roofEdgeTrim(bases,sourceMeshes);
  for(const [kind,geometry] of Object.entries(trim.geometries)){
    const color=kind==='flat'?(style==='office'?'#a3a9a6':palette.frame):(style==='office'||style==='stone'?'#52656c':'#786858');
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,metalness:kind==='flat'?.06:.30,roughness:.57,envMapIntensity:.85}));mesh.name='continuous-roof-trim-'+kind;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.stats={...stats,eaveSegments:trim.stats.eaveSegments,gutters:trim.stats.gutters,roofTrim:trim.stats,instances:frames.length+sills.length+ventPanels.length};
  return group;
}

export function installDaylight(renderer,scene){
  const environment=new THREE.Scene();
  const sky=new THREE.Mesh(new THREE.SphereGeometry(25,24,16),new THREE.ShaderMaterial({side:THREE.BackSide,toneMapped:false,vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:'varying vec3 vDir;void main(){vec3 d=normalize(vDir);float h=d.z;vec3 c=mix(vec3(.80,.88,.96),vec3(.26,.45,.66),pow(max(h,0.),.50));if(h<0.)c=mix(vec3(.80,.88,.96),vec3(.22,.24,.23),min(-h*3.,1.));float sun=pow(max(dot(d,normalize(vec3(-3.,-4.,6.))),0.),250.);float cloud=pow(max(0.,sin(d.x*5.+d.y*3.)*.5+.5),8.)*smoothstep(.05,.5,h)*.22;c+=cloud;c+=vec3(9.,7.8,6.2)*sun;gl_FragColor=vec4(c,1.);}'}));environment.add(sky);
  for(const [size,pos,intensity] of [[[10,6],[-8,-6,9],2.8],[[7,10],[8,2,8],1.7]]){
    const p=new THREE.Mesh(new THREE.PlaneGeometry(...size),new THREE.MeshBasicMaterial({color:new THREE.Color(intensity,intensity*1.03,intensity*1.07),toneMapped:false}));p.position.set(...pos);p.lookAt(0,0,0);environment.add(p);
  }
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2,height=2+rand(i,3)*5,b=new THREE.Mesh(new THREE.BoxGeometry(1.3+rand(i)*2,1.8,height),new THREE.MeshBasicMaterial({color:new THREE.Color(.22+rand(i)*.12,.27+rand(i)*.10,.30+rand(i)*.10)}));b.position.set(Math.cos(a)*15,Math.sin(a)*15,height/2-2);environment.add(b);}
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(environment,.045,.1,70);scene.environment=target.texture;scene.environmentIntensity=.65;pmrem.dispose();
  environment.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  return ()=>{target.dispose();scene.environment=null;};
}

export function contactShadow(metadata){
  const {outline,holes,parameters:p}=metadata,padding=.12,width=p.width+padding*2,height=p.depth+padding*2,size=256,c=canvas(size),ctx=c.getContext('2d'),image=ctx.createImageData(size,size),rings=[outline,...holes];
  const inside=(x,y,ring)=>{let found=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])found=!found;}return found;};
  const segments=rings.flatMap(r=>r.map((a,i)=>[a,r[(i+1)%r.length]]));
  for(let iy=0;iy<size;iy++)for(let ix=0;ix<size;ix++){
    const x=(ix/(size-1)-.5)*width,y=(iy/(size-1)-.5)*height;
    const solid=inside(x,y,outline)&&!holes.some(h=>inside(x,y,h));let distance=Infinity;
    for(const [a,b] of segments){const dx=b[0]-a[0],dy=b[1]-a[1],u=clamp(((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy),0,1);distance=Math.min(distance,Math.hypot(x-a[0]-dx*u,y-a[1]-dy*u));}
    const alpha=solid ? .20 : Math.exp(-distance*distance/.0017)*.20,i=(iy*size+ix)*4;image.data[i]=35;image.data[i+1]=39;image.data[i+2]=41;image.data[i+3]=Math.round(alpha*255);
  }
  ctx.putImageData(image,0,0);const map=texture(c,true),material=new THREE.MeshBasicMaterial({map,transparent:true,depthWrite:false,toneMapped:false}),plane=new THREE.Mesh(new THREE.PlaneGeometry(width,height),material);plane.position.z=-.0006;plane.renderOrder=1;
  plane.userData.displayOnly=true;return plane;
}
