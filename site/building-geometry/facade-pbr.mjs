import * as THREE from './vendor/three.module.js';

export const MATERIAL_VERSION='architectural-pbr-v1';
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

export function resolveLook(metadata,choice='auto'){
  if(choice!=='auto')return choice;
  const p=metadata.parameters;
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

function wallAtlas({style,rows,columns,bodyFraction,seed,podium,groundFloor}){
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
  // Roof triangles sample the deliberately blank upper section of this atlas.
  if(bodyTop>0){color.fillStyle=palette.wall;color.fillRect(0,0,width,bodyTop);h.fillStyle='rgb(128,128,128)';h.fillRect(0,0,width,bodyTop);}
  for(let row=0;row<rows;row++){
    const y=bodyTop+(rows-row-1)*cellH,band=Math.max(1,cellH*(style==='office'&&!podium ? .10 : .035));
    color.fillStyle=palette.band;color.fillRect(0,y+cellH-band,width,band);h.fillStyle='rgb(140,140,140)';h.fillRect(0,y+cellH-band,width,band);
    for(let column=0;column<columns;column++){
      const variation=rand(row,column,seed),isDoor=groundFloor&&row===0&&column===Math.floor(columns/2),windowW=cellW*(isDoor ? .65 : palette.width),windowH=cellH*(isDoor ? .99 : palette.height);
      const x=column*cellW+(cellW-windowW)/2,wy=y+(cellH-windowH)*(isDoor ? 1 : .35),frame=Math.max(1.1,Math.min(cellW,cellH)*(style==='office' ? .022 : .034)),reveal=Math.max(1,frame*.7);
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
  const baseShade=color.createLinearGradient(0,height*.82,0,height);baseShade.addColorStop(0,'rgba(28,29,26,0)');baseShade.addColorStop(1,'rgba(28,29,26,.13)');color.fillStyle=baseShade;color.fillRect(0,height*.82,width,height*.18);
  const map=texture(c,true),normal=normalFromHeight(heightCanvas),packed=texture(ormCanvas);
  const material=new THREE.MeshPhysicalMaterial({name:`${MATERIAL_VERSION}/${style}`,map,normalMap:normal,normalScale:new THREE.Vector2(.55,.55),roughness:1,roughnessMap:packed,metalness:1,metalnessMap:packed,aoMap:packed,aoMapIntensity:.45,envMapIntensity:1.15,ior:1.5,specularIntensity:1});
  return {material,textures:[map,normal,packed],info:{style,rows,columns,bodyFraction,width,height}};
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
    const p=basis.part,podium=p.id==='podium',fraction=(p.height-p.roofRise-p.base)/(p.height-p.base),key=`${this.style}/${p.id}/${basis.edge}/${basis.rows}/${basis.columns}/${fraction.toFixed(5)}`;
    this.live.add(key);
    if(!this.cache.has(key))this.cache.set(key,wallAtlas({style:this.style,rows:basis.rows,columns:basis.columns,bodyFraction:fraction,seed:basis.edge*17+p.id.length,podium,groundFloor:p.base===0&&(basis.edge===0||basis.edge===2)}));
    return this.cache.get(key).material;
  }
  roof(){const pitched=this.metadata.parameters.roof!=='flat',kind=pitched?(this.style==='residential'||this.style==='brick'?'tile':'metal'):'membrane',key='roof/'+kind;this.live.add(key);if(!this.cache.has(key))this.cache.set(key,roofAtlas(kind));return this.cache.get(key).material;}
  finish(){for(const [key,value] of this.cache)if(!this.live.has(key)){value.textures.forEach(t=>t.dispose());value.material.dispose();this.cache.delete(key);}}
  bind(mesh,material){this.faces.set(mesh,material);}
  setVisible(root,on){root?.traverse(o=>{if(o.isMesh)o.material=on?this.faces.get(o)||this.plainWall:o.userData.role==='roof'?this.plainRoof:this.plainWall;});}
  diagnostics(){return {version:MATERIAL_VERSION,style:this.style,atlases:this.cache.size,materials:[...this.cache.values()].map(v=>v.info)};}
  dispose(){for(const value of this.cache.values()){value.textures.forEach(t=>t.dispose());value.material.dispose();}this.cache.clear();this.plainWall.dispose();this.plainRoof.dispose();}
}

// Shallow display geometry catches real light at the glass surrounds and sills.
// It is kept outside the native mesh/export root and is never a CFD opening.
export function facadeRelief(bases,style){
  const group=new THREE.Group();group.name='display-only-facade-relief';group.userData.displayOnly=true;
  const frames=[],sills=[],palette=palettes[style],axis=new THREE.Vector3(0,0,1);
  const add=(list,b,u,z,width,height,depth)=>{
    const normal=b.normal,position=new THREE.Vector3(b.a[0]+b.tx*u+normal[0]*depth*.45,b.a[1]+b.ty*u+normal[1]*depth*.45,z),rotation=new THREE.Quaternion().setFromAxisAngle(axis,Math.atan2(b.ty,b.tx));
    list.push(new THREE.Matrix4().compose(position,rotation,new THREE.Vector3(width,depth,height)));
  };
  for(const b of bases){
    const body=b.height,cellW=b.length/b.columns,cellH=body/b.rows,podium=b.part.id==='podium';
    const curtain=style==='office'&&!podium,windowW=cellW*(podium&&style==='office' ? .83 : palette.width),windowH=cellH*(podium&&style==='office' ? .78 : palette.height),frame=Math.min(cellW,cellH)*(curtain ? .022 : .034);
    if(curtain){
      for(let col=0;col<b.columns;col++)for(const side of [-1,1])add(frames,b,(col+.5)*cellW+side*(windowW-frame)/2,b.base+body/2,Math.max(.00065,frame),body,.0045);
      for(let row=1;row<=b.rows;row++)add(frames,b,b.length/2,b.base+row*cellH-cellH*.05,b.length,cellH*.025,.003);
    }else{
      for(let row=0;row<b.rows;row++)for(let col=0;col<b.columns;col++){
        const isDoor=b.base===0&&(b.edge===0||b.edge===2)&&row===0&&col===Math.floor(b.columns/2),w=isDoor?cellW*.65:windowW,h=isDoor?cellH*.99:windowH;
        const u=(col+.5)*cellW,bottom=b.base+row*cellH+(isDoor?0:(cellH-h)*.65);
        for(const side of [-1,1])add(frames,b,u+side*(w-frame)/2,bottom+h/2,Math.max(.00065,frame),h,.0025);
        if(!isDoor)add(sills,b,u,bottom,w+frame*2,Math.max(.0012,cellH*.018),.008);
        add(frames,b,u,bottom+h-frame/2,w,Math.max(.00065,frame),.0025);
      }
    }
    if(b.part.roof==='flat')add(sills,b,b.length/2,b.base+body-.001,b.length,.004,.006);
  }
  const geometry=new THREE.BoxGeometry(1,1,1);
  for(const [matrices,color,metalness,roughness] of [[frames,palette.frame,palette.metal,.36],[sills,style==='office'?'#a3a9a6':palette.frame,.06,.78]]){
    if(!matrices.length)continue;
    const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color,metalness,roughness,envMapIntensity:.85}),matrices.length);
    matrices.forEach((m,i)=>mesh.setMatrixAt(i,m));mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  }
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
