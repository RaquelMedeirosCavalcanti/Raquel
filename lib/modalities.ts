import type {Session} from './runs.ts';
export const isStrengthType=(value:string)=>/^(strength(?:_training)?|weight_training|musculamento|musculacao|misculamento)$/.test(value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replaceAll(' ','_'));
// Older Garmin imports used 'other'; keep them visible in their modality tab.
export function sessionKind(s:Pick<Session,'kind'|'modality'>&{title?:string}):NonNullable<Session['kind']>{
 if(s.kind&&s.kind!=='other')return s.kind;
 const label=(s.modality||'').trim().toLowerCase();
 if(/^(caminhada|walking|indoor walking|treadmill walking)(\b|_)/.test(label))return 'walk';
 if(isStrengthType(label))return 'strength';
 if(['','other','outros'].includes(label)&&isStrengthType(s.title||''))return 'strength';
 if(/^pilates\b/.test(label))return 'pilates';
 return s.kind||'run';
}
export function modalityLabel(s:Pick<Session,'kind'|'modality'>){
 const kind=sessionKind(s);
 return ({run:'Corrida',strength:'Musculação',walk:'Caminhada',pilates:'Pilates',other:s.modality||'Outra atividade'})[kind];
}
export const automaticActivity=(s:Session)=>['run','strength','walk','pilates'].includes(sessionKind(s));
