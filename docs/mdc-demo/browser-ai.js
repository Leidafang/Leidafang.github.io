// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
let worker;
export const localAI=true; // Standalone public GPU test: never use the local Python API.
export async function browserAIStatus(){
  if(!navigator.gpu)return {ready:false,reason:'webgpu-unavailable'};
  const adapter=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});
  if(!adapter||adapter.info.isFallbackAdapter)return {ready:false,reason:'webgpu-unavailable'};
  if(adapter.limits.maxStorageBufferBindingSize<512*1024**2)return {ready:false,reason:'webgpu-buffer-limit'};
  return {ready:true};
}
export function predictBrowserCase(catalog,controls,id,signal,onStage){
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(new DOMException('Aborted','AbortError'));return;}
    worker??=new Worker(new URL('./browser-ai-worker.js',import.meta.url),{type:'module'});
    const current=worker;
    // Cold WASM/model compilation varies substantially by device; keep a bounded ten-minute preparation budget.
    const timer=setTimeout(()=>fail(Error('webgpu-timeout')),600000);
    const cleanup=()=>{clearTimeout(timer);signal.removeEventListener('abort',abort);current.onmessage=null;current.onerror=null;};
    const fail=error=>{cleanup();current.terminate();if(worker===current)worker=null;reject(error);};
    const abort=()=>fail(new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',abort,{once:true});
    current.onerror=event=>{event.preventDefault();fail(Error(event.message));};
    current.onmessage=({data})=>{if(data.id!==id)return;if(data.status){onStage(data.status.stage);return;}if(data.error){fail(Error(data.error));return;}cleanup();resolve(data.result);};
    current.postMessage({id,controls});
  });
}
