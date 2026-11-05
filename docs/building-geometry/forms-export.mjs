export function previewSTL(meshes){
  const lines=['solid architectural_form_preview'];
  for(const mesh of meshes)for(let i=0;i<mesh.positions.length;i+=9){
    const [a,b,c]=[0,3,6].map(j=>Array.from(mesh.positions.slice(i+j,i+j+3)));
    const u=b.map((v,k)=>v-a[k]),v=c.map((n,k)=>n-a[k]);
    const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);
    if(length<1e-12)continue;
    lines.push(`facet normal ${n.map(x=>x/length).join(' ')}`,' outer loop',...[a,b,c].map(p=>`  vertex ${p.join(' ')}`),' endloop','endfacet');
  }
  lines.push('endsolid architectural_form_preview');return lines.join('\n')+'\n';
}

export function nativeSvg(meshes){
  const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0),norm=a=>{const l=Math.hypot(...a);return a.map(x=>x/l);},d=[1.6,-2.2,1.55],right=norm([2.2,1.6,0]),up=norm([-2.48,3.41,7.4]),polygons=[];
  for(const m of meshes)for(let i=0;i<m.positions.length;i+=9){
    const n=Array.from(m.normals.slice(i,i+3));if(dot(n,d)<1e-6)continue;
    const pts=[0,3,6].map(j=>Array.from(m.positions.slice(i+j,i+j+3))),shade=.72+.28*Math.max(0,dot(n,norm([-3,-3,6])));
    polygons.push({pts:pts.map(p=>[dot(p,right),-dot(p,up)]),depth:pts.reduce((v,p)=>v+dot(p,d)/3,0),color:`rgb(${m.color.map(c=>Math.round(Math.min(1,c*shade)*255)).join(',')})`});
  }
  const xs=polygons.flatMap(p=>p.pts.map(q=>q[0])),ys=polygons.flatMap(p=>p.pts.map(q=>q[1])),xmin=Math.min(...xs),xmax=Math.max(...xs),ymin=Math.min(...ys),ymax=Math.max(...ys),scale=Math.min(510/(xmax-xmin),350/(ymax-ymin));
  const xy=([x,y])=>`${320+(x-(xmin+xmax)/2)*scale},${225+(y-(ymin+ymax)/2)*scale}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 450"><rect width="640" height="450" fill="#ecf0f2"/>${polygons.sort((a,b)=>a.depth-b.depth).map(p=>`<polygon points="${p.pts.map(xy).join(' ')}" fill="${p.color}"/>`).join('')}</svg>`;
}
