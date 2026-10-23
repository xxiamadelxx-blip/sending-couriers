import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherCache,weatherParts,weatherSymbol} from '../web/weather.mjs';
test('weather is optional cached data with timezone/city validation and a stale fallback',()=>{
 const p={weatherCity:'Test',timezone:'Europe/Moscow'},now=new Date('2026-10-01T05:00:00Z'),raw={provider:'Open-Meteo',requestedCity:'Test',city:'Test City',timezone:p.timezone,hourly:{time:['2026-10-01T09:00','2026-10-01T14:00','2026-10-01T20:00'],temperature_2m:[5,8,4],weather_code:[0,3,61]}};
 const c=weatherCache(raw,p,now);assert.equal(weatherParts(c,p,now).stale,false);assert.deepEqual(weatherParts(c,p,now).parts.map(p=>p.temp),[5,8,4]);assert.equal(weatherParts(c,p,new Date('2026-10-02T05:00:00Z')).stale,true);assert.equal(weatherParts(c,{...p,weatherCity:'Other'},now).parts[0].temp,null);assert.throws(()=>weatherCache({...raw,timezone:'UTC'},p,now));assert.equal(weatherSymbol(null),'—');
});
