import {wingLayout,gablePlanes,gableRun,MAX_ROOF_GRADIENT} from './roof-design.mjs?v=roof-boundaries-20261106';
export const ROOF_ENVELOPE_VERSION='architectural-roof-envelope-v1';
const EPS=1e-9,KEY_EPS=1e-7;
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
const value=(p,x,y)=>p[0]*x+p[1]*y+p[2];
const rectangle=r=>[[r[0],r[2]],[r[1],r[2]],[r[1],r[3]],[r[0],r[3]]];
const distances=r=>[[1,0,-r[0]],[-1,0,r[1]],[0,1,-r[2]],[0,-1,r[3]]];
const key=p=>p.map(v=>Math.round(v/KEY_EPS)).join(',');
const edgeKey=(a,b)=>[key(a),key(b)].sort().join('|');

function clip(poly,line,sign){
  const result=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],fa=sign*value(line,...a),fb=sign*value(line,...b);
    if(fa>=0)result.push(a);
    if((fa<0&&fb>0)||(fa>0&&fb<0)){const t=fa/(fa-fb);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
  }
  return result.filter((p,i)=>!i||Math.hypot(p[0]-result[i-1][0],p[1]-result[i-1][1])>EPS);
}

function bounds(poly){return [Math.min(...poly.map(p=>p[0])),Math.max(...poly.map(p=>p[0])),Math.min(...poly.map(p=>p[1])),Math.max(...poly.map(p=>p[1]))];}
function constructPart(source,part,config){
  const gable=part.roof==='gabled',concave=['l','u','court'].includes(config.family),outer=part.outer.map(([x,y])=>[x,-y]),holes=part.holes.map(r=>r.map(([x,y])=>[x,-y]));
  let layout;
  if(concave)layout=wingLayout(config);
  else {const box=bounds(outer);layout={wings:[box],axes:[box[1]-box[0]>=box[3]-box[2]?'x':'y'],ends:['none'],tiles:[outer]};}
  const {wings,axes,ends,tiles}=layout,groups=wings.map((r,i)=>gable?gablePlanes(r,axes[i],ends[i]):distances(r));
  if(!gable&&!concave){
    // Convex chamfered plans use distances to every actual outline edge.
    const winding=Math.sign(area(outer));groups[0]=outer.map((a,i)=>{const b=outer[(i+1)%outer.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),nx=-dy/length*winding,ny=dx/length*winding;return [nx,ny,-nx*a[0]-ny*a[1]];});
  }
  const run=Math.max(...wings.map((r,i)=>gable?gableRun(r,axes[i],ends[i]):Math.min(r[1]-r[0],r[3]-r[2])/2)),eave=Math.fround(part.height-part.roofRise),peak=Math.fround(part.height),pitch=(peak-eave)/run;
  const planes=[];for(const group of groups)for(const p of group)if(!planes.some(q=>q.every((v,i)=>Math.abs(v-p[i])<1e-8)))planes.push(p);
  const extraLines=gable&&concave?wings.flatMap(r=>distances(r)):[];
  const roofHeight=(x,y)=>{
    const candidates=groups.map((g,i)=>{const r=wings[i];return gable&&(x<r[0]-2e-7||x>r[1]+2e-7||y<r[2]-2e-7||y>r[3]+2e-7)?-Infinity:Math.min(...g.map(p=>value(p,x,y)));});
    return Math.fround(eave+pitch*Math.max(0,Math.min(run,Math.max(...candidates))));
  };
  const lines=[],lineKeys=new Set();
  for(let i=0;i<planes.length;i++)for(let j=i+1;j<planes.length;j++){
    let line=planes[i].map((v,k)=>v-planes[j][k]);const length=Math.hypot(line[0],line[1]);if(length<1e-12)continue;
    line=line.map(v=>v/length);if(line[0]<-EPS||(Math.abs(line[0])<EPS&&line[1]<0))line=line.map(v=>-v);
    const id=key(line);if(!lineKeys.has(id)){lineKeys.add(id);lines.push(line);}
  }
  for(const line of extraLines){const length=Math.hypot(line[0],line[1]);lines.push(line.map(v=>v/length));}
  let cells=tiles.map(p=>p.map(v=>[...v]));
  for(const line of lines){
    const next=[];
    for(const poly of cells){
      const values=poly.map(p=>value(line,...p));
      if(Math.min(...values)<-EPS&&Math.max(...values)>EPS){
        for(const sign of [-1,1]){const p=clip(poly,line,sign);if(p.length>=3&&Math.abs(area(p))>1e-12)next.push(p);}
      }else next.push(poly);
    }
    cells=next;
  }
  const canonical=new Map();
  const vertex=p=>{
    const id=key(p);if(!canonical.has(id))canonical.set(id,[Math.fround(p[0]),Math.fround(p[1])]);return canonical.get(id);
  };
  cells=cells.map(poly=>poly.map(vertex)).map(poly=>poly.filter((p,i)=>!i||key(p)!==key(poly[i-1]))).filter(poly=>poly.length>=3&&Math.abs(area(poly))>1e-12);
  const nodes=[...canonical.values()],roofPositions=[],roofNormals=[];
  const putTriangle=(a,b,c)=>{
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    if(length<1e-14)return;if(n[2]<0){[b,c]=[c,b];for(let i=0;i<3;i++)n[i]=-n[i];}
    roofPositions.push(...a,...b,...c);for(let i=0;i<3;i++)roofNormals.push(...n.map(v=>v/length));
  };
  for(const poly of cells){
    // Insert shared partition vertices on both sides of an edge. Centroid
    // fans retain those boundary subdivisions, so the roof has no T-junctions.
    const boundary=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<EPS)continue;
      const candidates=[];
      for(const p of nodes){const t=((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(length*length),distance=Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length;if(t>=-EPS&&t<1-EPS&&distance<1e-7)candidates.push({t,p});}
      candidates.sort((a,b)=>a.t-b.t);for(const {p} of candidates)if(!boundary.length||key(p)!==key(boundary.at(-1)))boundary.push(p);
    }
    if(boundary.length<3)continue;
    const centre=[poly.reduce((s,p)=>s+p[0],0)/poly.length,poly.reduce((s,p)=>s+p[1],0)/poly.length],c=[Math.fround(centre[0]),Math.fround(centre[1]),roofHeight(...centre)];
    for(let i=0;i<boundary.length;i++){const a=boundary[i],b=boundary[(i+1)%boundary.length];putTriangle(c,[...a,roofHeight(...a)],[...b,roofHeight(...b)]);}
  }

  const roof={positions:new Float32Array(roofPositions),normals:new Float32Array(roofNormals),color:source.find(m=>m.role==='roof').color,role:'roof'},edges=new Map();
  for(let i=0;i<roof.positions.length;i+=9){const p=[0,3,6].map(k=>Array.from(roof.positions.slice(i+k,i+k+3)));for(let j=0;j<3;j++){const a=p[j],b=p[(j+1)%3],id=edgeKey(a,b);if(edges.has(id))edges.get(id).count++;else edges.set(id,{a,b,count:1});}}
  const rings=[outer,...holes],boundary=[...edges.values()].filter(e=>e.count===1),wallPositions=[],wallNormals=[];
  const distanceToOutline=p=>Math.min(...rings.flatMap(r=>r.map((a,i)=>{const b=r[(i+1)%r.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);})));
  for(const {a,b}of boundary){
    if(distanceToOutline(a)>2e-6||distanceToOutline(b)>2e-6)throw Error('Roof has an unmatched internal partition edge');
    if(!gable&&(Math.abs(a[2]-eave)>2e-6||Math.abs(b[2]-eave)>2e-6))throw Error('Hip roof perimeter must share one eave height');
    const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy),n=[dy/length,-dx/length,0],ab=[a[0],a[1],part.base],bb=[b[0],b[1],part.base];
    wallPositions.push(...ab,...bb,...b,...ab,...b,...a);for(let j=0;j<6;j++)wallNormals.push(...n);
  }
  let maxGradient=0;for(let i=0;i<roof.normals.length;i+=3)maxGradient=Math.max(maxGradient,Math.hypot(roof.normals[i],roof.normals[i+1])/roof.normals[i+2]);
  if(!Number.isFinite(maxGradient)||maxGradient>pitch*1.08+.003||maxGradient>MAX_ROOF_GRADIENT*1.08+.003)throw Error('Roof contains an unintended steep facet');
  const wall={positions:new Float32Array(wallPositions),normals:new Float32Array(wallNormals),color:source.find(m=>m.role==='wall').color,role:'wall'};
  return {meshes:[wall,roof],report:{id:part.id,roof:part.roof,common_eave_height:eave,peak_height:peak,roof_rise:part.roofRise,equal_pitch:pitch,max_actual_gradient:maxGradient,ridge_layout:gable?(concave?'wing-aligned':'long-axis'):'equal-pitch-hip',wing_rectangles:wings,ridge_axes:gable?axes:null,ridge_end_conditions:gable?ends:null,partition_cells:cells.length,roof_triangles:roof.positions.length/9,wall_triangles:wall.positions.length/9}};
}
export function applyRoofEnvelope(meshes,shape){
  const parts=shape.parts.filter(p=>['gabled','hipped'].includes(p.roof)),results=parts.map(p=>constructPart(meshes,p,shape.config)),retained=[];
  // Native flat-source part walls terminate at their own total height. Keep
  // podium faces and any existing ground faces; reconstruct only pitched parts.
  for(const m of meshes){const positions=[],normals=[];for(let i=0;i<m.positions.length;i+=9){const top=Math.max(m.positions[i+2],m.positions[i+5],m.positions[i+8]);if(parts.some(p=>Math.abs(top-p.height)<2e-5))continue;positions.push(...m.positions.slice(i,i+9));normals.push(...m.normals.slice(i,i+9));}if(positions.length)retained.push({...m,positions:new Float32Array(positions),normals:new Float32Array(normals)});}
  return {meshes:[...retained,...results.flatMap(r=>r.meshes)],report:{method:ROOF_ENVELOPE_VERSION,roof_direction_control:'skillion-only',maximum_pitch_degrees:60,parts:results.map(r=>r.report),ground_closure_validated:false}};
}
