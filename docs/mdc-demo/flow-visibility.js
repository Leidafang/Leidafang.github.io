import {locate} from './flow-math.js';
// Distance-based fading avoids bright particles dwelling at low-speed wall ends.
// A cut view retains only sufficiently long contiguous visible pieces. Never
// connect pieces across a wall, cut plane, end of a path or animation respawn.
export function prepareVisibility(data,path){
  const distance=new Float32Array(path.count);
  for(let n=1;n<path.count;n++){
    const i=(path.offset+n)*5,j=i-5;
    distance[n]=distance[n-1]+Math.hypot(data[i]-data[j],data[i+1]-data[j+1],data[i+2]-data[j+2]);
  }
  const windows=(predicate,minLength)=>{
    const result=[];let start=-1;
    for(let n=0;n<=path.count;n++){
      const inside=n<path.count&&predicate((path.offset+n)*5);
      if(inside&&start<0)start=n;
      if(!inside&&start>=0){const end=n-1;if(distance[end]-distance[start]>=minLength)result.push([start,end]);start=-1;}
    }
    return result;
  };
  return {distance,all:[[0,path.count-1]],plenum:windows(i=>data[i+2]<-.035,.7),section:windows(i=>data[i]<=2.1,.5)};
}
const smooth=x=>{x=Math.min(1,Math.max(0,x));return x*x*(3-2*x);};
export function distanceOpacity(meta,index,fraction,mode){
  const windows=meta[mode]||meta.all,d=meta.distance;
  for(const [a,b] of windows)if(index>=a&&index+fraction<=b){
    const s=d[index]+(d[Math.min(index+1,d.length-1)]-d[index])*fraction;
    return smooth(Math.min(s-d[a],d[b]-s)/.25);
  }
  return 0;
}
export function pathOpacity(data,path,meta,time,mode){
  if(time<0||time>path.duration_s)return 0;
  const [i,,f]=locate(data,path,time);
  return distanceOpacity(meta,i/5-path.offset,f,mode);
}

// Stable, nested subsets distributed throughout the seeded zones. Both lines
// and particles consume these indices; density never decimates lines alone.
export function selectFlowPaths(count,level){
  const keep=[3,5,8,12,16,24][Math.max(0,Math.min(5,Math.round(level)-1))];
  return Array.from({length:count},(_,n)=>n).filter(n=>(n*7)%24<keep);
}
