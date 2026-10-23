const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// One native horizontal scroller for both dashboard pages and payment steps.
export function pager(id,items,{steps=false,label='Страницы'}={}) {
  const tabs=steps?'':`<div class="pager-tabs" role="tablist" aria-label="${esc(label)}">${items.map((item,i)=>`<button type="button" role="tab" id="${id}-tab-${i}" aria-controls="${id}-panel-${i}" data-page="${i}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${item.icon??''}<span>${esc(item.title)}</span></button>`).join('')}</div>`;
  const controls=steps?`<div class="pager-controls"><button type="button" data-previous aria-label="Предыдущий пункт">Назад</button><output aria-live="polite"></output><button type="button" data-next aria-label="Следующий пункт">Далее</button></div>`:'';
  return `<div class="pager" id="${id}">${tabs}<div class="pager-track" aria-label="${esc(label)}">${items.map((item,i)=>`<div class="pager-panel" id="${id}-panel-${i}" role="${steps?'group':'tabpanel'}" aria-label="${esc(item.title)}" ${steps?'':`aria-labelledby="${id}-tab-${i}"`}>${item.html}</div>`).join('')}</div>${controls}</div>`;
}

export function bindPager(host,{initial=0,onChange=()=>{}}={}) {
  const track=host.querySelector('.pager-track'),panels=[...host.querySelectorAll('.pager-panel')],tabs=[...host.querySelectorAll('[role="tab"]')],tabBar=host.querySelector('.pager-tabs');
  let active=Math.min(Math.max(initial,0),panels.length-1),raf=0;
  const centerTab=()=>{
    if(!tabBar || !tabs[active])return;
    tabBar.style.setProperty('--pager-pad-start',`${Math.max(0,(tabBar.clientWidth-tabs[0].getBoundingClientRect().width)/2)}px`);
    tabBar.style.setProperty('--pager-pad-end',`${Math.max(0,(tabBar.clientWidth-tabs.at(-1).getBoundingClientRect().width)/2)}px`);
    const tab=tabs[active].getBoundingClientRect(),bar=tabBar.getBoundingClientRect();
    tabBar.scrollTo({left:tabBar.scrollLeft+tab.left+tab.width/2-bar.left-bar.width/2,behavior:'smooth'});
  };
  const update=(index,scroll=false)=>{
    active=Math.min(Math.max(index,0),panels.length-1);
    panels.forEach((panel,i)=>{panel.inert=i!==active;panel.setAttribute('aria-hidden',String(i!==active));});
    tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===active));tab.tabIndex=i===active?0:-1;});
    centerTab();
    const out=host.querySelector('.pager-controls output');if(out)out.textContent=`${active+1} / ${panels.length}`;
    const prev=host.querySelector('[data-previous]'),next=host.querySelector('[data-next]');
    if(prev)prev.disabled=active===0;if(next)next.disabled=active===panels.length-1;
    track.style.height=`${panels[active].scrollHeight}px`;
    if(scroll)track.scrollLeft=active*track.clientWidth;
    onChange(active);
  };
  host.addEventListener('click',event=>{
    const tab=event.target.closest('[data-page]');if(tab){update(Number(tab.dataset.page),true);return;}
    if(event.target.closest('[data-previous]'))update(active-1,true);
    if(event.target.closest('[data-next]'))update(active+1,true);
  });
  host.querySelector('.pager-tabs')?.addEventListener('keydown',event=>{
    const focused=tabs.indexOf(document.activeElement),base=focused<0?active:focused;
    const delta={ArrowRight:1,ArrowLeft:-1,Home:-base,End:panels.length-1-base}[event.key];
    if(delta==null)return;event.preventDefault();update(base+delta,true);tabs[active]?.focus();
  });
  track.addEventListener('scroll',()=>{
    cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{
      const index=Math.round(track.scrollLeft/(track.clientWidth||1));if(index!==active)update(index);
    });
  });
  const observer=new ResizeObserver(()=>{if(!host.isConnected){observer.disconnect();return;}track.style.height=`${panels[active].scrollHeight}px`;centerTab();});
  panels.forEach(panel=>observer.observe(panel));if(tabBar)observer.observe(tabBar);
  update(active,true);
  return {go:index=>update(index,true),get index(){return active;}};
}
