import type {Metadata} from 'next';
import Dashboard from '../tracker';
import {requireAppUser} from '../auth';
import {validShareToken} from '../../lib/site-access';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Treinos de Kel · Somente leitura',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function ReadOnlyPage({searchParams}:{searchParams:Promise<{chave?:string}>}){
 const {chave}=await searchParams;
 if(!chave||!validShareToken(chave))return <main className="access-notice"><img src="/kel-logo.png" alt="Kel" width={120} height={120}/><h1>Link de consulta inválido.</h1><p>Peça a Kel um link de compartilhamento atualizado.</p></main>;
 await requireAppUser('/visualizar?chave='+chave);
 return <Dashboard shareToken={chave}/>;
}
