import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

let trees=[],shrubs=[],bushes=[];
export const vegetationStats={ready:false,trees:0,shrubs:0,planterBushes:0,treeTriangles:0,bushTriangles:0,treeRootOffsets:[],planterBounds:[]};
function daylitFoliage(tree){
  tree.traverse(o=>{if(o.isMesh&&o.material.name==='leaves'){
    const old=o.material;
    o.material=new THREE.MeshStandardMaterial({name:'daylit-leaves',map:old.map,
      color:0xf5ffe8,side:THREE.DoubleSide,alphaTest:.45,roughness:.85,
      emissive:0x6d8741,emissiveMap:old.map,emissiveIntensity:.12});
    old.dispose();
  }});
}
export function baseAnchor(geometry,baseRingSegments=0){
  geometry.computeBoundingBox();const b=geometry.boundingBox,p=geometry.attributes.position;
  // EZ-Tree emits the trunk's base ring first (followed by a duplicate seam
  // vertex). Use that actual stem origin, not a low hanging side branch.
  if(baseRingSegments){
    const root=new THREE.Vector3();
    for(let i=0;i<baseRingSegments;i++)root.add(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));
    return root.divideScalar(baseRingSegments);
  }
  const bottom=new THREE.Box3();
  for(let i=0;i<p.count;i++)if(p.getY(i)<=b.min.y+Math.max(1e-6,(b.max.y-b.min.y)*.002))
    bottom.expandByPoint(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));
  return new THREE.Vector3((bottom.min.x+bottom.max.x)/2,b.min.y,(bottom.min.z+bottom.max.z)/2);
}
export function normalized(source,height,anchor=null){
  const group=new THREE.Group();
  source.traverse(o=>{if(o.isMesh){const mesh=new THREE.Mesh(o.geometry,o.material);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}});
  const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const root=anchor||new THREE.Vector3(center.x,bounds.min.y,center.z);
  const inner=new THREE.Group();inner.add(group);group.position.copy(root).negate();
  // Planting height is root-to-top. Foliage below the root can be hidden by
  // soil, but must not reduce the intended above-soil height of a dense bush.
  inner.scale.setScalar(height/(bounds.max.y-root.y));inner.rotation.x=Math.PI/2;
  inner.userData.root=root.toArray();
  return inner;
}
export async function prepareVegetation(){
  // The pinned MIT module includes local data-URI bark/leaf textures; wait for
  // their decode before first rendering so the canopy cannot become solid cards.
  const manager=THREE.DefaultLoadingManager,oldLoad=manager.onLoad,oldError=manager.onError;
  let timer;
  const embeddedReady=new Promise((resolve,reject)=>{
    manager.onLoad=()=>{clearTimeout(timer);resolve();};
    manager.onError=()=>{clearTimeout(timer);reject(new Error('树木材质读取失败'));};
    timer=setTimeout(()=>reject(new Error('树木材质读取超时')),120000);
  });
  // Observe rejection while the embedded texture module is still downloading.
  embeddedReady.catch(()=>{});
  try{
    const {Tree}=await import('./assets/ez-tree/ez-tree-1.1.0.es.js');
    await embeddedReady;
    for(const seed of [17,83]){
      const tree=new Tree();tree.loadPreset('Oak Small');tree.options.seed=seed;
      tree.options.branch.children[1]=3;tree.options.branch.children[2]=4;
      tree.options.leaves.count=24;tree.options.leaves.size=2.8;tree.options.leaves.sizeVariance=.4;
      tree.generate();
      // Phong leaves do not receive diffuse PBR environment illumination.
      daylitFoliage(tree);
      vegetationStats.treeTriangles+=tree.triangleCount;
      trees.push(normalized(tree,1,baseAnchor(tree.branchesMesh.geometry,tree.options.branch.segments[0])));
    }
    for(const seed of [113,237]){
      const bush=new Tree();bush.loadPreset('Bush 1');bush.options.seed=seed;
      bush.options.leaves.count=18;bush.options.leaves.size=3.1;
      bush.generate();daylitFoliage(bush);
      vegetationStats.bushTriangles+=bush.triangleCount;
      bushes.push(normalized(bush,1,baseAnchor(bush.branchesMesh.geometry,bush.options.branch.segments[0])));
    }
  }finally{clearTimeout(timer);manager.onLoad=oldLoad;manager.onError=oldError;}
  const loader=new GLTFLoader(new THREE.LoadingManager());
  const [gltf,alpha]=await Promise.all([loader.loadAsync('./assets/shrub-03/shrub_03_1k.gltf'),new THREE.TextureLoader().loadAsync('./assets/shrub-03/textures/shrub_03_alpha_1k.png')]);
  alpha.flipY=false;
  gltf.scene.traverse(o=>{if(o.isMesh){
    o.material.alphaMap=alpha;o.material.alphaTest=.5;o.material.transparent=false;
    o.material.side=THREE.DoubleSide;o.material.roughness=.85;o.material.metalness=0;
    o.material.aoMapIntensity=.35;o.material.needsUpdate=true;
    o.material.emissive.set(0x63823c);o.material.emissiveMap=o.material.map;o.material.emissiveIntensity=.08;
    shrubs.push(normalized(o,1,baseAnchor(o.geometry)));
  }});
  vegetationStats.ready=true;
}
export function addTree(group,x,y,height,variant=0){
  if(!trees.length)return;
  const tree=trees[variant%trees.length].clone(true);tree.scale.multiplyScalar(height);tree.position.set(x,y,-.65);
  const pivot=new THREE.Group();pivot.add(tree);group.add(pivot);vegetationStats.trees++;
  tree.updateMatrixWorld(true);
  const root=new THREE.Vector3(...tree.userData.root);tree.children[0].localToWorld(root);
  vegetationStats.treeRootOffsets.push(Math.hypot(root.x-x,root.y-y));
}
export function addShrub(group,x,y,z,height,variant=0){
  if(!shrubs.length)return;
  const shrub=shrubs[variant%shrubs.length].clone(true);shrub.scale.multiplyScalar(height);shrub.position.set(x,y,z);
  group.add(shrub);vegetationStats.shrubs++;
}
export function addPlanterBush(group,x,y,z,height,variant=0){
  if(!bushes.length)return;
  const bush=bushes[variant%bushes.length].clone(true);bush.scale.multiplyScalar(height);
  bush.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),variant*.89));
  const size=new THREE.Box3().setFromObject(bush).getSize(new THREE.Vector3());
  const spread=.64/Math.max(size.x,size.y);bush.scale.x*=spread;bush.scale.z*=spread;
  bush.position.set(x,y,z);group.add(bush);vegetationStats.planterBushes++;
  const b=new THREE.Box3().setFromObject(bush);vegetationStats.planterBounds.push({min:b.min.toArray(),max:b.max.toArray()});
  if(vegetationStats.planterBushes===1)vegetationStats.shrubHeight=b.max.z-z;
}
