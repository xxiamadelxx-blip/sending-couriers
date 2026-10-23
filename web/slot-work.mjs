import {parseHours} from './core.mjs';
import {syncSlots,saveTimeline} from './forecast.mjs';

// Slot totals and actual WORK are distinct: a second slot cannot add the
// same day's working windows again. The caller persists this whole state once.
export function withSlotWorkingTime(state,date,{mode,intervals=[],workingMin=null}) {
  const forecast=syncSlots(state.forecast,state.entries);
  const old=forecast.days[date];
  const source=old?.source??'finance-slots';
  const other=(old?.intervals??[]).filter(i=>i.state!=='WORK');
  let input={date,source};
  if(mode==='intervals'){
    if(!intervals.length)throw new Error('Добавьте рабочий интервал.');
    for(const a of intervals)for(const b of other.filter(i=>i.state==='UNKNOWN'))
      if(a.start<b.end&&b.start<a.end)throw new Error('Рабочий интервал пересекает сохранённое неизвестное окно. Уточните его в истории прогноза.');
    input={...input,precision:'intervals',intervals:[...intervals,...other],workConfirmed:true};
  }else if(mode==='total'){
    const hours=parseHours(workingMin);
    if(hours>24)throw new Error('Рабочее время за день не может быть больше 24 ч.');
    input={...input,precision:'total',workingMin:Math.round(hours*60),intervals:other,workConfirmed:true};
  }else if(mode==='rest'){
    input={...input,precision:'total',workingMin:0,intervals:other,workConfirmed:true};
  }else if(mode==='unknown'){
    input={...input,precision:'unknown',workingMin:null,intervals:other,workConfirmed:false};
  }else throw new Error('Выберите способ ввода рабочего времени.');
  return {...state,forecast:saveTimeline(forecast,input)};
}
