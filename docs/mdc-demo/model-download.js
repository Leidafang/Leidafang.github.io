// Authenticated asset transport; credentials never reach OSS or public fallback paths.
export function createModelReader(config,access,publicRoot,fetcher=fetch){
  if(config.enabled&&(!access||access.endpoint!==new URL(config.endpoint).origin))throw Error('model-locked');
  return async name=>{
    if(!/^[a-z0-9.-]+$/.test(name))throw Error('Invalid asset path');
    if(!config.enabled)return fetcher(publicRoot+name);
    const response=await fetcher(access.endpoint+'/assets/'+name,{headers:{Authorization:'Bearer '+access.token},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    if(!response.ok||config.delivery!=='oss-signed-url')return response;
    const ticket=await response.json(),url=new URL(ticket.url);
    if(url.protocol!=='https:'||url.origin!==config.assetOrigin||url.username||url.password||url.hash||url.pathname!=='/v6-e300/'+name||!Number.isFinite(ticket.expires_at)||ticket.expires_at<=Date.now()||ticket.expires_at>Date.now()+125000)throw Error('Invalid download ticket');
    return fetcher(url.href,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
  };
}

// Store verified bytes only, under synthetic same-origin keys; never store
// the gateway session, manifest response, or short-lived signed URL.
const cacheName='mdc-authorized-model-v1:'+new URL('./',import.meta.url).href;
export async function openModelCache(){
  try{return await globalThis.caches?.open(cacheName);}catch{return undefined;}
}
export async function clearModelCache(){
  await globalThis.caches?.delete(cacheName);
}
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export async function readVerifiedAsset(spec,read,cache){
  const name=spec.file??spec.name;
  if(typeof name!=='string'||!/^[a-z0-9.-]+$/.test(name)||!/^[a-f0-9]{64}$/.test(spec.sha256))throw Error('Invalid asset identity');
  const key=new URL('./.mdc-model-cache/'+name,import.meta.url).href;
  try{
    const cached=await cache?.match(key);
    if(cached){
      const bytes=await cached.arrayBuffer();
      if(await sha256(bytes)===spec.sha256)return bytes;
    }
  }catch{/* Storage unavailable: continue via the authorized transport. */}
  const response=await read(name);if(!response.ok)throw Error('模型资产读取失败');
  const bytes=await response.arrayBuffer();
  if(await sha256(bytes)!==spec.sha256)throw Error('模型资产校验失败');
  try{await cache?.put(key,new Response(bytes));}catch{/* Quota/private mode: this prediction can still run. */}
  return bytes;
}
