// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import * as THREE from 'three';

// Only render geometry: remove hidden box interfaces while preserving the
// exact occupied volume. Never used to alter CFD fields or solid temperatures.
export function exposedBlocks(boxes){
  const axes=[0,1,2].map(k=>[...new Set(boxes.flatMap(b=>[b.lo[k],b.hi[k]]))].sort((a,b)=>a-b));
  const [xs,ys,zs]=axes,[nx,ny,nz]=axes.map(a=>a.length-1);
  const maps=axes.map(a=>new Map(a.map((v,i)=>[v,i]))),filled=new Uint8Array(nx*ny*nz);
  const index=(x,y,z)=>(x*ny+y)*nz+z;
  for(const b of boxes){
    const lo=b.lo.map((v,k)=>maps[k].get(v)),hi=b.hi.map((v,k)=>maps[k].get(v));
    for(let x=lo[0];x<hi[0];x++)for(let y=lo[1];y<hi[1];y++)for(let z=lo[2];z<hi[2];z++)filled[index(x,y,z)]=1;
  }
  const occupied=(x,y,z)=>x>=0&&y>=0&&z>=0&&x<nx&&y<ny&&z<nz&&filled[index(x,y,z)];
  const positions=[],normals=[],uv=[];
  function face(corners,normal){for(const i of [0,1,2,0,2,3]){positions.push(...corners[i]);normals.push(...normal);uv.push(...[[0,0],[1,0],[1,1],[0,1]][i]);}}
  for(let x=0;x<nx;x++)for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)if(occupied(x,y,z)){
    const a=xs[x],b=xs[x+1],c=ys[y],d=ys[y+1],e=zs[z],f=zs[z+1];
    if(!occupied(x-1,y,z))face([[a,c,e],[a,c,f],[a,d,f],[a,d,e]],[-1,0,0]);
    if(!occupied(x+1,y,z))face([[b,c,e],[b,d,e],[b,d,f],[b,c,f]],[1,0,0]);
    if(!occupied(x,y-1,z))face([[a,c,e],[b,c,e],[b,c,f],[a,c,f]],[0,-1,0]);
    if(!occupied(x,y+1,z))face([[a,d,e],[a,d,f],[b,d,f],[b,d,e]],[0,1,0]);
    if(!occupied(x,y,z-1))face([[a,c,e],[a,d,e],[b,d,e],[b,c,e]],[0,0,-1]);
    if(!occupied(x,y,z+1))face([[a,c,f],[b,c,f],[b,d,f],[a,d,f]],[0,0,1]);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));return geometry;
}

export function outsideBlocks(boxes,obstacles){
  let result=boxes;
  for(const obstacle of obstacles){
    const next=[];
    for(const b of result){
      const lo=b.lo.map((v,k)=>Math.max(v,obstacle.lo[k])),hi=b.hi.map((v,k)=>Math.min(v,obstacle.hi[k]));
      if(lo.some((v,k)=>v>=hi[k]-1e-8)){next.push(b);continue;}
      const rest={lo:[...b.lo],hi:[...b.hi]};
      for(let k=0;k<3;k++){
        if(rest.lo[k]<lo[k]-1e-8){const part={lo:[...rest.lo],hi:[...rest.hi]};part.hi[k]=lo[k];next.push(part);rest.lo[k]=lo[k];}
        if(rest.hi[k]>hi[k]+1e-8){const part={lo:[...rest.lo],hi:[...rest.hi]};part.lo[k]=hi[k];next.push(part);rest.hi[k]=hi[k];}
      }
    }
    result=next;
  }
  return result;
}
