'use client';
import {Fragment,useState} from 'react';
import {ChevronDown,Watch} from 'lucide-react';
import {type Session,timeText} from '../lib/runs';
import {sessionKind} from '../lib/modalities';
import {intervalLabels,type IntervalType} from '../lib/garmin-intervals';
const km=(v:number|null)=>v===null?'—':v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const measuredTime=(v:number|null)=>{
 if(v===null)return '—';const tenths=Math.round(v*10),seconds=Math.floor(tenths/10);
 const base=timeText(seconds);return tenths%10?base+','+tenths%10:base;
};
const pace=(time:number|null,distance:number|null)=>time&&distance?timeText(time/distance):'—';
export function GarminIntervals({session:s,compact=false}:{session:Session;compact?:boolean}){
 const [filter,setFilter]=useState<IntervalType|'all'>('all'),[expanded,setExpanded]=useState<number[]>([]);
 if(sessionKind(s)!=='run'||!s.sourceId?.startsWith('garmin:')||!['completed','adapted','light'].includes(s.status))return null;
 const d=s.garminDetails,groups=d?.intervals||[],types=Array.from(new Set(groups.map(g=>g.type)));
 const active=groups.filter(g=>g.type==='run'),hasActive=active.length>0&&active.every(g=>g.time!==null&&g.distance!==null);
 const runTime=hasActive?active.reduce((n,g)=>n+g.time!,0):null,runDistance=hasActive?active.reduce((n,g)=>n+g.distance!,0):null;
 const body=<div className="garmin-interval-body">
  {!!groups.length&&<>
   <div className="interval-pace-summary"><div><span>Pace total</span><strong>{pace(s.time,s.distance)} <small>/km</small></strong></div>{hasActive&&<div><span>Pace nas etapas de corrida</span><strong>{pace(runTime,runDistance)} <small>/km</small></strong></div>}</div>
   {types.length>1&&<div className="interval-filters" aria-label="Filtrar etapas"><button type="button" aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>Tudo</button>{types.map(type=><button key={type} type="button" aria-pressed={filter===type} onClick={()=>setFilter(type)}>{intervalLabels[type]}</button>)}</div>}
   <div className="interval-table-wrap"><table className="interval-table"><caption className="sr-only">Resultados por etapa registrados no Garmin</caption><thead><tr><th scope="col">Etapa</th><th scope="col">Tempo</th><th scope="col">Distância<br/><small>km</small></th><th scope="col">Pace médio<br/><small>min/km</small></th><th scope="col">FC média<br/><small>bpm</small></th></tr></thead><tbody>{groups.filter(g=>filter==='all'||g.type===filter).map(g=><Fragment key={g.index}><tr className={'interval-row interval-'+g.type}><th scope="row">{g.laps&&g.laps.length>1?<button type="button" className="interval-expand" aria-expanded={expanded.includes(g.index)} onClick={()=>setExpanded(p=>p.includes(g.index)?p.filter(i=>i!==g.index):[...p,g.index])}><ChevronDown size={15}/>{g.label}<small>{g.laps.length} voltas</small></button>:<span className="interval-name">{g.label}{g.type==='other'?' '+(g.index+1):''}</span>}{d?.status==='summary'&&(g.count||0)>1&&<small className="interval-count">{g.count} intervalos agrupados</small>}</th><td>{measuredTime(g.time)}</td><td>{km(g.distance)}</td><td>{pace(g.time,g.distance)}</td><td>{g.avgHr===null?'—':Math.round(g.avgHr)}</td></tr>{expanded.includes(g.index)&&g.laps?.map((l,lapIndex)=><tr className="interval-lap" key={'lap-'+l.index}><th scope="row">Volta {lapIndex+1}</th><td>{measuredTime(l.time)}</td><td>{km(l.distance)}</td><td>{pace(l.time,l.distance)}</td><td>{l.avgHr===null?'—':Math.round(l.avgHr)}</td></tr>)}</Fragment>)}</tbody><tfoot><tr><th scope="row">Total da atividade</th><td>{measuredTime(s.time)}</td><td>{km(s.distance)}</td><td>{pace(s.time,s.distance)}</td><td>{s.avgHr?Math.round(s.avgHr):'—'}</td></tr></tfoot></table></div>
   <p className="field-help">{d?.status==='summary'?'Resumo por tipo de etapa disponível no Garmin. As voltas individuais ainda não estão disponíveis.':'Abra uma etapa com várias voltas para ver cada trecho.'} O total inclui a atividade inteira, mesmo com um filtro selecionado. As etapas mostram os dados originais do Garmin.</p>
  </>}
  {!groups.length&&<p className="field-help">{!d?'As etapas serão consultadas na próxima sincronização.':d.status==='error'?'Não foi possível consultar as etapas agora. Os totais estão preservados e a integração tentará novamente.':'O Garmin não disponibilizou etapas para esta atividade. Os totais estão preservados.'}</p>}
 </div>;
 return compact?<details className="garmin-intervals"><summary><Watch size={16}/><strong>Etapas realizadas · Garmin</strong><ChevronDown size={16}/></summary>{body}</details>:<section className="garmin-intervals"><h3><Watch size={16}/>Etapas realizadas · Garmin</h3>{body}</section>;
}
