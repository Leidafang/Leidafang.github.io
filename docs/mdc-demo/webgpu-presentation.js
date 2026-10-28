// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import {AdvectionField} from './advection-field.js';
import {CONTROL_ORDER,validateCase} from './case-data.js';
const digest=async a=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a)),v=>v.toString(16).padStart(2,'0')).join('');
export function controlsEngineering(u){return {group_heat_kW:u.slice(0,3).map(v=>5+10*v),total_heat_kW:u.slice(0,3).reduce((s,v)=>s+5+10*v,0),rack_fan_multipliers:u.slice(3,6).map(v=>.7+.6*v),return_fan_multiplier:.7+.6*u[6],water_mass_flow_kg_s:.72+1.44*u[7],water_inlet_C:15};}
export function nodalField(field,geo,assets){
  const nodes=geo.axes.reduce((n,a)=>n*a.length,1),sum=new Float64Array(nodes*4),count=new Uint16Array(nodes),ids=assets['cell-nodes.u32'];
  for(let c=0;c<92016;c++)for(let k=0;k<8;k++){
    const n=ids[c*8+k];count[n]++;for(let d=0;d<3;d++)sum[n*4+d]+=field[c*4+1+d];sum[n*4+3]+=field[c*4]-273.15;
  }
  for(let n=0;n<nodes;n++)if(count[n])for(let d=0;d<4;d++)sum[n*4+d]/=count[n];
  for(const n of assets['wall-nodes.u32'])sum.fill(0,n*4,n*4+3);
  return new Float32Array(sum);
}
export function derivedMetrics(field,geo,controls){
  const summaries={};
  for(const [name,s] of Object.entries(geo.sections)){
    let net=0,pos=0,wt=0;
    for(let i=0;i<s.owner.length;i++){
      const a=s.owner[i]*4,b=s.neighbour[i]*4,w=s.weight[i];let q=0;
      for(let d=0;d<3;d++)q+=(w*field[a+d+1]+(1-w)*field[b+d+1])*s.sf[i][d];
      net+=q;if(q>0){pos+=q;wt+=q*(w*field[a]+(1-w)*field[b]);}
    }
    summaries[name]={net_volume_m3_s:net,temperature_C:pos>1e-10?wt/pos-273.15:null};
  }
  const cfg=geo.water_config,nb=cfg.branches,ns=cfg.segments_per_branch,n=nb*ns;
  const ts=new Float64Array(n),inlet=new Float64Array(n),outlet=new Float64Array(n);
  for(const [cell,seg,w] of geo.water_map)ts[seg]+=w*field[(95856+cell)*4];
  const capacity=controlsEngineering(controls).water_mass_flow_kg_s*cfg.cp_J_kg_K/nb;
  const k=capacity*(-Math.expm1(-cfg.solid_water_UA_W_K/n/capacity));
  let returned=0,heat=0;
  for(let b=0;b<nb;b++){let tw=cfg.inlet_T_K;for(let j=0;j<ns;j++){const s=b*ns+j;inlet[s]=tw;tw+=k*(ts[s]-tw)/capacity;outlet[s]=tw;}returned+=tw/nb;}
  for(const [cell,seg,w] of geo.water_map)heat+=k*w*(field[(95856+cell)*4]-inlet[seg]);
  return {air_supply_C:summaries.coldGrille.temperature_C,air_return_C:summaries.returnFan.temperature_C,return_volume_flow_m3_s:summaries.returnFan.net_volume_m3_s,cooling_heat_kW:heat/1000,water_return_C:returned-273.15};
}
function random(seed=1700){return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
function seeds(field,assets){
  const centres=assets['centres.f32'],bounds=assets['bounds.f32'],volumes=assets['volumes.f32'],rng=random(),result=[];
  for(let zone=0;zone<4;zone++){
    const ids=[],cdf=[];let v=0;
    for(let c=0;c<92016;c++){const y=centres[c*3+1],z=centres[c*3+2];if(!(zone===0?y<.95&&z>0:zone===1?y>2.15&&z>0:zone===2?y>.95&&y<2.15&&z>0:z<-.04)||Math.hypot(field[c*4+1],field[c*4+2],field[c*4+3])<=.08)continue;ids.push(c);cdf.push(v+=volumes[c]);}
    if(!v)continue;
    for(let n=0;n<150;n++){const value=rng()*v;let lo=0,hi=cdf.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(cdf[mid]<value)lo=mid+1;else hi=mid;}const c=ids[lo];result.push(Array.from({length:3},(_,d)=>centres[c*3+d]+(rng()-.5)*.6*(bounds[c*6+3+d]-bounds[c*6+d])));}
  }return result;
}
// Fixed maximum spatial/temporal steps, RK4 stages and every accepted chord
// remain in the native air occupancy. No reflection, normalization or smoothing.
function branch(field,seed,direction){
  const point=Float64Array.from(seed),sample=new Float64Array(4),k1=new Float64Array(4),k2=new Float64Array(4),k3=new Float64Array(4),k4=new Float64Array(4),mid=new Float64Array(3),next=new Float64Array(3);
  if(!field.sample(point,sample))return [];
  const path=[[...point,sample[3],0]];let time=0,length=0;
  for(let step=0;step<4500&&length<16&&time<45;step++){
    if(!field.sample(point,k1))break;const speed=Math.hypot(...k1.subarray(0,3));if(speed<.025)break;
    let dt=Math.min(.05,.008/speed,45-time),ok=false;
    for(let retry=0;retry<8;retry++,dt*=.5){
      for(let d=0;d<3;d++)mid[d]=point[d]+direction*dt*.5*k1[d];
      if(field.segmentFraction(point,mid)<1||!field.sample(mid,k2))continue;
      for(let d=0;d<3;d++)mid[d]=point[d]+direction*dt*.5*k2[d];
      if(field.segmentFraction(point,mid)<1||!field.sample(mid,k3))continue;
      for(let d=0;d<3;d++)mid[d]=point[d]+direction*dt*k3[d];
      if(field.segmentFraction(point,mid)<1||!field.sample(mid,k4))continue;
      for(let d=0;d<3;d++)next[d]=point[d]+direction*dt*(k1[d]+2*k2[d]+2*k3[d]+k4[d])/6;
      if(field.segmentFraction(point,next)<1||!field.sample(next,sample))continue;ok=true;break;
    }
    if(!ok||dt<1e-6)break;
    length+=Math.hypot(...next.map((v,d)=>v-point[d]));time+=dt;point.set(next);
    path.push([...point,sample[3],direction*time]);
  }return path;
}
export function makePaths(values,fieldValues,geo,assets,onProgress=()=>{}){
  const volume=new AdvectionField({schema:'mdc-advection-volume-v1',order:'xyz-z-fastest',stride:4,air_cells:92016,axes:geo.axes},fieldValues,assets['air-mask.u8']);
  const packed=[],paths=[],starts=seeds(values,assets);let rejected=0;
  for(let i=0;i<starts.length;i++){
    const back=branch(volume,starts[i],-1),forward=branch(volume,starts[i],1),joined=[...back.slice(1).reverse(),...forward];
    let best=[0,0],bestLength=0,start=0,length=0;
    for(let j=1;j<joined.length;j++){
      const ds=Math.hypot(...joined[j].slice(0,3).map((v,d)=>v-joined[j-1][d])),dt=joined[j][4]-joined[j-1][4];
      if(dt>0&&ds/dt>.04){length+=ds;if(length>bestLength){bestLength=length;best=[start,j];}}else{start=j;length=0;}
    }
    const run=joined.slice(best[0],best[1]+1);
    if(bestLength<2||run.length<2||run.at(-1)[4]-run[0][4]<.5){rejected++;continue;}
    const t0=run[0][4],offset=packed.length/5;let under=0;
    for(let j=0;j<run.length;j++){
      if(j&&run[j][2]<-.035&&run[j-1][2]<-.035)under+=Math.hypot(...run[j].slice(0,3).map((v,d)=>v-run[j-1][d]));
      packed.push(...run[j].slice(0,4),run[j][4]-t0);
    }
    paths.push({offset,count:run.length,duration_s:run.at(-1)[4]-t0,length_m:bestLength,underfloor_length_m:under});
    if(i%30===0)onProgress({stage:'paths',completed:i,total:starts.length});
  }
  if(paths.length<24)throw Error('预测速度场中可用流线不足，保留上一完整结果。');
  // Float32 rounding must not create chords through a thin solid or put a point outside.
  const array=new Float32Array(packed);for(const path of paths)for(let j=0;j<path.count;j++){
    const at=(path.offset+j)*5,p=array.subarray(at,at+3);if(!volume.contains(p)||j&&volume.segmentFraction(array.subarray(at-5,at-2),p)<1)throw Error('流线边界检查失败');
  }
  return {packed:array,paths,rejected};
}
export async function presentPrediction(field,controls,model,geo,assets,onProgress=()=>{}){
  if(field.length!==98376*4||!field.every(Number.isFinite))throw Error('Invalid browser prediction');
  const values=nodalField(field,geo,assets),{packed,paths,rejected}=makePaths(field,values,geo,assets,onProgress);
  const owners=assets['solid-owner.u32'],xyz=assets['solid-xyz.f32'],solid=new Float32Array(owners.length*4);
  for(let i=0;i<owners.length;i++){solid.set(xyz.subarray(i*3,i*3+3),i*4);solid[i*4+3]=field[owners[i]*4]-273.15;}
  const stats=(start,count)=>{let lo=Infinity,hi=-Infinity,sum=0,vol=0;for(let i=start;i<start+count;i++){const t=field[i*4],v=assets['volumes.f32'][i];lo=Math.min(lo,t);hi=Math.max(hi,t);sum+=t*v;vol+=v;}return {Tmin_K:lo,Tmax_K:hi,Tmean_K:sum/vol};};
  const regionStats={air:stats(0,92016)};
  const regions=geo.regions.map(r=>{const m=stats(r.cell_offset,r.cells);regionStats[r.name]=m;return {name:r.name,offset:r.offset,count:r.count,cells:r.cells,min_C:m.Tmin_K-273.15,max_C:m.Tmax_K-273.15,mean_C:m.Tmean_K-273.15};});
  const ranges={air:[regionStats.air.Tmin_K-273.15,regionStats.air.Tmax_K-273.15]};
  for(const k of ['racks','coil']){const rs=regions.filter(r=>(r.name==='coil')===(k==='coil'));ranges[k]=[Math.min(...rs.map(r=>r.min_C)),Math.max(...rs.map(r=>r.max_C))];}
  const e=controlsEngineering(controls),metrics=derivedMetrics(field,geo,controls),predictionId=await digest(field.buffer),domain=controls.every(v=>v>=.2&&v<=.8)?'inner_box':'outer_shell';
  const common={source_kind:'ai_prediction',snapshot_kind:'steady',domain_class:domain,prediction_id:predictionId,model_id:model.model_id,geometry_id:model.geometry_id,checkpoint_sha256:model.checkpoint_sha256,execution:'browser-webgpu-fp32'};
  const manifest={schema:'mdc-cfd-viewer-v1',source_schema:'mdc-r8-closed-loop-v6',case_id:'ai_prediction',...common,stride:5,paths,standard_controls:controls,standard_control_order:CONTROL_ORDER,engineering_controls:e,geometry:geo.geometry,air_temperature_range_C:ranges.air,display_temperature_range_C:ranges.air,metrics:{regions:regionStats,derived:metrics},derived_metrics_method:{schema:'mdc-ai-derived-metrics-v1',geometry_mapping_sha256:geo.metric_identity,air_method:'Native section interpolation, net volume flux and positive-flux temperature',water_method:'water_overlap_v1 algebraic closure from predicted coil T'},binary_sha256:await digest(packed.buffer),method:{integrator:'Browser RK4 on predicted air U; bidirectional shared seed; <=0.008m / 0.05s per step',wall_check:'Native occupancy and all RK stages/chords; float32 checked',short_paths_rejected:rejected,animation:'AI steady advection'}};
  const solidMeta={schema:'mdc-solid-surfaces-v1',source_schema:manifest.source_schema,...common,stride:4,regions,display_ranges_C:{racks:ranges.racks,coil:ranges.coil},sha256:await digest(solid.buffer)};
  const entry={id:'ai_prediction',title_zh:'AI 自定义稳态',title_en:'AI custom steady state',engineering_controls:e,ranges_C:ranges,metrics:{air_max_C:ranges.air[1],rack_max_C:ranges.racks[1],...metrics}};
  validateCase({scale_mode:'per_case',cases:[entry]},entry.id,manifest,solidMeta,packed,solid);
  return {data:{manifest,solidMeta,packed,solid},entry,result:{source:common,standard_controls:controls,domain_class:domain}};
}
