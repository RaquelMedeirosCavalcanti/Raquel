'use client';
import {distanceText} from '../lib/distances';
import {useEffect,useRef,useState} from 'react';
import {Watch,RefreshCw,Check,Pause} from 'lucide-react';
import {sessionKind} from '../lib/modalities';
import type {SyncState} from '../lib/garmin-sync';
import {type Session,shortDate,timeText} from '../lib/runs';

const stamp=(value?:string)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Ainda não realizada';
export function GarminConnection({ready,visible,data,updated,children}:{ready:boolean;visible:boolean;data:Session[];updated:(sessions:Session[])=>void;children:React.ReactNode}){
 const [configured,setConfigured]=useState(false),[state,setState]=useState<SyncState|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const running=useRef(false),updatedRef=useRef(updated);updatedRef.current=updated;
 async function action(body:Record<string,unknown>,automatic=false){
  if(running.current)return;running.current=true;setBusy(true);
  try{
   const r=await fetch('/api/garmin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const b=await r.json() as {state:SyncState;sessions?:Session[];changed?:number;error?:string};if(!r.ok)throw Error(b.error||'Não foi possível sincronizar.');
   setState(b.state);setError('');if(b.sessions)updatedRef.current(b.sessions);
   if(!automatic)setMessage(body.action==='sync'?b.changed?`${b.changed} atividade(s) sincronizada(s).`:'Consulta concluída. Nenhuma atividade ou etapa nova para atualizar.':body.action==='toggle'?(body.enabled?'Sincronização ativada.':'Sincronização pausada.'):'Atividade resolvida.');
  }catch(e){setError((e as Error).message)}finally{setBusy(false);running.current=false;}
 }
 useEffect(()=>{
  if(!ready)return;let active=true;
  async function check(){
   try{const r=await fetch('/api/garmin',{cache:'no-store'}),b=await r.json() as {state:SyncState;configured:boolean;error?:string};if(!r.ok)throw Error(b.error||'Falha ao verificar a conexão.');if(!active)return;setConfigured(b.configured);setState(b.state);if(b.configured&&b.state.enabled)await action({action:'sync'},true);}
   catch(e){if(active)setError((e as Error).message)}
  }
  check();const timer=setInterval(check,5*60000);
  const onVisible=()=>{if(document.visibilityState==='visible')check()};document.addEventListener('visibilitychange',onVisible);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible)};
 },[ready]);
 if(!visible)return configured&&state?<div className="garmin-status-strip"><Watch size={16}/><span>{busy?'Consultando Garmin…':state.enabled?'Garmin · baixa automática ativa':'Garmin · sincronização pausada'}</span>{(error||state.error)?<span role="status">Consulta pendente · veja a aba Garmin</span>:state.review.length>0?<span>{state.review.length} atividade(s) para revisar na aba Garmin</span>:state.lastSuccess?<small>Última consulta: {stamp(state.lastSuccess)}</small>:null}</div>:null;
 return <>
 <section className="plan-intro"><div><span className="small-kicker">FORERUNNER 55 · GARMIN CONNECT</span><h2>Registre sua atividade e sincronize com o Garmin Connect.</h2><p>O Meu ritmo importa corridas, musculação, caminhadas e Pilates. Nas corridas e na musculação, dá baixa no treino do mesmo dia quando a correspondência é única. Caminhadas e Pilates aparecem nas suas próprias abas e entram nos totais da Visão Geral.</p></div><Watch size={38}/></section>
 <section className="panel garmin-panel"><div className="panel-heading"><div><h2>{configured?'Sincronização de atividades':'Verifique sua conexão'}</h2><p>{configured?'Sua chave pessoal está protegida no servidor.':'A consulta automática precisa de uma chave pessoal Garmin configurada no servidor.'}</p></div><span className={'badge '+(state?.enabled&&configured?'completed':'planned')}>{state?.enabled&&configured?'Ativa':'Pendente / pausada'}</span></div>
 <ol className="garmin-flow"><li>Registre a corrida, musculação, caminhada ou sessão de Pilates no Garmin e salve.</li><li>Abra o Garmin Connect no celular e aguarde a atividade aparecer.</li><li>O Meu ritmo organiza cada modalidade e registra os dados disponíveis, dando baixa nas corridas e na musculação correspondentes ao plano. Na musculação, importa tempo, FC média e calorias sem alterar exercícios, séries, cargas ou repetições.</li></ol>
 <div className="garmin-sync-summary"><div><span>Última consulta bem-sucedida</span><strong>{stamp(state?.lastSuccess)}</strong></div><div><span>Automático a partir de</span><strong>{state?shortDate(state.since):'—'}</strong></div><div><span>Atividades para revisar</span><strong>{state?.review.length??0}</strong></div></div>
 <p className="field-help">Com o site aberto, a consulta é automática, com intervalo mínimo de 15 minutos. A consulta com o site fechado depende da rotina em segundo plano conectada ao Meu ritmo. Não é instantâneo: a atividade precisa chegar primeiro ao Garmin Connect.</p>
 <div className="training-actions"><button className="btn primary" disabled={!ready||!configured||busy||!state?.enabled} onClick={()=>action({action:'sync',force:true})}><RefreshCw size={16}/>{busy?'Sincronizando…':'Sincronizar agora'}</button><button className="btn secondary" disabled={!ready||!configured||busy||!state} onClick={()=>action({action:'toggle',enabled:!state?.enabled})}>{state?.enabled?<Pause size={16}/>:<Check size={16}/>}{state?.enabled?'Pausar automático':'Ativar automático'}</button></div>
 {(error||state?.error)&&<p className="form-error" role="alert">{error||state?.error} Seus registros foram preservados. A próxima consulta tentará novamente.</p>}{message&&<p className="form-info" role="status">{message}</p>}
 <p className="field-help">Nos detalhes do treino, consulte aquecimento, corrida, recuperações e desaquecimento, quando registrados pelo Garmin. O pace de cada etapa aparece separado do pace total. Treinos antigos já vinculados também recebem os detalhes, em lotes a cada sincronização.</p>
 <p className="below-note">Uma corrida diferente do planejado também pode dar baixa: “Realizado” confirma o registro, não o cumprimento de todas as etapas. Você pode editar a realização para “Adaptado” ou “Leve”.</p>
 </section>
 {!!state?.review.length&&<section className="panel garmin-panel"><h2>Atividades que precisam da sua escolha</h2><p>Estas atividades ainda não entram nos totais. Vincule a um treino, registre como atividade avulsa ou ignore uma duplicidade.</p>{state.review.map(item=><ReviewRow key={item.session.sourceId} item={item} data={data} busy={busy} resolve={(planId,ignore)=>action({action:'resolve',sourceId:item.session.sourceId,planId,ignore})}/>)}</section>}
 <details className="panel garmin-panel"><summary><strong>Buscar outras atividades ou consultar o histórico</strong></summary>{children}</details>
 </>;
}
function ReviewRow({item,data,busy,resolve}:{item:SyncState['review'][number];data:Session[];busy:boolean;resolve:(planId?:string,ignore?:boolean)=>void}){
 const [target,setTarget]=useState('');const s=item.session;
 const plans=data.filter(x=>x.hasPlan&&sessionKind(x)===sessionKind(s)&&!x.sourceId&&x.date<=s.actualDate).sort((a,b)=>b.date.localeCompare(a.date));
 return <div className="garmin-review"><div><strong>{shortDate(s.actualDate)} · {s.title}</strong><p>{s.distance!=null?distanceText(s.distance)+' km · ':''} {timeText(s.time)} · {s.avgHr??'—'} bpm</p><p className="field-help">{item.reason}</p></div><label>Vincular realização<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Registrar como atividade avulsa</option>{plans.map(p=><option key={p.id} value={p.id}>{shortDate(p.date)} · {p.title}{p.status!=='planned'?' · substituir realização':''}</option>)}</select></label><div className="training-actions"><button className="btn primary" disabled={busy||!s.time||(sessionKind(s)==='run'&&!s.distance)} onClick={()=>resolve(target||undefined)}>{target?'Vincular e dar baixa':'Registrar atividade'}</button><button className="btn secondary" disabled={busy} onClick={()=>resolve(undefined,true)}>Ignorar duplicidade</button></div></div>;
}
