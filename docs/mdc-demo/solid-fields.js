import * as THREE from 'three';

// Sequential solid-only palette, deliberately distinct from the air blue/red scale.
export function solidRGB(t,lo,hi){
  const stops=[[.12,.08,.31],[.39,.16,.55],[.74,.26,.45],[.96,.52,.29],[1,.91,.58]];
  const s=Math.max(0,Math.min(1,(t-lo)/(hi-lo||1)))*4,i=Math.min(3,Math.floor(s)),f=s-i;
  return stops[i].map((v,k)=>v+(stops[i+1][k]-v)*f);
}
export function buildSolidFields(meta,data){
  if(meta.schema!=='mdc-solid-surfaces-v1'||meta.stride!==4)throw new Error('不支持的固体场格式');
  const coil=new THREE.Group(),racks=new THREE.Group();
  const ranges={};
  for(const kind of ['coil','racks']){
    const regions=meta.regions.filter(r=>kind==='coil'?r.name==='coil':r.name.startsWith('rack'));
    ranges[kind]=meta.display_ranges_C?.[kind]??[Math.min(...regions.map(r=>r.min_C)),Math.max(...regions.map(r=>r.max_C))];
  }
  if(data.length!==meta.regions.reduce((n,r)=>n+r.count,0)*4)throw new Error('固体场长度不匹配');
  for(const r of meta.regions){
    const kind=r.name==='coil'?'coil':'racks',pos=new Float32Array(r.count*3),colors=new Float32Array(r.count*3);
    const [lo,hi]=ranges[kind];
    for(let i=0;i<r.count;i++){
      const at=(r.offset+i)*4,t=data[at+3];
      if(!Number.isFinite(t)||t<r.min_C-1e-4||t>r.max_C+1e-4)throw new Error('固体场数值越界');
      pos.set(data.subarray(at,at+3),i*3);
      const c=new THREE.Color().setRGB(...solidRGB(t,lo,hi),THREE.SRGBColorSpace);
      colors.set([c.r,c.g,c.b],i*3);
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(pos,3));
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,toneMapped:false}));
    mesh.userData.region=r.name;(kind==='coil'?coil:racks).add(mesh);
  }
  return {coil,racks,ranges,meta};
}
