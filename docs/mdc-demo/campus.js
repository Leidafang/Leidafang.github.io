import * as THREE from 'three';
import {addTree,addShrub,addPlanterBush} from './vegetation.js';
import {groundSurface,grassBed,pavedSlab} from './landscape.js';
import {logoShapes} from './brand-geometry.js';
import {outsideBlocks} from './render-geometry.js';
import {resolveCampusSurfaces} from './campus-surfaces.js';

// Illustrative context only: not survey/CAD, a simulated building, or a CFD BC.
// All external equipment is outside the retained air domain and does not alter U/T.
export const CAMPUS={office:[[-24,9,-.65],[8,23,18]],
  labels:[['办公楼',[-26.5,9,18.6]],
          ['通信/供电桥架',[5.7,7.2,3.6]],
          ['集装箱数据中心',[2.1,-.1,2.63]]],
  connection:[[4.28,2.5,1.72],[5.7,2.5,1.72],[5.7,2.5,3.25],[5.7,9,3.25]],
  plaza:[-25,9,-4,9],road:[-30,14,-10,-4],
  beds:[[-26.4,15,2,14],[11.2,15,2,14],[-16,3,8,3]],
  benches:[[-19,.85],[-13,.85],[-9,6.3]]};
let officeLetters=[];
// Shared elbow vertices include both adjacent offsets. Independently offsetting
// each segment leaves a gap where the horizontal tray becomes a vertical riser.
export function bridgeLane(offset,lift=0){
  return CAMPUS.connection.map(([x,y,z],i)=>[x+(i?offset:0),y+(i<3?offset:0),z+lift]);
}
export async function prepareCampus(){
  const texture=await new THREE.TextureLoader().loadAsync('./assets/brand/glodon-logo.png');
  const canvas=document.createElement('canvas');canvas.width=texture.image.width;canvas.height=texture.image.height;
  const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(texture.image,0,0);
  const pixels=context.getImageData(0,0,canvas.width,canvas.height);
  officeLetters=[true,false].map(green=>new THREE.ExtrudeGeometry(logoShapes(pixels,green),
    {depth:1.5,bevelEnabled:false,steps:1,curveSegments:1}));
  texture.dispose();
}
const boxGeo=new THREE.BoxGeometry(1,1,1),dummy=new THREE.Object3D();
function mat(color,metalness=0,roughness=.8){return new THREE.MeshStandardMaterial({color,metalness,roughness});}
function blocks(group,boxes,material){
  if(!boxes.length)return;
  const inst=new THREE.InstancedMesh(boxGeo,material,boxes.length);
  boxes.forEach(([x,y,z,sx,sy,sz],i)=>{dummy.position.set(x,y,z);dummy.scale.set(sx,sy,sz);dummy.rotation.set(0,0,0);dummy.updateMatrix();inst.setMatrixAt(i,dummy.matrix);});
  inst.castShadow=true;inst.receiveShadow=true;group.add(inst);return inst;
}
function bar(group,a,b,width,material){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const mesh=new THREE.Mesh(boxGeo,material);mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
  mesh.scale.set(width,delta.length(),width);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function grain(material,scale=3){
  const n=128,data=new Uint8Array(n*n*4);
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const noise=(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
    const v=203+Math.round(noise*22);const i=(y*n+x)*4;data.set([v,v,v,255],i);
  }
  const tex=new THREE.DataTexture(data,n,n,THREE.RGBAFormat);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.repeat.set(scale,scale);tex.needsUpdate=true;tex.generateMipmaps=true;tex.minFilter=THREE.LinearMipmapLinearFilter;
  material.roughnessMap=tex;material.bumpMap=tex;material.bumpScale=.008;return material;
}
function cylinder(group,a,b,radius,material){
  const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a));
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,v.length(),12),material);
  mesh.position.set(...a).addScaledVector(v,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());
  mesh.castShadow=true;group.add(mesh);return mesh;
}
export function buildCampus(group){
  group.userData.campus=true;
  const ground=mat(0x454b4d),concrete=grain(mat(0xc9c6bf)),trim=mat(0x40505b,.65,.35);
  const white=grain(mat(0xc8cecf,.08,.72));
  const safety=mat(0xdab049,.15,.65),utility=mat(0x397a97,.6,.35);
  // One site layout: a full-width forecourt, a six-metre access road, and
  // a distinct equipment apron. Coordinates are independent of CFD geometry.
  pavedSlab(group,-8,8,-.679,44,38,.22,'asphalt',2.1,ground);
  pavedSlab(group,-8,-10.5,-.607,44,1,.07,'concrete',3.6,concrete);
  pavedSlab(group,-8,2.5,-.607,34,13,.07,'concrete',3.6,concrete).name='office-forecourt';
  pavedSlab(group,-8,24.6,-.607,34,2.7,.07,'concrete',3.6,concrete);
  for(const x of [-25,9])pavedSlab(group,x,16,-.607,1.3,14,.07,'concrete',3.6,concrete);
  // Front kerb spans the new building; lowered pedestrian/service accesses.
  const kerbs=[[-16.2,-4,-.56,17.6,.16,.22],[-1.75,-4,-.56,1.7,.16,.22],[7.3,-4,-.56,3.4,.16,.22],
    [-25,2.5,-.56,.16,13,.22],[9,2.5,-.56,.16,13,.22],[-19,-10,-.56,22,.18,.22],[6,-10,-.56,16,.18,.22]];
  blocks(group,kerbs,concrete);
  const pavingTrim=mat(0x777e7d,.05,.85);
  // Broad edging bands define the entrance axis without a duplicate tile grid.
  blocks(group,[[-7.4,1.2,-.594,.20,10.4,.016],[-2.6,1.2,-.594,.20,10.4,.016],
    [-8,6,-.594,34,.20,.016],[-8,-3.3,-.594,34,.20,.016]],pavingTrim);
  groundSurface(group,2.65,1.5,-.59,6.7,7,'concrete',1.8).name='equipment-apron';
  blocks(group,[[2.1,1.36,-.55,4.8,3.37,.10]],concrete);
  const drains=[],roadMarks=[];
  for(let x=-24.8;x<9;x+=.18)drains.push([x,-3.7,-.588,.04,.12,.012]);
  blocks(group,[[-8,-3.7,-.598,34,.16,.015]],trim);blocks(group,drains,white);
  // Road centre follows the entire frontage, broken at the entry crossing.
  for(let x=-28.8;x<13;x+=3)if(x<-8.4||x>-1.6)roadMarks.push([x,-7,-.673,1.5,.09,.009]);
  for(const y of [-9.6,-4.4])roadMarks.push([-8,y,-.673,43,.08,.009]);
  for(let y=-9.4;y<-4.4;y+=.72)roadMarks.push([-5,y,-.667,4.1,.38,.012]);
  blocks(group,roadMarks,mat(0xe4e1cb)).name='road-markings';
  const soil=mat(0x665741,0,1);
  blocks(group,CAMPUS.beds.map(([x,y,w,l])=>[x,y,-.62,w,l,.08]),soil);
  CAMPUS.beds.forEach(([x,y,w,l],i)=>grassBed(group,x,y,w,l,173+i*108,.04));
  // Curbed planting beds, not green plates lying on an asphalt model base.
  const bedEdges=[];
  for(const [x,y,w,l] of CAMPUS.beds){
    for(const sign of [-1,1]){
      bedEdges.push([x+sign*(w/2+.035),y,-.55,.075,l+.15,.12]);
      bedEdges.push([x,y+sign*(l/2+.035),-.55,w+.15,.075,.12]);
    }
  }
  blocks(group,bedEdges,concrete);

  // Photo-referenced office massing: six storeys, terracotta vertical ribs,
  // recessed dark glazing and roof lettering. Dimensions are display estimates.
  const office=new THREE.Group();office.name='glodon-office';
  office.userData={illustrative:true,storeys:6,footprint:[32,14],height:18.65};group.add(office);
  const terracotta=grain(mat(0xa94422,.12,.65));
  const sunlitClay=mat(0xc46135,.12,.66),recess=mat(0x492d26,.05,.8);
  const darkGlass=mat(0x284752,.50,.21),palePanel=mat(0x9caaa8,.2,.6),roof=grain(mat(0x8b9089,.15,.8));
  blocks(office,[[-8,16,8.45,31.7,13.7,18.2]],recess);
  blocks(office,[[-8,16,17.99,32.4,14.4,.25]],roof);
  const ribs=[],bands=[],glassFaces=[],panels=[],frames=[],sills=[],reflectiveGlass=[];
  const pitch=32/26,sidePitch=14/12;
  // A clear ground-floor plinth and six horizontal floor bands sit behind the fins.
  for(let level=0;level<6;level++){
    const z=-.58+level*3.08;
    for(const y of [8.98,23.02]){
      bands.push([-8,y,z+.12,32.15,.28,.3]);
      for(let bay=0;bay<26;bay++){
        const x=-24+(bay+.5)*pitch;
        glassFaces.push([x,y,z+1.64,pitch-.30,.10,2.38]);
        panels.push([x,y-.012,z+.47,pitch-.30,.13,.46]);
        const face=y<16?y-.08:y+.08;
        frames.push([x,face,z+1.64,.045,.12,2.38],[x,face,z+2.23,pitch-.30,.12,.04]);
        sills.push([x,face,z+.76,pitch-.22,.30,.055],[x,face,z+2.86,pitch-.22,.20,.05]);
        if((bay+level*3)%5===0)reflectiveGlass.push([x,face,z+1.7,pitch-.38,.015,1.73]);
      }
    }
    for(const x of [-24.15,8.15]){
      bands.push([x,16,z+.12,.28,14.15,.3]);
      for(let bay=0;bay<12;bay++){
        const y=9+(bay+.5)*sidePitch;
        glassFaces.push([x,y,z+1.64,.10,sidePitch-.28,2.38]);
        panels.push([x+.012,y,z+.47,.13,sidePitch-.28,.46]);
        const face=x<0?x-.08:x+.08;
        frames.push([face,y,z+1.64,.12,.045,2.38],[face,y,z+2.23,.12,sidePitch-.28,.04]);
        sills.push([face,y,z+.76,.30,sidePitch-.22,.055],[face,y,z+2.86,.20,sidePitch-.22,.05]);
        if((bay+level*3)%5===0)reflectiveGlass.push([face,y,z+1.7,.015,sidePitch-.36,1.73]);
      }
    }
  }
  for(let i=0;i<=26;i++)for(const y of [8.78,23.22])ribs.push([-24+i*pitch,y,8.74,.19,.50,18.65]);
  for(let i=0;i<=12;i++)for(const x of [-24.20,8.20])ribs.push([x,9+i*sidePitch,8.74,.28,.19,18.65]);
  // A real entrance opening: remove the regular ground-floor facade behind
  // the doors, including fins that previously coincided with the door rails.
  const portal={lo:[-7.3,8.45,-.65],hi:[-2.7,9.12,2.75]};
  for(const boxes of [ribs,bands,glassFaces,panels,frames,sills,reflectiveGlass]){
    const clipped=outsideBlocks(boxes.map(b=>({lo:b.slice(0,3).map((x,k)=>x-b[k+3]/2),hi:b.slice(0,3).map((x,k)=>x+b[k+3]/2)})),[portal]);
    boxes.splice(0,boxes.length,...clipped.map(b=>[...b.lo.map((x,k)=>(x+b.hi[k])/2),...b.lo.map((x,k)=>b.hi[k]-x)]));
  }
  blocks(office,glassFaces,darkGlass);blocks(office,reflectiveGlass,mat(0x395c68,.45,.25));
  blocks(office,panels,palePanel);blocks(office,frames,trim);blocks(office,sills,mat(0x6b7371,.5,.4));
  blocks(office,bands,terracotta);blocks(office,ribs,sunlitClay);
  blocks(office,[[-8,8.76,18.1,32.65,.55,.30],[-8,23.24,18.1,32.65,.55,.30],
    [-24.24,16,18.1,.55,14.5,.30],[8.24,16,18.1,.55,14.5,.30]],terracotta);
  // Full parapet and coping; the roof plane sits within these edges.
  blocks(office,[[-8,23,18.36,32,.18,.45],[-24,16,18.36,.18,14,.45],[8,16,18.36,.18,14,.45]],terracotta);
  blocks(office,[[-8,23,18.60,32.3,.32,.065],[-24,16,18.60,.32,14,.065],[8,16,18.60,.32,14,.065]],trim);
  // Low roof rail, rooftop service volumes and structural supports for the signs.
  for(const y of [8.9,23.1]){
    for(let x=-24;x<=8;x+=2)bar(office,[x,y,18.2],[x,y,18.8],.035,trim);
    bar(office,[-24,y,18.78],[8,y,18.78],.035,trim);
  }
  blocks(office,[[-10,18.5,18.8,5,3,1.5],[-18,19,18.45,3.3,2.6,.8]],roof);
  blocks(office,[[-10,18.5,19.57,5.3,3.3,.12],[-18,19,18.9,3.6,2.9,.10]],trim);
  const vents=[];for(let i=0;i<9;i++)vents.push([-10,16.97,18.35+i*.12,3.6,.08,.045]);
  blocks(office,vents,trim);
  for(const x of [-18.8,-17.2]){
    const fan=new THREE.Mesh(new THREE.CylinderGeometry(.43,.43,.1,24),trim);
    fan.rotation.x=Math.PI/2;fan.position.set(x,19,18.99);fan.castShadow=true;office.add(fan);
    for(let k=-3;k<=3;k++)bar(office,[x-.33,19+k*.095,19.055],[x+.33,19+k*.095,19.055],.018,white);
  }
  // Dark metal backs and opaque brand-coloured faces give actual letter depth.
  const signColors=[0x63b62e,0x0080cb];
  const signSides=signColors.map(color=>mat(color,.25,.42));
  const signFaces=signColors.map(color=>new THREE.MeshBasicMaterial({color,toneMapped:false}));
  function roofSign(width,position,right){
    const height=width*33/346;
    const sign=new THREE.Group();
    const x=new THREE.Vector3(...right),up=new THREE.Vector3(0,0,1),normal=x.clone().cross(up);
    sign.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,up,normal));
    sign.position.set(...position);sign.name='glodon-roof-sign';sign.userData.extruded=true;office.add(sign);
    officeLetters.forEach((geometry,i)=>{
      const letters=new THREE.Mesh(geometry,[signFaces[i],signSides[i]]);
      letters.scale.setScalar(width/346);letters.position.set(-width/2,-height/2,0);
      letters.castShadow=true;sign.add(letters);
    });
    const back=new THREE.Vector3(...position).addScaledVector(normal,-.22);
    for(const z of [position[2]-height*.38,position[2]+height*.12]){
      const a=back.clone().addScaledVector(x,-width*.48),b=back.clone().addScaledVector(x,width*.48);a.z=b.z=z;
      bar(office,a.toArray(),b.toArray(),.035,trim);
    }
    for(let t=-.45;t<=.46;t+=.15){
      const base=back.clone().addScaledVector(x,width*t);base.z=18.2;
      const top=base.clone();top.z=position[2]+height*.42;
      bar(office,base.toArray(),top.toArray(),.035,trim);
      const foot=base.clone().addScaledVector(normal,-.8);
      bar(office,foot.toArray(),top.toArray(),.028,trim);
    }
  }
  roofSign(15,[-3.5,8.55,19.3],[1,0,0]);roofSign(10,[8.45,16,19.15],[0,1,0]);
  office.userData.roofSigns={count:2,letterMeshes:officeLetters.length*2,
    triangles:officeLetters.reduce((sum,g)=>sum+g.attributes.position.count/3,0)*2,rasterFaces:false};
  // Recessed entrance and a canopy connecting the office promenade to the yard.
  blocks(office,[[-5,8.68,.88,4,.15,2.9]],darkGlass);
  blocks(office,[[-5,7.75,2.58,5,2.65,.18]],terracotta);
  blocks(office,[[-5,8.65,.88,.075,.18,2.9]],trim);
  for(const x of [-7.15,-2.85])bar(office,[x,6.65,-.53],[x,6.65,2.5],.08,trim);
  blocks(office,[[-5,7.7,-.43,5.3,2.7,.16]],concrete);
  // Entrance fascia, glazing rails, canopy soffit, handles and a flush approach.
  blocks(office,[[-5,6.43,2.58,5.04,.07,.22],[-5,7.75,2.47,4.8,2.4,.035]],trim);
  blocks(office,[[-5,7.0,-.51,5.8,3.1,.12]],concrete);
  const entryFrames=[];
  for(const x of [-6.9,-5.65,-4.35,-3.1])entryFrames.push([x,8.57,.9,.045,.08,2.8]);
  entryFrames.push([-5,8.57,1.95,3.85,.08,.045],[-5.12,8.46,.9,.025,.06,.45],[-4.88,8.46,.9,.025,.06,.45]);
  blocks(office,entryFrames,white);
  // Rear drainage and facade movement joints help the mass read as construction.
  for(const x of [-23.6,7.6])cylinder(office,[x,23.3,-.5],[x,23.3,18.3],.055,trim);

  // Container shell now has its own cutaway-aware group, independent of campus.
  const zoneMarks=[];
  for(let x=-.4;x<4.8;x+=.45)zoneMarks.push([x,-.55,-.518,.24,.035,.005]);
  for(const x of [-.4,4.6])for(let y=-.4;y<3.1;y+=.45)zoneMarks.push([x,y,-.518,.035,.24,.005]);
  blocks(group,zoneMarks,safety);
  for(const x of [-.4,4.6])for(const y of [-.5,3.25]){
    cylinder(group,[x,y,-.57],[x,y,.24],.052,safety);
    cylinder(group,[x,y,.08],[x,y,.16],.054,trim);
    blocks(group,[[x,y,-.56,.19,.19,.035]],trim);
  }

  // A visually continuous service bridge ends at each facade penetration.
  // It suggests building IT/power connectivity, NOT air or water exchange.
  const route=CAMPUS.connection;
  const rungs=[];
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i];
    const d=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),length=d.length();
    const cross=Math.abs(d.x)>.1?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0);
    const tray=bar(group,a,b,.09,trim);tray.userData.serviceBridge=true;
    for(let step=.12;step<length;step+=.25){
      const p=new THREE.Vector3(...a).addScaledVector(d,step/length);
      rungs.push([p.x,p.y,p.z,cross.x?.43:.025,cross.y?.43:.025,.03]);
    }
  }
  for(const offset of [-.19,.19]){
    const points=bridgeLane(offset);for(let i=1;i<points.length;i++)bar(group,points[i-1],points[i],.055,trim);
  }
  for(const offset of [-.10,.10]){
    const points=bridgeLane(offset,.065).map(p=>new THREE.Vector3(...p)),path=new THREE.CurvePath();
    let start=points[0];
    for(let i=1;i<points.length-1;i++){
      const corner=points[i],incoming=corner.clone().sub(points[i-1]).normalize(),outgoing=points[i+1].clone().sub(corner).normalize();
      const a=corner.clone().addScaledVector(incoming,-.075),b=corner.clone().addScaledVector(outgoing,.075);
      path.add(new THREE.LineCurve3(start,a));path.add(new THREE.QuadraticBezierCurve3(a,corner,b));start=b;
    }
    path.add(new THREE.LineCurve3(start,points.at(-1)));
    const cable=new THREE.Mesh(new THREE.TubeGeometry(path,180,.022,8,false),offset<0?utility:safety);
    cable.name=offset<0?'bridge-data-cable':'bridge-power-cable';cable.userData.continuous=true;group.add(cable);
  }
  blocks(group,rungs,white);
  for(const y of [2.5,5.2,8.3]){
    bar(group,[6.04,y,-.60],[6.04,y,3.30],.085,trim);
    bar(group,[5.42,y,3.17],[6.10,y,3.17],.07,trim);
    blocks(group,[[6.04,y,-.57,.28,.28,.05]],trim);
  }
  blocks(group,[[4.29,2.5,1.72,.085,.42,.42],[5.7,8.63,3.25,.68,.36,.55]],utility);
  // Weather hood and dedicated service bay terminate against the actual facade.
  blocks(group,[[5.7,8.62,2.01,.89,.25,4.9],[5.7,8.38,3.58,.88,.65,.08]],trim);
  blocks(group,[[7.25,7,.16,.85,.7,1.5]],white);
  const cabinetVents=[];for(let k=0;k<7;k++)cabinetVents.push([7.25,6.64,.08+k*.09,.63,.04,.025]);
  blocks(group,cabinetVents,trim);

  // Planters at the office entry; no particle-like foliage or decorative fog.
  for(const x of [-8.3,-1.7]){
    blocks(group,[[x,7.4,-.34,.85,.78,.55]],trim);
    blocks(group,[[x,7.4,-.061,.78,.71,.012]],soil);
    blocks(group,[[x,7.01,-.05,.9,.035,.045],[x,7.79,-.05,.9,.035,.045],
      [x-.435,7.4,-.05,.035,.8,.045],[x+.435,7.4,-.05,.035,.8,.045]],white);
    for(let n=0;n<3;n++)addPlanterBush(group,x+(n-1)*.2,7.4+(n%2?-.06:.06),-.045,n===0?.8:.68+n*.03,n);
  }
  const trees=[[-26.4,14,6.8],[11.2,14,6.3],[-19,3,5.0],[-13,3,4.7]];
  for(const [i,[x,y,h]] of trees.entries())addTree(group,x,y,h,i);
  for(const [x,y] of trees){
    const mulch=new THREE.Mesh(new THREE.CircleGeometry(.37,24),soil);mulch.position.set(x,y,-.566);mulch.receiveShadow=true;group.add(mulch);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.39,.018,5,32),trim);ring.position.set(x,y,-.551);group.add(ring);
  }
  for(let n=0;n<12;n++)addShrub(group,n%2?-26.4:11.2,9+Math.floor(n/2)*2.1,-.575,.32+(n%3)*.055,n);
  // Seating faces the forecourt with its back to planting, clear of the main
  // entrance axis and equipment access. Bicycle stands occupy the west end.
  const bench=[],backrest=[],benchLegs=[];
  for(const [x,y] of CAMPUS.benches){
    for(let i=0;i<5;i++)bench.push([x,y+i*.085,-.13,2.0,.07,.055]);
    for(let k=0;k<3;k++)backrest.push([x,y+.43,.04+k*.1,2.0,.055,.065]);
    for(const dx of [-.76,.76])benchLegs.push([x+dx,y+.18,-.36,.075,.4,.45],[x+dx,y+.42,-.05,.06,.055,.8]);
  }
  blocks(group,bench,grain(mat(0x8a7455)));blocks(group,backrest,grain(mat(0x92744d)));blocks(group,benchLegs,trim);
  for(let x=-23.5;x<-20.5;x+=.6){
    cylinder(group,[x,6.6,-.60],[x,6.6,.24],.025,trim);
    cylinder(group,[x,7.2,-.60],[x,7.2,.24],.025,trim);
    cylinder(group,[x,6.6,.24],[x,7.2,.24],.025,trim);
  }
  // Quiet service-yard details: inspection covers, facade sconces and two
  // path lights. Nothing intrudes into the container or implies a new CFD BC.
  for(const [x,y] of [[7.1,.2],[7.1,5.6]]){
    blocks(group,[[x,y,-.598,.52,.52,.014]],trim);
    const cover=[];for(let k=0;k<6;k++)cover.push([x,y-.21+k*.084,-.588,.45,.012,.007]);
    blocks(group,cover,mat(0x899491,.55,.65));
  }
  for(const x of [-8.3,-1.7]){
    blocks(group,[[x,8.6,1.77,.18,.12,.24]],trim);
    blocks(group,[[x,8.532,1.77,.12,.012,.15]],mat(0xe9e9d5,0,.5));
  }
  for(const [x,y] of [[-8.1,-2.9],[-1.9,-2.9],[-22,5.4],[-10,5.4],[8.4,-2.9]]){
    cylinder(group,[x,y,-.61],[x,y,.24],.036,trim);
    blocks(group,[[x,y,.24,.14,.14,.055]],white);
  }
  resolveCampusSurfaces(group);
}
