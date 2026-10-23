import {parseWindows,parseMinute,workingMinutes,minuteLabel} from './forecast.mjs';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=min=>min==null?'Не задано':min===0?'Отдых':`${Math.floor(min/60)} ч${min%60?' '+min%60+' мин':''}`;
const row=(i={},disabled=false)=>`<div class="interval-row" data-full-day="${i.end-i.start===1440}"><label>С<input type="time" data-start value="${i.start==null?'':minuteLabel(i.start)}" ${disabled?'disabled':''}></label><span>—</span><label>До${i.end-i.start===1440?' · след. день':''}<input type="time" data-end value="${i.end==null?'':minuteLabel(i.end>1440?i.end-1440:i.end===1440?0:i.end)}" ${disabled?'disabled':''}></label><button type="button" data-remove aria-label="Удалить интервал" ${disabled?'disabled':''}>×</button></div>`;
function readRows(rows){return [...rows.querySelectorAll('.interval-row')].flatMap(r=>{const a=r.querySelector('[data-start]').value,b=r.querySelector('[data-end]').value;if(!a||!b)throw new Error('Укажите начало и конец каждого интервала.');return a===b&&r.dataset.fullDay==='true'?[{start:parseMinute(a),end:parseMinute(a)+1440,state:'WORK',paymentCounted:'UNKNOWN'}]:parseWindows(a+'–'+b);});}
export function intervalField(id,list=[],min=null,disabled=false){
 return `<section class="interval-control" data-interval="${id}"><div class="interval-heading"><h3>Рабочее время</h3><output>${label(min)}</output></div><input type="hidden" id="${id}" value="${min==null?'':min/60}" ${disabled?'disabled':''}><div class="interval-rows">${(list.length?list:[{}]).map(i=>row(i,disabled)).join('')}</div><div class="interval-actions"><button type="button" data-add ${disabled?'disabled':''}>+ Интервал</button><button type="button" data-rest ${disabled?'disabled':''}>Выходной</button><button type="button" data-unknown ${disabled?'disabled':''}>Не задано</button></div><p class="hint interval-legacy" ${list.length||min==null||min===0?'hidden':''}>Сохранён итог без времени суток.</p><p class="field-warning" data-interval-error hidden></p></section>`;
}
export function intervalValue(root,id){
 const field=root.querySelector('#'+id),control=field.closest('[data-interval]');if(field.dataset.error)throw new Error(field.dataset.error);
 const list=control._intervals??[];return {workingMin:field.value===''?null:Math.round(Number(field.value)*60),intervals:list,precision:list.length?'intervals':field.value===''?'unknown':'total'};
}
export function setIntervals(root,id,list,min){
 const field=root.querySelector('#'+id),control=field.closest('[data-interval]');control._intervals=list;
 field.value=min==null?'':min/60;delete field.dataset.error;control.querySelector('output').textContent=label(min);
 control.querySelector('.interval-rows').innerHTML=(list.length?list:[{}]).map(i=>row(i,field.disabled)).join('');control.querySelector('[data-interval-error]').hidden=true;control.querySelector('.interval-legacy').hidden=!!list.length||min==null||min===0;
}
export function bindIntervals(root){root.querySelectorAll('[data-interval]').forEach(control=>{
 const id=control.dataset.interval,field=root.querySelector('#'+id),rows=control.querySelector('.interval-rows');
 const emit=()=>field.dispatchEvent(new Event('input',{bubbles:true}));
 const update=()=>{try{
  const list=readRows(rows);setNoRender(list,workingMinutes(list));
 }catch(error){field.dataset.error=error.message;const out=control.querySelector('[data-interval-error]');out.textContent=error.message;out.hidden=false;}emit();};
 const setNoRender=(list,min)=>{control._intervals=list;field.value=min==null?'':min/60;delete field.dataset.error;control.querySelector('output').textContent=label(min);control.querySelector('[data-interval-error]').hidden=true;control.querySelector('.interval-legacy').hidden=true;};
 const values=[...rows.querySelectorAll('.interval-row')].map(r=>[r.querySelector('[data-start]').value,r.querySelector('[data-end]').value]);control._intervals=values.every(v=>v[0]&&v[1])?readRows(rows):[];
 rows.addEventListener('input',update);rows.addEventListener('click',event=>{const button=event.target.closest('[data-remove]');if(!button)return;button.closest('.interval-row').remove();if(!rows.children.length){setIntervals(root,id,[],null);emit();}else update();});
 control.querySelector('[data-add]').onclick=()=>{rows.insertAdjacentHTML('beforeend',row());field.dataset.error='Укажите начало и конец каждого интервала.';rows.lastElementChild.querySelector('input').focus();};
 control.querySelector('[data-rest]').onclick=()=>{setIntervals(root,id,[],0);emit();};control.querySelector('[data-unknown]').onclick=()=>{setIntervals(root,id,[],null);emit();};
});}
