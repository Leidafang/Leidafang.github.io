// The pinned OSM2World web build can add a ridge vertex on a concave roof's
// perimeter without inserting that vertex into its adjacent facade. Rebuild
// only those native vertical panels whose top differs from the roof boundary.
// Roof vertices, footprints, heights and all other native faces stay intact.
export const JUNCTION_VERSION='roof-wall-junction-v2';
const EPS=2e-6;
const key=p=>p.map(x=>Math.round(x/EPS)).join(',');
const vertex=(array,i)=>Array.from(array.slice(i,i+3));
const dot2=(p,n)=>p[0]*n[0]+p[1]*n[1];

function boundaryEdges(meshes){
  const edges=new Map();
  for(const mesh of meshes)for(let i=0;i<mesh.positions.length;i+=9){
    const points=[0,3,6].map(j=>vertex(mesh.positions,i+j));
    for(let j=0;j<3;j++){
      const a=points[j],b=points[(j+1)%3],ka=key(a),kb=key(b),id=ka<kb?ka+'|'+kb:kb+'|'+ka;
      if(ka===kb)continue;
      if(edges.has(id))edges.get(id).count++;else edges.set(id,{a,b,count:1});
    }
  }
  return [...edges.values()].filter(e=>e.count===1);
}

export const getRoofBoundaryEdges=meshes=>boundaryEdges(meshes.filter(m=>m.role==='roof'));

// Presentation uses the actual roof perimeter, including inner courtyard
// edges, instead of drawing a constant-height trim through pitched walls.
export function facadeRoofProfile(basis,edges){
  const {a,tx,ty,length,normal,part}=basis,tolerance=1e-4,low=part.height-part.roofRise;
  const onPlane=p=>Math.abs((p[0]-a[0])*normal[0]+(p[1]-a[1])*normal[1])<=tolerance;
  const points=new Map();
  for(const edge of edges){
    if(!onPlane(edge.a)||!onPlane(edge.b))continue;
    for(const p of [edge.a,edge.b]){
      const u=(p[0]-a[0])*tx+(p[1]-a[1])*ty;
      if(u< -tolerance||u>length+tolerance||p[2]<low-tolerance||p[2]>part.height+tolerance)continue;
      const id=Math.round(u/tolerance),value={u:Math.max(0,Math.min(length,u)),z:p[2],position:p};
      if(!points.has(id)||points.get(id).z<p[2])points.set(id,value);
    }
  }
  const profile=[...points.values()].sort((a,b)=>a.u-b.u);
  return profile.length>=2&&profile[0].u<tolerance&&length-profile.at(-1).u<tolerance?profile:[];
}

export function auditRoofWallSeams(meshes){
  const roofs=getRoofBoundaryEdges(meshes),walls=boundaryEdges(meshes.filter(m=>m.role==='wall'));
  const distance=(p,a,b)=>{const d=b.map((x,k)=>x-a[k]),length=d.reduce((s,x)=>s+x*x,0);if(!length)return Infinity;const u=Math.max(0,Math.min(1,d.reduce((s,x,k)=>s+x*(p[k]-a[k]),0)/length));return Math.hypot(...p.map((x,k)=>x-a[k]-u*d[k]));};
  let error=0;
  for(const {a,b} of roofs)for(const u of [0,.25,.5,.75,1]){
    const p=a.map((x,k)=>x+(b[k]-x)*u);let closest=Infinity;
    for(const e of walls)closest=Math.min(closest,distance(p,e.a,e.b));
    error=Math.max(error,closest);
  }
  return {roof_boundary_edges:roofs.length,samples_per_edge:5,max_distance:error,tolerance:5e-5,passed:Number.isFinite(error)&&error<=5e-5,scope:'Roof-to-wall boundary alignment only; not closed-solid or CFD acceptance'};
}

function verticalPanels(mesh){
  const triangles=[],byEdge=new Map(),parents=new Map();
  const find=i=>{let root=i;while(parents.get(root)!==root)root=parents.get(root);while(i!==root){const next=parents.get(i);parents.set(i,root);i=next;}return root;};
  for(let i=0;i<mesh.positions.length;i+=9){
    const normal=vertex(mesh.normals,i);if(Math.abs(normal[2])>EPS)continue;
    const points=[0,3,6].map(j=>vertex(mesh.positions,i+j));parents.set(i,i);triangles.push({i,normal,points});
    for(let j=0;j<3;j++){
      const ka=key(points[j]),kb=key(points[(j+1)%3]),id=ka<kb?ka+'|'+kb:kb+'|'+ka;
      for(const other of byEdge.get(id)||[]){
        if(dot2(normal,other.normal)>1-EPS)parents.set(find(i),find(other.i));
      }
      if(!byEdge.has(id))byEdge.set(id,[]);byEdge.get(id).push({i,normal});
    }
  }
  const groups=new Map();
  for(const triangle of triangles){const id=find(triangle.i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(triangle);}
  return [...groups.values()];
}

export function matchRoofWallJunctions(meshes){
  const roofBoundary=getRoofBoundaryEdges(meshes);
  const repairs=[];let addedTriangles=0,maxGap=0;
  const result=meshes.map((mesh,meshIndex)=>{
    if(mesh.role!=='wall')return mesh;
    const replacements=new Map(),removed=new Set();
    for(const panel of verticalPanels(mesh)){
      const n=panel[0].normal,t=[-n[1],n[0]],points=panel.flatMap(v=>v.points),plane=dot2(points[0],n);
      const lo=Math.min(...points.map(p=>dot2(p,t))),hi=Math.max(...points.map(p=>dot2(p,t))),base=Math.min(...points.map(p=>p[2]));
      const onPlane=p=>Math.abs(dot2(p,n)-plane)<=EPS;
      if(!points.every(onPlane))continue;
      // Require a horizontal native base, keeping soffits and other wall
      // arrangements outside this correction's scope.
      if(!points.some(p=>Math.abs(dot2(p,t)-lo)<=EPS&&Math.abs(p[2]-base)<=EPS)||!points.some(p=>Math.abs(dot2(p,t)-hi)<=EPS&&Math.abs(p[2]-base)<=EPS))continue;
      const candidates=new Map();
      for(const {a,b} of roofBoundary){
        if(!onPlane(a)||!onPlane(b))continue;
        for(const p of [a,b]){
          const u=dot2(p,t);
          if(u>=lo-EPS&&u<=hi+EPS&&p[2]>base+EPS)candidates.set(key(p),{u,p});
        }
      }
      const chain=[...candidates.values()].sort((a,b)=>a.u-b.u);
      if(chain.length<3||Math.abs(chain[0].u-lo)>EPS||Math.abs(chain.at(-1).u-hi)>EPS)continue;
      // Overlapping roof sheets are ambiguous; do not combine their heights.
      if(chain.some((p,i)=>i&&p.u-chain[i-1].u<=EPS))continue;
      const top=new Map();
      for(const p of points){const u=dot2(p,t),id=Math.round(u/EPS);if(!top.has(id)||top.get(id).z<p[2])top.set(id,{u,z:p[2]});}
      const old=[...top.values()].sort((a,b)=>a.u-b.u);
      const oldHeight=u=>{
        for(let i=1;i<old.length;i++)if(u<=old[i].u+EPS){const a=old[i-1],b=old[i];return a.z+(b.z-a.z)*(u-a.u)/(b.u-a.u);}
        return old.at(-1).z;
      };
      const gap=Math.max(...chain.map(v=>Math.abs(v.p[2]-oldHeight(v.u))));if(gap<=EPS)continue;
      const positions=[],normals=[];
      const triangle=(a,b,c)=>{positions.push(...a,...b,...c);normals.push(...n,...n,...n);};
      for(let i=1;i<chain.length;i++){
        const a=chain[i-1].p,b=chain[i].p,ab=[a[0],a[1],base],bb=[b[0],b[1],base];
        triangle(ab,bb,b);triangle(ab,b,a);
      }
      const first=Math.min(...panel.map(v=>v.i));replacements.set(first,{positions,normals});panel.forEach(v=>removed.add(v.i));
      const delta=positions.length/9-panel.length;addedTriangles+=delta;maxGap=Math.max(maxGap,gap);
      repairs.push({mesh:meshIndex,normal:n,base,roof_boundary_vertices:chain.length,replaced_triangles:panel.length,inserted_triangles:positions.length/9,max_height_difference:gap});
    }
    if(!replacements.size)return mesh;
    const positions=[],normals=[];
    for(let i=0;i<mesh.positions.length;i+=9){
      if(replacements.has(i)){const r=replacements.get(i);positions.push(...r.positions);normals.push(...r.normals);}
      else if(!removed.has(i)){positions.push(...mesh.positions.slice(i,i+9));normals.push(...mesh.normals.slice(i,i+9));}
    }
    return {...mesh,positions:new Float32Array(positions),normals:new Float32Array(normals)};
  });
  return {meshes:result,report:{version:JUNCTION_VERSION,repaired_panels:repairs.length,added_triangles:addedTriangles,max_height_difference:maxGap,roof_vertices_modified:false,repairs}};
}
