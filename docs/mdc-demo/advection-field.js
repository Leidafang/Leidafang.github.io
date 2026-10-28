// Copyright (c) 2026 广联达科技股份有限公司. Proprietary portions: see LICENSE.txt; third-party licenses remain applicable.
// Pure numerical kernel. World coordinates in metres, U in m/s, time in seconds.
// No lifetime, low-speed cut-off, random kick, normalization or automatic respawn.
const requireValue=(ok,msg)=>{if(!ok)throw new Error(msg);};
const indexOf=(a,x)=>{if(x<a[0]||x>=a.at(-1))return -1;let lo=0,hi=a.length-1;while(hi-lo>1){const mid=(lo+hi)>>1;if(x<a[mid])hi=mid;else lo=mid;}return lo;};
export class AdvectionField{
  constructor(meta,values,mask){
    requireValue(meta?.schema==='mdc-advection-volume-v1'&&meta.order==='xyz-z-fastest'&&meta.stride===4,'Invalid volume schema');
    const axes=meta.axes;requireValue(axes?.length===3&&axes.every(a=>a.length>=2&&a.every((v,i)=>Number.isFinite(v)&&(!i||v>a[i-1]))),'Invalid volume axes');
    this.meta=meta;this.axes=axes;this.dims=axes.map(a=>a.length-1);this.values=values;this.mask=mask;
    requireValue(values.length===axes.reduce((n,a)=>n*a.length,4)&&values.every(Number.isFinite),'Invalid volume values');
    requireValue(mask.length===this.dims.reduce((a,b)=>a*b)&&mask.every(v=>v===0||v===1)&&mask.reduce((a,b)=>a+b,0)===meta.air_cells,'Invalid occupancy');
    const [nx,ny,nz]=this.dims;this.cells=[];this.cdf=[];let volume=0;
    for(let i=0;i<nx;i++)for(let j=0;j<ny;j++)for(let k=0;k<nz;k++)if(this.air(i,j,k)){
      this.cells.push([i,j,k]);volume+=(axes[0][i+1]-axes[0][i])*(axes[1][j+1]-axes[1][j])*(axes[2][k+1]-axes[2][k]);this.cdf.push(volume);
    }
    requireValue(volume>0,'Empty air volume');this.volume=volume;
    let maxSpeed=0;for(let i=0;i<values.length;i+=4)maxSpeed=Math.max(maxSpeed,Math.hypot(values[i],values[i+1],values[i+2]));
    const minWidth=Math.min(...axes.flatMap(a=>a.slice(1).map((v,i)=>v-a[i])));
    // Global displacement bound + RK2; ray traversal also checks every crossed cell.
    this.step=Math.min(1/120,maxSpeed>0?.4*minWidth/maxSpeed:1/120);
    requireValue(Number.isFinite(this.step)&&this.step>0,'Invalid integration step');
    this.ny=axes[1].length;this.nz=axes[2].length;
  }
  air(i,j,k){const [nx,ny,nz]=this.dims;return i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz&&this.mask[(i*ny+j)*nz+k]===1;}
  locate(p){return this.axes.map((a,d)=>indexOf(a,p[d]));}
  contains(p){return this.air(...this.locate(p));}
  sample(p,out){
    const axes=this.axes,i=indexOf(axes[0],p[0]),j=indexOf(axes[1],p[1]),k=indexOf(axes[2],p[2]);
    if(!this.air(i,j,k))return false;
    const wx=(p[0]-axes[0][i])/(axes[0][i+1]-axes[0][i]),wy=(p[1]-axes[1][j])/(axes[1][j+1]-axes[1][j]),wz=(p[2]-axes[2][k])/(axes[2][k+1]-axes[2][k]);
    out.fill(0);
    for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++){
      const weight=(x?wx:1-wx)*(y?wy:1-wy)*(z?wz:1-wz);
      const index=(((i+x)*this.ny+j+y)*this.nz+k+z)*4;
      for(let d=0;d<4;d++)out[d]+=weight*this.values[index+d];
    }return true;
  }
  // Exact grid-face traversal. hitAxes is a bit mask of the contact normals.
  // Fast path stays inside one convex air cell; no arrays allocated in this loop.
  segmentFraction(a,b){
    this.hitAxes=0;
    const axes=this.axes;let i=indexOf(axes[0],a[0]),j=indexOf(axes[1],a[1]),k=indexOf(axes[2],a[2]);
    if(!this.air(i,j,k))return 0;
    if(b[0]>=axes[0][i]&&b[0]<axes[0][i+1]&&b[1]>=axes[1][j]&&b[1]<axes[1][j+1]&&b[2]>=axes[2][k]&&b[2]<axes[2][k+1])return 1;
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],sx=Math.sign(dx),sy=Math.sign(dy),sz=Math.sign(dz);
    for(let n=0;n<this.dims[0]+this.dims[1]+this.dims[2]+3;n++){
      const tx=sx?(axes[0][i+(sx>0?1:0)]-a[0])/dx:Infinity;
      const ty=sy?(axes[1][j+(sy>0?1:0)]-a[1])/dy:Infinity;
      const tz=sz?(axes[2][k+(sz>0?1:0)]-a[2])/dz:Infinity;
      const next=Math.min(tx,ty,tz);if(next>1)return 1;
      const crossed=(Math.abs(tx-next)<1e-10?1:0)|(Math.abs(ty-next)<1e-10?2:0)|(Math.abs(tz-next)<1e-10?4:0);
      // At a corner, check all adjacent crossed cells, including diagonal solids.
      for(let bits=crossed;bits;bits=(bits-1)&crossed){
        if(!this.air(i+(bits&1?sx:0),j+(bits&2?sy:0),k+(bits&4?sz:0))){
          this.hitAxes=crossed;return Math.max(0,next-1e-7);
        }
      }
      i+=crossed&1?sx:0;j+=crossed&2?sy:0;k+=crossed&4?sz:0;
      if(next>=1)return 1;
    }
    throw new Error('Grid traversal did not converge');
  }
}
export async function loadAdvection(data,signal){
  const meta=data.manifest.advection;
  requireValue(meta?.air_cells===data.manifest.geometry.cells.air,'Volume geometry mismatch');
  requireValue(meta?.data_file==='advection.f32'&&meta.mask_file==='air-mask.u8'&&/^\.\/api\/ai\/results\/[a-f0-9]{64}\/$/.test(data.assetBase),'Prediction volume unavailable');
  const buffers=await Promise.all([meta.data_file,meta.mask_file].map(async name=>{const response=await fetch(data.assetBase+name,{signal});if(!response.ok)throw new Error('Volume unavailable');return response.arrayBuffer();}));
  const hashes=await Promise.all(buffers.map(async buffer=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),v=>v.toString(16).padStart(2,'0')).join('')));
  requireValue(hashes[0]===meta.sha256&&hashes[1]===meta.mask_sha256,'Volume integrity mismatch');
  return new AdvectionField(meta,new Float32Array(buffers[0]),new Uint8Array(buffers[1]));
}
export class ParticleExperiment{
  constructor(field,count=2000,seed=1700,{mode='tracer',relaxation=.6}={}){
    requireValue(Number.isInteger(count)&&count>0&&count<=10000,'Invalid particle count');
    requireValue(['tracer','elastic'].includes(mode)&&relaxation>0,'Invalid particle mode');
    this.field=field;this.count=count;this.mode=mode;this.relaxation=relaxation;this.time=0;
    this.positions=new Float64Array(count*3);this.velocities=new Float64Array(count*3);this.temperatures=new Float32Array(count);
    this.boundaryContacts=0;this.totalContacts=0;this.zeroSpeed=0;
    const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return (seed+.5)/4294967296;};
    const sample=new Float64Array(4);
    for(let n=0;n<count;n++){
      const target=random()*field.volume;let lo=0,hi=field.cdf.length-1;while(lo<hi){const m=(lo+hi)>>1;if(field.cdf[m]<target)lo=m+1;else hi=m;}
      const cell=field.cells[lo],p=cell.map((i,d)=>field.axes[d][i]+(field.axes[d][i+1]-field.axes[d][i])*(1e-5+(1-2e-5)*random()));
      this.positions.set(p,n*3);field.sample(p,sample);this.temperatures[n]=sample[3];
      for(let d=0;d<3;d++)this.velocities[n*3+d]=sample[d];
    }
    this.a=new Float64Array(4);this.b=new Float64Array(4);
    this.p=new Float64Array(3);this.mid=new Float64Array(3);this.next=new Float64Array(3);this.move=new Float64Array(3);
  }
  advance(dt){
    requireValue(Number.isFinite(dt)&&dt>=0,'Invalid timestep');
    const field=this.field,a=this.a,b=this.b,p=this.p,mid=this.mid,next=this.next,move=this.move;
    // Fixed bounded steps, never a large catch-up jump. Report actual integrated time.
    let remaining=Math.min(dt,field.step*32);this.zeroSpeed=0;this.boundaryContacts=0;
    while(remaining>1e-12){
      const h=Math.min(field.step,remaining),gain=-Math.expm1(-h/this.relaxation),halfGain=-Math.expm1(-.5*h/this.relaxation);let zeros=0,contacts=0;
      for(let n=0;n<this.count;n++){
        const offset=n*3;for(let d=0;d<3;d++)p[d]=this.positions[offset+d];
        if(!field.sample(p,a))throw new Error('Particle left air domain');
        if(this.mode==='elastic'){
          // Illustrative inertial particles: dv/dt=(U-v)/tau, tau=0.6 s by default.
          // Restitution=1 at impact; the flow subsequently changes speed/direction.
          // No random impulse at zero U and no overwrite of reflected velocity by U.
          for(let d=0;d<3;d++){
            const v=this.velocities[offset+d];move[d]=v+(a[d]-v)*halfGain;
            this.velocities[offset+d]=v+(a[d]-v)*gain;
          }
          if(move[0]===0&&move[1]===0&&move[2]===0){zeros++;this.temperatures[n]=a[3];continue;}
          let left=h;
          for(let bounce=0;bounce<8&&left>1e-12;bounce++){
            for(let d=0;d<3;d++)next[d]=p[d]+left*move[d];
            const f=field.segmentFraction(p,next),normal=field.hitAxes;
            for(let d=0;d<3;d++)p[d]+=f*(next[d]-p[d]);
            if(f===1)break;
            contacts++;left*=1-f;
            for(let d=0;d<3;d++)if(normal&(1<<d)){move[d]=-move[d];this.velocities[offset+d]=-this.velocities[offset+d];}
            if(!normal)break;
          }
          next.set(p);
        }else{
          if(a[0]===0&&a[1]===0&&a[2]===0){zeros++;this.temperatures[n]=a[3];continue;}
          for(let d=0;d<3;d++)mid[d]=p[d]+.5*h*a[d];
          const mf=field.segmentFraction(p,mid);
          if(mf<1){for(let d=0;d<3;d++)next[d]=p[d]+mf*(mid[d]-p[d]);contacts++;}
          else{
            field.sample(mid,b);for(let d=0;d<3;d++)next[d]=p[d]+h*b[d];
            const f=field.segmentFraction(p,next);
            if(f<1){for(let d=0;d<3;d++)next[d]=p[d]+f*(next[d]-p[d]);contacts++;}
          }
        }
        if(field.sample(next,b)){for(let d=0;d<3;d++)this.positions[offset+d]=next[d];this.temperatures[n]=b[3];}
        else{contacts++;this.temperatures[n]=a[3];} // retain the last valid position
      }
      remaining-=h;this.time+=h;this.zeroSpeed=zeros;this.boundaryContacts+=contacts;this.totalContacts+=contacts;
    }
  }
}
