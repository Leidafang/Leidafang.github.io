// Browser workshop: independent lightweight massing, separate from Blender assets.
import * as THREE from './vendor/three.module.js';

export const defaults = Object.freeze({shape:'hshape', width:16, depth:24, floors:5,
  floorHeight:3.2, arm:4, roof:'flat', roofHeight:3});

export function normalizeConfig(input) {
  const p = {...defaults,...input};
  if (!['rectangle','circle','lshape','hshape'].includes(p.shape)) throw Error('Unsupported footprint');
  for (const k of ['width','depth','floors','floorHeight','arm','roofHeight']) {
    p[k]=Number(p[k]);
    if (!Number.isFinite(p[k])) throw Error(`Invalid ${k}`);
  }
  if (p.width<8 || p.width>48 || p.depth<8 || p.depth>48 ||
      !Number.isInteger(p.floors) || p.floors<1 || p.floors>16 ||
      p.floorHeight<2.5 || p.floorHeight>5 || p.roofHeight<.5 || p.roofHeight>8)
    throw Error('Parameters outside the workshop range');
  if (p.shape==='circle') p.depth=p.width;
  p.arm=Math.min(Math.max(p.arm,1.5),Math.min(p.width,p.depth)*.42);
  if (p.shape!=='rectangle') p.roof='flat';
  if (!['flat','gable','hip'].includes(p.roof)) throw Error('Unsupported roof');
  return p;
}

export function footprint(p) {
  const w=p.width/2,d=p.depth/2,a=p.arm;
  if (p.shape==='rectangle') return [[-w,-d],[w,-d],[w,d],[-w,d]];
  if (p.shape==='circle') return Array.from({length:64},(_,i)=>{
    const t=i*Math.PI*2/64;return [w*Math.cos(t),w*Math.sin(t)];
  });
  if (p.shape==='lshape') return [[-w,-d],[w,-d],[w,-d+a],[-w+a,-d+a],[-w+a,d],[-w,d]];
  return [[-w,-d],[-w+a,-d],[-w+a,-a/2],[w-a,-a/2],[w-a,-d],[w,-d],
    [w,d],[w-a,d],[w-a,a/2],[-w+a,a/2],[-w+a,d],[-w,d]];
}

export function polygonArea(poly) {
  return Math.abs(poly.reduce((s,a,i)=>{const b=poly[(i+1)%poly.length];return s+a[0]*b[1]-a[1]*b[0];},0))/2;
}

export function buildGeometry(input) {
  const config=normalizeConfig(input), poly=footprint(config);
  const h=config.floors*config.floorHeight,r=config.roofHeight;
  const positions=[],groups=[];
  function triangle(a,b,c,material=0,normal=null) {
    const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),vc=new THREE.Vector3(...c);
    const n=vb.clone().sub(va).cross(vc.clone().sub(va));
    if (n.lengthSq()<1e-16) return;
    if (normal && n.dot(new THREE.Vector3(...normal))<0) [b,c]=[c,b];
    const start=positions.length/3;positions.push(...a,...b,...c);
    const last=groups.at(-1);
    if (last && last.materialIndex===material) last.count+=3;
    else groups.push({start,count:3,materialIndex:material});
  }
  function face(v,material,normal) {
    for (let i=1;i<v.length-1;i++) triangle(v[0],v[i],v[i+1],material,normal);
  }
  const triangles=THREE.ShapeUtils.triangulateShape(poly.map(p=>new THREE.Vector2(...p)),[]);
  for (const t of triangles) {
    triangle(...t.map(i=>[...poly[i],0]),0,[0,0,-1]);
    if(config.roof==='flat') triangle(...t.map(i=>[...poly[i],h]),1,[0,0,1]);
  }
  for(let i=0;i<poly.length;i++) {
    const a=poly[i],b=poly[(i+1)%poly.length];
    face([[...a,0],[...b,0],[...b,h],[...a,h]],0,null);
  }
  if(config.roof==='gable') {
    const w=config.width/2,d=config.depth/2;
    const a=[-w,-d,h],b=[w,-d,h],c=[w,d,h],e=[-w,d,h];
    const left=[-w,0,h+r],right=[w,0,h+r];
    face([a,b,right,left],1,[0,0,1]);face([left,right,c,e],1,[0,0,1]);
    face([e,a,left],0,[-1,0,0]);face([b,c,right],0,[1,0,0]);
  }
  if(config.roof==='hip') {
    const rotated=config.depth>config.width;
    const w=(rotated?config.depth:config.width)/2,d=(rotated?config.width:config.depth)/2;
    const point=(x,y,z)=>rotated?[-y,x,z]:[x,y,z];
    const a=point(-w,-d,h),b=point(w,-d,h),c=point(w,d,h),e=point(-w,d,h);
    const left=point(-(w-d),0,h+r),right=point(w-d,0,h+r);
    face([a,b,right,left],1,[0,0,1]);face([e,c,right,left],1,[0,0,1]);
    face([e,a,left],1,[0,0,1]);face([b,c,right],1,[0,0,1]);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  for(const g of groups)geometry.addGroup(g.start,g.count,g.materialIndex);
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const checks=inspectGeometry(geometry);
  if(!checks.closed || checks.degenerateTriangles || checks.volume<=0) {
    geometry.dispose();throw Error('Generated geometry failed the surface check');
  }
  return {geometry,config,footprint:poly,area:polygonArea(poly),checks};
}

export function inspectGeometry(geometry) {
  const a=geometry.getAttribute('position'),index=geometry.index;
  const count=index?index.count:a.count,edges=new Map();
  let volume=0,degenerateTriangles=0;
  const point=i=>new THREE.Vector3().fromBufferAttribute(a,index?index.getX(i):i);
  const key=p=>[p.x,p.y,p.z].map(x=>Math.round(x*1e6)).join(',');
  for(let i=0;i<count;i+=3) {
    const p=[point(i),point(i+1),point(i+2)];
    const cross=p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0]));
    if(cross.lengthSq()<1e-16)degenerateTriangles++;
    volume+=p[0].dot(p[1].clone().cross(p[2]))/6;
    for(let j=0;j<3;j++) {
      const ka=key(p[j]),kb=key(p[(j+1)%3]);
      const id=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
      const edge=edges.get(id)||{count:0,direction:0};
      edge.count++;edge.direction+=ka<kb?1:-1;edges.set(id,edge);
    }
  }
  const badEdges=[...edges.values()].filter(e=>e.count!==2 || e.direction!==0).length;
  return {closed:badEdges===0,badEdges,degenerateTriangles,volume,triangles:count/3,
    selfIntersectionsChecked:false,cfdMeshValidated:false};
}

export function exportParameters(config,checks) {
  return {generator:'browser-workshop-v1',description:'Independent browser massing implementation',
    units:'metres',stl_up_axis:'Z',glb_up_axis:'Y',parameters:{...config},
    geometry_checks:{closed_edge_topology:checks.closed,degenerate_triangles:checks.degenerateTriangles,
      self_intersections_checked:false,cfd_mesh_validated:false},training_eligible:false};
}
