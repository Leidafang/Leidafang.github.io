// A shed roof is one affine height field over the building footprint. Reuse
// OSM2World's flat-top triangulation (including courtyard holes) and map its
// upper vertices to that plane. This avoids concave-footprint failures in the
// pinned web module's native SkillionRoof while retaining its native topology.
export const PLANAR_ROOF_VERSION='native-topology-planar-skillion-v1';
const EPS=2e-6;

export function applyPlanarSkillion(meshes,parts){
  const roofs=parts.filter(p=>p.roof==='skillion').map(part=>{
    const radians=part.roofDirection*Math.PI/180;
    // OSM roof:direction is downhill, clockwise from north. The adapter's
    // northing is mirrored, so the uphill planar direction is (-sin, cos).
    const direction=[-Math.sin(radians),Math.cos(radians)],projections=[];
    for(const mesh of meshes.filter(m=>m.role==='roof'))for(let i=0;i<mesh.positions.length;i+=3){
      if(Math.abs(mesh.positions[i+2]-part.height)<=EPS)projections.push(mesh.positions[i]*direction[0]+mesh.positions[i+1]*direction[1]);
    }
    const lo=Math.min(...projections),hi=Math.max(...projections);
    if(!Number.isFinite(lo)||hi-lo<EPS)throw Error('The native roof footprint cannot define a shed plane');
    return {part,direction,lo,hi};
  });
  const result=meshes.map(mesh=>{
    const positions=new Float32Array(mesh.positions),normals=new Float32Array(mesh.normals);
    for(let i=0;i<positions.length;i+=3){
      const roof=roofs.find(r=>Math.abs(positions[i+2]-r.part.height)<=EPS);if(!roof)continue;
      const projection=positions[i]*roof.direction[0]+positions[i+1]*roof.direction[1],fraction=Math.max(0,Math.min(1,(projection-roof.lo)/(roof.hi-roof.lo)));
      positions[i+2]=roof.part.height-roof.part.roofRise+roof.part.roofRise*fraction;
    }
    if(mesh.role==='roof')for(let i=0;i<positions.length;i+=9){
      const a=positions.slice(i,i+3),b=positions.slice(i+3,i+6),c=positions.slice(i+6,i+9),u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...cross);
      if(length<1e-12)throw Error('The native roof triangulation contains a degenerate face');
      for(const offset of [0,3,6])normals.set(cross.map(x=>x/length),i+offset);
    }
    return {...mesh,positions,normals};
  });
  return {meshes:result,report:{method:PLANAR_ROOF_VERSION,source_topology:'OSM2World flat roof and facade mesh',parts:roofs.map(r=>({id:r.part.id,roof_direction_deg:r.part.roofDirection,roof_rise:r.part.roofRise,projection_range:[r.lo,r.hi]}))}};
}
