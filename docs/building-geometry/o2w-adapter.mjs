import {O2WConverter} from './vendor/osm2world/osm2world-core-web.mjs';
import {buildOsmData,exportParameters} from './forms-model.mjs?v=forms-o2w-20261105';

// The upstream module emits Y-up meshes. Convert to the project's Z-up frame
// and normalize by the requested reference height, without reshaping axes.
export async function generateBuilding(config,floors=10){
  const {osm,referenceHeight,shape}=buildOsmData(config,floors);
  const native=await new Promise((resolve,reject)=>new O2WConverter().convertJson(JSON.stringify(osm),resolve,error=>reject(Error(String(error)))));
  const meshes=[],lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0,rewoundTriangles=0;
  for(const m of native){
    const original=m.positions(),originalNormals=m.normals(),indices=m.indices(),positions=new Float32Array(indices.length*3),normals=new Float32Array(indices.length*3),color=Array.from(m.color());
    for(let i=0;i<positions.length;i+=3){
      const j=indices[i/3]*3;
      positions[i]=original[j]/referenceHeight;positions[i+1]=-original[j+2]/referenceHeight;positions[i+2]=original[j+1]/referenceHeight;
      normals[i]=originalNormals[j];normals[i+1]=-originalNormals[j+2];normals[i+2]=originalNormals[j+1];
      for(let k=0;k<3;k++){if(!Number.isFinite(positions[i+k]))throw Error('Generator returned non-finite geometry');lo[k]=Math.min(lo[k],positions[i+k]);hi[k]=Math.max(hi[k],positions[i+k]);}
    }
    // The pinned web module emits clockwise fronts for its Babylon.js example.
    // Honor the native outward normals when adapting to Three.js/glTF winding.
    for(let i=0;i<positions.length;i+=9){
      const a=positions.slice(i,i+3),b=positions.slice(i+3,i+6),c=positions.slice(i+6,i+9),u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]);
      const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      if(cross.reduce((s,x,k)=>s+x*normals[i+k],0)<0){
        for(let k=0;k<3;k++){[positions[i+3+k],positions[i+6+k]]=[positions[i+6+k],positions[i+3+k]];[normals[i+3+k],normals[i+6+k]]=[normals[i+6+k],normals[i+3+k]];}rewoundTriangles++;
      }
    }
    triangles+=positions.length/9;meshes.push({positions,normals,color,role:color.reduce((s,v)=>s+v,0)/3<.63?'roof':'wall'});
  }
  if(!triangles||Math.abs(hi[2]-1)>.0001||Math.abs(lo[2])>.0001)throw Error('Native building height did not match H=1');
  const metadata=exportParameters(config,floors);
  metadata.output={triangles,bounds:[lo,hi],native_meshes:meshes.length,source_reference_height_m:referenceHeight,
    front_faces_adapted_to_outward_normals:true,rewound_triangles:rewoundTriangles,
    surface_kind:'Native OSM2World preview assembly; ground caps and internal contacts are not repaired',closed_solid_validated:false};
  return {meshes,bounds:[lo,hi],triangles,metadata,footprintArea:shape.footprintArea};
}
