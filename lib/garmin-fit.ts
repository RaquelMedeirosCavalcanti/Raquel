import {Decoder,Stream} from '@garmin/fitsdk';
import {unzipSync} from 'fflate';
import {fitIntervals,type GarminInterval} from './garmin-intervals.ts';
const MAX_FIT_BYTES=2*1024*1024;
// Decode only bounded files and retain only lap/workout fields in persisted data.
// GPS tracks and personal profile data never leave this function.
export function decodeGarminActivity(bytes:Uint8Array,fallbackSteps:Record<string,any>[]=[]):GarminInterval[]{
 let data=bytes;
 if(bytes[0]===0x50&&bytes[1]===0x4b){
  let selected=false;
  const files=unzipSync(bytes,{filter:file=>{
   if(selected||!/\.fit$/i.test(file.name)||file.originalSize>MAX_FIT_BYTES)return false;
   selected=true;return true;
  }});
  const match=Object.values(files)[0];if(!match)throw Error('Arquivo FIT indisponível.');data=match;
 }
 if(data.length>MAX_FIT_BYTES)throw Error('Arquivo FIT muito grande.');
 const decoder=new Decoder(Stream.fromByteArray(data));
 if(!decoder.isFIT()||!decoder.checkIntegrity())throw Error('Arquivo FIT inválido.');
 let count=0;
 const {messages,errors}=decoder.read({mergeHeartRates:false,expandComponents:false,convertDateTimesToDates:false,mesgListener:()=>{if(++count>25000)throw Error('Atividade muito extensa.');}});
 if(errors.length)throw Error('Não foi possível ler todas as etapas.');
 const laps=messages.lapMesgs||[],steps=messages.workoutStepMesgs||[];
 if(laps.length>500)throw Error('Atividade com muitas voltas.');
 // A run file has one session. Do not mix laps from multisport sessions.
 if((messages.sessionMesgs?.length||0)>1)return [];
 const sport=messages.sessionMesgs?.[0]?.sport;
 if(sport&&sport!=='running')return [];
 return fitIntervals(laps,steps.length?steps:fallbackSteps);
}
