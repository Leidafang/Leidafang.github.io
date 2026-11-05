import {generateBuilding} from './o2w-adapter.mjs?v=roof-junction-20261105';

self.onmessage=async({data})=>{
  const {ticket,config,floors}=data;
  try{
    const result=await generateBuilding(config,floors);
    self.postMessage({type:'geometry',ticket,result},result.meshes.flatMap(m=>[m.positions.buffer,m.normals.buffer]));
  }catch(error){self.postMessage({type:'error',ticket,message:String(error.message||error)});}
};
self.postMessage({type:'ready'});
