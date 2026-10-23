import * as THREE from 'three';
import { fanRPM, fanAngle } from './flow-math.js';
import {buildCampus} from './campus.js';
import {outsideBlocks} from './render-geometry.js';

// Render-only detail: never used as CFD occupancy, heat transfer or particle data.
export const rotors=[];
const cube=new THREE.BoxGeometry(1,1,1), transform=new THREE.Object3D();
function batch(group,items,material){
  if(!items.length)return;
  const mesh=new THREE.InstancedMesh(cube,material,items.length);
  items.forEach(([x,y,z,sx,sy,sz],i)=>{
    transform.position.set(x,y,z);transform.scale.set(sx,sy,sz);transform.rotation.set(0,0,0);
    transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
  });
  mesh.receiveShadow=true;group.add(mesh);return mesh;
}
function tube(group,points,r,material){
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(8,points.length*8),r,6,false),material);
  group.add(mesh);return mesh;
}
function surfaceTexture(kind){
  const size=128,data=new Uint8Array(size*size*4);let seed=97;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=(seed>>>24)/255;
    const grain=kind==='brush'?170+45*Math.sin(y*1.3)+20*noise:165+65*noise;
    const seam=kind==='floor'&&(x%64<2||y%64<2);
    const v=seam?65:Math.round(grain),i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=v;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.needsUpdate=true;texture.repeat.set(4,4);
  return texture;
}
export function finishMaterials(mats){
  const coat=surfaceTexture('coat'),brush=surfaceTexture('brush'),floor=surfaceTexture('floor');
  for(const name of ['body','dark','structure']){
    mats[name].roughnessMap=coat;mats[name].bumpMap=coat;mats[name].bumpScale=.00065;
  }
  for(const name of ['panel','frame','coil','fan']){
    mats[name].roughnessMap=brush;mats[name].bumpMap=brush;mats[name].bumpScale=.00025;
  }
  mats.floor.map=floor;mats.floor.roughness=.83;
}
export function addFan(group,x,y,z,r,axis,kind,multiplier){
  const assembly=new THREE.Group();assembly.position.set(x,y,z);
  if(axis==='y')assembly.rotation.x=-Math.PI/2; // local +z points into hot aisle
  else assembly.rotation.x=Math.PI; // downward floor exhaust
  const metal=new THREE.MeshStandardMaterial({color:0x748591,metalness:.8,roughness:.32});
  const dark=new THREE.MeshStandardMaterial({color:0x17212a,metalness:.5,roughness:.4});
  assembly.add(new THREE.Mesh(new THREE.TorusGeometry(r,.008,6,32),metal));
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(r*.23,r*.23,.025,12),dark);
  hub.rotation.x=Math.PI/2;assembly.add(hub);
  // Integrated exposure of a 7-blade silhouette prevents false reverse/stationary
  // rotation at high RPM. This is a shutter approximation, not fluid simulation.
  const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{phase:{value:0},sweep:{value:0}},
    vertexShader:`varying vec2 local;void main(){local=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 local;uniform float phase;uniform float sweep;
      void main(){float r=length(local);if(r<.23||r>.94)discard;
        float theta=atan(local.y,local.x)-phase+.65*r;
        float width=7.*sweep*.5;
        float attenuation=abs(width)<.001?1.:sin(width)/width;
        float blade=clamp(.48+.48*cos(7.*theta)*attenuation,0.,1.);
        float edge=smoothstep(.23,.3,r)*(1.-smoothstep(.86,.94,r));
        gl_FragColor=vec4(vec3(.38,.48,.56),blade*edge*.9);
        #include <colorspace_fragment>
      }`});
  const disk=new THREE.Mesh(new THREE.PlaneGeometry(r*2,r*2),mat);assembly.add(disk);
  for(const fraction of [.46,.72,.97]){
    const guard=new THREE.Mesh(new THREE.TorusGeometry(r*fraction,.0018,4,32),metal);guard.position.z=.019;assembly.add(guard);
  }
  const spokes=[];
  for(const dx of [-r*.97,r*.97])spokes.push([dx,0,.02,.006,r*2,.008]);
  batch(assembly,spokes,metal);
  group.add(assembly);
  rotors.push({assembly,mat,rpm:fanRPM(kind,multiplier),kind,phase:0});
}
export function updateFans(seconds,playing,speed,slow,frameSeconds){
  for(const fan of rotors){
    const factor=slow?1/30:1;
    fan.phase=fanAngle(fan.rpm,seconds*factor);
    fan.mat.uniforms.phase.value=fan.phase;
    fan.mat.uniforms.sweep.value=playing?fan.rpm/60*Math.PI*2*frameSeconds*speed*factor:0;
  }
}
export function addEquipmentDetail(group,geometry){
  const dark=new THREE.MeshStandardMaterial({color:0x25313b,metalness:.7,roughness:.48});
  const silver=new THREE.MeshStandardMaterial({color:0x93a1ab,metalness:.8,roughness:.32});
  const blue=new THREE.MeshStandardMaterial({color:0x126184,metalness:.15,roughness:.6});
  const rails=[],screws=[],trays=[];
  geometry.rack_x.forEach(([a,b])=>{
    for(const x of [a+.012,b-.012]){
      rails.push([x,.952,1,.016,.022,1.85]);
      for(let z=.14;z<1.85;z+=.065)screws.push([x,.936,z,.009,.006,.009]);
    }
    for(let z=.18;z<1.8;z+=.2){
      trays.push([(a+b)/2,1.52,z,b-a-.05,.89,.012]);
      tube(group,[[b-.025,2.17,z],[b+.002,2.19,z+.04],[b+.02,2.19,z+.05]],.004,blue);
    }
    tube(group,[[b+.02,2.19,.23],[b+.02,2.19,1.88]],.004,blue);
    // Hinges, rear PDU, rack-door grip and cable raceway; schematic dimensions.
    rails.push([b-.035,.935,1.02,.015,.028,.23]);
    rails.push([a+.03,2.172,1,.035,.03,1.65]);
    for(const z of [.36,1.64])screws.push([a,.94,z,.029,.035,.1]);
  });
  const outside=items=>outsideBlocks(items.map(([x,y,z,w,d,h])=>({lo:[x-w/2,y-d/2,z-h/2],hi:[x+w/2,y+d/2,z+h/2]})),geometry.excluded_blocks)
    .map(({lo,hi})=>[...lo.map((v,k)=>(v+hi[k])/2),...lo.map((v,k)=>hi[k]-v)]);
  batch(group,outside(rails),dark);batch(group,outside(screws),silver);batch(group,outside(trays),dark);
}
export function addCoilDetail(group,geometry){
  const finMaterial=new THREE.MeshStandardMaterial({color:0x77909b,metalness:.8,roughness:.35});
  finMaterial.roughnessMap=surfaceTexture('brush');
  const copper=new THREE.MeshStandardMaterial({color:0xb56b3e,metalness:.8,roughness:.32});
  const frame=new THREE.MeshStandardMaterial({color:0x374855,metalness:.7,roughness:.4});
  const fins=[],rails=[];
  for(const [lo,hi] of geometry.coil_plates_z_m){
    const z=(lo+hi)/2;
    // Fin stacks and longitudinal tubes are an equivalent-coil visual metaphor,
    // not manufacturer CAD or obstructions added to the CFD airflow.
    for(let x=.035;x<4.18;x+=.032)fins.push([x,1.5,z,.003,.86,.09]);
    for(const y of [1.09,1.91])rails.push([2.1,y,z,4.18,.018,.096]);
    for(const y of [1.2,1.5,1.8])tube(group,[[.03,y,z],[4.16,y,z]],.011,copper);
    for(const x of [.055,4.145])tube(group,[[x,1.18,z],[x,1.5,z],[x,1.82,z]],.02,copper);
  }
  batch(group,fins,finMaterial);batch(group,rails,frame);
  for(const x of [.055,4.145])tube(group,[[x,1.5,-.44],[x,1.5,-.09]],.023,copper);
}
export function addEnvironment(world,group){
  buildCampus(group);
  world.fog=null;
}
