
import React from 'react';
import { TIPOS_LAUDO_PADRAO, MODELO_CAROTIDAS } from '../../src/lib/tipos-laudo';
export const user={uid:'qa-user',email:'teste@example.invalid',getIdToken:async()=> 'fixture'};
export const workspace={id:'qa-local',nomeClinica:'Clínica demonstração',p1:'#8B1A1A',corPrimaria:'#8B1A1A',slogan:'Ambiente de teste — dados fictícios',ortancAtivo:true};
export const profile={nome:'Profissional demonstração',tipo:'medico',tipoPerfil:'medico',crm:'00000',ufCrm:'CE',especialidade:'Cardiologia'};
export const paciente={id:'qa-paciente',nome:'Paciente demonstração com nome extenso para conferir a leitura',cpf:'00000000000',dtnasc:'1970-01-01',sexo:'F',telefone:'85999990000',convenio:'Convênio demonstração'};
export const exames=[{id:'qa-exame',pacienteId:paciente.id,pacienteNome:paciente.nome,pacienteDtnasc:paciente.dtnasc,tipoExame:'doppler_carotidas',status:'emitido',acc:'DEMO-001',convenio:paciente.convenio,dataExame:'2026-10-08',emitidoEm:{toDate:()=>new Date('2026-10-08T12:00:00Z')},laudoTextoHtml:MODELO_CAROTIDAS,imagensDicom:['qa/ex/dicom/1.jpg','qa/ex/dicom/2.jpg','qa/ex/dicom/3.jpg']},{id:'qa-eco',pacienteId:paciente.id,pacienteNome:paciente.nome,tipoExame:'eco_tt',status:'andamento',acc:'DEMO-002',convenio:'Particular',dataExame:'2026-10-08'}];
export function useAuth(){return {user,profile,workspace,papel:'dono',loading:false,contextos:[],subscription:{tipo:'Teste',franquiaMensal:100,franquiaUsada:3},reloadProfile:async()=>{}};}
export function useTiposLaudo(){return {tipos:TIPOS_LAUDO_PADRAO,tiposMap:Object.fromEntries(TIPOS_LAUDO_PADRAO.map(t=>[t.id,t]))};}
export const db={}; export const auth={currentUser:user,signOut:async()=>{}};
export const useParams=()=>({id:'qa-exame'});const router={push:()=>{},replace:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/agenda';
export default function Link({children,href,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>){return <a href={href} {...props}>{children}</a>;}
export const getPaciente=async()=>paciente;export const getExames=async()=>exames;
export const getExame=async()=>({...exames[0],status:new URLSearchParams(location.search).get('closed')?'emitido':'andamento'});
export const getHistorico=async()=>({items:exames,lastDoc:null,hasMore:false,erro:false});
export const getHonorarios=async()=>({convenios:{'Convênio demonstração':100,Particular:150},valorUnico:null});
export const getExtratoContador=async()=>({emitidos:0});export const anoMesAtual=()=> '2026-10';
const forbid=()=>{throw Error('Writes forbidden in visual fixture');};
export const saveExame=forbid,saveHonorarios=forbid,incrementarExtrato=forbid,logAction=forbid,setDoc=forbid;
export const checkExtratoLimit=async()=>({pode:true,franquia:1});
export const doc=(...parts:unknown[])=>parts;export const collection=doc;export const query=(x:unknown)=>x;export const orderBy=()=>null;export const limit=()=>null;export const serverTimestamp=()=>null;
export const getDoc=async()=>({exists:()=>false,data:()=>({})});
export const getDocs=async(ref:unknown[])=>{const rows=ref?.includes('integracoes')?['feegow','orthanc','wader'].map(id=>({id,data:()=>({ativo:true,status:'conectado'})})):[];return {docs:rows,forEach:(fn:(row:{id:string;data:()=>{ativo:boolean;status:string}})=>void)=>rows.forEach(fn),empty:!rows.length};};
export const writeBatch=()=>({update:forbid,set:forbid,commit:forbid});
export const signInWithEmailAndPassword=forbid,createUserWithEmailAndPassword=forbid,sendEmailVerification=forbid,sendPasswordResetEmail=forbid;

export const getPacientes=async()=>[paciente];
export const savePaciente=forbid,updateProfile=forbid,updateWorkspace=forbid;
export const listenWorklist=(_ws:unknown,callback:(rows:typeof exames)=>void)=>{callback(exames);return ()=>{};};
export const listenNaoRealizados=(_ws:unknown,callback:(rows:typeof exames)=>void)=>{callback([]);return ()=>{};};
export const onSnapshot=(_ref:unknown,callback:(snapshot:{docs:{id:string;data:()=>typeof TIPOS_LAUDO_PADRAO[number]}[];forEach:(f:(row:{id:string;data:()=>typeof TIPOS_LAUDO_PADRAO[number]})=>void)=>void})=>void)=>{callback({docs:TIPOS_LAUDO_PADRAO.map(t=>({id:t.id,data:()=>t})),forEach:(f:(row:{id:string;data:()=>typeof TIPOS_LAUDO_PADRAO[number]})=>void)=>TIPOS_LAUDO_PADRAO.forEach(t=>f({id:t.id,data:()=>t}))});return ()=>{};};
export const checkEmissao=async()=>({pode:true});
