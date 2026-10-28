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
