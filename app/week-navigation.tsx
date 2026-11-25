'use client';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {addDays,monday,shortDate,today} from '../lib/runs';

export function WeekNavigation({start,title,label,onChange}:{start:string;title?:string;label?:string;onChange:(start:string)=>void}){
 const current=monday(today()),isCurrent=start===current;
 return <div className="plan-week-nav">
  <button className="icon-button" aria-label="Semana anterior" onClick={()=>onChange(addDays(start,-7))}><ChevronLeft size={20}/></button>
  <div><span>{label?label+' · ':''}{shortDate(start)} – {shortDate(addDays(start,6))} / {addDays(start,6).slice(0,4)}{isCurrent?' · SEMANA ATUAL':''}</span><h3>{title||'Atividades da semana'}</h3>{!isCurrent&&<button className="text-button current-week-button" onClick={()=>onChange(current)}>Voltar à semana atual</button>}</div>
  <button className="icon-button" aria-label="Próxima semana" onClick={()=>onChange(addDays(start,7))}><ChevronRight size={20}/></button>
 </div>;
}
