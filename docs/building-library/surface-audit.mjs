// Preview surface diagnostics; does not validate CFD meshes or self-intersections.
import * as THREE from './vendor/three.module.js';

export function surfaceAudit(geometry){
  const p=geometry.getAttribute('position'),index=geometry.index;
  const count=index?index.count:p.count,edges=new Map(),parent=new Map();let volume=0,degenerate=0;
  const point=i=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i);
  const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e6)).join(',');
  function find(k){if(!parent.has(k))parent.set(k,k);let root=k;while(parent.get(root)!==root)root=parent.get(root);while(parent.get(k)!==k){const next=parent.get(k);parent.set(k,root);k=next;}return root;}
  function unite(a,b){const x=find(a),y=find(b);if(x!==y)parent.set(x,y);}
  for(let i=0;i<count;i+=3){
    const v=[point(i),point(i+1),point(i+2)];
    if(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).lengthSq()<1e-18)degenerate++;
    volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
    for(let j=0;j<3;j++){
      const a=key(v[j]),b=key(v[(j+1)%3]),id=a<b?a+'|'+b:b+'|'+a;
      unite(a,b);
      const item=edges.get(id)||[0,0];item[0]++;item[1]+=a<b?1:-1;edges.set(id,item);
    }
  }
  const boundary=[...edges.values()].filter(e=>e[0]===1).length;
  const nonmanifold=[...edges.values()].filter(e=>e[0]>2).length;
  const winding=[...edges.values()].filter(e=>e[0]===2&&e[1]!==0).length;
  return {triangles:count/3,boundary_edges:boundary,nonmanifold_edges:nonmanifold,
    winding_conflicts:winding,degenerate_triangles:degenerate,
    closed:boundary===0&&nonmanifold===0&&winding===0&&degenerate===0,volume_m3:volume,
    components:new Set([...parent.keys()].map(find)).size,
    self_intersections_checked:false,cfd_mesh_validated:false};
}
