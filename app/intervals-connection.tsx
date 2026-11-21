'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Check,Send,Link2} from 'lucide-react';
import {type Session,today,addDays,shortDate,timeText} from '../lib/runs';
import {previewWorkouts} from '../lib/intervals-workouts';
type Connection={athlete:{id:string;name:string};automatic:boolean;connectedAt:string;lastSuccess?:string;lastCount?:number;sentCount:number;error?:string;issues?:string[]};
type Result={ready:boolean;connected:boolean;connection:Connection|null;sent?:number;unchanged?:number;error?:string};
const stamp=(value?:string)=>value?new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}):'Nenhum envio confirmado';
export function IntervalsConnection({ready,visible,data}:{ready:boolean;visible:boolean;data:Session[]}){
 const [state,setState]=useState<Result|null>(null),[key,setKey]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[disconnecting,setDisconnecting]=useState(false);
 const [from,setFrom]=useState(today()),[to,setTo]=useState(addDays(today(),90)),[excluded,setExcluded]=useState<string[]>([]);
 const running=useRef(false);
 const preview=useMemo(()=>previewWorkouts(data,from,to),[data,from,to]);
 const selected=preview.filter(p=>!p.error&&!excluded.includes(p.id));
 async function action(body:Record<string,unknown>,silent=false){
  if(running.current)return;running.current=true;setBusy(true);if(!silent){setError('');setMessage('');}
  try{
   const response=await fetch('/api/intervals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),result=await response.json() as Result;
   if(!response.ok)throw Error(result.error||'Não foi possível concluir a operação.');
   setState(result);setError('');
   if(body.action==='connect'){setKey('');setMessage(`${result.connection?.athlete.name}: conexão concluída. Revise e envie um treino para testar antes de ativar o automático.`);}
   else if(body.action==='disconnect'){setDisconnecting(false);setMessage('Conexão removida. Os treinos já enviados continuam no Intervals.icu.');}
   else if(body.action==='automatic')setMessage(body.automatic?'Envio automático ativado. Os treinos de corrida planejados serão enviados e atualizados ao abrir o app e pela rotina de hora em hora.':'Envio automático pausado. Você pode continuar enviando manualmente.');
   else if(!silent)setMessage(result.sent?`${result.sent} treino(s) recebido(s) no Intervals.icu. Abra o Garmin Connect e sincronize o relógio para conferir.`:`Nenhuma alteração para enviar. ${result.unchanged||0} treino(s) já estavam atualizados no Intervals.icu.`);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível concluir a operação.');}
  finally{running.current=false;setBusy(false);}
 }
 useEffect(()=>{
  if(!ready)return;let active=true;
  async function check(){
   if(running.current)return;
   try{
    const response=await fetch('/api/intervals',{cache:'no-store'}),result=await response.json() as Result;
    if(!response.ok)throw Error(result.error||'Não foi possível consultar o Intervals.icu.');
    if(!active)return;setState(result);
    if(result.connected&&result.connection?.automatic)await action({action:'sync',automatic:true},true);
   }catch(e){if(active)setError(e instanceof Error?e.message:'Não foi possível consultar o Intervals.icu.');}
  }
  check();const timer=setInterval(check,15*60000),onVisible=()=>{if(document.visibilityState==='visible')check()};
  document.addEventListener('visibilitychange',onVisible);
  return()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
 },[ready]);
 if(!visible)return null;
 const connection=state?.connection;
 return <section className="panel garmin-panel intervals-panel" aria-labelledby="intervals-heading">
  <div className="panel-heading"><div><span className="small-kicker">MEU RITMO · INTERVALS.ICU · GARMIN</span><h2 id="intervals-heading">Enviar treinos de corrida para o Garmin</h2><p>Conecte o Intervals.icu para transferir seus planejamentos com etapas e metas de ritmo.</p></div><span className={'badge '+(state?.connected?'completed':'planned')}>{state?.connected?'Conectado':'Configurar'}</span></div>
  {!state&&<p role="status">Verificando conexão…</p>}
  {state&&!state.ready&&<p className="form-error">A conexão precisa ser habilitada no servidor antes do uso.</p>}
  {!state?.connected&&<>
   <ol className="garmin-flow"><li>No Intervals.icu, mantenha marcada a opção “Carregar treinos preparados” na conexão Garmin.</li><li>Abra as configurações do Intervals.icu e procure “Configurações de desenvolvedor” / “Developer Settings”. Gere uma chave de API.</li><li>Cole a chave abaixo e conecte. Depois envie apenas um treino e confira suas etapas no Garmin antes de ativar o automático.</li></ol>
   <a className="btn secondary" href="https://intervals.icu/settings" target="_blank" rel="noreferrer">Abrir configurações do Intervals.icu</a>
   <form className="garmin-form" onSubmit={e=>{e.preventDefault();action({action:'connect',key,automatic:false});}}>
    <label htmlFor="intervals-key">Chave de API do Intervals.icu<input id="intervals-key" type="password" autoComplete="off" required maxLength={4096} value={key} onChange={e=>setKey(e.target.value)} placeholder="Cole sua chave aqui" disabled={busy}/></label>
    <p className="field-help">A chave é validada e armazenada com criptografia no servidor. Você pode revogá-la nas configurações do Intervals.icu.</p>
    <button className="btn primary" disabled={!ready||!state?.ready||busy||!key.trim()}><Link2 size={16}/>{busy?'Conectando…':'Conectar Intervals.icu'}</button>
   </form>
  </>}
  {connection&&<>
   <div className="garmin-sync-summary"><div><span>Conta conectada</span><strong>{connection.athlete.name}</strong></div><div><span>Último envio ao Intervals.icu</span><strong>{stamp(connection.lastSuccess)}</strong></div><div><span>Treinos enviados</span><strong>{connection.sentCount}</strong></div></div>
   <label className="intervals-check"><input type="checkbox" disabled={busy} checked={connection.automatic} onChange={e=>{action({action:'automatic',automatic:e.target.checked});}}/>Atualizar automaticamente os treinos planejados</label>
   <p className="field-help">Quando ativo, envia as corridas futuras planejadas e atualiza as que mudaram, ao abrir o app (intervalo mínimo de 15 minutos) e pela rotina de hora em hora. Primeiro teste um treino. O planejamento original permanece no Meu Ritmo.</p>
  </>}
  <div className="intervals-preview">
   <h3>Revise os treinos antes do envio</h3>
   <div className="form-grid"><label>De<input type="date" min={today()} max={to} value={from} onChange={e=>{setFrom(e.target.value);setExcluded([]);}}/></label><label>Até<input type="date" min={from} max={addDays(today(),365)} value={to} onChange={e=>{setTo(e.target.value);setExcluded([]);}}/></label></div>
   <p className="field-help">A lista inclui somente corridas planejadas de hoje em diante. Reenviar atualiza o mesmo treino no Intervals.icu. Confira lá antes de apagar manualmente um treino já sincronizado.</p>
   {preview.length>0?<>
    <div className="training-actions"><button className="text-button" type="button" onClick={()=>setExcluded([])} disabled={busy}>Selecionar todos</button><button className="text-button" type="button" onClick={()=>setExcluded(preview.map(p=>p.id))} disabled={busy}>Desmarcar todos</button></div>
    <div className="intervals-workouts">{preview.map(p=><div className="intervals-workout" key={p.id}><label className="intervals-check"><input type="checkbox" aria-label={`Enviar ${p.title} de ${shortDate(p.date)}`} disabled={busy||!!p.error} checked={!p.error&&!excluded.includes(p.id)} onChange={e=>setExcluded(ids=>e.target.checked?ids.filter(id=>id!==p.id):[...ids,p.id])}/><span><strong>{shortDate(p.date)} · {p.title}</strong>{p.error&&<span className="form-error">{p.error}</span>}</span></label>{p.description&&<details><summary>Conferir etapas e ritmos</summary><WorkoutStages session={data.find(s=>s.id===p.id)!}/></details>}</div>)}</div>
    <button type="button" className="btn primary" disabled={!ready||!state?.connected||busy||selected.length===0||selected.length>100} onClick={()=>action({action:'sync',from,to,ids:selected.map(p=>p.id)})}><Send size={16}/>{busy?'Aguarde…':`Enviar ${selected.length} treino(s) selecionado(s)`}</button>
   </>:<p>Nenhuma corrida planejada neste período.</p>}
  </div>
  {(error||connection?.error)&&<p className="form-error" role="alert">{error||connection?.error}</p>}
  {message&&<p className="form-info" role="status"><Check size={16}/>{message}</p>}
  {!!connection?.issues?.length&&<div role="status" className="form-error">{connection.issues.map((issue,i)=><p key={i}>{issue}</p>)}</div>}
  <p className="below-note">“Enviado” confirma o recebimento pelo Intervals.icu. A chegada ao Garmin depende da conexão e da janela de sincronização dessa plataforma. Confira o primeiro treino no Garmin Connect e no relógio, incluindo os limites de pace e a recuperação após a última repetição.</p>
  {connection&&<div className="intervals-disconnect">{disconnecting?<><p>Remover a chave e pausar os próximos envios? Os treinos já enviados continuam no Intervals.icu.</p><div className="training-actions"><button type="button" className="btn secondary" disabled={busy} onClick={()=>setDisconnecting(false)}>Manter conexão</button><button type="button" className="danger-button" disabled={busy} onClick={()=>action({action:'disconnect'})}>Desconectar</button></div></>:<button type="button" className="text-button" disabled={busy} onClick={()=>setDisconnecting(true)}>Desconectar Intervals.icu</button>}</div>}
 </section>;
}

function WorkoutStages({session}:{session:Session}){
 return session.steps?.length?<ol className="intervals-stages">{session.steps.map((step,i)=><li key={i}><strong>{step.label}</strong><p>{step.detail}</p></li>)}</ol>:<p className="field-help">Corrida · {session.plannedDistance?session.plannedDistance.toLocaleString('pt-BR')+' km':timeText(session.plannedTime)}{session.plannedPaceMin||session.plannedPace?' · '+timeText(session.plannedPaceMin??session.plannedPace)+'–'+timeText(session.plannedPaceMax??session.plannedPaceMin??session.plannedPace)+' min/km':''}</p>;
}
