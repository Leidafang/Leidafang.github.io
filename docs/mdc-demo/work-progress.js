// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt.
import {getLanguage} from './i18n.js';

export function createWorkProgress(element){
  let percent=0;
  const label=element.querySelector('.work-progress-label');
  return {
    update(at,[zh,en]){
      percent=Math.max(percent,Math.min(99,Math.floor(at)));
      label.textContent=getLanguage()==='zh'?zh:en;
      element.style.setProperty('--work-progress',percent+'%');
      element.setAttribute('aria-valuenow',String(percent));
      element.setAttribute('aria-valuetext',label.textContent);
    }
  };
}
