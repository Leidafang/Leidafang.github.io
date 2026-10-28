// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import {loadCase} from './case-data.js';
export const AI_MODEL='mdc-v6-solid-mask-e300',AI_GEOMETRY='wall98376-global-energy-overlap-v1';
export function controlsFromEngineering(values){
  if(values.length!==8||values.some(v=>!Number.isFinite(v)))throw new Error('Invalid input');
  const u=values.map((v,i)=>i<3?(v-5)/10:i<7?(v-.7)/.6:(v-.72)/1.44);
  if(u.some(v=>v<.1-1e-12||v>.9+1e-12))throw new Error('Out of supported range');
  // Remove decimal conversion roundoff only; never clip an out-of-range input.
  return u.map(v=>Number(v.toFixed(12)));
}
export function controlDomain(controls){return controls.every(v=>v>=.2&&v<=.8)?'inner_box':'outer_shell';}
export async function predictCase(catalog,controls,requestId,signal,onStage=()=>{}){
  const response=await fetch('./api/ai/predict',{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify({request_id:requestId,model_id:AI_MODEL,geometry_id:AI_GEOMETRY,standard_controls:controls})});
  if(!response.ok)throw new Error(response.status===409?'busy':'prediction');
  const result=await response.json();
  if(result.request_id!==requestId||JSON.stringify(result.standard_controls)!==JSON.stringify(controls)||result.source?.model_id!==AI_MODEL||result.source?.geometry_id!==AI_GEOMETRY||result.domain_class!==controlDomain(controls)||!/^\.\/api\/ai\/results\/[a-f0-9]{64}\/$/.test(result.asset_base))throw new Error('Invalid prediction response');
  onStage('loading');
  const entry=result.entry;
  const nextCatalog={...catalog,cases:[...catalog.cases.filter(c=>c.id!=='ai_prediction'),entry]};
  const data=await loadCase(nextCatalog,'ai_prediction',signal,result.asset_base);
  if(data.manifest.prediction_id!==result.source.prediction_id||JSON.stringify(data.manifest.standard_controls)!==JSON.stringify(controls)||data.manifest.domain_class!==result.domain_class)throw new Error('Prediction/field mismatch');
  return {data,entry,result};
}
