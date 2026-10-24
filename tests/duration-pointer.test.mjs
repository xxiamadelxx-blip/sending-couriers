import test from 'node:test';
import assert from 'node:assert/strict';
import {bindDurations} from '../web/duration-control.mjs';

class Element extends EventTarget {
  value=''; disabled=false; attributes=new Map();
  classList={toggle(){}};
  setAttribute(k,v){this.attributes.set(k,String(v));}
  focus(){} setPointerCapture(id){this.captured=id;}
  getBoundingClientRect(){return {left:0,width:334};}
}
function fixture(){
  const input=new Element(),slider=new Element(),control=new Element();
  input.value='8';control.dataset={duration:'hours'};
  input.closest=()=>control;
  control.querySelector=()=>slider;control.querySelectorAll=()=>[];
  const root={querySelector:()=>input,querySelectorAll:()=>[control]};
  bindDurations(root);
  const pointer=(type,x,y)=>{
    const event=new Event(type,{cancelable:true});
    Object.assign(event,{pointerId:1,button:0,clientX:x,clientY:y});
    slider.dispatchEvent(event);
  };
  const nativeInput=value=>{slider.value=String(value);slider.dispatchEvent(new Event('input'));};
  return {input,slider,pointer,nativeInput};
}

test('native range input during a track touch cannot jump the saved duration',()=>{
  const f=fixture();f.pointer('pointerdown',270,10);
  f.nativeInput(720); // Android may update the native range while touch begins.
  assert.equal(f.input.value,'8');assert.equal(Number(f.slider.value),480);
  f.pointer('pointerup',270,10);
});
test('vertical pan cancels a partial thumb drag and ignores native range movement',()=>{
  const f=fixture();f.pointer('pointerdown',117,10);
  f.pointer('pointermove',137,10);assert.equal(f.input.value,'8,5');
  f.pointer('pointermove',138,110);
  f.nativeInput(720);
  assert.equal(f.input.value,'8');assert.equal(Number(f.slider.value),480);
  f.pointer('pointercancel',138,110);
});
test('intentional thumb drag retains quarter-hour steps',()=>{
  const f=fixture();f.pointer('pointerdown',117,10);
  f.pointer('pointermove',157,10);f.pointer('pointerup',157,10);
  assert.equal(f.input.value,'9');assert.equal(Number(f.slider.value),540);
});
test('keyboard or accessibility range input still works after a pointer gesture',()=>{
  const f=fixture();f.pointer('pointerdown',270,10);f.pointer('pointerup',270,10);
  f.nativeInput(495);assert.equal(f.input.value,'8,25');
  f.pointer('pointerdown',117,10);f.pointer('pointercancel',117,30);
  f.nativeInput(510);assert.equal(f.input.value,'8,5');
});
test('track touch captures release outside and lost capture cannot disable keyboard input',()=>{
  const f=fixture();f.pointer('pointerdown',270,10);
  assert.equal(f.slider.captured,1,'Release outside must return to this slider');
  f.pointer('lostpointercapture',350,10);
  f.nativeInput(495);assert.equal(f.input.value,'8,25');
});
