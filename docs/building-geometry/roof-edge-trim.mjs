import * as THREE from './vendor/three.module.js';
import {DETAIL_CLEARANCE,DETAIL_WALL_GAP} from './roof-detail-clearance.mjs?v=roof-depth-20261106';

export const ROOF_TRIM_VERSION='continuous-roof-trim-v1';

// A closed, mitered ring replaces intersecting fascia/gutter/head-course boxes.
// The drip lip and fascia are one section, so roof cuts cannot create stacked
// coincident caps. Each section stays outside the actual facade perimeter.
export function roofEdgeTrim(bases){
  const rings=new Map(),buffers={flat:{positions:[],normals:[]},pitched:{positions:[],normals:[]}};
  const stats={version:ROOF_TRIM_VERSION,rings:0,flatRings:0,pitchedRings:0,eaveSegments:0,gutters:0,hiddenFlatEdges:0,skippedRings:0};
  for(const basis of bases){
    const id=basis.part.id+'/'+Math.floor(basis.edge/1000);
    if(!rings.has(id))rings.set(id,[]);rings.get(id).push(basis);
  }
  // A lower flat wing may omit the wall buried inside a taller part. Complete
  // its trim ring using that part's flat perimeter; the buried strip remains
  // occluded. Visible edge positions still come from the native roof profile.
  for(const list of rings.values()){
    const part=list[0].part;
    const ringIndex=Math.floor(list[0].edge/1000),ring=[part.outer,...part.holes][ringIndex].map(([x,y])=>[x,-y]),existing=new Set(list.map(b=>b.edge));
    const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0),sign=(area>0?1:-1)*(ringIndex?-1:1);
    const outward=i=>{const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);return [sign*(b[1]-a[1])/length,-sign*(b[0]-a[0])/length];};
    // Shared part walls can supply either native normal. The footprint fixes
    // the outward side of the trim consistently, including buried interfaces.
    for(let i=0;i<list.length;i++)list[i]={...list[i],normal:outward(list[i].edge%1000)};
    if(part.roof!=='flat')continue;
    for(let i=0;i<ring.length;i++)if(!existing.has(ringIndex*1000+i)){
      const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      list.push({part,edge:ringIndex*1000+i,normal:outward(i),roofProfile:[{position:[...a,part.height]},{position:[...b,part.height]}]});stats.hiddenFlatEdges++;
    }
  }
  for(const bases of rings.values()){
    const segments=[],part=bases[0].part,pitched=part.roof!=='flat',total=part.height-part.base;
    for(const b of bases.sort((a,b)=>a.edge-b.edge))for(let i=1;i<b.roofProfile.length;i++){
      const a=new THREE.Vector3(...b.roofProfile[i-1].position),c=new THREE.Vector3(...b.roofProfile[i].position);
      if(Math.hypot(c.x-a.x,c.y-a.y)<1e-6)continue;
      segments.push({a,b:c,normal:new THREE.Vector3(...b.normal,0).normalize()});
    }
    if(segments.length<3||segments.some((s,i)=>s.a.distanceTo(segments[(i+segments.length-1)%segments.length].b)>5e-5)){
      stats.skippedRings++;continue;
    }
    const vertices=[];
    for(let i=0;i<segments.length;i++){
      const current=segments[i],previous=segments[(i+segments.length-1)%segments.length],denominator=1+current.normal.dot(previous.normal);
      if(denominator<1e-4){vertices.length=0;break;}
      vertices.push({point:current.a.clone().add(previous.b).multiplyScalar(.5),miter:current.normal.clone().add(previous.normal).divideScalar(denominator)});
    }
    if(!vertices.length){stats.skippedRings++;continue;}
    const depth=pitched?Math.min(.017,total*.018):.006,height=pitched?Math.min(.012,total*.014):.004,gap=DETAIL_WALL_GAP;
    const section=pitched?[[gap,-DETAIL_CLEARANCE],[gap+depth,-DETAIL_CLEARANCE],[gap+depth,-height*.24],[gap+depth*.70,-height*.24],[gap+depth*.70,-height],[gap,-height]]:[[gap,-DETAIL_CLEARANCE],[gap+depth,-DETAIL_CLEARANCE],[gap+depth,-height],[gap,-height]];
    const points=vertices.map(v=>section.map(([n,z])=>v.point.clone().addScaledVector(v.miter,n).add(new THREE.Vector3(0,0,z))));
    const output=buffers[pitched?'pitched':'flat'];
    const triangle=(a,b,c,desired)=>{
      let vertices=[a,b,c].map(p=>new THREE.Vector3(...p.toArray().map(Math.fround))),normal=new THREE.Vector3().crossVectors(vertices[1].clone().sub(vertices[0]),vertices[2].clone().sub(vertices[0]));
      if(normal.lengthSq()<1e-20)return;
      if(normal.dot(desired)<0){[vertices[1],vertices[2]]=[vertices[2],vertices[1]];normal.negate();}
      normal.normalize();output.positions.push(...vertices[0],...vertices[1],...vertices[2]);output.normals.push(...normal,...normal,...normal);
    };
    for(let i=0;i<segments.length;i++){
      const j=(i+1)%segments.length;
      for(let k=0;k<section.length;k++){
        const l=(k+1)%section.length,dn=section[l][0]-section[k][0],dz=section[l][1]-section[k][1],desired=segments[i].normal.clone().multiplyScalar(-dz).add(new THREE.Vector3(0,0,dn));
        triangle(points[i][k],points[j][k],points[j][l],desired);triangle(points[i][k],points[j][l],points[i][l],desired);
      }
      if(pitched){
        stats.eaveSegments++;const s=segments[i];
        if(Math.abs(s.b.z-s.a.z)/Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)<.08&&Math.min(s.a.z,s.b.z)<=part.height-part.roofRise+1e-4)stats.gutters++;
      }
    }
    stats.rings++;stats[pitched?'pitchedRings':'flatRings']++;
  }
  const geometries={};
  for(const [kind,buffer] of Object.entries(buffers))if(buffer.positions.length){
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer.positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(buffer.normals,3));geometries[kind]=geometry;
  }
  return {geometries,stats};
}
