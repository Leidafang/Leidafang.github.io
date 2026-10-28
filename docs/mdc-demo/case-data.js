// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
// Explicit v6 steady-state contract. No transient interpolation or legacy R8 indexing.
export const CONTROL_ORDER=['heat_A','heat_B','heat_C','rack_fan_A','rack_fan_B','rack_fan_C','return_fan','cooling_water_flow'];
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const requireValue=(ok,message)=>{if(!ok)throw new Error(message);};
export function validateCase(catalog,id,m,s,air,solid){
  const entry=catalog.cases.find(c=>c.id===id);
  requireValue(entry&&m.case_id===id&&m.source_schema==='mdc-r8-closed-loop-v6'&&m.schema==='mdc-cfd-viewer-v1'&&m.stride===5,'Invalid steady case');
  requireValue(equal(m.standard_control_order,CONTROL_ORDER)&&m.standard_controls.length===8,'Invalid v6 controls');
  if(id==='ai_prediction'){
    requireValue(m.source_kind==='ai_prediction'&&m.snapshot_kind==='steady'&&s.source_kind===m.source_kind&&s.prediction_id===m.prediction_id&&m.model_id==='mdc-v6-solid-mask-e300'&&m.geometry_id==='wall98376-global-energy-overlap-v1'&&s.checkpoint_sha256===m.checkpoint_sha256&&m.checkpoint_sha256==='d0a0876b9209155053079067e133b122dcb4d2983df611e8e4c892b47ae9eb78','AI identity mismatch');
    requireValue(!('iteration' in m)&&!('iteration' in s)&&!('numerically_converged' in m.method),'AI must not claim CFD convergence');
    requireValue(m.standard_controls.every(v=>v>=.1&&v<=.9),'AI controls outside supported range');
    requireValue(m.domain_class===(m.standard_controls.every(v=>v>=.2&&v<=.8)?'inner_box':'outer_shell')&&s.domain_class===m.domain_class,'AI control domain mismatch');
    requireValue(m.derived_metrics_method?.schema==='mdc-ai-derived-metrics-v1','AI derived metrics missing');
    for(const key of ['air_supply_C','air_return_C','return_volume_flow_m3_s','cooling_heat_kW','water_return_C']){
      const v=m.metrics.derived?.[key];
      requireValue((Number.isFinite(v)||(v===null&&['air_supply_C','air_return_C'].includes(key)))&&v===entry.metrics[key],'AI metric/field mismatch');
    }
  }
  const u=m.standard_controls,e=m.engineering_controls,close=(a,b)=>Math.abs(a-b)<1e-8;
  requireValue(u.every(v=>Number.isFinite(v)&&v>=0&&v<=1)&&equal(e,entry.engineering_controls),'Case controls do not match catalog');
  requireValue(u.slice(0,3).every((v,i)=>close(5+10*v,e.group_heat_kW[i]))&&u.slice(3,6).every((v,i)=>close(.7+.6*v,e.rack_fan_multipliers[i]))&&close(.7+.6*u[6],e.return_fan_multiplier)&&close(.72+1.44*u[7],e.water_mass_flow_kg_s),'Invalid engineering control mapping');
  requireValue(s.schema==='mdc-solid-surfaces-v1'&&s.source_schema===m.source_schema&&s.iteration===m.iteration&&s.stride===4,'Air/solid state mismatch');
  requireValue(catalog.scale_mode==='per_case'&&equal(s.display_ranges_C,{racks:entry.ranges_C.racks,coil:entry.ranges_C.coil})&&equal(m.display_temperature_range_C,entry.ranges_C.air)&&equal(m.display_temperature_range_C,m.air_temperature_range_C),'Inconsistent case temperature scales');
  let count=0;
  for(const p of m.paths){requireValue(p.offset===count&&p.count>=2&&p.length_m>=2&&p.duration_s>0,'Invalid path layout');count+=p.count;}
  requireValue(air.length===count*5&&air.every(Number.isFinite),'Invalid air binary');
  for(const p of m.paths)for(let i=1;i<p.count;i++)requireValue(air[(p.offset+i)*5+4]>air[(p.offset+i-1)*5+4],'Nonmonotone travel time');
  requireValue(solid.length===s.regions.reduce((n,r)=>n+r.count,0)*4&&solid.every(Number.isFinite),'Invalid solid binary');
}
async function response(url,signal){const r=await fetch(url,{signal});if(!r.ok)throw new Error(`Data unavailable (${r.status})`);return r;}
export async function loadCatalog(){
  const c=await (await response('./data/catalog.json')).json();
  requireValue(c.schema==='mdc-steady-catalog-v1'&&c.source_schema==='mdc-r8-closed-loop-v6'&&c.snapshot_kind==='independent_steady_states','Invalid steady catalog');
  requireValue(c.cases.length===5&&c.cases.every(v=>/^[a-z_]+$/.test(v.id))&&new Set(c.cases.map(v=>v.id)).size===5&&c.cases.some(v=>v.id===c.default_case),'Invalid case selection');
  return c;
}
async function sha(buffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('');}
export async function loadCase(catalog,id,signal,base=`./data/${id}/`){
  requireValue(catalog.cases.some(c=>c.id===id),'Unknown case');
  const [mb,sb,ab,tb]=await Promise.all(['manifest.json','solids.json','paths.f32','solids.f32'].map(async name=>(await response(base+name,signal)).arrayBuffer()));
  const decode=b=>JSON.parse(new TextDecoder().decode(b)),m=decode(mb),s=decode(sb);
  const hashes=await Promise.all([sha(mb),sha(ab),sha(tb)]);
  requireValue(hashes[0]===s.air_manifest_sha256&&hashes[1]===m.binary_sha256&&hashes[2]===s.sha256,'Case integrity check failed');
  const air=new Float32Array(ab),solid=new Float32Array(tb);validateCase(catalog,id,m,s,air,solid);
  return {manifest:m,solidMeta:s,packed:air,solid,assetBase:base};
}

// Geometry-only startup: no cached CFD fields, temperatures or particle paths.
export async function loadEmptyScene(catalog){
  const scene=await (await response('./scene-geometry.json')).json();
  requireValue(scene.schema==='mdc-scene-geometry-v1'&&scene.geometry?.rack_x?.length===6,'Invalid scene geometry');
  const entry=catalog.cases.find(c=>c.id===catalog.default_case),e=entry.engineering_controls;
  const standard_controls=[...e.group_heat_kW.map(v=>(v-5)/10),...e.rack_fan_multipliers.map(v=>(v-.7)/.6),(e.return_fan_multiplier-.7)/.6,(e.water_mass_flow_kg_s-.72)/1.44];
  return {manifest:{case_id:entry.id,source_kind:'not_computed',geometry:scene.geometry,engineering_controls:e,standard_controls,paths:[],display_temperature_range_C:[0,1],metrics:{regions:{}}},packed:new Float32Array(0),solid:new Float32Array(0),solidMeta:{schema:'mdc-solid-surfaces-v1',stride:4,regions:[],display_ranges_C:{racks:[0,1],coil:[0,1]}}};
}
