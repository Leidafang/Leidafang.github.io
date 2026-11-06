// Architectural roof rules shared by parameter bounds and mesh construction.
export const MAX_ROOF_PITCH_DEG=60;
export const MAX_ROOF_GRADIENT=Math.tan(MAX_ROOF_PITCH_DEG*Math.PI/180);
const rect=r=>[[r[0],r[2]],[r[1],r[2]],[r[1],r[3]],[r[0],r[3]]];
export function wingLayout(p){
  const w=p.width,d=p.depth,x=-w/2,y=-d/2,a=w*p.leftWidth,c=d*p.crossDepth;
  if(p.family==='court'){
    const cw=w*p.courtWidth,cd=d*p.courtDepth,cx=(w-cw)/2*p.courtX,cy=-(d-cd)/2*p.courtY,l=cx-cw/2,r=cx+cw/2,b=cy-cd/2,t=cy+cd/2;
    return {wings:[[x,x+w,y,b],[x,x+w,t,y+d],[x,l,y,y+d],[r,x+w,y,y+d]],axes:['x','x','y','y'],ends:['both','both','both','both'],tiles:[[x,x+w,y,b],[x,x+w,t,y+d],[x,l,b,t],[r,x+w,b,t]].map(rect)};
  }
  const main=[x,x+w,y+d-c,y+d],left=[x,x+a,y,y+d],wings=[main,left],tiles=[main,[x,x+a,y,y+d-c]],axes=['x','y'],ends=[p.family==='u'?'both':'start','end'];
  if(p.family==='u'){
    const b=w*p.rightWidth,r=d*p.rightReach;wings.push([x+w-b,x+w,y+d-r,y+d]);tiles.push([x+w-b,x+w,y+d-r,y+d-c]);axes.push('y');ends.push('end');
  }
  return {wings,axes,ends,tiles:tiles.map(rect)};
}
export function gablePlanes(r,axis,end='none'){
  const planes=axis==='x'?[[0,1,-r[2]],[0,-1,r[3]]]:[[1,0,-r[0]],[-1,0,r[1]]];
  if(end==='start'||end==='both')planes.push(axis==='x'?[1,0,-r[0]]:[0,1,-r[2]]);
  if(end==='end'||end==='both')planes.push(axis==='x'?[-1,0,r[1]]:[0,-1,r[3]]);
  return planes;
}
export function gableRun(r,axis,end='none'){
  const across=axis==='x'?r[3]-r[2]:r[1]-r[0],along=axis==='x'?r[1]-r[0]:r[3]-r[2];
  return end==='none'?across/2:Math.min(across/2,along/(end==='both'?2:1));
}
export function roofRiseLimit(p){
  if(p.roof==='flat')return .26;
  let spans;
  if(['l','u','court'].includes(p.family)&&p.roof!=='skillion'){
    const {wings,axes,ends}=wingLayout(p);
    const run=Math.max(...wings.map((r,i)=>p.roof==='hipped'?Math.min(r[1]-r[0],r[3]-r[2])/2:gableRun(r,axes[i],ends[i])));
    spans=[{run,height:1}];
  }else{
    const w=p.width,d=p.depth,dimensions=p.family==='podium'?[[w*p.towerWidth,d*p.towerDepth,1]]:p.family==='twin'?[[w*p.twinWidth,d*p.towerDepth,1],[w*p.twinWidth,d*p.towerDepth,p.secondHeight]]:[[w,d,1]];
    spans=dimensions.map(([width,depth,height])=>({height,run:p.roof==='skillion'?Math.abs(width*Math.sin(p.roofDirection*Math.PI/180))+Math.abs(depth*Math.cos(p.roofDirection*Math.PI/180)):Math.min(width,depth)/2}));
  }
  return Math.max(.05,Math.floor((Math.min(.26,...spans.map(s=>Math.min(s.height*.35,s.run*MAX_ROOF_GRADIENT)))+1e-9)*100)/100);
}
