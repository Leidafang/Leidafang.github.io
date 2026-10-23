import * as THREE from 'three';
import {samplePath,phaseTime} from './flow-math.js';
import {PARTICLE_SAMPLES,TRAIL_STEP_S,particleGeometry,particleMaterial,particleColors,particleVertex} from './particle-style.js';
import {prepareVisibility,selectFlowPaths,distanceOpacity,pathOpacity} from './flow-visibility.js';

// Same path sampling, cut windows, endpoint fades and particle style as AI steady.
// Owned by the transient player so a reference never replaces an AI prediction.
export function createSteadyReferenceFlow(parent,meta,data){
  const group=new THREE.Group();group.visible=false;parent.add(group);
  const visibility=meta.paths.map(p=>prepareVisibility(data,p));
  const selected=selectFlowPaths(meta.paths.length,3),out=new Float32Array(4);
  const color=particleColors(meta.ranges.air);
  let mode='',count=1000,clock=0;
  const lines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexColors:true,
    vertexShader:`attribute float alpha;varying vec3 C;varying float A;void main(){C=color;A=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 C;varying float A;void main(){gl_FragColor=vec4(C,A*.11);\n#include <colorspace_fragment>\n}`}));
  const pg=particleGeometry(4000*PARTICLE_SAMPLES);
  const points=new THREE.Points(pg,particleMaterial());
  points.frustumCulled=false;points.renderOrder=3;group.add(lines,points);
  function configure(view,n,showParticles,showLines){
    count=n;points.visible=showParticles;lines.visible=showParticles&&showLines;
    const next=['plenum','section'].includes(view)?view:'all';
    if(next!==mode){
      mode=next;const xyz=[],rgb=[],alpha=[];
      for(const index of selected){const p=meta.paths[index],v=visibility[index];
        for(const [a,b] of v[mode])for(let j=a+1;j<=b;j++)for(const k of [j-1,j]){
          const i=(p.offset+k)*5,c=color(data[i+3]);xyz.push(data[i],data[i+1],data[i+2]);rgb.push(c.r,c.g,c.b);alpha.push(distanceOpacity(v,k,0,mode));
        }
      }
      const g=new THREE.BufferGeometry();for(const [name,a,s] of [['position',xyz,3],['color',rgb,3],['alpha',alpha,1]])g.setAttribute(name,new THREE.Float32BufferAttribute(a,s));
      lines.geometry.dispose();lines.geometry=g;
    }
    update(0);
  }
  function update(dt){
    clock+=dt;const a=pg.attributes;let at=0;
    for(let j=0;j<count;j++){
      const slot=j%selected.length,index=selected[slot],p=meta.paths[index];
      const onPath=Math.floor((count-1-slot)/selected.length)+1;
      const phase=(Math.floor(j/selected.length)/onPath+(index*.61803398875)%1)%1;
      const time=phaseTime(clock,p.duration_s,phase);
      for(let tail=0;tail<PARTICLE_SAMPLES;tail++){
        const t=time-tail*TRAIL_STEP_S,v=samplePath(data,p,Math.max(0,t),out),c=color(v[3]);
        particleVertex(a,at++,v,c,tail,pathOpacity(data,p,visibility[index],t,mode));
      }
    }
    pg.setDrawRange(0,at);Object.values(a).forEach(x=>{x.clearUpdateRanges();x.addUpdateRange(0,at*x.itemSize);x.needsUpdate=true;});
  }
  return {group,configure,update,get clock(){return clock;},diagnostics:()=>({caseId:meta.case_id,sourceKind:meta.source_kind,paths:selected.length,particleStyle:'soft-temperature-v1',trailSeconds:(PARTICLE_SAMPLES-1)*TRAIL_STEP_S,mode,clock,particles:count,visible:group.visible,pointsVisible:points.visible,linesVisible:lines.visible,traceVertices:lines.geometry.attributes.position?.count??0,particleProbe:Array.from(pg.attributes.position.array.slice(0,9))})};
}
