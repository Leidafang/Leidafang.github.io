// Copyright (c) 2026 广联达科技股份有限公司. See LICENSE.txt.
import {modelAccessConfig as config} from './model-access-config.js';
import {getLanguage} from './i18n.js';
export const protectedModels=config.enabled;
let session=null,expiryTimer,root,busy=false,message='',failed=false;
const text=(zh,en)=>getLanguage()==='zh'?zh:en;
function endpoint(){
  const u=new URL(config.endpoint);
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('gateway-not-configured');
  return u.origin;
}
export const modelUnlocked=()=>!protectedModels||Boolean(session&&session.expires_at>Date.now());
export function lockModel(){session=null;clearTimeout(expiryTimer);document.dispatchEvent(new Event('mdc:model-access'));refreshAccess();}
export async function requireModelAccess(){
  if(!protectedModels)return null;
  if(!modelUnlocked()){lockModel();throw Error('model-locked');}
  const current=session;
  const r=await fetch(endpoint()+'/session',{headers:{Authorization:'Bearer '+current.token},cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(r.status===401){lockModel();throw Error('model-locked');}
  if(!r.ok)throw Error('gateway-unavailable');
  if(session!==current)throw Error('model-locked');
  return {endpoint:endpoint(),token:current.token};
}
export function refreshAccess(){
  if(!root)return;
  const open=modelUnlocked();
  root.querySelector('strong').textContent=text(open?'本机 AI 已解锁':'解锁本机 AI','Local AI '+(open?'unlocked':'locked'));
  root.querySelector('p').textContent=text('默认展示名义 CFD 工况。输入授权密码后下载模型，在你的 GPU 上预测。','Nominal CFD is shown by default. Enter the access password to download the model and predict on your GPU.');
  const input=root.querySelector('input');input.placeholder=text('授权密码','Access password');input.setAttribute('aria-label',input.placeholder);
  root.querySelector('form').hidden=open;input.disabled=busy;
  root.querySelector('[type=submit]').disabled=busy||!config.endpoint;
  root.querySelector('[type=submit]').textContent=text(busy?'正在验证…':'解锁',busy?'Verifying…':'Unlock');
  root.querySelector('[data-lock]').hidden=!open;root.querySelector('[data-lock]').textContent=text('锁定并返回名义工况','Lock and return to nominal CFD');
  const status=root.querySelector('[role=status]');status.dataset.error=String(failed);
  status.textContent=!config.endpoint?text('下载服务尚未配置，当前仅展示预载工况。','Download service is not configured. Preloaded fields remain available.'):message;
}
export function mountModelAccess(parent){
  if(!protectedModels)return;
  root=document.createElement('section');root.className='model-access';
  root.innerHTML='<strong></strong><p></p><form><input type="password" autocomplete="current-password" minlength="16" maxlength="256" required><button type="submit"></button></form><button type="button" data-lock></button><p role="status" aria-live="polite"></p><a href="mailto:xiongyn@glodon.com">xiongyn@glodon.com</a>';
  parent.insertBefore(root,parent.querySelector('form'));
  root.querySelector('[data-lock]').onclick=lockModel;
  root.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;busy=true;failed=false;message='';refreshAccess();
    const input=root.querySelector('input'),password=input.value;input.value='';
    try{
      const r=await fetch(endpoint()+'/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
      if(!r.ok)throw Error(r.status===401?'password':r.status===429?'rate':'service');
      const value=await r.json();if(typeof value.token!=='string'||!Number.isFinite(value.expires_at)||value.expires_at<=Date.now()||value.expires_at>Date.now()+3601000)throw Error('service');
      session=value;clearTimeout(expiryTimer);expiryTimer=setTimeout(lockModel,session.expires_at-Date.now());
      document.dispatchEvent(new Event('mdc:model-access'));
    }catch(e){failed=true;message=e.message==='password'?text('密码不正确。','Incorrect password.'):e.message==='rate'?text('尝试过于频繁，请稍后重试。','Too many attempts. Try again later.'):text('无法连接下载服务，请稍后重试。','Download service unavailable. Please retry.');}
    finally{busy=false;refreshAccess();}
  };
  document.addEventListener('mdc:languagechange',refreshAccess);refreshAccess();
}
