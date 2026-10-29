import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyState} from '../web/core.mjs';
import {forecastClock,saveForecastHours} from '../web/forecast.mjs';
import {mountForecast} from '../web/forecast-ui.mjs';

// Only the simple forecast's DOM contract is needed here. Layout, pointer input,
// and browser rendering remain the responsibility of the existing UI tests.
class Element {
  constructor(attributes) {
    this.value=/\bvalue="([^"]*)"/.exec(attributes)?.[1]??'';
    this.hidden=/\bhidden(?:\s|$)/.test(attributes);
    this.textContent='';
    this.listeners=new Map();
    this.attributes=new Map();
    this.classList={toggle(){}};
  }
  addEventListener(type,listener) {
    if(!this.listeners.has(type))this.listeners.set(type,[]);
    this.listeners.get(type).push(listener);
  }
  dispatchEvent(event) {
    for(const listener of this.listeners.get(event.type)??[])listener(event);
    this['on'+event.type]?.(event);
    return true;
  }
  closest() {return null;}
  setAttribute(name,value) {this.attributes.set(name,String(value));}
  removeAttribute(name) {this.attributes.delete(name);}
}

class Root {
  set innerHTML(html) {
    this.elements=new Map();
    for(const tag of html.matchAll(/<\w+\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
      this.elements.set('#'+tag[2],new Element(tag[1]));
    }
  }
  querySelector(selector) {return this.elements.get(selector)??null;}
  // The regression uses text input, so interval/slider and legacy-tab binding
  // are deliberately outside this fixture's scope.
  querySelectorAll() {return [];}
  input(id,value) {
    const element=this.querySelector('#'+id);
    assert.ok(element,`Missing input ${id}`);
    element.value=value;
    element.dispatchEvent(new Event('input',{bubbles:true}));
  }
}

class Timers {
  now=0;
  nextId=1;
  pending=new Map();
  setTimeout=(callback,delay=0,...args)=>{
    const id=this.nextId++;
    this.pending.set(id,{callback,args,delay,at:this.now+delay});
    return id;
  };
  clearTimeout=id=>{this.pending.delete(id);};
  count(delay) {return [...this.pending.values()].filter(timer=>timer.delay===delay).length;}
  advance(milliseconds) {
    const until=this.now+milliseconds;
    for(;;) {
      const next=[...this.pending].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      const [id,timer]=next;
      this.pending.delete(id);
      this.now=timer.at;
      timer.callback(...timer.args);
    }
    this.now=until;
  }
}

function fixture(t) {
  const timers=new Timers(),root=new Root();
  const originals={setTimeout:globalThis.setTimeout,clearTimeout:globalThis.clearTimeout,window:Object.getOwnPropertyDescriptor(globalThis,'window')};
  globalThis.setTimeout=timers.setTimeout;
  globalThis.clearTimeout=timers.clearTimeout;
  globalThis.window={scrollTo(){}};
  t.after(()=>{
    globalThis.setTimeout=originals.setTimeout;
    globalThis.clearTimeout=originals.clearTimeout;
    if(originals.window)Object.defineProperty(globalThis,'window',originals.window);
    else delete globalThis.window;
  });
  let state=emptyState(),attempts=0,commits=0,failure=null;
  const date=forecastClock(state.forecast).date;
  state={...state,forecast:saveForecastHours(state.forecast,date,840,480)};
  const mount=()=>mountForecast({
    root,getState:()=>state,
    commit:next=>{
      attempts++;
      if(failure)throw failure;
      state=next;
      commits++;
    },
    heading:()=>'<button id="goBack" type="button"></button>',
    nav(){},leave(){},notify(){}
  });
  return {root,timers,date,mount,get state(){return state;},get attempts(){return attempts;},get commits(){return commits;},set failure(error){failure=error;}};
}

test('flush persists changed hours before immediate forecast re-entry and cancels the old save',t=>{
  const f=fixture(t),screen=f.mount();
  assert.equal(f.root.querySelector('#todayWorkHours').value,'8');
  f.root.input('todayWorkHours','9');
  assert.equal(f.state.forecast.weekConfig.workingMin,480,'Input alone still awaits autosave');
  assert.equal(f.timers.count(500),1);

  assert.equal(screen.flush(),true);
  assert.equal(f.state.forecast.weekConfig.workingMin,540);
  assert.equal(f.state.forecast.plans[f.date].workingMin,540);
  assert.equal(f.state.forecast.plans[f.date].slotMin,840);
  assert.equal(f.timers.count(500),0);
  assert.equal(f.commits,1);

  const reopened=f.mount();
  assert.equal(f.root.querySelector('#todayWorkHours').value,'9');
  assert.equal(f.root.querySelector('#todaySlotHours').value,'14');
  assert.equal(reopened.flush(),true);
  assert.equal(f.commits,1,'Leaving an unchanged screen must not write again');
  f.timers.advance(5000);
  assert.equal(f.commits,1,'An old screen must not write after re-entry');
  assert.equal(f.state.forecast.weekConfig.workingMin,540);
  assert.equal(f.root.querySelector('#todayWorkHours').value,'9');
});

test('flush cancels a pending autosave and commits only the latest valid input',t=>{
  const f=fixture(t),screen=f.mount();
  f.root.input('todayWorkHours','9');
  f.timers.advance(200);
  f.root.input('todayWorkHours','10');
  assert.equal(f.timers.count(500),1);
  assert.equal(screen.flush(),true);
  assert.equal(f.state.forecast.weekConfig.workingMin,600);
  f.timers.advance(5000);
  assert.equal(f.commits,1);
  assert.equal(f.state.forecast.weekConfig.workingMin,600);
});

test('remaining on the screen still autosaves once after the debounce',t=>{
  const f=fixture(t),screen=f.mount();
  f.root.input('todayWorkHours','9');
  f.timers.advance(499);
  assert.equal(f.commits,0);
  assert.equal(f.state.forecast.weekConfig.workingMin,480);
  f.timers.advance(1);
  assert.equal(f.commits,1);
  assert.equal(f.state.forecast.weekConfig.workingMin,540);
  assert.equal(f.timers.count(500),0);
  assert.equal(screen.flush(),true);
  f.timers.advance(5000);
  assert.equal(f.commits,1);
});

test('failed flush preserves persisted state and the draft, cancels autosave, and can be retried',t=>{
  const f=fixture(t),screen=f.mount();
  const before=f.state,serialized=JSON.stringify(before);
  f.root.input('todayWorkHours','9');
  f.failure=new Error('Не удалось сохранить данные на телефоне.');

  assert.equal(screen.flush(),false);
  assert.equal(f.state,before);
  assert.equal(JSON.stringify(f.state),serialized);
  assert.equal(f.root.querySelector('#todayWorkHours').value,'9');
  assert.equal(f.root.querySelector('#forecastError').hidden,false);
  assert.match(f.root.querySelector('#forecastError').textContent,/Не удалось сохранить/);
  assert.equal(f.timers.count(500),0);
  assert.equal(f.attempts,1);
  f.timers.advance(5000);
  assert.equal(f.attempts,1,'A failed navigation must not leave a delayed write');

  f.failure=null;
  assert.equal(screen.flush(),true);
  assert.equal(f.commits,1);
  assert.equal(f.state.forecast.weekConfig.workingMin,540);
  assert.equal(f.root.querySelector('#todayWorkHours').value,'9');
});

test('an invalid duration pair blocks flush without losing the draft or writing stale input',t=>{
  const f=fixture(t),screen=f.mount();
  const before=f.state,serialized=JSON.stringify(before);
  f.root.input('todayWorkHours','9');
  f.root.input('todayWorkHours','15');

  assert.equal(screen.flush(),false);
  assert.equal(f.state,before);
  assert.equal(JSON.stringify(f.state),serialized);
  assert.equal(f.root.querySelector('#todayWorkHours').value,'15');
  assert.equal(f.root.querySelector('#forecastError').hidden,false);
  assert.match(f.root.querySelector('#forecastError').textContent,/не может превышать/);
  f.timers.advance(5000);
  assert.equal(f.attempts,0,'The previous valid draft must not be saved after invalid input');

  f.root.input('todayWorkHours','9');
  assert.equal(screen.flush(),true);
  assert.equal(f.state.forecast.weekConfig.workingMin,540);
  assert.equal(f.commits,1);
  assert.equal(f.timers.count(500),0);
});
