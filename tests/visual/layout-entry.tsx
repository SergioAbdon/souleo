
import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import SidebarLaudo from '../../src/components/laudo/SidebarLaudo';
import SheetA4 from '../../src/components/laudo/SheetA4';
import EditorLaudo from '../../src/components/laudo/EditorLaudo';
import Carotidas from '../../src/app/laudo-texto/[id]/page';
import Ficha from '../../src/app/(plataforma)/pacientes/[id]/page';
import Extrato from '../../src/components/Extrato';
import Integracoes from '../../src/app/(plataforma)/integracoes/page';
import Login from '../../src/app/login/page';
import Historico from '../../src/components/Historico';
import Agenda from '../../src/app/(plataforma)/agenda/page';
import Clinica from '../../src/app/(plataforma)/clinica/page';
import Pacientes from '../../src/app/(plataforma)/pacientes/page';
import Perfil from '../../src/components/PerfilModal';
const noop=()=>{};
function Eco(){const [locked,setLocked]=useState(false);const editor=useRef<React.ComponentRef<typeof EditorLaudo>>(null);useEffect(()=>{const timer=setInterval(()=>{if(editor.current){editor.current.setContent("<p>Câmaras cardíacas com dimensões preservadas.</p><p>Função sistólica global preservada.</p>");clearInterval(timer)}},100);return()=>clearInterval(timer)},[]);return <div className={'laudo-workspace '+(locked?'laudo-locked':'')}><SidebarLaudo clinicaNome="Clínica demonstração" medicoInfo="Dados fictícios para conferência visual" onVoltar={noop} onSalvarEmitir={noop} onLimpar={noop} onImportarDicom={noop} ortancAtivo totalMedidasDicom={12} totalImagensDicom={4} onAbrirGaleria={noop} exameAcc="DEMO-001" emitido={locked} readOnlyMotor={locked} readOnlyIdentificacao={locked} modoEmitido={<button data-testid="unlock" onClick={()=>setLocked(false)}>Desbloquear teste</button>}/><SheetA4 p1="#8B1A1A" clinicaNome="Clínica demonstração" clinicaSlogan="Dados fictícios" clinicaEnd="" clinicaTel="" sigTexto="Profissional demonstração" editorLaudo={<EditorLaudo ref={editor} editable={!locked}/>}/><button data-testid="lock" style={{position:'fixed',bottom:8,right:8}} onClick={()=>setLocked(true)}>Simular emitido</button></div>}
const surface=new URLSearchParams(location.search).get('surface')||'eco';
const surfaces:Record<string,React.ReactNode>={agenda:<Agenda/>,clinica:<Clinica/>,pacientes:<Pacientes/>,perfil:<Perfil open onClose={noop}/>,eco:<Eco/>,carotidas:<Carotidas/>,ficha:<Ficha/>,financeiro:<Extrato/>,integracoes:<Integracoes/>,login:<Login/>,historico:<Historico/>};
window.fetch=async(input,options)=>{if(String(input).startsWith('/api/membros')&&(!options?.method||options.method==='GET'))return new Response(JSON.stringify({ok:true,membros:[{uid:'qa-user',nome:'Profissional demonstração',papel:'dono',locais:[],status:'ativo'}],pendentes:[]}));throw Error('Network disabled in visual fixture');};
createRoot(document.getElementById('root')!).render(['eco','carotidas','login'].includes(surface)?surfaces[surface]:<main className="max-w-[1440px] mx-auto p-4 sm:p-8">{surfaces[surface]}</main>);
