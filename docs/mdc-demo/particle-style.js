// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
import * as THREE from 'three';
import {temperatureRGB} from './flow-math.js';

// One visual scale for steady and time-dependent advection. This changes only
// drawing: positions, temperatures and physical clocks remain source-owned.
export const PARTICLE_SAMPLES=12;
export const TRAIL_STEP_S=.018;
export const particleRadius=k=>k===0?12:7.2*(1-k/18);
export const particleAlpha=k=>k===0?1:.86*(1-k/PARTICLE_SAMPLES);
export function particleGeometry(count){
  const g=new THREE.BufferGeometry();
  for(const [name,size] of [['position',3],['color',3],['alpha',1],['radius',1]])
    g.setAttribute(name,new THREE.BufferAttribute(new Float32Array(count*size),size).setUsage(THREE.DynamicDrawUsage));
  return g;
}
export function particleMaterial(){
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,
    uniforms:{pixelRatio:{value:Math.min(globalThis.devicePixelRatio??1,1.75)},cutX:{value:100},cutZ:{value:100}},
    vertexShader:`attribute float alpha,radius;uniform float pixelRatio;varying vec3 C,p;varying float A;void main(){C=color;A=alpha;p=position;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(radius*pixelRatio*4./max(.1,-mv.z),1.,20.);}`,
    fragmentShader:`uniform float cutX,cutZ;varying vec3 C,p;varying float A;void main(){if(p.x>cutX||p.z>cutZ)discard;float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;float a=(1.-smoothstep(.65,1.,r))*A;if(a<.01)discard;gl_FragColor=vec4(C,a);\n#include <colorspace_fragment>\n}`});
}
export function particleColors(range){
  const span=Math.max(1e-6,range[1]-range[0]);
  const lut=Array.from({length:256},(_,i)=>new THREE.Color().setRGB(...temperatureRGB(range[0]+i/255*span,...range),THREE.SRGBColorSpace));
  return t=>lut[Math.max(0,Math.min(255,Math.round((t-range[0])/span*255)))];
}
export function particleVertex(attrs,i,v,color,k,opacity=1){
  const at=i*3;for(let d=0;d<3;d++)attrs.position.array[at+d]=v[d];
  attrs.color.array[at]=color.r;attrs.color.array[at+1]=color.g;attrs.color.array[at+2]=color.b;
  attrs.alpha.array[i]=opacity*particleAlpha(k);attrs.radius.array[i]=particleRadius(k);
}
// A tail may not bridge an invalid playback chord, even if both end samples
// happen to lie in valid intervals. Never discard the particle head at rest.
export function historyVisible(valid,stride,particle,older,newer){
  if(older<0)return false;
  for(let f=Math.floor(older)+1;f<=Math.ceil(newer);f++)if(!valid[f*stride+particle])return false;
  return true;
}
