import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Bespoke render shell fitted to this CFD envelope, NOT ISO/manufacturer CAD.
// Native geometry allows a faithful cutaway without stretching a closed asset
// across the scientific field. All coordinates remain outside the air domain.
const metal=(color,roughness=.46,metalness=.45)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
function assembly(group){
  const buckets=new Map();
  const put=(geo,material)=>{if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(geo.index?geo.toNonIndexed():geo);};
  return {
    box(p,s,material,r=.006){const g=new RoundedBoxGeometry(...s,2,Math.min(r,...s.map(v=>v/5)));g.translate(...p);put(g,material);},
    rod(a,b,r,material){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=new THREE.CylinderGeometry(r,r,v.length(),10);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize()));g.translate(...a.map((x,i)=>x+v.getComponent(i)/2));put(g,material);},
    sheet(axis,constant,lo,hi,bottom,top,material){
      // Folded sheet rather than disconnected sticks: trapezoidal ribs.
      const count=Math.max(1,Math.round((hi-lo)/.15)),verts=[],uv=[];
      for(let n=0;n<count;n++)for(let k=0;k<4;k++){
        const coords=[0,.28,.43,.83,1],depth=[0,0,.018,.018,0];
        const u=lo+(n+coords[k])*(hi-lo)/count,w=lo+(n+coords[k+1])*(hi-lo)/count;
        const pt=(x,z,d)=>axis==='y'?[x,constant+d,z]:axis==='x'?[constant+d,x,z]:[x,z,constant+d];
        const a=pt(u,bottom,depth[k]),b=pt(w,bottom,depth[k+1]),c=pt(w,top,depth[k+1]),d=pt(u,top,depth[k]);
        verts.push(...a,...b,...c,...a,...c,...d);
        uv.push(u,bottom,w,bottom,w,top,u,bottom,w,top,u,top);
      }
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();put(g,material);
    },
    finish(){for(const [mat,list] of buckets){const g=mergeGeometries(list,false);list.forEach(x=>x.dispose());const mesh=new THREE.Mesh(g,mat);mesh.castShadow=false;mesh.receiveShadow=false;group.add(mesh);}}
  };
}
export function buildContainerExterior(group){
  const fixed=new THREE.Group(),cutaway=new THREE.Group(),closed=new THREE.Group();
  group.add(fixed,cutaway,closed);group.userData.containerExterior=true;
  group.userData.closed=closed;group.userData.cutaway=cutaway;
  const f=assembly(fixed),c=assembly(cutaway),s=assembly(closed);
  const steel=metal(0x345869,.5,.35),edge=metal(0x9aaeb6,.3,.75),panel=metal(0xdde1df,.62,.07),dark=metal(0x273039,.7,.12);
  // Fine powder-coat roughness; no fake rust or invented temperature staining.
  const coatData=new Uint8Array(128*128*4);let seed=53;
  for(let i=0;i<coatData.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=190+(seed>>>26);coatData.set([v,v,v,255],i);}
  const coat=new THREE.DataTexture(coatData,128,128);coat.wrapS=coat.wrapT=THREE.RepeatWrapping;coat.repeat.set(7,7);
  coat.generateMipmaps=true;coat.minFilter=THREE.LinearMipmapLinearFilter;coat.needsUpdate=true;
  for(const m of [steel,panel]){m.roughnessMap=coat;m.bumpMap=coat;m.bumpScale=.00035;}
  panel.side=THREE.DoubleSide;const blue=metal(0x32687b,.5,.45),rubber=metal(0x11191c,.95,0);
  const indicator=new THREE.MeshBasicMaterial({color:0x84d9b9,toneMapped:false});
  // Layered base rails, crossmembers, forklift pockets and mounting pads.
  for(const y of [-.085,2.835]){
    f.box([2.1,y,-.565],[4.52,.15,.19],steel);
    f.box([2.1,y+(y<0?-.08:.08),-.48],[4.31,.02,.035],edge,.002);
  }
  for(const x of [-.095,4.295])f.box([x,1.375,-.565],[.16,2.92,.19],steel);
  for(let x=.35;x<4.2;x+=.5)f.box([x,1.375,-.565],[.065,2.72,.055],dark);
  for(const x of [1.25,2.95]){
    f.box([x,-.169,-.57],[.36,.012,.095],dark,.008);
    for(const dx of [-.193,.193])f.box([x+dx,-.177,-.57],[.025,.02,.125],edge,.002);
  }
  // Corner posts with cap plates / weld returns. Open corner sockets give scale.
  for(const x of [-.095,4.295])for(const y of [-.095,2.845]){
    f.box([x,y,.84],[.14,.14,2.73],steel,.009);
    f.box([x+(x<0?-.074:.074),y,.84],[.018,.17,2.62],edge,.003);
    for(const z of [-.54,2.245]){
      f.box([x,y,z],[.205,.19,.15],edge,.017);
      f.box([x,y+(y<0?-.097:.097),z],[.09,.004,.06],dark,.018);
      f.box([x,y,z+.077],[.105,.07,.004],dark,.018);
    }
    f.box([x,y,-.675],[.28,.26,.065],dark);
  }
  // Top rails are profiled dark beams, not the former oversized white wire cage.
  for(const y of [-.095,2.845]){
    f.box([2.1,y,2.23],[4.32,.125,.125],steel);
    f.box([2.1,y,2.303],[4.35,.15,.035],edge,.004);
  }
  for(const x of [-.095,4.295])f.box([x,1.375,2.23],[.125,2.84,.125],steel);
  // Permanent far-wall and skirting convey enclosure while the front is cut out.
  // Panel edges overlap the post/rail seating faces. A display shell is not
  // numerically constrained to end at the CFD room's inner coordinates.
  f.sheet('y',2.81,-.045,4.245,-.49,2.185,panel);
  for(const y of [-.14,2.86])f.box([2.1,y,-.385],[4.15,.028,.06],blue,.003);
  f.sheet('y',-.16,-.045,4.245,-.49,-.14,panel);
  for(const x of [-.16,4.32])f.sheet('x',x,-.045,2.795,-.49,-.14,panel);
  // Partial end wall / roof lip frame the cut; full replacement is toggled below.
  for(const x of [-.16,4.32]){
    c.sheet('x',x,-.045,.19,-.14,2.185,panel);
    c.sheet('x',x,2.56,2.795,-.14,2.185,panel);
  }
  c.sheet('z',2.24,-.13,4.33,2.52,2.88,panel);
  // Complete exterior: roof, front cladding, left end and right service doors.
  s.sheet('z',2.24,-.13,4.33,-.13,2.88,panel);
  s.sheet('y',-.16,-.045,4.245,-.14,2.185,panel);
  s.sheet('x',-.16,-.045,2.795,-.14,2.185,panel);
  // Right-end door jambs and header bridge the return to the frame. Keep the
  // small central door seal, but no open perimeter band around the doors.
  for(const y of [.005,2.75])s.box([4.35,y,.85],[.07,.12,2.67],steel,.004);
  s.box([4.35,1.375,2.15],[.07,2.82,.1],steel,.004);
  f.box([4.33,1.375,-.455],[.06,2.82,.09],steel,.004);
  for(const [a,b] of [[.045,1.36],[1.395,2.705]]){
    s.box([4.345,(a+b)/2,.99],[.025,b-a,2.32],dark);
    s.sheet('x',4.364,a+.025,b-.025,-.14,2.115,panel);
    for(const y of [a+.12,b-.12]){
      s.rod([4.403,y,-.1],[4.403,y,2.08],.016,edge);
      for(const z of [.02,.68,1.4,1.99])s.box([4.42,y,z],[.07,.07,.065],steel);
      s.rod([4.427,y,.68],[4.427,y+.16,.68],.014,dark);
    }
    for(const z of [.22,1.02,1.83])s.box([4.415,a+.025,z],[.06,.14,.075],edge);
  }
  // Seals, wall seams, fasteners and compact status/service hardware.
  for(const x of [.04,4.16])s.box([x,-.183,1.0],[.015,.008,2.25],rubber,.002);
  for(let x=.15;x<4.1;x+=.42)for(const z of [-.22,2.14])s.rod([x,-.181,z],[x,-.19,z],.012,edge);
  f.box([4.39,2.55,1.63],[.12,.33,.43],steel);
  f.box([4.456,2.55,1.63],[.02,.285,.37],panel);
  f.box([4.472,2.48,1.74],[.006,.022,.022],indicator,.001);
  for(const y of [2.43,2.64])f.rod([4.47,y,1.43],[4.47,y,1.18],.018,dark);
  // Water connectors are illustrative service connections, not a water mesh.
  for(const [y,m] of [[2.47,blue],[2.64,edge]]){
    f.rod([4.31,y,-.32],[4.48,y,-.32],.03,m);
    f.rod([4.48,y,-.32],[4.48,y,-.49],.03,m);
  }
  f.finish();c.finish();s.finish();closed.visible=false;
  if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#193a49';ctx.fillRect(0,0,512,128);
    ctx.fillStyle='#e1eeef';ctx.font='600 44px sans-serif';ctx.fillText('MODULAR / MDC 01',22,55);
    ctx.font='23px sans-serif';ctx.fillStyle='#a3c3ce';ctx.fillText('THERMAL FLOW DEMONSTRATOR',22,96);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const plaque=new THREE.Mesh(new THREE.PlaneGeometry(1.03,.2575),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
    plaque.rotation.x=Math.PI/2;plaque.position.set(.77,-.194,1.77);closed.add(plaque);
  }
  return group;
}
