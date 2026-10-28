// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import {createBrowserModel} from './webgpu-runtime.js';
import {presentPrediction} from './webgpu-presentation.js';
let model,geometry,busy=false;
self.onmessage=async({data:{id,controls}})=>{
  if(busy){self.postMessage({id,error:'busy'});return;}busy=true;
  const progress=status=>self.postMessage({id,status});
  try{
    model??=await createBrowserModel(progress);geometry??=await model.loadGeometry();
    progress({stage:'inference'});const prediction=await model.predict(controls);
    progress({stage:'paths'});const result=await presentPrediction(prediction.field,controls,model.manifest,geometry.geo,geometry.assets,progress);
    result.result.inference_seconds=prediction.milliseconds/1000;result.result.device=model.info;
    self.postMessage({id,result},[result.data.packed.buffer,result.data.solid.buffer]);
  }catch(e){self.postMessage({id,error:e.message});}finally{busy=false;}
};
