// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import {t} from './i18n.js';

export const DIALS=[
  ...'ABC'.split('').map(group=>({label:'组功率',group,min:6,max:14,step:.1,precision:1,unit:'kW',value:10,warmer:1})),
  ...'ABC'.split('').map(group=>({label:'柜风机',group,min:.76,max:1.24,step:.01,precision:2,unit:'×',value:1,warmer:-1})),
  {label:'回风倍率',min:.76,max:1.24,step:.01,precision:2,unit:'×',value:1,warmer:-1},
  {label:'水流量',min:.864,max:2.016,step:.001,precision:3,unit:'kg/s',value:1.44,warmer:-1},
];
export function warmth(value,spec){const v=(value-spec.min)/(spec.max-spec.min);return spec.warmer===1?v:1-v;}
function thermalColor(v){
  const blue=[26,133,201],neutral=[174,189,203],red=[224,77,68];
  const a=v<.5?blue:neutral,b=v<.5?neutral:red,f=v<.5?v*2:(v-.5)*2;
  return `rgb(${a.map((x,i)=>Math.round(x+(b[i]-x)*f)).join(',')})`;
}
export function dialAngle(value,spec){return -135+270*(value-spec.min)/(spec.max-spec.min);}
export function angleValue(angle,spec){
  const raw=spec.min+(Math.max(-135,Math.min(135,angle))+135)/270*(spec.max-spec.min);
  return Number(Math.min(spec.max,Math.max(spec.min,spec.min+Math.round((raw-spec.min)/spec.step)*spec.step)).toFixed(spec.precision));
}
export function angleDelta(next,previous){return ((next-previous+540)%360)-180;}
const point=(a,r=30)=>[40+r*Math.sin(a*Math.PI/180),40-r*Math.cos(a*Math.PI/180)];
function arc(a,b,r=30){const p=point(a,r),q=point(b,r);return `M ${p} A ${r} ${r} 0 ${b-a>180?1:0} 1 ${q}`;}

export function bindDials(root){
  const records=DIALS.map((spec,i)=>{
    const card=document.createElement('div');card.className='ai-dial-card';
    card.innerHTML=`<label id="ai-label${i}" for="ai-u${i}"></label>
      <div id="ai-dial${i}" class="ai-dial" role="slider" tabindex="0" aria-labelledby="ai-label${i}" aria-describedby="ai-range-note" aria-valuemin="${spec.min}" aria-valuemax="${spec.max}">
        <svg viewBox="0 0 80 78" aria-hidden="true">
          <defs>
            <radialGradient id="dial-face-${i}" cx="35%" cy="25%" r="80%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eaf1f6"/></radialGradient>
            <linearGradient id="dial-rim-${i}" x2="0" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#c9d8e3"/></linearGradient>
            <pattern id="dial-hatch-${i}" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="4" height="4" fill="#ffdf96"/><path d="M0 0V4" stroke="#8a5200" stroke-width="1.5"/></pattern>
          </defs>
          <circle class="dial-bezel" cx="40" cy="40" r="36" fill="url(#dial-rim-${i})"/>
          <circle class="dial-face" cx="40" cy="40" r="33" fill="url(#dial-face-${i})"/>
          <path class="dial-training" d="${arc(-101.25,101.25,37)}"/>
          <path class="dial-extrapolation" stroke="url(#dial-hatch-${i})" d="${arc(-135,-101.25,37)} ${arc(101.25,135,37)}"/>
          ${Array.from({length:54},(_,j)=>{const a=-135+j*5;return `<path class="dial-thermal" stroke="${thermalColor(spec.warmer===1?(j+.5)/54:1-(j+.5)/54)}" d="${arc(a,a+5.3)}"/>`;}).join('')}
          ${Array.from({length:19},(_,j)=>`<path class="dial-tick ${j%3===0?'major':''}" d="M${point(-135+j*15,j%3===0?22.5:24)} L${point(-135+j*15,26)}"/>`).join('')}
          ${[-101.25,101.25].map(a=>`<path class="dial-boundary" d="M${point(a,26)} L${point(a,39)}"/>`).join('')}
          <g class="dial-needle"><path class="dial-pointer" d="M40 11 L43.1 41 L40 46 L36.9 41 Z"/><path class="dial-pointer-facet" d="M40 11 L43.1 41 L40 46 Z"/></g>
          <circle class="dial-hub" cx="40" cy="40" r="4.6"/><circle class="dial-hub-center" cx="40" cy="40" r="1.5"/>
        </svg><div class="dial-limits"><span>${spec.min}</span><span>${spec.max}</span></div>
      </div><div class="dial-domain-badge"><span class="dial-domain-icon" aria-hidden="true"></span><span class="dial-domain"></span></div><div class="dial-number"><input id="ai-u${i}" type="number" required min="${spec.min}" max="${spec.max}" step="${spec.step}" value="${spec.value.toFixed(spec.precision)}" aria-labelledby="ai-label${i}"><small>${spec.unit}</small></div>`;
    root.appendChild(card);
    const input=card.querySelector('input'),dial=card.querySelector('.ai-dial'),needle=card.querySelector('.dial-needle');
    let dragging=false,lastAngle=0,accumulated=0;
    const update=()=>{
      const value=input.valueAsNumber,valid=input.validity.valid&&Number.isFinite(value);
      card.classList.toggle('invalid',!valid);dial.setAttribute('aria-invalid',String(!valid));
      dial.setAttribute('aria-disabled',String(input.disabled));dial.tabIndex=input.disabled?-1:0;
      dial.setAttribute('aria-label',`${t(spec.label)} ${spec.group??''} ${spec.unit}`);
      card.querySelector('label').textContent=`${spec.group?spec.group+' · ':''}${t(spec.label)}`;
      if(valid){
        const angle=dialAngle(value,spec);needle.setAttribute('transform',`rotate(${angle} 40 40)`);
        dial.dataset.angle=String(angle);dial.setAttribute('aria-valuenow',String(value));
        const outer=angle < -101.25-1e-8 || angle > 101.25+1e-8;
        card.classList.toggle('outer',outer);
        card.dataset.domain=outer?'outer_shell':'inner_box';
        const lo=(spec.min+(spec.max-spec.min)/8).toFixed(spec.precision),hi=(spec.max-(spec.max-spec.min)/8).toFixed(spec.precision);
        card.querySelector('.dial-domain-badge').title=t('内推范围：{lo}–{hi} {unit}',{lo,hi,unit:spec.unit});
        card.querySelector('.dial-domain').textContent=t(outer?'外推':'内推');
        needle.style.color=thermalColor(warmth(value,spec));
        dial.setAttribute('aria-valuetext',`${value.toFixed(spec.precision)} ${spec.unit} · ${t(outer?'外推':'内推')}`);
      }else{
        card.classList.remove('outer');card.dataset.domain='invalid';
        card.querySelector('.dial-domain-badge').removeAttribute('title');
        card.querySelector('.dial-domain').textContent='—';
      }
    };
    const set=value=>{input.value=value.toFixed(spec.precision);input.dispatchEvent(new Event('input',{bubbles:true}));};
    const pointerAngle=e=>{const r=dial.querySelector('svg').getBoundingClientRect();return Math.atan2(e.clientX-(r.left+r.width/2),-(e.clientY-(r.top+r.width/80*40)))*180/Math.PI;};
    dial.addEventListener('pointerdown',e=>{
      if(input.disabled||e.button!==0)return;
      e.preventDefault();dial.focus();dial.setPointerCapture(e.pointerId);dragging=true;
      lastAngle=pointerAngle(e);accumulated=Math.max(-135,Math.min(135,lastAngle));set(angleValue(accumulated,spec));
    });
    dial.addEventListener('pointermove',e=>{
      if(!dragging||input.disabled)return;
      const angle=pointerAngle(e);accumulated=Math.max(-135,Math.min(135,accumulated+angleDelta(angle,lastAngle)));lastAngle=angle;set(angleValue(accumulated,spec));
    });
    for(const event of ['pointerup','pointercancel','lostpointercapture'])dial.addEventListener(event,()=>{dragging=false;});
    dial.addEventListener('keydown',e=>{
      if(input.disabled)return;
      const value=Number.isFinite(input.valueAsNumber)?input.valueAsNumber:spec.value;
      const delta={ArrowUp:1,ArrowRight:1,ArrowDown:-1,ArrowLeft:-1,PageUp:10,PageDown:-10}[e.key];
      if(delta===undefined&&!['Home','End'].includes(e.key))return;
      e.preventDefault();set(e.key==='Home'?spec.min:e.key==='End'?spec.max:Math.max(spec.min,Math.min(spec.max,value+delta*spec.step)));
    });
    input.addEventListener('input',update);update();return update;
  });
  return ()=>records.forEach(update=>update());
}
