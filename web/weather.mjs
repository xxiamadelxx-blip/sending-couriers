import {localClock,currentProfile} from './forecast.mjs';
const labels=['Утро','День','Вечер'],times=['09:00','14:00','20:00'];
export function weatherLocation(data,now=new Date()){
 const p=currentProfile(data,now);
 if(data.location?.weatherCity)return data.location;
 if(p?.weatherCity||p?.zone)return {weatherCity:p.weatherCity||p.zone,timezone:p.timezone,source:'profile'};
 const history=Object.values(data.days??{}).filter(d=>d.zone&&d.source!=='finance-slots').sort((a,b)=>a.date.localeCompare(b.date));
 const last=history.at(-1);if(last)return {weatherCity:last.zone,timezone:last.timezone??'Europe/Moscow',source:'history'};
 return {weatherCity:'',timezone:p?.timezone??'Europe/Moscow',source:'unknown'};
}
export function weatherCache(raw,profile,now=new Date()){
 if(raw?.provider!=='Open-Meteo'||raw.requestedCity!==profile.weatherCity||raw.timezone!==profile.timezone||!raw.hourly)throw new Error('Погода относится к другой местности или часовому поясу.');
 const h=raw.hourly;if(!Array.isArray(h.time)||!Array.isArray(h.temperature_2m)||!Array.isArray(h.weather_code)||h.time.length>100)throw new Error('Неполные погодные данные.');
 const days={};for(let i=0;i<h.time.length;i++){
  const stamp=String(h.time[i]),date=stamp.slice(0,10),part=times.indexOf(stamp.slice(11,16));if(part<0||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(stamp))continue;
  const temp=h.temperature_2m[i],code=h.weather_code[i];if(!Number.isFinite(temp)||temp< -100||temp>70||!Number.isInteger(code)||code<0||code>99)continue;
  if(!days[date])days[date]=[];days[date][part]={label:labels[part],temp,code};
 }
 if(!Object.values(days).some(v=>v.filter(Boolean).length===3))throw new Error('Погода недоступна: неполный прогноз.');
 return {provider:'Open-Meteo',city:String(raw.city??profile.weatherCity).slice(0,120),requestedCity:profile.weatherCity,timezone:profile.timezone,fetchedAt:now.toISOString(),days};
}
export function weatherParts(cache,profile,now=new Date()){
 const date=localClock(profile.timezone,now).date,valid=!!profile.weatherCity&&cache?.requestedCity===profile.weatherCity&&cache?.timezone===profile.timezone;
 const sourceDate=valid?(cache.days?.[date]?date:Object.keys(cache.days??{}).filter(d=>d<date).sort().at(-1)):null;
 const parts=labels.map((label,i)=>{const p=valid?cache.days?.[sourceDate]?.[i]:null;return {label,temp:Number.isFinite(p?.temp)?p.temp:null,code:Number.isInteger(p?.code)&&p.code>=0&&p.code<=99?p.code:null};});
 const available=parts.some(v=>v.temp!=null),stale=!available||sourceDate!==date||!Number.isFinite(Date.parse(cache?.fetchedAt))||now-new Date(cache.fetchedAt)>6*3600000;
 return {parts,available,sourceDate,stale,city:valid?String(cache.city):profile.weatherCity};
}
export function weatherSymbol(code){
 if(code==null)return '—';if(code===0)return '☀';if(code===1)return '🌤';if(code===2)return '⛅';if(code===3)return '☁';if([45,48].includes(code))return '≋';
 if([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code))return '☂';
 if([71,73,75,77,85,86].includes(code))return '❄';if([95,96,99].includes(code))return 'ϟ';return '—';
}
export function weatherDescription(code){
 if(code===0)return 'Ясно';if(code===1)return 'Преимущественно ясно';if(code===2)return 'Переменная облачность';if(code===3)return 'Пасмурно';
 const symbol=weatherSymbol(code);return {'≋':'Туман','☂':'Дождь','❄':'Снег','ϟ':'Гроза'}[symbol]??'Нет данных';
}
