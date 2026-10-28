// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import * as ort from './vendor/ort/ort.webgpu.bundle.min.mjs';
import {modelAccessConfig} from './model-access-config.js';
import {createModelReader} from './model-download.js';
const root=new URL('./webgpu/',import.meta.url).href;
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),n=>n.toString(16).padStart(2,'0')).join('');
async function asset(spec,read=path=>fetch(root+path)){const name=spec.file??spec.name;if(!/^[a-z0-9.-]+$/.test(name))throw Error('Invalid asset path');const r=await read(name);if(!r.ok)throw Error('模型资产读取失败');const b=await r.arrayBuffer();if(await hash(b)!==spec.sha256)throw Error('模型资产校验失败');return b;}
export async function browserCapability(){
  if(!navigator.gpu)throw Error('webgpu-unavailable');
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter||adapter.info.isFallbackAdapter)throw Error('webgpu-unavailable');
  const limits=Object.fromEntries(['maxBufferSize','maxStorageBufferBindingSize'].map(k=>[k,adapter.limits[k]]));
  const info={vendor:adapter.info.vendor,architecture:adapter.info.architecture,device:adapter.info.device,description:adapter.info.description,isFallbackAdapter:adapter.info.isFallbackAdapter};
  if(limits.maxStorageBufferBindingSize<512*1024**2)throw Error('webgpu-buffer-limit');
  return {adapter,info,limits};
}
export async function createBrowserModel(progress=()=>{},access=null){
  const read=createModelReader(modelAccessConfig,access,root);
  const {adapter,info,limits}=await browserCapability();progress({stage:'device',info,limits});
  const device=await adapter.requestDevice({requiredLimits:limits});
  ort.env.webgpu.device=device;ort.env.wasm.numThreads=1;ort.env.wasm.wasmPaths=new URL('./vendor/ort/',import.meta.url).href;
  let session;
  try{
    const response=await read('manifest.json');if(!response.ok)throw Error('模型清单读取失败');const manifest=await response.json();
    if(manifest.model_id!=='mdc-v6-solid-mask-e300'||manifest.geometry_id!=='wall98376-global-energy-overlap-v1'||manifest.checkpoint_sha256!=='d0a0876b9209155053079067e133b122dcb4d2983df611e8e4c892b47ae9eb78'||manifest.points!==98376)throw Error('模型身份不匹配');
    progress({stage:'download',info,limits});
    const [model,local]=await Promise.all([asset(manifest.files['model.onnx'],read),asset(manifest.files['local.f32'],read)]);
    const runtimeRoot=new URL('./vendor/ort/',import.meta.url);
    const runtime=await (await fetch(new URL('runtime.json',runtimeRoot))).json();
    const compressed=await fetch(new URL('runtime.bin',runtimeRoot));if(!compressed.ok)throw Error('推理运行时读取失败');
    const wasm=await new Response(compressed.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if(runtime.version!=='1.30.0'||wasm.byteLength!==runtime.bytes||await hash(wasm)!==runtime.sha256)throw Error('推理运行时校验失败');
    ort.env.wasm.wasmBinary=wasm;
    progress({stage:'compile',info,limits});
    session=await ort.InferenceSession.create(model,{executionProviders:['webgpu'],extra:{session:{disable_cpu_ep_fallback:'1'}}});
    const input=new ort.Tensor('float32',new Float32Array(local),[1,manifest.points,5]);
    return {manifest,info,limits,
      async predict(controls){
        if(controls.length!==8||controls.some(v=>!Number.isFinite(v)||v<.1||v>.9))throw Error('控制参数超出范围');
        const start=performance.now(),ct=new ort.Tensor('float32',new Float32Array(controls),[1,1,8]);
        const outputs=await session.run({local:input,controls:ct});
        try{const data=await outputs.field.getData(),field=new Float32Array(manifest.points*4);
          for(let i=0;i<manifest.points;i++)for(let c=0;c<4;c++)field[i*4+c]=c&&i>=manifest.air_cells?0:data[i*4+c]*manifest.state_std[c]+manifest.state_mean[c];
          if(!field.every(Number.isFinite))throw Error('预测包含无效数值');return {field,milliseconds:performance.now()-start};
        }finally{ct.dispose();outputs.field.dispose();}
      },
      async loadGeometry(){
        const geo=JSON.parse(new TextDecoder().decode(await asset(manifest.files['geometry.json'],read)));
        if(geo.schema!=='mdc-webgpu-geometry-v1'||geo.checkpoint_sha256!==manifest.checkpoint_sha256)throw Error('几何身份不匹配');
        const assets=Object.fromEntries(await Promise.all(Object.entries(geo.files).map(async([name,spec])=>[name,new (spec.dtype==='<u4'?Uint32Array:spec.dtype==='u1'?Uint8Array:Float32Array)(await asset(spec,read))])));
        return {geo,assets};
      },
      async dispose(){input.dispose();await session.release();device.destroy();}
    };
  }catch(error){await session?.release();device.destroy();throw error;}
}
export async function verifyWebGPU(progress){
  const model=await createBrowserModel(progress),cases=[];
  try{
    for(const ref of model.manifest.references){
      progress({stage:'inference',case:ref.name,info:model.info,limits:model.limits});
      const {field,milliseconds}=await model.predict(ref.controls),expected=new Float32Array(await asset(ref));let tmax=0,umax=0,tsq=0,usq=0;
      for(let i=0;i<model.manifest.points;i++)for(let c=0;c<4;c++){
        if(c&&i>=model.manifest.air_cells)continue;
        const err=Math.abs(field[i*4+c]-expected[i*4+c]);if(c){umax=Math.max(umax,err);usq+=err*err;}else{tmax=Math.max(tmax,err);tsq+=err*err;}
      }
      cases.push({name:ref.name,milliseconds,T_max_abs_K:tmax,U_max_abs_m_s:umax,T_rmse_K:Math.sqrt(tsq/model.manifest.points),U_rmse_m_s:Math.sqrt(usq/(model.manifest.air_cells*3)),passed:tmax<.01&&umax<.001});
    }
    return {passed:cases.every(c=>c.passed),info:model.info,limits:model.limits,cases,executionProvider:'webgpu',cpuFallbackDisabled:true};
  }finally{await model.dispose();}
}
