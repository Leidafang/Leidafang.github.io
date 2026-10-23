// Browser-independent numerical helpers, tested against the exported data.
// Same physical range; saturated cool/warm branches emphasize the aisle contrast.
export const COLOR_STOPS = [[0,[24,80,255]], [.25,[0,169,255]], [.46,[32,221,242]], [.54,[255,181,32]], [.75,[255,76,12]], [1,[255,24,66]]];
// Design assumptions only. CFD specifies relative speed, not a calibrated RPM.
export const FAN_NOMINAL_RPM = {rack:3000,return:900};
export function fanRPM(kind,multiplier){return FAN_NOMINAL_RPM[kind]*Math.max(0,multiplier);}
export function fanAngle(rpm,seconds){return ((rpm/60*seconds)%1)*Math.PI*2;}
export function temperatureRGB(t, min, max) {
  const f=Math.max(0,Math.min(1,(t-min)/(max-min || 1)));
  let k=0; while(k<COLOR_STOPS.length-2 && f>COLOR_STOPS[k+1][0]) k++;
  const [a,ca]=COLOR_STOPS[k], [b,cb]=COLOR_STOPS[k+1], s=(f-a)/(b-a);
  return ca.map((c,j)=>(c+(cb[j]-c)*s)/255);
}
export function locate(data, path, t) {
  let a=0,b=path.count-1;
  while(b-a>1){const m=(a+b)>>1;if(data[(path.offset+m)*5+4]<=t)a=m;else b=m;}
  const i=(path.offset+a)*5,j=(path.offset+b)*5;
  const mix=Math.max(0,Math.min(1,(t-data[i+4])/(data[j+4]-data[i+4] || 1)));
  return [i,j,mix];
}
export function samplePath(data,path,t,out=new Float32Array(4)) {
  const [i,j,f]=locate(data,path,t);
  for(let k=0;k<4;k++)out[k]=data[i+k]*(1-f)+data[j+k]*f;
  return out;
}
export function phaseTime(elapsed, duration, phase) {
  return ((elapsed+phase*duration)%duration+duration)%duration;
}
