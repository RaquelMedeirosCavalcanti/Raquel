import Dashboard from './tracker';
import {requireAppUser} from './auth';
import {canManageTraining} from '../lib/site-access';
export const dynamic='force-dynamic';
export default async function Home(){
 const user=await requireAppUser('/');
 if(!canManageTraining(user))return <main className="access-notice"><img src="/kel-logo.png" alt="Kel" width={120} height={120}/><span className="small-kicker">SOMENTE LEITURA</span><h1>Os treinos de Kel, para acompanhar.</h1><p>Abra o link de consulta enviado por Kel para visualizar o planejamento e a evolução.</p><p>Se o link foi cancelado, peça um novo compartilhamento.</p></main>;
 return <Dashboard/>;
}
