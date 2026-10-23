import * as THREE from 'three';

// Trace the supplied mark into solid letter contours. No white texture matte,
// transparent signboard or raster filtering is involved in the rooftop letters.
// Coordinates remain in logo pixels; the caller sets the architectural scale.
export function logoShapes({data,width,height},green){
  const filled=(x,y)=>{
    if(x<0||y<0||x>=width||y>=height)return false;
    const i=(y*width+x)*4,[r,g,b,a]=data.slice(i,i+4);
    return a>=128&&Math.min(r,g,b)<180&&(g>b)===green;
  };
  const edges=new Map();
  function edge(a,b){const key=a.join(',');if(!edges.has(key))edges.set(key,[]);edges.get(key).push(b);}
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(filled(x,y)){
    const z=height-y-1;
    if(!filled(x,y+1))edge([x,z],[x+1,z]);
    if(!filled(x+1,y))edge([x+1,z],[x+1,z+1]);
    if(!filled(x,y-1))edge([x+1,z+1],[x,z+1]);
    if(!filled(x-1,y))edge([x,z+1],[x,z]);
  }
  const rings=[];
  while(edges.size){
    const start=edges.keys().next().value.split(',').map(Number),ring=[];
    let p=start,prev=[start[0]-1,start[1]];
    do{
      ring.push(new THREE.Vector2(...p));const key=p.join(','),next=edges.get(key);
      if(!next?.length)throw new Error('Open logo contour');
      // At diagonal pixel contacts keep the left-hand boundary of each letter.
      next.sort((a,b)=>{
        const turn=q=>Math.atan2((p[0]-prev[0])*(q[1]-p[1])-(p[1]-prev[1])*(q[0]-p[0]),
          (p[0]-prev[0])*(q[0]-p[0])+(p[1]-prev[1])*(q[1]-p[1]));
        return turn(b)-turn(a);
      });
      const q=next.shift();if(!next.length)edges.delete(key);prev=p;p=q;
    }while(p[0]!==start[0]||p[1]!==start[1]);
    const simple=ring.filter((p,i)=>{
      const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];
      return (p.x-a.x)*(b.y-p.y)!==(p.y-a.y)*(b.x-p.x);
    });
    if(simple.length>=3)rings.push(simple);
  }
  // Remove pixel stair-steps without thickening strokes or filling counters.
  // Split closed rings at a distant vertex before the open-polyline simplifier.
  function simplify(points){
    if(points.length<3)return points;
    const a=points[0],b=points.at(-1),d=b.clone().sub(a),length=d.lengthSq();
    let index=0,max=.5*.5;
    for(let i=1;i<points.length-1;i++){
      const t=length?THREE.MathUtils.clamp(points[i].clone().sub(a).dot(d)/length,0,1):0;
      const distance=points[i].distanceToSquared(a.clone().addScaledVector(d,t));
      if(distance>max){max=distance;index=i;}
    }
    return index?[...simplify(points.slice(0,index+1)).slice(0,-1),...simplify(points.slice(index))]:[a,b];
  }
  const smooth=rings.map(r=>{
    let split=1;for(let i=2;i<r.length;i++)if(r[i].distanceToSquared(r[0])>r[split].distanceToSquared(r[0]))split=i;
    const points=[...simplify(r.slice(0,split+1)).slice(0,-1),...simplify([...r.slice(split),r[0]]).slice(0,-1)];
    return points.length>=3?points:r;
  });
  const outers=smooth.filter(r=>THREE.ShapeUtils.area(r)>0),holes=smooth.filter(r=>THREE.ShapeUtils.area(r)<0);
  const inside=(p,ring)=>{
    let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;
    }return yes;
  };
  return outers.map(r=>{
    const shape=new THREE.Shape(r);shape.holes=holes.filter(h=>inside(h[0],r)).map(h=>new THREE.Path(h));return shape;
  });
}
