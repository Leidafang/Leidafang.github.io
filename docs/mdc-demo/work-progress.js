// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt.
import {getLanguage} from './i18n.js';

export function createWorkProgress(element){
  let stage,started=0,percent=0,remaining=null,lastFraction=0;
  const label=element.querySelector('.work-progress-label');
  const detail=element.querySelector('.work-progress-detail');
  return {
    update(nextStage,at,[zh,en],fraction=null){
      const now=performance.now();
      if(stage!==nextStage){stage=nextStage;started=now;remaining=null;lastFraction=0;}
      const elapsed=(now-started)/1000;
      if(fraction>lastFraction){
        lastFraction=fraction;
        if(fraction>=.1&&fraction<1&&elapsed>=1)remaining=elapsed*(1-fraction)/fraction;
      }
      if(fraction===1)remaining=null;
      percent=Math.max(percent,Math.min(99,Math.floor(at)));
      const chinese=getLanguage()==='zh';
      const count=(chinese?'约 ':'~')+percent+'%';
      const seconds=remaining===null?null:Math.max(5,Math.ceil(remaining/5)*5);
      const eta=seconds===null?'':chinese?`本阶段约剩 ${seconds} 秒`:`~${seconds} s left in this step`;
      label.textContent=chinese?zh:en;
      detail.textContent=eta?`${count} · ${eta}`:count;
      element.style.setProperty('--work-progress',percent+'%');
      element.setAttribute('aria-valuenow',String(percent));
      element.setAttribute('aria-valuetext',`${label.textContent} · ${detail.textContent}`);
    }
  };
}
