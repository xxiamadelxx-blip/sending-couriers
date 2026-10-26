// A detented duration control. Plans and facts decide separately when to save.
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const numeric=raw=>raw.trim()!==''&&Number.isFinite(Number(raw.replace(',','.')))?Number(raw.replace(',','.'))*60:null;
const hours=min=>String(Math.round(min/60*10000)/10000).replace('.',',');
const spoken=min=>min==null?'Не задано':`${Math.floor(min/60)} ч${min%60?' '+Math.round(min%60)+' мин':''}`;
export function durationField(id,label,min=null,extra='') {
  return `<div class="duration-control field" data-duration="${id}"><div class="duration-heading"><label for="${id}">${esc(label)}</label><span class="duration-value"><input id="${id}" type="text" aria-label="${esc(label)}" inputmode="decimal" value="${min==null?'':hours(min)}" placeholder="—" ${extra}><span>ч</span></span></div><div class="duration-track"><button type="button" data-duration-step="-1" aria-label="${esc(label)}: минус 15 минут">−</button><input id="${id}Slider" class="duration-slider" type="range" min="0" max="1440" step="15" value="${min??0}" aria-label="${esc(label)}"><button type="button" data-duration-step="1" aria-label="${esc(label)}: плюс 15 минут">+</button></div></div>`;
}
export function syncDuration(root,id){
  const input=root.querySelector('#'+id),control=input?.closest('[data-duration]');if(!control)return;
  const slider=control.querySelector('[type=range]'),min=numeric(input.value);
  slider.value=min??0;slider.setAttribute('aria-valuetext',spoken(min));slider.disabled=input.disabled;
  control.classList.toggle('duration-unknown',min==null);control.classList.toggle('duration-disabled',input.disabled);
  control.querySelectorAll('button').forEach(b=>b.disabled=input.disabled);
}
export function bindDurations(root){
  root.querySelectorAll('[data-duration]').forEach(control=>{
    const id=control.dataset.duration,input=root.querySelector('#'+id),slider=control.querySelector('[type=range]');
    const sync=()=>syncDuration(root,id),set=min=>{input.value=hours(Math.min(1440,Math.max(0,min)));input.dispatchEvent(new Event('input',{bubbles:true}));sync();};
    input.addEventListener('input',sync);sync();
    control.querySelectorAll('[data-duration-step]').forEach(b=>b.onclick=()=>set((numeric(input.value)??0)+Number(b.dataset.durationStep)*15));
    let drag=null,pointer=null;
    // Pointer gestures use the detented drag below. Android's native range can
    // emit an input while a vertical pan starts; it must not overwrite hours.
    slider.addEventListener('input',()=>pointer==null?set(Number(slider.value)):sync());
    slider.addEventListener('mousedown',e=>e.preventDefault());
    const cancel=()=>{if(!drag)return;const previous=drag.raw;drag=null;input.value=previous;input.dispatchEvent(new Event('input',{bubbles:true}));sync();};
    slider.addEventListener('pointerdown',e=>{
      if(e.button!==0||e.isPrimary===false||slider.disabled)return;pointer=e.pointerId;e.preventDefault();slider.focus({preventScroll:true});slider.setPointerCapture(e.pointerId);
      const box=slider.getBoundingClientRect(),thumb=box.left+17+(box.width-34)*Number(slider.value)/1440;
      if(Math.abs(e.clientX-thumb)>23)return; // Tapping the track never jumps to a distant value.
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,base:numeric(input.value)??0,raw:input.value,step:0};
    });
    const move=e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
      if(Math.abs(dy)>Math.abs(dx)+8){cancel();return;}
      const step=Math.trunc(dx/10);if(step!==drag.step){drag.step=step;set(drag.base+step*15);}
    };
    slider.addEventListener('pointermove',move);
    slider.addEventListener('pointerup',e=>{move(e);drag=null;pointer=null;});
    slider.addEventListener('pointercancel',()=>{cancel();pointer=null;sync();});
    slider.addEventListener('lostpointercapture',()=>{cancel();pointer=null;sync();});
  });
}
