import {prepareCountModel,installCountModels,validateCounts} from './forecast-count.mjs';
self.onmessage=event=>{const {id,data,date,zone,version}=event.data;try{
 installCountModels(data.trainedModel?[data.trainedModel]:[]);
 const artifact=prepareCountModel(data.days,date,zone);
 // Validation is work on facts/cutoff, never on the edited scenario.
 if(!artifact.validation)artifact.validation=validateCounts(data.days,date,version,zone);
 self.postMessage({id,artifact});
}catch(error){self.postMessage({id,error:error.message});}};
