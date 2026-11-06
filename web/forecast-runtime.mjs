import {setCountTraining,cachedCountModel,countModelKey,installCountModels} from './forecast-count.mjs';
import {forecastClock,planDay,profileFor,FORECAST_VERSION} from './forecast.mjs';
setCountTraining(false); // The UI is inference-only; preparation belongs to the worker.
let worker=null,sequence=0;const jobs=new Map(),pending=new Map();
function getWorker(){if(worker)return worker;worker=new Worker(new URL('./forecast-worker-bundle.js',import.meta.url));
 worker.onmessage=event=>{const {id,artifact,error}=event.data,job=jobs.get(id);if(!job)return;jobs.delete(id);if(error)job.reject(new Error(error));else{installCountModels([artifact]);job.resolve(artifact);}};
 worker.onerror=event=>{console.error('Forecast worker',event.message,event.filename,event.lineno,event.colno);for(const job of jobs.values())job.reject(new Error('Не удалось подготовить прогноз. Откройте приложение повторно.'));jobs.clear();worker.terminate();worker=null;};return worker;}
export function prepareForecast(data){
 const date=forecastClock(data).date,zone=planDay(data,date).zone??profileFor(data,date)?.zone??'',key=countModelKey(data.days,date,zone);
 installCountModels(data.trainedModel?[data.trainedModel]:[]);
 const ready=cachedCountModel(data.days,date,zone);if(ready?.validation)return Promise.resolve(ready);if(pending.has(key))return pending.get(key);
 const task=new Promise((resolve,reject)=>{try{const id=++sequence;jobs.set(id,{resolve,reject});getWorker().postMessage({id,data,date,zone,version:FORECAST_VERSION});}catch(error){reject(error);}}).finally(()=>pending.delete(key));pending.set(key,task);return task;
}
export function forecastKey(data){const date=forecastClock(data).date;return countModelKey(data.days,date,planDay(data,date).zone??profileFor(data,date)?.zone??'');}
