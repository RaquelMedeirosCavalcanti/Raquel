'use client';
import {useEffect,useRef,useState} from 'react';
import {Copy,Eye,Link2,Share2,X} from 'lucide-react';

export function useDialogFocus(close:()=>void){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';ref.current?.focus();
  const onKey=(e:KeyboardEvent)=>{
   if(e.key==='Escape')close();
   if(e.key==='Tab'&&ref.current){const items=Array.from(ref.current.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input')).filter(el=>el.offsetParent!==null);if(!items.length)return;
    if(e.shiftKey&&(document.activeElement===items[0]||document.activeElement===ref.current)){e.preventDefault();items.at(-1)?.focus()}
    else if(!e.shiftKey&&document.activeElement===items.at(-1)){e.preventDefault();items[0]?.focus()}
   }
  };
  document.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',onKey);previous?.focus()};
 },[close]);
 return ref;
}

export function ShareDialog({close}:{close:()=>void}){
 const [path,setPath]=useState<string|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const ref=useDialogFocus(close);const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{let active=true;fetch('/api/shares',{cache:'no-store'}).then(async r=>{const b=await r.json() as {path:string|null;error?:string};if(!r.ok)throw Error(b.error||'Não foi possível carregar o compartilhamento.');if(active)setPath(b.path)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const url=path?new URL(path,window.location.origin).href:'';
 async function update(method:'POST'|'DELETE'){
  setBusy(true);setError('');setMessage('');
  try{const r=await fetch('/api/shares',{method});const b=await r.json() as {path:string|null;error?:string};if(!r.ok)throw Error(b.error||'Não foi possível atualizar o compartilhamento.');setPath(b.path||null);setMessage(method==='DELETE'?'Link cancelado. Ele não poderá mais carregar seus registros.':'Link de consulta criado. Agora você pode copiá-lo.');}
  catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function copy(){setError('');try{await navigator.clipboard.writeText(url);setMessage('Link copiado. Envie para a pessoa autorizada.')}catch{input.current?.focus();input.current?.select();setMessage('Selecione e copie o link no campo acima.')}}
 async function share(){if(!navigator.share)return copy();try{await navigator.share({title:'Meu ritmo · Kel — somente leitura',text:'Acompanhe meus treinos e minha evolução.',url})}catch(e){if((e as Error).name!=='AbortError')await copy()}}
 return <div className="modal-overlay"><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="share-title" className="modal share-dialog"><div className="modal-header"><div><span className="small-kicker">COMPARTILHAR COM ALGUÉM</span><h2 id="share-title">Seus treinos, só para acompanhar.</h2></div><button aria-label="Fechar compartilhamento" className="icon-button" onClick={close}><X size={21}/></button></div><div className="modal-body"><div className="share-permissions"><Eye size={24}/><div><strong>Versão somente leitura</strong><p>A pessoa verá seu resumo, evolução, planejamento, exercícios, cargas e observações. Seus registros continuam editáveis apenas por você.</p></div></div><div className="share-instructions"><strong>Como compartilhar</strong><ol><li>Crie e copie seu link de consulta.</li><li>Para autorizar uma nova pessoa, informe no ChatGPT o e-mail que ela usa para entrar.</li><li>Envie o link para ela abrir com essa mesma conta.</li></ol><p>O link acompanha seus registros atualizados e funciona apenas para contas autorizadas.</p></div>{loading?<p role="status">Carregando o compartilhamento…</p>:path?<div className="share-link-box"><label htmlFor="share-url">Seu link de consulta</label><input id="share-url" ref={input} readOnly value={url} onFocus={e=>e.target.select()}/><div className="share-actions"><button className="btn primary" disabled={busy} onClick={copy}><Copy size={16}/>Copiar link</button><button className="btn secondary" disabled={busy} onClick={share}><Share2 size={16}/>Enviar link</button><a className="text-button" href={path} target="_blank" rel="noreferrer">Ver como visitante</a></div><button className="text-button revoke-link" disabled={busy} onClick={()=>update('DELETE')}>{busy?'Atualizando…':'Cancelar este link'}</button><p className="field-help">Cancelar impede novas consultas pelo link. Para voltar a compartilhar, crie outro link.</p></div>:<button className="btn primary" disabled={busy} onClick={()=>update('POST')}><Link2 size={17}/>{busy?'Criando…':'Criar link somente leitura'}</button>}{error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status" className="share-message">{message}</p>}</div><div className="modal-footer"><button className="btn secondary" onClick={close}>Concluir</button></div></div></div>
}
