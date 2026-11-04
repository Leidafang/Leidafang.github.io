import * as THREE from './vendor/three.module.js';
import {OrbitControls} from './vendor/OrbitControls.js';

export class MeshView{
  constructor(canvas,stage,plan){
    this.stage=stage;this.plan=plan;this.geometry=null;this.model=null;this.edges=null;this.wires=null;
    this.dirty=true;this.mode='iso';this.wire=false;this.colored=false;this.renderCount=0;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xeef1f3);
    this.camera=new THREE.OrthographicCamera(-30,30,25,-25,.01,10000);this.camera.up.set(0,0,1);
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.25;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.scene.add(new THREE.HemisphereLight(0xe7f1ff,0x8c969b,2.6));
    this.light=new THREE.DirectionalLight(0xffe8d6,3.4);this.light.castShadow=true;
    this.light.shadow.mapSize.set(2048,2048);this.light.shadow.normalBias=.1;this.scene.add(this.light);
    const fill=new THREE.DirectionalLight(0xddeeff,1.2);fill.position.set(30,10,100);this.scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(10000,10000),new THREE.MeshStandardMaterial({color:0xe9edef,roughness:1}));
    floor.position.z=-.03;floor.receiveShadow=true;this.scene.add(floor);
    this.controls=new OrbitControls(this.camera,canvas);this.controls.enableDamping=true;this.controls.dampingFactor=.1;
    this.controls.minZoom=.15;this.controls.maxZoom=10;this.controls.autoRotateSpeed=.65;this.controls.listenToKeyEvents(canvas);
    this.controls.addEventListener('change',()=>this.dirty=true);
    new ResizeObserver(()=>{this.renderer.setSize(stage.clientWidth,stage.clientHeight,false);this.fit();}).observe(stage);
    this.renderer.setSize(stage.clientWidth,stage.clientHeight,false);
    const clock=new THREE.Clock();
    this.renderer.setAnimationLoop(()=>{
      const changed=this.controls.update(Math.min(clock.getDelta(),.05));
      if(this.dirty||changed||this.controls.autoRotate){this.renderer.render(this.scene,this.camera);this.renderCount++;this.dirty=false;}
    });
  }
  setGeometry(geometry){
    if(this.model){this.geometry.dispose();this.model.material.dispose();this.model.removeFromParent();}
    for(const obj of [this.edges,this.wires,this.grid])if(obj){obj.geometry.dispose();obj.material.dispose();obj.removeFromParent();}
    this.geometry=geometry;geometry.computeBoundingBox();geometry.computeVertexNormals();
    const box=geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    const positions=geometry.getAttribute('position'),colors=new Float32Array(positions.count*3);
    const palette=[new THREE.Color(0x648da9),new THREE.Color(0xb5cbd4),new THREE.Color(0xe4be99),new THREE.Color(0xb56542)];
    for(let i=0;i<positions.count;i++){
      const t=Math.max(0,Math.min(.999999,(positions.getZ(i)-box.min.z)/size.z))*3;
      const k=Math.min(2,Math.floor(t));const c=palette[k].clone().lerp(palette[k+1],t-k);
      colors.set([c.r,c.g,c.b],i*3);
    }
    geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));
    const material=new THREE.MeshStandardMaterial({color:this.colored?0xffffff:0xa0b9c9,roughness:.87,side:THREE.DoubleSide,vertexColors:this.colored});
    this.model=new THREE.Mesh(geometry,material);this.model.castShadow=true;this.model.receiveShadow=false;
    this.model.position.set(-center.x,-center.y,-box.min.z);this.scene.add(this.model);
    this.edges=new THREE.LineSegments(new THREE.EdgesGeometry(geometry,25),new THREE.LineBasicMaterial({color:0x426276,transparent:true,opacity:.2}));
    this.edges.position.copy(this.model.position);this.scene.add(this.edges);
    this.wires=new THREE.LineSegments(new THREE.WireframeGeometry(geometry),new THREE.LineBasicMaterial({color:0x3a596e,transparent:true,opacity:.28}));
    this.wires.position.copy(this.model.position);this.wires.visible=this.wire;this.scene.add(this.wires);
    const step=size.length()>140?20:size.length()>70?10:5;
    this.grid=new THREE.GridHelper(step*30,30,0xa1b0ba,0xc1ccd3);this.grid.rotation.x=Math.PI/2;this.grid.position.z=-.02;
    this.grid.material.transparent=true;this.grid.material.opacity=.3;this.scene.add(this.grid);
    document.getElementById('grid-label').textContent=`米制 · 网格 ${step} m · 拖动旋转`;
    this.light.position.set(-size.length(),-size.length(),size.length()*2);
    const range=size.length()*1.5;
    Object.assign(this.light.shadow.camera,{left:-range,right:range,top:range,bottom:-range,near:.1,far:range*6});
    this.light.shadow.camera.updateProjectionMatrix();
    this.drawPlan();this.fit();this.dirty=true;
  }
  fit(preset=null){
    if(!this.model)return;if(preset)this.mode=preset;
    const box=new THREE.Box3().setFromObject(this.model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    let direction;
    if(preset==='top')direction=new THREE.Vector3(0,-.0001,1);
    else if(preset==='front')direction=new THREE.Vector3(0,-1,.0001);
    else if(preset==='iso'||!this.hasFit)direction=new THREE.Vector3(1.4,-1.8,1.35).normalize();
    else direction=this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,size.length()*3+20);this.camera.lookAt(center);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(this.camera.quaternion),up=new THREE.Vector3(0,1,0).applyQuaternion(this.camera.quaternion),xs=[],ys=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const p=new THREE.Vector3(x,y,z).sub(center);xs.push(p.dot(right));ys.push(p.dot(up));
    }
    const aspect=this.stage.clientWidth/this.stage.clientHeight;
    const height=Math.max((Math.max(...ys)-Math.min(...ys))*1.45,(Math.max(...xs)-Math.min(...xs))/aspect*1.45,2);
    Object.assign(this.camera,{left:-height*aspect/2,right:height*aspect/2,top:height/2,bottom:-height/2,zoom:1});
    this.camera.updateProjectionMatrix();this.controls.update();this.hasFit=true;this.dirty=true;
    document.querySelectorAll('[data-view]').forEach(el=>{el.classList.toggle('active',el.dataset.view===this.mode);el.setAttribute('aria-pressed',String(el.dataset.view===this.mode));});
  }
  drawPlan(){
    const canvas=this.plan,ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height,p=this.geometry.getAttribute('position');
    const box=this.geometry.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
    ctx.fillStyle='#f0f3f5';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#e4e9ec';ctx.lineWidth=1;
    for(let x=0;x<w;x+=35){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(let y=0;y<h;y+=35){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    const scale=Math.min((w-70)/size.x,(h-62)/size.y);ctx.fillStyle='#96adbd';
    for(let i=0;i<p.count;i+=3){ctx.beginPath();for(let j=0;j<3;j++){
      const x=w/2+(p.getX(i+j)-center.x)*scale,y=h/2-8-(p.getY(i+j)-center.y)*scale;
      if(j===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
    }ctx.closePath();ctx.fill();}
    ctx.fillStyle='#8598a5';ctx.font='15px sans-serif';ctx.textAlign='center';ctx.fillText(`${size.x.toFixed(1)} × ${size.y.toFixed(1)} m`,w/2,h-10);
  }
  setColor(on){this.colored=on;if(this.model){this.model.material.vertexColors=on;this.model.material.color.set(on?0xffffff:0xa0b9c9);this.model.material.needsUpdate=true;}this.dirty=true;}
  setWire(on){this.wire=on;if(this.wires)this.wires.visible=on;this.dirty=true;}
  screenshot(callback){this.renderer.render(this.scene,this.camera);this.renderer.domElement.toBlob(callback,'image/png');}
  dimensions(){return this.geometry?.boundingBox.getSize(new THREE.Vector3()).toArray();}
}
