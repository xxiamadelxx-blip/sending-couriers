// Presentation only: date-grouped editable slots in the selected period.
// All aggregates come from calculateDay; this module invents no clock times.
import {icon} from './icons.mjs';

export function orderedPeriodDates(entries) {
  return [...new Set(entries.map(e=>e.date))].sort((a,b)=>b.localeCompare(a));
}

export function periodDayMarkup(entries, dayTotals, dateLabel, hoursText, money, esc) {
  const dates=orderedPeriodDates(entries);
  if (!dates.length) return '<section class="period-no-days"><h2>Пока нет записей</h2><p>За выбранный период сохранённых слотов нет.</p></section>';
  const display=(value,formatter)=>esc(formatter(value));
  return dates.map(date=>{
    const day=dayTotals(date);
    const slots=entries.filter(e=>e.date===date).slice().sort((a,b)=>String(a.createdAt??'').localeCompare(String(b.createdAt??''))||String(a.id).localeCompare(String(b.id)));
    const count=slots.length;
    const slotHtml=slots.map((entry,index)=>{
      const slotNumber=index+1;
      return `<article class="period-day-slot">
          <header class="period-slot-header"><strong>Слот ${slotNumber}</strong><button class="period-slot-edit" type="button" data-entry="${esc(entry.id)}" aria-label="Редактировать слот ${slotNumber}, ${esc(dateLabel(date))}">Редактировать ${icon['chevron-right']}</button></header>
          <dl class="period-slot-facts"><div><dt>Активно</dt><dd>${display(entry.dailyHours,hoursText)} ч</dd></div><div><dt>Заказы</dt><dd>${entry.dailyOrders==null?'—':esc(entry.dailyOrders)}</dd></div><div><dt>Вознаграждение</dt><dd>${display(entry.reward,money)}</dd></div><div><dt>Чаевые</dt><dd>${display(entry.tips,money)}</dd></div><div><dt>Бонусы отдельно</dt><dd>${display(entry.separateBonus,money)}</dd></div>${entry.displayedNet!=null?`<div><dt>Итог на экране</dt><dd>${display(entry.displayedNet,money)}</dd></div>`:''}</dl>
          ${entry.note?`<p class="period-slot-note">${esc(entry.note)}</p>`:''}
        </article>`;
    }).join('');
    return `<details class="period-day">
      <summary><span class="period-day-title">${esc(dateLabel(date))}<small>${count} ${count===1?'слот':count>=2&&count<=4?'слота':'слотов'}</small></span>
        <span class="period-day-figures"><strong>${display(day.paidReward,money)}</strong><small>${display(day.hours,hoursText)} ч · ${day.orders==null?'—':esc(day.orders)} заказов</small></span>
        <span class="period-day-chevron" aria-hidden="true">${icon['chevron-down']}</span></summary>
      <div class="period-day-slots">${slotHtml}</div>
    </details>`;
  }).join('');
}
