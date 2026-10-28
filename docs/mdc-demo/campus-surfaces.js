// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import * as THREE from 'three';

// Static display architecture only. Give overlapping coplanar box faces a
// single owner (later detail wins), without moving surfaces or using depth bias.
// Non-box geometry, transparent meshes and independently switched scenes stay
// untouched. Rebuild only affected batches; retain face materials and UVs.
export function resolveCampusSurfaces(root){
  root.updateMatrixWorld(true);
  const batches=[],planes=new Map(),matrix=new THREE.Matrix4(),normalMatrix=new THREE.Matrix3();
  let boxCount=0,removedArea=0;
  root.traverse(object=>{
    if(!object.isMesh||object.geometry.type!=='BoxGeometry')return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    if(materials.some(m=>m.transparent))return;
    const geometry=object.geometry,batch={object,faces:[],changed:false};
    const position=geometry.attributes.position,uv=geometry.attributes.uv,normal=geometry.attributes.normal;
    for(let instance=0;instance<(object.isInstancedMesh?object.count:1);instance++){
      if(object.isInstancedMesh){object.getMatrixAt(instance,matrix);matrix.premultiply(object.matrixWorld);}else matrix.copy(object.matrixWorld);
      const e=matrix.elements;
      if([0,4,8].some(k=>[0,1,2].filter(j=>Math.abs(e[k+j])>1e-7).length!==1))return;
      normalMatrix.getNormalMatrix(matrix);boxCount++;
      for(const group of geometry.groups){
        const indices=[...new Set(Array.from({length:group.count},(_,j)=>geometry.index.getX(group.start+j)))];
        const points=indices.map(i=>new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(matrix).toArray());
        const n=new THREE.Vector3().fromBufferAttribute(normal,indices[0]).applyNormalMatrix(normalMatrix).toArray();
        const axis=n.findIndex(x=>Math.abs(x)>.99),sign=Math.sign(n[axis]),axes=[0,1,2].filter(k=>k!==axis),[u,v]=axes;
        const plane=points[0][axis],rect=[Math.min(...points.map(p=>p[u])),Math.min(...points.map(p=>p[v])),Math.max(...points.map(p=>p[u])),Math.max(...points.map(p=>p[v]))];
        const face={axis,sign,axes,plane,rect,patches:[rect],material:group.materialIndex,batch};
        // Preserve the original box face's UV orientation, also for rotated bars.
        const p=points[0],a=points[1],b=points[2],det=(a[u]-p[u])*(b[v]-p[v])-(b[u]-p[u])*(a[v]-p[v]);
        const tex=indices.slice(0,3).map(i=>[uv.getX(i),uv.getY(i)]);
        face.uv=(x,y)=>{
          const s=((x-p[u])*(b[v]-p[v])-(y-p[v])*(b[u]-p[u]))/det;
          const t=((a[u]-p[u])*(y-p[v])-(a[v]-p[v])*(x-p[u]))/det;
          return tex[0].map((value,k)=>value+s*(tex[1][k]-value)+t*(tex[2][k]-value));
        };
        batch.faces.push(face);
        const key=`${axis}/${sign}/${Math.round(plane*1e5)}`;
        if(!planes.has(key))planes.set(key,[]);planes.get(key).push(face);
      }
    }
    batches.push(batch);
  });
  const epsilon=1e-6;
  function subtract(r,c){
    const x0=Math.max(r[0],c[0]),y0=Math.max(r[1],c[1]),x1=Math.min(r[2],c[2]),y1=Math.min(r[3],c[3]);
    if(x1-x0<=epsilon||y1-y0<=epsilon)return [r];
    const parts=[];removedArea+=(x1-x0)*(y1-y0);
    if(x0-r[0]>epsilon)parts.push([r[0],r[1],x0,r[3]]);
    if(r[2]-x1>epsilon)parts.push([x1,r[1],r[2],r[3]]);
    if(y0-r[1]>epsilon)parts.push([x0,r[1],x1,y0]);
    if(r[3]-y1>epsilon)parts.push([x0,y1,x1,r[3]]);
    return parts;
  }
  for(const faces of planes.values())for(let i=0;i<faces.length;i++){
    const face=faces[i];
    for(let j=i+1;j<faces.length&&face.patches.length;j++){
      const before=removedArea;face.patches=face.patches.flatMap(r=>subtract(r,faces[j].rect));
      if(removedArea>before)face.batch.changed=true;
    }
  }
  let rebuilt=0;
  for(const batch of batches){
    if(!batch.changed)continue;
    const {object}=batch,positions=[],normals=[],uvs=[],geometry=new THREE.BufferGeometry();
    const sorted=[...batch.faces].sort((a,b)=>a.material-b.material);
    let current=-1,start=0;
    for(const face of sorted){
      if(face.material!==current){
        if(current>=0)geometry.addGroup(start,positions.length/3-start,current);
        current=face.material;start=positions.length/3;
      }
      const [u,v]=face.axes,n=[0,0,0];n[face.axis]=face.sign;
      const order=face.sign*(face.axis===1?-1:1)>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
      for(const [x0,y0,x1,y1] of face.patches){
        const corners=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
        for(const i of order){
          const [x,y]=corners[i],p=[0,0,0];p[face.axis]=face.plane;p[u]=x;p[v]=y;
          positions.push(...p);normals.push(...n);uvs.push(...face.uv(x,y));
        }
      }
    }
    geometry.addGroup(start,positions.length/3-start,current);
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geometry.applyMatrix4(object.matrixWorld.clone().invert());
    const mesh=new THREE.Mesh(geometry,object.material);
    mesh.name=object.name;mesh.userData={...object.userData,coplanarResolved:true};
    mesh.position.copy(object.position);mesh.quaternion.copy(object.quaternion);mesh.scale.copy(object.scale);
    mesh.castShadow=object.castShadow;mesh.receiveShadow=object.receiveShadow;mesh.visible=object.visible;
    object.parent.add(mesh);object.removeFromParent();rebuilt++;
    // Shared BoxGeometry is retained by untouched meshes. Release instance GPU buffers.
    if(object.isInstancedMesh)object.dispose();
  }
  root.userData.surfaceCleanup={boxCount,rebuilt,removedArea};
}
