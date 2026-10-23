import * as THREE from 'three';
import {RoomEnvironment} from 'three/addons/RoomEnvironment.js';

// A photographed architectural miniature: finite site, matte sweep and soft
// studio reflections. This backdrop has no relation to the CFD domain.
export function createDaylight(renderer,world,{deferEnvironment=false}={}){
  function enableEnvironment(){
    if(world.environment)return;
  const environment=new RoomEnvironment();environment.rotation.x=Math.PI/2;
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(environment,.06);
  world.environment=target.texture;world.environmentIntensity=.32;
  environment.dispose();pmrem.dispose();
  }
  if(!deferEnvironment)enableEnvironment();

  const backdrop=new THREE.Group();backdrop.name='miniature-studio';
  // Neutral seamless paper, with restrained lighting variation on the floor.
  // No photographic horizon, stretched clouds, surrounding terrain or fog.
  const background=new THREE.Color(0xb7c2c5);
  const surround=new THREE.Mesh(new THREE.SphereGeometry(1000,16,12),
    new THREE.MeshBasicMaterial({color:background,side:THREE.BackSide,depthWrite:false,toneMapped:false}));
  surround.renderOrder=-100;surround.name='studio-surround';backdrop.add(surround);
  const material=new THREE.MeshStandardMaterial({color:0xa9b2b3,roughness:.92,metalness:0,dithering:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.studioBackground={value:background};
    shader.vertexShader='varying vec2 vStageXY;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nvStageXY=(modelMatrix*vec4(position,1.)).xy;');
    shader.fragmentShader='varying vec2 vStageXY;\nuniform vec3 studioBackground;\n'+shader.fragmentShader;
    // A broad, deterministic tent filter on the stage receiver only. The
    // building retains the sharper existing shadow filter for small details.
    const shadowChunk=THREE.ShaderChunk.shadowmap_pars_fragment.replace(
      /float getShadow\([\s\S]*?\n\t\}/,`float getShadow(sampler2D shadowMap, vec2 shadowMapSize,
        float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord){
        vec3 q=shadowCoord.xyz/shadowCoord.w;q.z+=shadowBias;
        if(q.x<0. || q.x>1. || q.y<0. || q.y>1. || q.z>1.)return 1.;
        float shade=0.;vec2 stepSize=vec2(12.)/shadowMapSize;
        for(int x=-2;x<=2;x++)for(int y=-2;y<=2;y++){
          float weight=(3.-abs(float(x)))*(3.-abs(float(y)));
          shade+=weight*texture2DCompare(shadowMap,q.xy+vec2(float(x),float(y))*stepSize,q.z);
        }
        return mix(1.,shade/81.,shadowIntensity*.72);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',shadowChunk);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 relative=vStageXY-vec2(-8.,8.);
      // One receiver also owns contact shading, without coplanar overlays.
      vec2 outside=max(abs(relative)-vec2(22.,19.),0.);
      float edgeDistance=length(outside);
      float contact=exp(-edgeDistance*edgeDistance/1.8);
      float pool=exp(-dot((relative-vec2(-27.,-20.))/85.,(relative-vec2(-27.,-20.))/85.));
      diffuseColor.rgb*=(.90+.13*pool)*(1.-.28*contact);
    `);
    // Fade only the distant sweep, never the miniature, before output encoding.
    shader.fragmentShader=shader.fragmentShader.replace('#include <colorspace_fragment>',`
      float sweep=smoothstep(65.,240.,length(vStageXY-vec2(-8.,8.)));
      gl_FragColor.rgb=mix(gl_FragColor.rgb,studioBackground,sweep);
      #include <colorspace_fragment>`);
  };
  const floor=new THREE.Mesh(new THREE.PlaneGeometry(1600,1600),material);
  // The base underside is -.899 m. A separated receiver avoids depth fighting.
  floor.position.z=-.94;floor.receiveShadow=true;floor.name='studio-shadow-receiver';backdrop.add(floor);
  world.add(backdrop);

  const hemi=new THREE.HemisphereLight(0xe7f0f5,0xb5aa98,1.15);hemi.position.set(0,0,1);world.add(hemi);
  const sunDirection=new THREE.Vector3(-.48,-.55,.83).normalize();
  const sun=new THREE.DirectionalLight(0xffedda,2.65);
  sun.position.copy(sunDirection).multiplyScalar(80).add(new THREE.Vector3(-8,10,0));
  sun.target.position.set(-8,10,0);world.add(sun.target,sun);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
  Object.assign(sun.shadow.camera,{left:-36,right:36,top:36,bottom:-36,near:.1,far:160});
  sun.shadow.normalBias=.018;sun.shadow.bias=-.00012;sun.shadow.autoUpdate=false;
  const fill=new THREE.DirectionalLight(0xd7e9f5,.7);fill.position.set(6,3,7);world.add(fill);
  return {sky:backdrop,sun,enableEnvironment};
}
