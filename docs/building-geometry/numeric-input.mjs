// Keep native number-input drafts ("1.", "-", "", etc.) intact until the
// user finishes editing. Sliders can continue updating the model immediately.
export function bindNumericInput(input,{value,commit,invalid}){
  input.step='any';input.inputMode='decimal';
  let composing=false;
  const restore=()=>{input.value=String(value());input.removeAttribute('aria-invalid');};
  const finish=()=>{
    if(composing)return;
    const text=input.value.trim(),number=Number(text);
    try{
      if(!text||input.validity.badInput||!Number.isFinite(number))throw Error('Incomplete number');
      commit(number);
    }catch{restore();invalid?.();return;}
    restore();
  };
  input.addEventListener('input',()=>input.removeAttribute('aria-invalid'));
  input.addEventListener('compositionstart',()=>{composing=true;});
  input.addEventListener('compositionend',()=>{composing=false;});
  input.addEventListener('blur',finish);
  input.addEventListener('keydown',event=>{
    if(event.isComposing||composing||event.keyCode===229)return;
    if(event.key==='Enter'){event.preventDefault();finish();}
    if(event.key==='Escape'){event.preventDefault();restore();}
  });
}

export function syncNumericInput(input,value){
  if(input!==input.ownerDocument.activeElement){
    input.value=String(value);input.removeAttribute('aria-invalid');
  }
}
