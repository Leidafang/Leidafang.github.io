import * as THREE from './vendor/three.module.js';

export const DETAIL_CLEARANCE_VERSION='roof-detail-clearance-v2';
export const DETAIL_CLEARANCE=5e-5;
export const DETAIL_WALL_GAP=1.5e-4;
const EPS=1e-9;
const faces=[[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3],[0,2,3,1],[4,5,7,6]];

function clip(polygons,plane){
  const result=[],cuts=[];
  for(const polygon of polygons){
    const output=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane.distanceToPoint(a)+DETAIL_CLEARANCE,db=plane.distanceToPoint(b)+DETAIL_CLEARANCE;
      if(da<=EPS)output.push(a);
      if((da<0&&db>0)||(da>0&&db<0)){
        const p=a.clone().lerp(b,da/(da-db));output.push(p);cuts.push(p);
      }
    }
    if(output.length>=3)result.push(output);
  }
  const points=[...new Map(cuts.map(p=>[p.toArray().map(v=>Math.round(v/1e-8)).join(','),p])).values()];
  if(points.length>=3){
    const centre=points.reduce((c,p)=>c.add(p),new THREE.Vector3()).divideScalar(points.length),normal=plane.normal;
    const u=new THREE.Vector3().crossVectors(Math.abs(normal.z)<.9?new THREE.Vector3(0,0,1):new THREE.Vector3(1,0,0),normal).normalize(),v=new THREE.Vector3().crossVectors(normal,u);
    points.sort((a,b)=>Math.atan2(a.clone().sub(centre).dot(v),a.clone().sub(centre).dot(u))-Math.atan2(b.clone().sub(centre).dot(v),b.clone().sub(centre).dot(u)));
    result.push(points);
  }
  return result;
}

// Decorative boxes may straddle roofs at eaves, valleys and stepped wings.
// Keep ordinary details instanced; clip only intersecting ones below the real
// roof triangles, including a small separation and closed cut faces. Native
// building vertices and the export root are never changed here.
export function roofDetailClearance(meshes=[],{openBack=false}={}){
  const roofs=[];
  for(const mesh of meshes.filter(m=>m.role==='roof'))for(let i=0;i<mesh.positions.length;i+=9){
    const triangle=new THREE.Triangle(...[0,3,6].map(k=>new THREE.Vector3(...mesh.positions.slice(i+k,i+k+3))));
    const plane=new THREE.Plane().setFromCoplanarPoints(triangle.a,triangle.b,triangle.c);if(plane.normal.z<0)plane.negate();
    if(plane.normal.z>EPS)roofs.push({triangle,plane,bounds:new THREE.Box3().setFromPoints([triangle.a,triangle.b,triangle.c])});
  }
  const unit=new THREE.Box3(new THREE.Vector3(-.5,-.5,-.5),new THREE.Vector3(.5,.5,.5)),local=new THREE.Triangle(),inverse=new THREE.Matrix4();
  return matrix=>{
    const bounds=unit.clone().applyMatrix4(matrix).expandByScalar(DETAIL_CLEARANCE*2),scale=new THREE.Vector3().setFromMatrixScale(matrix),planes=new Map();inverse.copy(matrix).invert();
    // Include neighbouring roof facets at shared edges and touching corners,
    // not just a strict solid intersection. Otherwise Float32 boundary contact
    // can leave the adjacent slope out of a valley/eave cut.
    const padded=unit.clone().expandByVector(new THREE.Vector3(DETAIL_CLEARANCE/scale.x,DETAIL_CLEARANCE/scale.y,DETAIL_CLEARANCE/scale.z));
    for(const roof of roofs){
      if(!bounds.intersectsBox(roof.bounds))continue;
      local.copy(roof.triangle);local.a.applyMatrix4(inverse);local.b.applyMatrix4(inverse);local.c.applyMatrix4(inverse);
      if(padded.intersectsTriangle(local)){
        const key=[...roof.plane.normal.toArray(),roof.plane.constant].map(v=>Math.round(v/1e-7)).join(',');planes.set(key,roof.plane);
      }
    }
    if(!planes.size)return null;
    const corners=Array.from({length:8},(_,i)=>new THREE.Vector3(i&1?.5:-.5,i&2?.5:-.5,i&4?.5:-.5).applyMatrix4(matrix));
    let polygons=faces.map(face=>face.map(i=>corners[i]));
    for(const plane of planes.values())polygons=clip(polygons,plane);
    const positions=[],normals=[],outward=new THREE.Vector3(matrix.elements[4],matrix.elements[5],matrix.elements[6]).normalize();
    for(const polygon of polygons)for(let i=1;i<polygon.length-1;i++){
      // Derive normals after Float32 rounding, as used by the renderer. Tiny
      // clipped corners can otherwise collapse or flip during buffer upload.
      const [a,b,c]=[polygon[0],polygon[i],polygon[i+1]].map(p=>new THREE.Vector3(...p.toArray().map(Math.fround))),normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));
      if(normal.lengthSq()<1e-20)continue;normal.normalize();if(openBack&&normal.dot(outward)<-.999999)continue;positions.push(...a,...b,...c);normals.push(...normal,...normal,...normal);
    }
    return {positions,normals};
  };
}
