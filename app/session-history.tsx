'use client';
import {distanceText} from '../lib/distances';
import {ChevronRight} from 'lucide-react';
import {type Session,isDone,shortDate,timeText,statuses} from '../lib/runs';
import {sessionKind} from '../lib/modalities';
import {bounds,type Period} from '../lib/training-metrics';
export function SessionHistory({kind,data,date,period,setDate,setPeriod,open}:{kind:'run'|'strength';data:Session[];date:string;period:Period;setDate:(d:string)=>void;setPeriod:(p:Period)=>void;open:(s:Session)=>void}){
 const [start,end]=bounds(date,period);const rows=data.filter(s=>sessionKind(s)===kind&&isDone(s)&&s.actualDate>=start&&s.actualDate<=end).sort((a,b)=>b.actualDate.localeCompare(a.actualDate));
 return <section className="panel overview-details"><div className="panel-heading"><div><h2>Histórico de {kind==='run'?'corridas':'musculação'}</h2><p>Todos os registros realizados, incluindo atividades fora do planejamento.</p></div></div><div className="history-period"><div className="period-toolbar"><div className="segmented">{(['day','week','month'] as const).map(p=><button key={p} className={period===p?'selected':''} onClick={()=>setPeriod(p)}>{{day:'Dia',week:'Semana',month:'Mês'}[p]}</button>)}</div><label className="date-control">Data de referência<input aria-label="Data de referência do histórico" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></label></div></div>{rows.length?<div className="comparison-list">{rows.map(s=><button key={s.id} onClick={()=>open(s)}><div><strong>{shortDate(s.actualDate)} · {s.title}</strong><small>{s.distance?`${distanceText(s.distance)} km · `:''}{timeText(s.time)} · {s.avgHr??'—'} bpm · {s.calories??'—'} kcal</small></div><span className={'badge '+s.status}>{statuses[s.status]}</span><ChevronRight size={17}/></button>)}</div>:<div className="empty-state"><p>Nenhuma atividade realizada neste período.</p></div>}</section>;
}
