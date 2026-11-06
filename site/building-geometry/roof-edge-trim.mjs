import * as THREE from './vendor/three.module.js';
import {DETAIL_CLEARANCE,DETAIL_WALL_GAP} from './roof-detail-clearance.mjs?v=roof-depth-20261106';

export const ROOF_TRIM_VERSION='continuous-roof-trim-v3';
const pointKey=p=>p.toArray().map(v=>Math.round(v/2e-6)).join(',');
const edgeKey=(a,b)=>[pointKey(a),pointKey(b)].sort().join('|');

function adjacentRoofPlanes(meshes){
  const edges=new Map(),facets=[];
  for(const mesh of meshes.filter(m=>m.role==='roof'))for(let i=0;i<mesh.positions.length;i+=9){
    const points=[0,3,6].map(k=>new THREE.Vector3(...mesh.positions.slice(i+k,i+k+3))),triangle=new THREE.Triangle(...points),plane=new THREE.Plane().setFromCoplanarPoints(...points);
    if(Math.abs(plane.normal.z)<1e-8)continue;
    const facet={triangle,plane};facets.push(facet);
    for(let j=0;j<3;j++){const key=edgeKey(points[j],points[(j+1)%3]);if(!edges.has(key))edges.set(key,[]);edges.get(key).push(plane);}
  }
  return (a,b)=>{
    const exact=edges.get(edgeKey(a,b));if(exact?.length===1)return exact;
    // Profiles may span collinear native edge subdivisions. Match the actual
    // roof surface around their midpoint instead of choosing a nominal pitch.
    const mid=a.clone().add(b).multiplyScalar(.5),nearest=new THREE.Vector3(),planes=[];
    for(const {triangle,plane} of facets)if(Math.max(Math.abs(plane.distanceToPoint(a)),Math.abs(plane.distanceToPoint(b)),triangle.closestPointToPoint(mid,nearest).distanceTo(mid))<=5e-5)planes.push(plane);
    return planes;
  };
}

// Coplanar flat parts share one external trim, with internal seams removed.
function mergeFlatRings(rings){
  const groups=new Map();
  for(const [id,bases]of rings){const part=bases[0].part;if(part.roof!=='flat')continue;const key=Math.round(part.height/1e-6);if(!groups.has(key))groups.set(key,new Map());groups.get(key).set(part.id,part);}
  let merged=0;
  for(const parts of groups.values()){
    if(parts.size<2)continue;
    const segments=[],vertices=[],height=[...parts.values()][0].height;
    for(const part of parts.values())for(const [ri,source]of [part.outer,...part.holes].entries()){
      let ring=source.map(([x,y])=>[x,-y]);
      const area=ring.reduce((sum,a,i)=>{const b=ring[(i+1)%ring.length];return sum+a[0]*b[1]-a[1]*b[0];},0);
      if((area>0)!==Boolean(ri))ring=ring.reverse();
      vertices.push(...ring);for(let i=0;i<ring.length;i++)segments.push({a:ring[i],b:ring[(i+1)%ring.length]});
    }
    const key=p=>p.map(v=>Math.round(v/1e-7)).join(','),edges=new Map();
    for(const {a,b}of segments){
      const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),cuts=[0,1];
      for(const p of vertices){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length),distance=Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length;if(t>1e-8&&t<1-1e-8&&distance<1e-7)cuts.push(t);}
      cuts.sort((a,b)=>a-b);
      for(let i=1;i<cuts.length;i++){
        if(cuts[i]-cuts[i-1]<1e-8)continue;
        const start=[a[0]+dx*cuts[i-1],a[1]+dy*cuts[i-1]],end=[a[0]+dx*cuts[i],a[1]+dy*cuts[i]],id=key(start)+'|'+key(end),reverse=key(end)+'|'+key(start);
        if(edges.has(reverse))edges.delete(reverse);else edges.set(id,{a:start,b:end});
      }
    }
    const loops=[];
    while(edges.size){
      const [firstId,first]=edges.entries().next().value;edges.delete(firstId);const loop=[first.a];let end=first.b;
      while(key(end)!==key(first.a)){
        loop.push(end);const next=[...edges.entries()].find(([,e])=>key(e.a)===key(end));if(!next)throw Error('Flat trim union has an open boundary');edges.delete(next[0]);end=next[1].b;
      }
      loops.push(loop);
    }
    for(const [id,bases]of rings)if(parts.has(bases[0].part.id))rings.delete(id);
    for(const [i,loop]of loops.entries()){
      const part={...parts.values().next().value,id:'flat-union-'+height+'-'+i,outer:loop.map(([x,y])=>[x,-y]),holes:[]},bases=[];
      // Loop winding is clockwise on outer boundaries, counterclockwise in holes.
      for(let j=0;j<loop.length;j++){const a=loop[j],b=loop[(j+1)%loop.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);bases.push({part,edge:j,normal:[-(b[1]-a[1])/length,(b[0]-a[0])/length],roofProfile:[{position:[...a,height]},{position:[...b,height]}]});}
      rings.set(part.id,bases);
    }
    merged+=parts.size-1;
  }
  return merged;
}
function mergeCollinear(segments){
  let merged=0,changed=true;
  while(changed&&segments.length>3){
    changed=false;
    for(let i=0;i<segments.length;i++){
      const j=(i+1)%segments.length,a=segments[i],b=segments[j],la=Math.hypot(a.b.x-a.a.x,a.b.y-a.a.y),lb=Math.hypot(b.b.x-b.a.x,b.b.y-b.a.y);
      if(a.normal.dot(b.normal)<1-1e-7||Math.abs((a.b.z-a.a.z)/la-(b.b.z-b.a.z)/lb)>1e-5)continue;
      const combined={...a,b:b.b,planes:[...a.planes,...b.planes]};
      if(j===0){segments[0]=combined;segments.splice(i,1);}else{segments[i]=combined;segments.splice(j,1);}
      merged++;changed=true;break;
    }
  }
  return merged;
}

// A closed, mitered ring replaces intersecting fascia/gutter/head-course boxes.
// The drip lip and fascia are one section, so roof cuts cannot create stacked
// coincident caps. Each section stays outside the actual facade perimeter.
export function roofEdgeTrim(bases,sourceMeshes=[]){
  const rings=new Map(),buffers={flat:{positions:[],normals:[]},pitched:{positions:[],normals:[]}};
  const stats={version:ROOF_TRIM_VERSION,rings:0,flatRings:0,pitchedRings:0,eaveSegments:0,gutters:0,hiddenFlatEdges:0,skippedRings:0,roofPlaneEdges:0,unmatchedRoofEdges:0,pitchLimitedRings:0,maxSlopeDrop:0,mergedFlatParts:0,mergedCollinearSegments:0},planesFor=adjacentRoofPlanes(sourceMeshes);
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
  stats.mergedFlatParts=mergeFlatRings(rings);
  for(const bases of rings.values()){
    const segments=[],part=bases[0].part,pitched=part.roof!=='flat',total=part.height-part.base;
    for(const b of bases.sort((a,b)=>a.edge-b.edge))for(let i=1;i<b.roofProfile.length;i++){
      const a=new THREE.Vector3(...b.roofProfile[i-1].position),c=new THREE.Vector3(...b.roofProfile[i].position);
      if(Math.hypot(c.x-a.x,c.y-a.y)<1e-6)continue;
      const planes=pitched?planesFor(a,c):[];
      if(pitched){stats.roofPlaneEdges++;if(!planes.length)stats.unmatchedRoofEdges++;}
      segments.push({a,b:c,normal:new THREE.Vector3(...b.normal,0).normalize(),planes});
    }
    if(segments.length<3||segments.some((s,i)=>s.a.distanceTo(segments[(i+segments.length-1)%segments.length].b)>5e-5)){
      stats.skippedRings++;continue;
    }
    if(pitched&&segments.some(s=>!s.planes.length)){stats.skippedRings++;continue;}
    stats.mergedCollinearSegments+=mergeCollinear(segments);
    const vertices=[];
    for(let i=0;i<segments.length;i++){
      const current=segments[i],previous=segments[(i+segments.length-1)%segments.length],denominator=1+current.normal.dot(previous.normal);
      if(denominator<1e-4){vertices.length=0;break;}
      vertices.push({point:current.a.clone().add(previous.b).multiplyScalar(.5),miter:current.normal.clone().add(previous.normal).divideScalar(denominator),planes:[...previous.planes,...current.planes]});
    }
    if(!vertices.length){stats.skippedRings++;continue;}
    const height=pitched?Math.min(.012,total*.014):.004,gap=DETAIL_WALL_GAP;let depth=pitched?Math.min(.017,total*.018):.006;
    const shortest=Math.min(...segments.map(s=>Math.hypot(s.b.x-s.a.x,s.b.y-s.a.y)));depth=Math.min(depth,Math.max(1e-6,shortest*.2-gap));
    if(pitched){
      // A fixed overhang becomes a long downward skirt on very steep/narrow
      // wings. Keep one constant depth around each ring and shorten it so the
      // outer edge drops by at most two fascia heights along the roof slope.
      let offset=gap+depth;
      for(const v of vertices)for(const plane of v.planes){
        const intercept=plane.distanceToPoint(v.point)/plane.normal.z,slope=(plane.normal.x*v.miter.x+plane.normal.y*v.miter.y)/plane.normal.z;
        if(slope>1e-8)offset=Math.min(offset,(2*height-intercept)/slope);
      }
      if(offset<gap+1e-6){stats.skippedRings++;continue;}
      if(offset<gap+depth-1e-8){depth=offset-gap;stats.pitchLimitedRings++;}
    }
    const section=pitched?[[gap,-DETAIL_CLEARANCE],[gap+depth,-DETAIL_CLEARANCE],[gap+depth,-height*.24],[gap+depth*.70,-height*.24],[gap+depth*.70,-height],[gap,-height]]:[[gap,-DETAIL_CLEARANCE],[gap+depth,-DETAIL_CLEARANCE],[gap+depth,-height],[gap,-height]];
    const points=vertices.map(v=>section.map(([n,z])=>{
      const point=v.point.clone().addScaledVector(v.miter,n);let top=v.point.z;
      // Moving an eave outward also moves it down its adjacent roof planes.
      // At a concave corner/ridge, stay below both planes and join one shared
      // section; a level outward extrusion otherwise stands above the roof.
      if(pitched)for(const plane of v.planes)top=Math.min(top,-(plane.normal.x*point.x+plane.normal.y*point.y+plane.constant)/plane.normal.z);
      stats.maxSlopeDrop=Math.max(stats.maxSlopeDrop,v.point.z-top);point.z=top+z;return point;
    }));
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
