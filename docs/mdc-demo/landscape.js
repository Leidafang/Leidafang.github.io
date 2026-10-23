import * as THREE from 'three';

const textures={};
export const landscapeStats={ready:false,grassBlades:0};
export async function prepareLandscape(){
  const loader=new THREE.TextureLoader();
  await Promise.all(['grass','asphalt','concrete'].map(async kind=>{
    const names=kind==='grass'?['Grass004_1K-JPG_Color.jpg','Grass004_1K-JPG_NormalGL.jpg','Grass004_1K-JPG_Roughness.jpg']:
      [`${kind}_diff_1k.jpg`,`${kind}_nor_gl_1k.jpg`,`${kind}_rough_1k.jpg`];
    textures[kind]=await Promise.all(names.map(n=>loader.loadAsync(`./assets/surfaces/${n}`)));
    textures[kind].forEach((t,i)=>{t.colorSpace=i===0?THREE.SRGBColorSpace:THREE.NoColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;});
  }));
  landscapeStats.ready=true;
}
export function surfaceMaterial(kind,repeat=[1,1],color=0xffffff){
  const material=new THREE.MeshStandardMaterial({color,roughness:1,metalness:0});
  if(kind==='grass')material.color.set(0xb4c49c);
  if(textures[kind]){
    const maps=textures[kind].map(t=>{const c=t.clone();c.repeat.set(...repeat);c.needsUpdate=true;return c;});
    [material.map,material.normalMap,material.roughnessMap]=maps;
    material.normalScale.setScalar(kind==='grass'?.8:.35);
  }
  return material;
}
export function groundSurface(group,x,y,z,width,length,kind,tile){
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,length),surfaceMaterial(kind,[width/tile,length/tile]));
  mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);return mesh;
}

// The textured top is the slab's own +Z face, not a second almost-coplanar
// plane. This prevents camera-dependent depth fighting on distant paving.
export function pavedSlab(group,x,y,z,width,length,depth,kind,tile,sides){
  const top=surfaceMaterial(kind,[width/tile,length/tile]);
  const geometry=new THREE.BoxGeometry(width,length,depth);
  const mesh=new THREE.Mesh(geometry,[sides,sides,sides,sides,top,sides]);
  mesh.position.set(x,y,z-depth/2);mesh.receiveShadow=true;
  mesh.userData.paving=true;group.add(mesh);return mesh;
}

// Low, static grass geometry gives the silhouette thickness. These are plant
// surfaces, not decorative flow particles. Fixed seed and bounded triangles.
export function grassBed(group,x,y,width,length,seed,elevation=0){
  const turf=groundSurface(group,x,y,-.615+elevation,width,length,'grass',1.4);
  turf.name='textured-turf';
  let state=seed;
  const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const position=[],colors=[],palette=[0x687b36,0x809044,0x9aa157,0x778647].map(c=>new THREE.Color(c));
  const count=Math.round(width*length*65);
  for(let i=0;i<count;i++){
    const px=x+(random()-.5)*(width-.035),py=y+(random()-.5)*(length-.035);
    for(let b=0;b<3;b++){
      const a=random()*Math.PI*2,h=.018+random()*.055,w=.005+random()*.005;
      const dx=Math.cos(a)*w,dy=Math.sin(a)*w,bend=.015+random()*.02;
      position.push(px-dx,py-dy,-.613,px+dx,py+dy,-.613,px+Math.cos(a+.6)*bend,py+Math.sin(a+.6)*bend,-.613+h);
      const c=palette[Math.floor(random()*palette.length)];
      for(const scale of [.72,.8,1.12])colors.push(c.r*scale,c.g*scale,c.b*scale);
    }
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(position,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.95}));
  mesh.position.z=elevation;mesh.receiveShadow=true;mesh.name='short-grass';group.add(mesh);landscapeStats.grassBlades+=count*3;
}
