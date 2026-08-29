'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Tela de Laudo — Motor V8 MP4
// Componentes: SidebarLaudo + SheetA4
// Motor carrega via <script> em IIFE isolado
// IDs DOM idênticos — compatível DICOM SR
// ══════════════════════════════════════════════════════════════════

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { saveExame } from '@/lib/firestore';
import { db, auth } from '@/lib/firebase';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { dataLocalHoje } from '@/lib/utils';
// v3: billing agora e server-side via /api/emitir
// gerarESalvarPdf legado removido — emissao + PDF agora sao server-side em /api/emitir
import SidebarLaudo from '@/components/laudo/SidebarLaudo';
import SheetA4 from '@/components/laudo/SheetA4';
import DicomGallery, { buscarUrlsAssinadas, renderPaginas } from '@/components/laudo/DicomGallery';
import DicomSrImport from '@/components/laudo/DicomSrImport';
import { normalizarParaImport, prefixoArquivoPorTipo, isSchemaAntigo, InputImport, MedidaSr, MapaSr, SR_TO_MOTOR } from '@/lib/dicom-sr-mapping';
import { carregarPerfilAparelho } from '@/lib/perfil-aparelho';
import { precisaConfirmarEmissao, SEM_SELECAO_PREFIXO } from '@/lib/emissao-guarda';
import { decidirFontePreenchimento, rascunhoExpirado, SETE_DIAS_MS, type RascunhoLocal } from '@/lib/rascunho-restauracao';
import BancoFrases from '@/components/laudo/BancoFrases';
import EditorLaudo from '@/components/laudo/EditorLaudo';
import type { EditorLaudoRef } from '@/components/laudo/EditorLaudo';
import { gerarDocx } from '@/lib/exportDocx';
import { PopupSalvarEmitir, ModoEmitido } from '@/components/laudo/PopupEmitir';
// Shadow Mode (Fase 5): roda Senna90 server-side em paralelo invisível
import { executarEReportar, shadowModeAtivo } from '@/lib/shadow-runner';
// Migração Senna90 (16/05/2026): quando a flag está ON, o Senna90
// (server, 72/72 testes) passa a alimentar achados/conclusões no TipTap
// via `_onLaudoGerado` — a ponte que existia mas NUNCA era chamada
// desde a migração TipTap (raiz do "bug das frases" imortal).
// Flag OFF = comportamento de hoje (rollback instantâneo, zero-deploy).
import { senna90Primario, senna93Params } from '@/lib/primary-engine-flag';
import { alertasVisiveis } from '@/lib/alertas-motor';
import type { AlertaUI } from '@/senna90/types';
import { calcularSenna90, criarDebounce } from '@/lib/senna90-bridge';
import { montarLaudoHtml } from '@/lib/senna90-render';
import { mesclarLinhas } from '@/lib/laudo-merge';
import { checkboxParaMedida, medidaParaChecked } from '@/lib/checkbox-codec';
import { TIPOS_LAUDO_PADRAO, modalidadeDe, type TipoLaudo } from '@/lib/tipos-laudo';
import { montarPdfMoldura } from '@/lib/pdf-moldura';
import { montarParamsHtml, paramsParaTexto, paramsParaDocx } from '@/lib/pdf-params';
// F3-T5 (a virada do cabo): com `senna93Params()` ON, quem pinta #out-*,
// #calc-* e #params-tbody é o Senna93 — os MESMOS nós, o mesmo formato de
// leitura. OFF = motor legado, byte-idêntico ao de hoje.
// F3-T6: `sincronizarCampoPmap` substitui `window.refluxoPulmonar` (motor
// legado) nos 3 call-sites — mesmo corpo, mesmo efeito, sem depender do
// motor estar no ar. DOM-pura: NÃO lê flag (o campo PSMAP aparece igual com
// ON e com OFF).
import { pintarTabelaSenna93, lerIdentTela, sincronizarCampoPmap } from '@/lib/params-render';
import { rodapeFontes } from '@/senna90/classificacoes/fontes';
// Tabela de critérios do escore de Wilkins — fonte única (ver renderWilkinsHtml).
import { WK_DESC } from '@/senna90/achados/wilkins';
// Telefone/CEP do local: a cópia privada daqui virou uma só em paciente-fmt
// (ARQ-I6) — o laudo-texto formatava os MESMOS campos com uma segunda cópia.
import { fmtTel, fmtCep } from '@/lib/paciente-fmt';

// F3-T5 (revisão, I2): com a flag ON a tabela de medidas É a ponte — não há
// mais pintura local de reserva. Falha de rede/auth/rate-limit deixava
// `#params-tbody` VAZIO em SILÊNCIO e um laudo podia ser assinado assim. Fail
// loud: avisa aqui, e o guard de `handleEmitir` barra a emissão. Com a flag
// OFF nada disto roda (o motor legado continua pintando local).
const MSG_FALHA_TABELA = 'Falha ao calcular a tabela — verifique a conexão e recarregue';

// nº16 (S5-T7): remount limpo por exame. Antes o componente NÃO desmontava
// ao navegar /laudo/A → /laudo/B (mesma rota, só o param muda) — todo o
// arsenal de resets manuais abaixo (exameAnteriorRef + limparCampos(true) +
// prevGer/restauracao zerados no onSnapshot) existia só pra simular, à mão,
// o que um remount de verdade faria de graça. Com a `key`, trocar de exame
// desmonta `LaudoPageInner` inteira e monta outra: estados e refs nascem
// zerados por construção. Os resets manuais continuam no código — inofensivos
// (nunca mais disparam, porque `exameAnteriorRef.current` sempre nasce null
// na instância nova) — e ficam como rede de segurança se um refactor futuro
// tirar a `key` de novo.
export default function LaudoPage() {
  const params = useParams();
  return <LaudoPageInner key={String(params.id)} />;
}

// Campos canônicos SÓ no topo do exame (fonte única) — nunca dentro de
// `medidas`. `convenio` saiu em 16/05; os outros cinco saíram na tríade final
// da S5 (I5): a recepção corrige `solicitante`/`pacienteNome` pelo caminho
// oficial (T5) e a cópia velha em `medidas` repovoava o campo na abertura,
// desfazendo a correção na próxima gravação. `coletarMedidas` não grava mais
// nenhum deles; `preencherExame` ignora os que ainda existem em exames
// antigos (leitura tolerante, sem migração).
const SO_DO_TOPO = new Set(['nome', 'dtnasc', 'dtexame', 'convenio', 'solicitante', 'sexo']);

function LaudoPageInner() {
  const params = useParams();
  const router = useRouter();
  const { user, profile, workspace } = useAuth();
  const [motorLoaded, setMotorLoaded] = useState(false);
  const [motorErro, setMotorErro] = useState(false);
  const [exame, setExame] = useState<Record<string, unknown> | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [emitido, setEmitido] = useState(false);
  const [dicomImportado, setDicomImportado] = useState(false);
  // Estado da galeria DICOM (modal full-screen com thumbnails + lightbox).
  // Adicionada em 14/05/2026 — médico consegue ver as imagens dentro do laudo.
  const [galeriaOpen, setGaleriaOpen] = useState(false);
  // Modal de import de medidas SR (15/05/2026). Substitui o auto-import
  // que rodava ao clicar "📡 Vivid" — agora abre modal de validação 1-a-1.
  const [srImportOpen, setSrImportOpen] = useState(false);
  // F3-T7: Banco de Frases virou React. Antes o modal era HTML injetado no
  // SheetA4 e quem abria/fechava era o motor legado (window.abrirBanco →
  // classList.add('open')). Agora é state daqui.
  const [bancoOpen, setBancoOpen] = useState(false);
  // URLs selecionadas pra imprimir no PDF do laudo (subset de imagensDicom).
  // Sincronizado com `exame.imagensSelecionadasPdf` no Firestore. Default
  // quando undefined no Firestore = primeiras 8 (ou menos se exame tem <8).
  const [imagensSelecionadasPdf, setImagensSelecionadasPdf] = useState<string[]>([]);
  // Toggle "Incluir imagens DICOM no PDF" — controlado pelo médico no
  // PopupSalvarEmitir (decisão 15/05/2026). Default true quando há imagens
  // selecionadas. Lido por `gerarPdfHtml()` pra incluir/omitir as páginas.
  const [imagensIncluidasNoPdf, setImagensIncluidasNoPdf] = useState(true);
  // Reedição de laudo emitido em curso (Opção A, status canônico Trava 3):
  // true quando médico desbloqueou um 'emitido'. handleEmitir reseta;
  // handleVoltar avisa se ainda true (edição não reemitida será perdida).
  const [reedicaoAtiva, setReedicaoAtiva] = useState(false);
  // F3 Task 2 — os alertas estruturados do motor. Chegavam em
  // `ResultadoLaudo.alertas` a cada rodada da ponte e eram DESCARTADOS aqui
  // (a page só lia `achados`/`conclusoes`). Agora descem pra sidebar.
  const [alertasMotor, setAlertasMotor] = useState<AlertaUI[]>([]);
  // `senna93Params()` avaliado UMA vez, na montagem. NÃO no initializer do
  // useState: a flag lê `localStorage` (false no servidor) — com ela ON, o
  // primeiro render do cliente divergiria do HTML do SSR (hydration
  // mismatch). Efeito com deps `[]` → o servidor e o 1º render do cliente
  // concordam em `false`, e a flag entra logo depois. Flag OFF: `false`
  // pra `false`, React não re-renderiza (bailout) — árvore idêntica à de hoje.
  const [paramsOn, setParamsOn] = useState(false);
  useEffect(() => { setParamsOn(senna93Params()); }, []);
  const editorRef = useRef<EditorLaudoRef>(null);
  const pendingHtml = useRef<string | null>(null);
  // Texto restaurado sobrevive à 1a geração do Senna90 (S5-T1 fix, achado
  // CRITICAL do revisor): setado quando `preencherExame()` restaura laudoHtml
  // (rascunho local aceito OU exame.laudoHtml) em `pendingHtml`. O `sc()` da
  // carga inicial (motorInicializar → calcFn → dispararSenna90 debounce
  // 300ms → _onLaudoGerado → setContent INCONDICIONAL) sobrescrevia esse
  // texto restaurado antes do médico digitar uma letra. A PRIMEIRA rodada de
  // sc() pós-restauração pula o disparo do Senna90 (motor antigo calcFn()
  // continua rodando normal — tabela/derivados intactos); do próximo input
  // em diante o fluxo volta ao normal.
  const textoRestauradoRef = useRef(false);
  // Restauração roda só 1x (S5-T1 fix2, achado do re-review): `preencherExame()`
  // é chamado DUAS vezes na carga — 1x dentro de motorInicializar (~444) e 1x no
  // useEffect [exameCarregado, motorLoaded] (~245, 500ms depois), duplicidade
  // pré-existente. Sem este guard, a 2a chamada re-arma `textoRestauradoRef`
  // depois que a 1a `sc()` já tinha consumido — engolindo a próxima edição
  // genuína do médico — e o `confirm()` do rascunho podia aparecer 2×. O
  // preenchimento de medidas/identificação (idempotente, só escreve campo
  // vazio) continua rodando nas duas chamadas. Task 7 traz o remount por
  // exame que zera os refs — quando isso existir, este guard volta a fazer
  // sentido reavaliar junto.
  const restauracaoFeitaRef = useRef(false);
  // Corrida autosave × emissão (S5-T1 fix, achado IMPORTANT do revisor):
  // true durante handleEmitir — o tick do autosave (60s) não salva por cima
  // de uma emissão em curso. Task 7 reusa este mesmo ref pro guard de duplo
  // clique no botão emitir.
  const emitindoRef = useRef(false);
  // S7-T0.3 (E1): chave da TENTATIVA de emissão, não do clique. Nasce na
  // primeira tentativa e SOBREVIVE ao erro — o retry depois de um timeout de
  // rede (a transação de billing já commitou, o Puppeteer é que estourou)
  // manda a mesma chave e o servidor devolve a emissão que existe em vez de
  // debitar de novo. Só zera no sucesso: reemissão deliberada = chave nova,
  // e essa cobra (política registrada).
  const emissaoKeyRef = useRef<string | null>(null);
  // Wrapper único do motor (S5-T7, nº12): `sc()` (declarado dentro de
  // `motorInicializar`) é calc() + disparo do Senna90 + shadow mode — só
  // existe DEPOIS do motor carregar. `safeCalc()` é chamado de fora (Limpar,
  // preencherExame) antes disso ser garantido; guardar `sc` aqui deixa
  // `safeCalc()` preferir o wrapper completo sempre que ele já existir, e
  // cair pro `calc()` cru do window só como fallback (motor ainda subindo).
  const scRef = useRef<(() => void) | undefined>(undefined);
  // Flag "esta instância ainda está montada" (S5-T7 fix, review C2+I1):
  // duas execuções sobrevivem ao unmount sem cancelamento — o timer do
  // debounce do Senna90 (`criarDebounce` não expõe `cancel()`) e o `onload`
  // de um `<script>` do motor ainda em voo quando o médico troca de exame
  // antes do motor terminar de subir. As duas, se deixadas rodar, escrevem
  // no DOM/editor da instância NOVA usando o `editorRef`/timers da instância
  // VELHA (já morta) — `vivoRef.current === false` faz as duas virarem no-op.
  // Reset pra `true` no topo do efeito do motor (StrictMode em dev remonta
  // o mesmo componente sem trocar de instância — precisa rearmar).
  const vivoRef = useRef(true);
  // F3-T6 (carona da re-revisão da T5, concern 3): "a tabela na tela é a da
  // ÚLTIMA rodada, e essa rodada deu certo". Contar `#params-tbody tr` só
  // responde "existe tabela" — uma tabela pintada às 10h00 e invalidada por
  // uma rodada que falhou às 10h05 (o médico mexeu numa medida, a ponte caiu)
  // continua no DOM com os números VELHOS, e o laudo sairia assinado com
  // eles. `false` nos mesmos 4 pontos que dão o toast de falha, `true` depois
  // de cada pintura que completou. Lido só pelo guard do `handleEmitir` — e
  // só com a flag ON (com OFF quem pinta é o motor legado, síncrono, e o
  // guard nem chega a olhar este ref).
  const tabelaFrescaRef = useRef(false);
  // Dirty flag (S5-T1): setada pelo listener delegado do #laudo-sidebar
  // (medidas) e pelo onDirty do EditorLaudo (achados/conclusões). Autosave
  // e beforeunload leem este ref — zerado só em salvamento COM sucesso.
  const dirtyRef = useRef(false);
  // Última geração do motor por bloco (S5-T2): é o "estado conhecido" contra
  // o qual o merge por linha decide o que o médico mexeu. `null` = ainda não
  // houve geração neste exame (ver o pseudo-prev em `dispararSenna90`).
  const prevGerAchados = useRef<string[] | null>(null);
  const prevGerConclusoes = useRef<string[] | null>(null);
  // Tela viva (S4-T12): o listener do exame roda a cada gravação do Wader;
  // este guard marca a PRIMEIRA snapshot (a única que inicializa `emitido`).
  const primeiraSnapshot = useRef(true);
  // Último exame que a página preencheu — distingue carga inicial de TROCA de
  // exame no bloco de reset (S5-T2 fix2).
  const exameAnteriorRef = useRef<string | null>(null);
  // Guard SEPARADO da seleção de imagens (FIX F1, S4-T12 fix): a seleção só
  // pode ser inicializada na primeira snapshot QUE JÁ TEM imagens. Amarrada
  // ao guard acima, o médico que abrisse o laudo antes do Wader terminar
  // ficava com seleção [] pra sempre — e emitia o laudo SEM imagem nenhuma.
  const selecaoInicializada = useRef(false);
  // Perfil do aparelho (S4-T13, decisão 16): mapa medida-do-SR → campo do
  // laudo, editável no cartão Integrações. Nasce no default embutido, então
  // falha de leitura NUNCA derruba a importação — só mantém a whitelist.
  const [perfilAparelho, setPerfilAparelho] = useState<MapaSr>(SR_TO_MOTOR);
  // Tipo do exame no catálogo (S5-T10): dá o título impresso e diz se este
  // exame é do motor mesmo — carótidas virou texto livre (D6).
  const [tipo, setTipo] = useState<TipoLaudo | null>(null);

  const exameId = params.id as string;
  const p1 = (workspace?.corPrimaria as string) || '#8B1A1A';
  const clinicaNome = (workspace?.nomeClinica as string) || 'Consultório';
  const clinicaSlogan = (workspace?.slogan as string) || '';
  const clinicaEndRaw = (workspace?.endereco as string) || '';
  const clinicaEnd = fmtCep(clinicaEndRaw);
  const clinicaTelRaw = (workspace?.telefone as string) || '';
  const clinicaTel = fmtTel(clinicaTelRaw);
  const tel2Raw = (workspace?.telefone2 as string) || '';
  const clinicaTel2 = tel2Raw ? fmtTel(tel2Raw) : '';
  const telCompleto = clinicaTel + (clinicaTel2 ? ' / ' + clinicaTel2 : '');
  const espRaw = (profile?.especialidade as string) || '';
  const especialidade = espRaw.replace(/\\/g, ' e ').replace(/\//g, ' e ');
  const sigTexto = profile
    ? `${profile.nome || ''}\n${especialidade}\nCRM/${profile.ufCrm || ''} ${profile.crm || ''}`
    : '';
  const medicoInfo = profile
    ? `${profile.nome || ''} · CRM/${profile.ufCrm || ''} ${profile.crm || ''}`
    : '';
  const logoB64 = (workspace?.logoB64 as string) || '';
  const sigB64 = (profile?.sigB64 as string) || '';
  // Título do exame (S5-T10 a): sai do catálogo em vez do literal
  // "ECOCARDIOGRAMA TRANSTORÁCICO" que o transesofágico e o stress
  // também estavam imprimindo. Fallback = o literal de sempre.
  const tituloExame = (tipo?.nome || 'ECOCARDIOGRAMA TRANSTORÁCICO').toUpperCase();

  // Processar conteúdo pendente quando TipTap está pronto.
  //
  // FIX 15/05/2026 (bug "frases não aparecem"): ANTES esse interval fazia
  // `clearInterval` após a PRIMEIRA aplicação de pendingHtml. Problema: o
  // motor chama `_onLaudoGerado` toda vez que recalcula (médico digita).
  // Se nesse momento `editorRef.current` está null (TipTap remontou — e os
  // states novos de galeria/import/reedição aumentaram re-renders), a frase
  // ia pra `pendingHtml` MAS o interval já estava morto (clearInterval) →
  // pendingHtml nunca mais era aplicado → comentários/conclusão sumiam.
  //
  // Agora o interval roda enquanto o componente está montado (só limpa no
  // unmount). Custo: 1 tick/300ms ocioso — irrelevante. Garante que
  // QUALQUER pendingHtml setado é aplicado na próxima checagem, sempre.
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingHtml.current && editorRef.current) {
        editorRef.current.setContent(pendingHtml.current);
        pendingHtml.current = null;
        // NÃO faz clearInterval — mantém vivo pra próximas frases
      }
    }, 300);
    return () => clearInterval(interval);
  }, []);

  // Tipo do exame + guarda de modalidade (S5-T10 a, espelho de laudo-texto).
  // Exame de modalidade 'texto' (carótidas) aberto aqui por link antigo/atalho
  // ia parar no motor de eco — tabela de medidas e conclusões que não são
  // desse exame. Só redireciona se AINDA NÃO foi emitido: carótidas já
  // assinadas pelo motor continuam abrindo/reimprimindo onde nasceram.
  const tipoId = (exame?.tipoExame as string) || '';
  const jaEmitidoDoc = !!exame?.emitidoEm;
  // Documento FECHADO pro rascunho (gate de `salvarLaudo`, fix2/n1). Não é
  // `emitidoEm`: `transferirExame` devolve o consumo, apaga o `pdfUrl` e põe
  // `status:'andamento'`, mas MANTÉM o `emitidoEm` — o médico que recebeu o
  // laudo justamente pra refazê-lo ficaria sem autosave e sem rascunho de
  // servidor. Cancelado entra na lista porque salvar gravaria
  // `status:'andamento'` e ressuscitaria o exame na fila.
  const docFechado = ['emitido', 'cancelado'].includes((exame?.status as string) || '');
  useEffect(() => {
    if (!workspace?.id || !exame) return;
    (async () => {
      let t: TipoLaudo | null = null;
      try {
        const snap = await getDoc(doc(db, 'workspaces', workspace.id, 'tiposLaudo', tipoId));
        if (snap.exists()) t = snap.data() as TipoLaudo;
      } catch { /* fallback abaixo */ }
      if (!t) t = TIPOS_LAUDO_PADRAO.find(x => x.id === tipoId) || null;
      setTipo(t);
      if (!jaEmitidoDoc && modalidadeDe(t, tipoId) === 'texto') router.replace('/laudo-texto/' + exameId);
    })();
    // `exame` fora das deps de propósito: o onSnapshot troca o objeto a cada
    // gravação do Wader e isso re-leria o catálogo sem parar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, exameId, tipoId, jaEmitidoDoc, router]);

  // Perfil do aparelho — UMA leitura por workspace (não muda durante o laudo).
  useEffect(() => {
    if (!workspace?.id) return;
    carregarPerfilAparelho(db, workspace.id)
      .then(setPerfilAparelho)
      .catch((err) => console.warn('perfilAparelho:', err));
  }, [workspace?.id]);

  // Carregar exame — TELA VIVA (S4-T12, achado 24).
  // Antes: `getExame()` uma vez. O médico abria o laudo enquanto o Wader
  // ainda processava e a tela ficava congelada — botão "📡 Importar" cinza
  // e "🖼️ Imagens" vazio pra sempre, até dar F5. Agora `onSnapshot`: o que
  // o Wader grava (medidasDicom, imagensDicom, dicomUltimoErro) acende
  // sozinho na tela.
  useEffect(() => {
    if (!workspace?.id || !exameId) return;
    // Refs zeradas A CADA exame (S4-T15 fix D1): elas vivem no componente, e
    // navegar laudo→laudo sem desmontar herdava os guards do exame anterior —
    // laudo emitido abria DESTRAVADO e a seleção de imagens ficava a do
    // paciente anterior. Zerar aqui é o mesmo escopo do onSnapshot.
    primeiraSnapshot.current = true;
    selecaoInicializada.current = false;
    // Restauração e merge também são POR EXAME (S5-T2, nota pendente da T1):
    // navegar laudo→laudo sem desmontar levava o texto do paciente anterior
    // como "geração conhecida" — o merge protegeria frases do laudo errado.
    restauracaoFeitaRef.current = false;
    textoRestauradoRef.current = false;
    prevGerAchados.current = null;
    prevGerConclusoes.current = null;
    // O editor remonta pela `key={exameId}` (ver <EditorLaudo/> lá embaixo).
    // Junto com ele morrem as duas coisas que carregariam texto do paciente
    // anterior pro laudo novo: o HTML ainda na fila e a dirty-flag (que faria
    // o autosave gravar o laudo de A dentro do exame de B).
    pendingHtml.current = null;
    dirtyRef.current = false;
    // Sidebar limpa na TROCA de exame (nunca na carga: os selects nascem com
    // default do HTML e zerar aqui mudaria o 1o laudo). Sem isso, campo que o
    // exame novo não sobrescreve fica com o dado do paciente anterior — e o
    // Senna90 fabrica o laudo de B com os dados de A. É a MESMA limpeza do
    // botão "Limpar" (`limparCampos`), que já reseta select por
    // `selectedIndex` e desmarca checkbox — `wilkins-toggle` ligado no
    // paciente A fazia o laudo de B sair com "0 pontos, favorável para
    // valvuloplastia mitral percutânea".
    if (exameAnteriorRef.current && exameAnteriorRef.current !== exameId) {
      limparCampos(true);
    }
    exameAnteriorRef.current = exameId;
    const unsub = onSnapshot(
      doc(db, 'workspaces', workspace.id, 'exames', exameId),
      (snap) => {
        if (!snap.exists()) return;
        const dados = { id: snap.id, ...snap.data() } as Record<string, unknown>;
        setExame(dados);

        // `emitido` SÓ na primeira snapshot (guard de ref): depois disso o
        // state é do médico — reinicializar a cada gravação do Wader
        // retrancaria o laudo que ele acabou de desbloquear.
        if (primeiraSnapshot.current) {
          primeiraSnapshot.current = false;
          if (dados.emitidoEm) setEmitido(true);
        }

        // Inicializa seleção de imagens pra impressão — na primeira snapshot
        // QUE JÁ TRAZ imagens (guard próprio, FIX F1). Sem imagens não há o
        // que inicializar: a snapshot seguinte do Wader é que vai valer.
        //  - Se já tem `imagensSelecionadasPdf` salvo → usa (filtrado)
        //  - Senão → default = primeiras 8 (ou todas, se exame tem <8)
        //    Esse default só vive em memória; só persiste no Firestore
        //    quando médico toggle alguma imagem (auto-save abaixo).
        // Já inicializada NÃO re-roda: a escolha do médico é soberana.
        const todas = (dados.imagensDicom as string[] | undefined) || [];
        if (!selecaoInicializada.current && todas.length > 0) {
          selecaoInicializada.current = true;
          const salvas = dados.imagensSelecionadasPdf as string[] | undefined;
          if (salvas && Array.isArray(salvas)) {
            // Filtra URLs salvas que ainda existem em imagensDicom (defensivo
            // contra remap/reprocessamento que mudou URLs)
            setImagensSelecionadasPdf(salvas.filter((u) => todas.includes(u)));
          } else {
            setImagensSelecionadasPdf(todas.slice(0, 8));
          }
        }
        // nº17 (S5-T7): poda a seleção em TODA snapshot (não só na 1a) — se
        // uma URL selecionada sumiu de `imagensDicom` (reprocesso/remap do
        // Wader), tira da seleção. NUNCA adiciona: se o médico desmarcou uma
        // imagem, uma snapshot nova não a marca de volta.
        // Guard `todas.length > 0` (review M1): uma snapshot com
        // `imagensDicom` vazio (carga/transitório antes do Wader escrever)
        // NÃO deve zerar a seleção pra sempre — `selecaoInicializada` já
        // ficou `true` na 1a vez que houve imagem, então a inicialização não
        // roda de novo pra repopular. A mesma regra do guard F1 de
        // inicialização (vazio = "não vale nada ainda") vale aqui.
        if (todas.length > 0) {
          setImagensSelecionadasPdf((sel) => sel.filter((u) => todas.includes(u)));
        }
      },
      (err) => console.warn('laudo onSnapshot:', err),
    );
    return () => unsub();
  // `limparCampos` é declaração de função da própria página (estável, mexe só
  // no DOM): entrar como dep re-assinaria o onSnapshot a cada render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id, exameId]);

  /**
   * Toggle seleção de uma imagem pra impressão (decisão 14/05/2026).
   * Auto-save no Firestore — sem botão "Salvar". O conceito é "estas vão
   * pro PDF quando emitir/imprimir".
   *
   * Mantém a ORDEM em que o médico clicou (importa pro PDF) — não reordena
   * pela posição na galeria.
   */
  async function handleToggleSelecaoImagem(url: string) {
    if (!workspace?.id || !exameId || !user?.uid) return;
    const novaLista = imagensSelecionadasPdf.includes(url)
      ? imagensSelecionadasPdf.filter((u) => u !== url) // remove
      : [...imagensSelecionadasPdf, url]; // adiciona no fim
    setImagensSelecionadasPdf(novaLista); // optimistic UI
    try {
      await saveExame(workspace.id, { id: exameId, imagensSelecionadasPdf: novaLista }, user.uid);
    } catch (e) {
      console.warn('Falha ao salvar seleção de imagens:', e);
      // Não reverter UI — médico continua escolhendo. Próximo toggle tenta de novo.
    }
  }

  // Preencher quando exame + motor prontos.
  //
  // Dep é o ID do exame CARREGADO, NÃO o objeto `exame`: com a tela viva
  // (onSnapshot acima) o objeto muda a cada gravação do Wader. Se o efeito
  // seguisse o objeto, `preencherExame()` jogaria as medidas salvas por cima
  // do que o médico está digitando — e reabriria o prompt "Rascunho salvo…"
  // no meio do laudo. O ID só muda quando é OUTRO exame.
  //
  // Por que o ID do exame carregado e não `exameId` da rota (S5-T2 fix2):
  // navegar /laudo/A → /laudo/B troca `exameId` na hora, mas `exame` só vira
  // B quando a snapshot chega. Seguir a rota rodaria `preencherExame()` com o
  // closure de A — re-preenchendo a sidebar com A e jogando o laudoHtml de A
  // em `pendingHtml`, ou seja, trazendo de volta o vazamento que a `key` do
  // editor acabou de fechar. Seguindo `exame.id`, o preenchimento só roda
  // quando os dados do exame novo já estão em mãos: sidebar de B, rascunho
  // de B, `textoRestauradoRef` armado antes do `sc()` (fluxo da T1 intacto).
  const exameCarregadoId = (exame?.id as string) || '';
  useEffect(() => {
    if (!exameCarregadoId || !motorLoaded) return;
    // Timer órfão (tríade final, C1): sem cleanup + sem `vivoRef`, trocar de
    // exame DENTRO desta janela de 500ms fazia o callback de A rodar contra o
    // DOM vivo de B — `idCampos` escrevia nome/dtnasc/dtexame/convênio/
    // solicitante/sexo do paciente A nos campos (vazios) de B, e o
    // preenchimento legítimo de B não corrige (só escreve campo vazio). Daí
    // pro doc e pro PDF assinado de B é `coletarIdentificacao()`. Mesmo par
    // de guardas dos outros dois órfãos fechados na T7 (debounce do Senna90 e
    // `onload` do <script>): cancela o timer no unmount E ignora o disparo
    // tardio se a instância já morreu.
    const t = setTimeout(() => {
      if (!vivoRef.current) return;
      try { preencherExame(); safeCalc(); } catch (e) { console.warn('preencher:', e); }
    }, 500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exameCarregadoId, motorLoaded]);

  // Autosave (S5-T1): a cada 60s, se houve mudança real (dirtyRef) desde o
  // último save, grava no servidor. NUNCA roda com laudo emitido (travado/
  // assinado — editar aqui não é o fluxo, é reedição via handleDesbloquear).
  // Zera dirtyRef só em sucesso — falha (offline) tenta de novo no próximo tick.
  //
  // Tríade final (I1): o gate é o `emitido` do STATE, e `handleDesbloquear()`
  // o zera pra abrir a reedição — 60s depois o tick gravava `status:
  // 'andamento'` num laudo ASSINADO. `docFechado` (o STATUS do DOC)
  // entra no gate E nas deps, pra o intervalo re-armar com o valor fresco
  // quando a snapshot chega. A trava de verdade está em `salvarLaudo` — este
  // gate só evita a chamada à toa.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (emitido || docFechado || !dirtyRef.current || emitindoRef.current) return;
      const ok = await salvarLaudo('andamento', { laudoHtml: editorRef.current?.getHTML() ?? '' });
      if (ok) dirtyRef.current = false;
    }, 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emitido, docFechado]);

  // beforeunload (S5-T1): avisa se há mudança não salva e o laudo não foi
  // emitido — emitido é documento fechado, não há o que perder ao sair.
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyRef.current && !emitido) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [emitido]);

  // Carregar motor
  useEffect(() => {
    if (motorLoaded) return;
    vivoRef.current = true; // rearma (StrictMode dev remonta sem trocar de instância)
    const w = window as unknown as Record<string, unknown>;
    w.escH = (s: string) => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };
    w.showToast = (msg: string) => { const el = document.createElement('div'); el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:99999;background:#1E293B;color:#fff;padding:10px 20px;border-radius:9px;font-size:13px;font-weight:600;font-family:IBM Plex Sans,sans-serif;box-shadow:0 4px 20px rgba(0,0,0,.3);'; el.textContent = msg; document.body.appendChild(el); setTimeout(() => el.remove(), 3000); };
    w.hexToRgb = (h: string) => { if (!h) return [30, 58, 95]; h = h.replace('#', ''); const n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    w.uid = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    w.tog = (id: string) => { const el = document.getElementById(id); if (el) el.classList.toggle('collapsed'); };
    // alertaIT e setDiastModo wrappers serão aplicados após o motor carregar (ver script.onload)

    // Callbacks TipTap — motor chama estes ao renderizar achados/conclusões
    // Motor gera laudo completo → envia para TipTap
    //
    // WK_DESC vem do Senna90 (tríade final, ARQ-I1): a tabela de critérios de
    // Wilkins existia DUAS vezes verbatim — a cópia viva aqui e o export de
    // `senna90/achados/wilkins.ts` sem consumidor nenhum. Arrumar a redação
    // "onde ela mora" não mudava nada no laudo. Import só de dado puro (o
    // senna90 segue intocável). Os RÓTULOS ficam aqui e são o outro lado do
    // contrato de 4 pontas: `RENDER_WILKINS` (laudo-merge.ts) colapsa o bloco
    // renderizado casando exatamente estes textos — renomear um só de um lado
    // duplica o escore de Wilkins dentro do laudo assinado. Amarrado em
    // tests/unit/contrato-ponte-ids.test.mjs (8).
    const WK_LABELS: Record<string, string> = { mob: 'Mobilidade do folheto', esp: 'Espessamento valvar', sub: 'Espessamento subvalvar', cal: 'Calcificação valvar' };

    function renderWilkinsHtml(json: string): string {
      const d = JSON.parse(json);
      let html = '<p><strong>Escore Ecocardiográfico de Wilkins &amp; Block:</strong></p>';
      for (const key of ['mob', 'esp', 'sub', 'cal'] as (keyof typeof WK_DESC)[]) {
        const val = d[key] as number;
        if (val > 0) {
          html += `<p>• <strong>${WK_LABELS[key]}</strong> (${val} pts): ${WK_DESC[key][val]}</p>`;
        }
      }
      html += `<p><strong>TOTAL: ${d.sc} pontos.</strong> ${d.concFrase}</p>`;
      return html;
    }

    w._onLaudoGerado = (html: string) => {
      // Processar __WILKINS__ JSON → HTML formatado com critérios
      let processed = html.replace(/<p>__WILKINS__(\{.*?\})<\/p>/g, (_match, json) => {
        try { return renderWilkinsHtml(json); } catch { return ''; }
      });
      processed = processed.replace(/__WILKINS__(\{.*?\})/g, (_match, json) => {
        try { return renderWilkinsHtml(json); } catch { return ''; }
      });
      if (editorRef.current) {
        editorRef.current.setContent(processed);
      } else {
        pendingHtml.current = processed;
      }
    };
    // Banco de frases insere no cursor.
    // F3-T7: ÓRFÃ. Quem chamava era `inserirFraseSelecionada()` do motor, só
    // acionada pelo `onclick` do modal legado — que saiu do SheetA4. O React
    // agora chama `editorRef.insertLine` direto (ver <BancoFrases>). Fica de
    // pé porque o motor ainda define a função; morre junto com ele na F5.
    w._onInserirFrase = (texto: string) => {
      if (editorRef.current) editorRef.current.insertLine(texto);
    };

    // v3: carregar motor com retry e error handling
    // S5-T12: cache-bust (`?v=${Date.now()}`) só no RETRY — a 1a carga usa a
    // URL crua (cache do navegador vale) e só perde o cache quando a 1a
    // tentativa falhou de verdade (s.onerror).
    let retryCount = 0;
    function carregarScript(retry = false) {
      const s = document.createElement('script');
      s.src = retry ? `/motor/motorv8mp4.js?v=${Date.now()}` : '/motor/motorv8mp4.js';
      s.onerror = () => {
        try { document.body.removeChild(s); } catch {}
        if (retryCount < 1) {
          retryCount++;
          console.warn('Motor: falha ao carregar, tentando novamente...');
          setTimeout(() => carregarScript(true), 2000);
        } else {
          console.error('Motor: falha definitiva apos retry');
          setMotorErro(true);
        }
      };
      s.onload = () => motorInicializar();
      document.body.appendChild(s);
    }

    function motorInicializar() {
      setMotorLoaded(true);
      setTimeout(() => {
        // fix (S5-T7 review, I1): troca de exame ANTES do motor terminar de
        // subir — o `<script>` de A ainda em voo dispara `s.onload` (o
        // closure de A) depois que B já montou. Sem este guard,
        // `motorInicializar()` de A rodaria contra a sidebar de B (listeners
        // duplicados, um deles sempre com `editorRef` morto → `setContent`
        // cru a cada tecla, matando o merge em B pelo resto da sessão). A
        // instância viva (B) já religa tudo sozinha no seu próprio efeito.
        if (!vivoRef.current) return;
        // F3-T5: a flag é lida UMA vez por montagem do efeito (o `paramsOn`
        // do render é state e este closure tem deps `[]` — veria `false`
        // eterno). Trocar a flag exige RECARREGAR a página do laudo; é o
        // mesmo contrato do kill-switch (primary-engine-flag.ts).
        const paramsOn = senna93Params();
        try {
          // F3-T5: `calcFn` é sempre o `calc()` CRU do motor, guardado na
          // primeira montagem — nunca o wrapper que a virada instala em
          // `window.calc` mais abaixo. Sem esta guarda, trocar de exame
          // (remount, sem recarregar) DEPOIS de virar o kill-switch faria
          // `calcFn` apontar pro wrapper e `sc()` chamar a si mesmo até
          // estourar a pilha. Mesmo padrão de `__setDiastModoOrig` (nº M2).
          const wCalc = window as unknown as Record<string, unknown>;
          if (!wCalc.__calcOrig) wCalc.__calcOrig = wCalc.calc;
          const calcFn = wCalc.__calcOrig as (() => void) | undefined;
          if (calcFn) {
            // ── Migração Senna90 (16/05/2026) ──────────────────────────
            // Disparador com debounce (300ms): chama o Senna90 no servidor
            // e injeta achados/conclusões no TipTap via `_onLaudoGerado`.
            // ESTE é o conserto da raiz: `_onLaudoGerado` existia desde a
            // migração TipTap mas NINGUÉM chamava — o motor antigo escrevia
            // em `#achados-body` (inexistente) e crashava silencioso. Agora
            // o Senna90 (tipado, 72/72 testes, mapeamento AHA correto)
            // alimenta a ponte. Debounce evita estourar rate-limit 60/min.
            // Falha (rede/auth) → não re-renderiza, motor antigo segue
            // fazendo params-tbody/calc-* (sem regressão).
            //
            // Merge por linha (S5-T2, decisão D2-c): o que sai pro editor NÃO
            // é mais a geração crua do motor — é ela mesclada com o que está
            // no editor agora. Regra em `src/lib/laudo-merge.ts` (25 testes).
            const dispararSenna90 = criarDebounce(300, async () => {
              // fix (S5-T7 review, m5): mesmo guard de baixo, repetido ANTES
              // do fetch — sem isto, uma instância já morta ainda gastava 1
              // chamada de `/api/laudo/calcular` (rate limit 60/min
              // compartilhado com a instância viva) só pra jogar o resultado
              // fora depois do `await`. O guard pós-`await` continua
              // necessário (o unmount pode acontecer DURANTE o fetch).
              if (!vivoRef.current) return;
              // F3-T5: fotografia da tela no MESMO instante em que a ponte lê
              // o DOM (`calcularSenna90` lê na linha seguinte). A pintura
              // acontece depois do round-trip; sem a foto, a coluna de medidas
              // sairia com o que o médico acabou de digitar e a de derivados
              // com o cálculo anterior por ~300ms. Com a flag OFF nem lê.
              const identNaChamada = paramsOn ? lerIdentTela() : null;
              const r = await calcularSenna90();
              // fix (S5-T7 review, C2): `criarDebounce` não expõe `cancel()`
              // — trocar de exame não cancela um timer já armado por esta
              // instância. Se ele disparar depois do unmount, `editorRef`
              // já é null (não vaza dados: a checagem de `ed` abaixo pula o
              // merge) — mas sem este guard `onGer` ainda seria o handler DA
              // INSTÂNCIA NOVA (reatribuído síncrono no mount dela) e faria
              // `setContent` CRU (sem merge) de um laudo calculado com o DOM
              // em branco (pré-`preencherExame` da instância nova) por cima
              // do texto recém-restaurado do paciente novo.
              // F3-T5 (revisão, I2): a ponte voltou vazia com a flag ON → a
              // tabela NÃO foi pintada. Não pode ser silêncio (ver
              // MSG_FALHA_TABELA no topo). `vivoRef` no teste pra não avisar
              // o paciente B sobre a falha do exame A.
              // F3-T6: a rodada falhou → o que está na tela ficou VELHO.
              // Marca antes do toast (o `vivoRef` só decide se AVISA).
              if (!r && paramsOn) { tabelaFrescaRef.current = false; if (vivoRef.current) toast(MSG_FALHA_TABELA); }
              if (!r || !vivoRef.current) return; // falha OU instância morta → no-op
              const ed = editorRef.current;
              // Editor ainda não montou: nada pra preservar, e o HTML vai
              // esperar em `pendingHtml`. Mesclar contra [] aqui APAGARIA o
              // laudo inteiro (tudo pareceria "linha que o médico deletou").
              const atuaisA = ed ? ed.getAchadosLines() : null;
              const atuaisC = ed ? ed.getConclusoesLines() : null;
              // 1a geração do exame com o editor JÁ preenchido (rascunho
              // restaurado): alinha contra a PRÓPRIA geração nova como
              // pseudo-prev — o que casa com o motor é substituído por ele
              // mesmo (idempotente), o que não casa é do médico e FICA.
              const prevA = prevGerAchados.current ?? (atuaisA?.length ? r.achados : null);
              const prevC = prevGerConclusoes.current ?? (atuaisC?.length ? r.conclusoes : null);
              // `?.length`, NÃO `atuaisA` (Critical 2 do review): `[]` é
              // truthy — editor montado e vazio virava "o médico apagou tudo"
              // e o merge devolvia [], apagando o laudo inteiro. Editor vazio
              // = nada a preservar → a geração nova manda. (`mesclarLinhas`
              // repete o guard na raiz, pra qualquer outro chamador.)
              const mescladoA = prevA && atuaisA?.length ? mesclarLinhas(prevA, r.achados, atuaisA) : r.achados;
              const mescladoC = prevC && atuaisC?.length ? mesclarLinhas(prevC, r.conclusoes, atuaisC) : r.conclusoes;
              prevGerAchados.current = r.achados;
              prevGerConclusoes.current = r.conclusoes;
              // Passa pelo `_onLaudoGerado` de propósito: é lá que a sentinela
              // __WILKINS__ vira bloco formatado (o merge devolve a sentinela).
              const html = montarLaudoHtml(mescladoA, mescladoC);
              const onGer = (window as unknown as Record<string, unknown>)
                ._onLaudoGerado as ((h: string) => void) | undefined;
              if (onGer) onGer(html);
              // F3 Task 2 (gate): os alertas do motor chegam aqui desde a
              // migração Senna90 e eram jogados fora. Único efeito novo no
              // handler. Dois cuidados, os dois pra NÃO mexer numa página
              // delicada quando ela não precisa mudar:
              //  1. `senna93Params()` lido AQUI (não o `paramsOn` do render,
              //     que este closure de deps `[]` veria eterno em `false`):
              //     flag OFF = nem o setState acontece → zero re-render novo
              //     em produção, árvore idêntica à de hoje.
              //  2. lista igual à anterior → devolve `prev` e o React sai por
              //     bailout: só re-renderiza quando o conjunto de alertas
              //     REALMENTE muda, não a cada rodada da ponte.
              if (senna93Params()) {
                const novos = alertasVisiveis(r.alertas);
                setAlertasMotor((prev) => (
                  prev.length === novos.length
                  && prev.every((a, i) => a.tipo === novos[i].tipo && a.mensagem === novos[i].mensagem)
                    ? prev : novos
                ));
              }
              // F3 Task 5 (A VIRADA): a metade dos NÚMEROS. Entra DEPOIS do
              // merge por linha (S5, intocado acima) — pintura pura de DOM,
              // não toca em texto, editor nem `prevGer`. Com a flag OFF esta
              // linha nunca roda e quem pinta continua sendo o `calcFn()` do
              // `sc()`. Nunca os dois: são mutuamente exclusivos pela flag
              // (ADR do Contrato da Ponte, item 4).
              if (paramsOn && identNaChamada) {
                try { pintarTabelaSenna93(r, () => identNaChamada); tabelaFrescaRef.current = true; }
                catch (e) { tabelaFrescaRef.current = false; console.warn('params:', e); toast(MSG_FALHA_TABELA); }
              }
            });

            // Wrapper: motor antigo (params-tbody + calc-*, intocado) +
            // Senna90 (achados/conclusões → TipTap, só se flag ON) +
            // shadow (comparação invisível, se ativo).
            const sc = () => {
              // F3-T5 (A VIRADA): com a flag ON o motor legado NÃO pinta
              // mais — nem `calcFn()` (que escreveria por cima de #out-*/
              // #calc-*/#params-tbody com o formato antigo), nem o override
              // `alertaIT` (o aviso IT-sem-PSAP virou alerta estruturado do
              // motor na T2). Com a flag OFF este bloco é o de sempre, linha
              // por linha.
              if (!paramsOn) {
                try { calcFn(); } catch (e) { console.warn('calc:', e); }
                // nº13 (S5-T8): renderizarLaudo agora tem guards e não quebra
                // antes de alertaIT() — mas religa aqui também pra cobrir os
                // outros pontos de chamada de calcFn() que não passam por `sc`.
                try { (window as unknown as { alertaIT?: () => void }).alertaIT?.(); } catch { /* não bloquear */ }
              }
              // Migração Senna90: flag ON → preenche o vazio dos achados.
              // Achado CRITICAL (revisor S5-T1): a 1a rodada pós-restauração
              // NÃO dispara o Senna90 — senão o setContent incondicional de
              // `_onLaudoGerado` sobrescreve o laudoHtml restaurado (rascunho
              // aceito ou exame.laudoHtml) antes do médico tocar em nada.
              // calcFn() já rodou acima (tabela/derivados intactos); a partir
              // do próximo input o fluxo volta ao normal.
              if (senna90Primario()) {
                if (textoRestauradoRef.current) {
                  textoRestauradoRef.current = false;
                  // F3-T5: o guard pula a ponte pra não sobrescrever o texto
                  // restaurado — mas com a flag ON a ponte é a ÚNICA fonte da
                  // tabela. Sem esta pintura, abrir um exame salvo mostraria
                  // #params-tbody vazio (e uma reemissão sairia com o PDF sem
                  // a tabela de medidas). Chamada direta: só pinta, não passa
                  // por `_onLaudoGerado` nem grava `prevGer` — o texto do
                  // médico continua intocado, que é o motivo do guard existir.
                  // F3-T5 (revisão, m1): a foto da tela (`lerIdentTela`) é
                  // tirada ANTES do await, igual ao caminho do debounce —
                  // antes era avaliada DEPOIS do round-trip e os dois
                  // caminhos casavam instantes diferentes da mesma tela.
                  // (revisão, I2): ponte vazia = tabela vazia → fail loud.
                  if (paramsOn) {
                    const identNaChamada = lerIdentTela();
                    calcularSenna90()
                      .then((r) => {
                        if (!vivoRef.current) return;
                        if (!r) { tabelaFrescaRef.current = false; toast(MSG_FALHA_TABELA); return; }
                        pintarTabelaSenna93(r, () => identNaChamada);
                        tabelaFrescaRef.current = true;
                      })
                      .catch(() => { tabelaFrescaRef.current = false; if (vivoRef.current) toast(MSG_FALHA_TABELA); });
                  }
                } else {
                  try { dispararSenna90(); } catch { /* não bloquear */ }
                }
              }
              // Shadow mode (Fase 5): invisível, server-side
              if (shadowModeAtivo()) {
                try { executarEReportar(exameId); } catch { /* não bloquear */ }
              }
            };
            // nº12: publica o wrapper pra `safeCalc()` (fora deste escopo)
            // preferir `sc` (calc + Senna90 + shadow) em vez do `calc()` cru.
            scRef.current = sc;

            // F3-T5 (ponto cego do contrato): `window.calc` tem chamadores
            // que o guard de `paramsOn` acima NÃO alcança — os 3 botões da
            // diastólica em SidebarLaudo.tsx (`motorCalc()`, invisível pro
            // regex do contrato) e o `toggleWilkins()` do próprio motor. Com
            // a flag ON, cada um deles repintava #params-tbody/#calc-*/#out-*
            // no formato ANTIGO por cima do Senna93 — e o botão "Manual" não
            // dispara evento nenhum, então a tabela FICAVA legada até o
            // próximo input. Um laudo emitido nesse estado sairia com números
            // do motor legado carimbados `motorNumeros: 'senna93'`. Com a
            // flag ON, todo `calc()` vira `sc()` (que não chama o legado e
            // dispara a ponte). Com OFF, `window.calc` continua o motor cru.
            //
            // F3-T5 (revisão, I1): o `else` DESFAZ o wrapper. `window.calc` é
            // global e sobrevive ao remount — sem ele, virar o kill-switch e
            // trocar de exame deixava o wrapper de ANTES no ar apontando pro
            // `scRef` novo (que com OFF não pinta nada), e os 3 botões da
            // diastólica ficavam mudos até um F5. Restaurar do `__calcOrig`
            // (o `calc()` cru guardado acima) cura o global sem reload. Com a
            // flag SEMPRE OFF é atribuição-identidade: `__calcOrig` foi lido
            // de `wCalc.calc` na 1ª montagem e nada mais reescreveu — mesmo
            // objeto-função de volta no mesmo lugar, no-op.
            if (paramsOn) {
              wCalc.calc = () => {
                try { scRef.current?.(); } catch (e) { console.warn('calc:', e); }
              };
            } else if (wCalc.__calcOrig) {
              wCalc.calc = wCalc.__calcOrig;
            }

            // FIX 12/05/2026: Event delegation no container, NÃO em cada input.
            //
            // Bug antigo (HISTÓRICO — corrigido pelo nº4/S5-T4, `Sec` agora monta
            // os filhos SEMPRE e só alterna `hidden`): querySelectorAll só pegava
            // inputs das seções ABERTAS no momento do load (Sistólica e Segmentar
            // começam fechadas — seus inputs nem existiam no DOM). Quando o médico
            // abria essas seções e digitava, calc() não rodava → frases não apareciam.
            //
            // Solução (ainda vale, motivo diferente hoje): um único listener no
            // #laudo-sidebar (sempre presente). Eventos `input`/`change` borbulham
            // (bubble) pro container, e checamos o target. Funciona pra inputs
            // adicionados depois (auto-fill DICOM, importação SR, etc.) sem
            // precisar re-anexar listener por campo.
            const sidebar = document.getElementById('laudo-sidebar');
            if (sidebar) {
              const onInputOrChange = (e: Event) => {
                const t = e.target as HTMLElement | null;
                if (!t) return;
                // nº23: sinal SINTÉTICO disparado ao fim de `preencherExame()`
                // (target = o próprio container, não um campo). NÃO é edição
                // do médico — não marca dirty, não passa pelo `sc()` completo
                // (que dispararia o Senna90 e consumiria PREMATURAMENTE o
                // guard `textoRestauradoRef`: os dois chamadores de
                // `preencherExame()` já rodam `sc()`/`safeCalc()` logo depois,
                // então o QUE FALTAVA era só revelar o condicional PSMAP
                // (setado por valor sem disparar `change` real) + recalcular
                // os derivados do motor legado — nada mais).
                if (t.id === 'laudo-sidebar') {
                  // F3-T6: era `window.refluxoPulmonar` (motor legado). Mesmo
                  // corpo, agora local — e sem o `if (fn)`/try: a função
                  // guarda os dois nós e não tem como lançar.
                  sincronizarCampoPmap();
                  // fix (S5-T7 review, C1): motor CRU aqui, não `safeCalc()`.
                  // Desde o nº12, `safeCalc()` é o wrapper `sc()` — que dispara
                  // o Senna90 e CONSOME `textoRestauradoRef`. Este branch existe
                  // exatamente pra NÃO fazer isso (comentário acima, nº23): os
                  // dois chamadores de `preencherExame()` já rodam `sc()`/
                  // `safeCalc()` logo depois deles mesmos — bastava revelar o
                  // condicional PSMAP e recalcular os derivados legados.
                  // Passar por `sc()` aqui consumia o guard ANTES da hora,
                  // dobrando o Senna90 do fluxo de carga (T2 duplicava o laudo
                  // ~1s após abrir um exame com `laudoHtml` salvo).
                  //
                  // F3-T5: com a flag ON o motor legado não pinta mais nada —
                  // sobra o `refluxoPulmonar()` acima (revelar o PSMAP), que é
                  // o que este branch realmente precisava fazer. A tabela vem
                  // do `sc()` que os dois chamadores de `preencherExame()`
                  // rodam logo em seguida.
                  if (!paramsOn) {
                    try { calcFn(); } catch (e) { console.warn('calc:', e); }
                  }
                  return;
                }
                const tag = t.tagName;
                if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
                  dirtyRef.current = true; // S5-T1: medida mudou → rascunho desatualizado
                  sc();
                }
              };
              sidebar.addEventListener('input', onInputOrChange);
              sidebar.addEventListener('change', onInputOrChange);
            }

            // fix (S5-T7 review, P1 — pré-existente desde ae71447, achado na
            // onda de fechamento): este `preencherExame()` é DEAD CODE por
            // construção — o efeito "Carregar motor" tem deps `[]`, então o
            // `motorInicializar` aqui dentro fecha sobre o `exame` da
            // PRIMEIRA renderização (sempre `null`, o Firestore ainda não
            // respondeu). `preencherExame()` sempre entra no
            // `if (!exame) return;` do topo e não faz nada — os dois
            // chamadores REAIS (`[exameCarregadoId, motorLoaded]` mais
            // abaixo, e o `change` sintético que ele mesmo dispara) já
            // cobrem a carga com o `exame` de verdade.
            //
            // O `sc()` que vinha logo depois, porém, FAZIA algo — e o algo
            // era ruim: disparava o Senna90 contra a sidebar ainda vazia
            // (motor recém-carregado, nenhum dado preenchido) e gravava essa
            // geração fantasma em `prevGerAchados`/`prevGerConclusoes`. Isso
            // tirava de jogo o pseudo-prev da T2 (`prevGerAchados.current ??
            // (...)`, só ativa quando o ref ainda é `null`) — a 1a geração
            // REAL (na carga, com o rascunho restaurado, ou na 1a tecla do
            // médico) passava a mesclar contra esse "estado conhecido" vazio
            // em vez do pseudo-prev, e linhas editadas pelo médico saíam
            // duplicadas (a dele + a nova do motor).
            //
            // Fix: `calcFn()` cru no lugar de `sc()` — preserva o único
            // efeito colateral que tinha valor real (o motor legado
            // populando `#params-tbody`/derivados assim que carrega, mesmo
            // antes do exame chegar) sem disparar Senna90 nenhum daqui — logo
            // sem gravar em `prevGer`. `preencherExame()` foi só apagado
            // (no-op comprovado, ver acima).
            //
            // F3-T5: com a flag ON nada roda aqui. O único efeito que este
            // `calcFn()` tinha era pintar a tabela VAZIA (só travessões) antes
            // do exame chegar — e o equivalente ON seria disparar a ponte
            // contra a sidebar em branco, exatamente a "geração fantasma" que
            // o fix P1 acima acabou de matar (gravaria `prevGer` e duplicaria
            // as linhas editadas pelo médico). A tabela é pintada ~500ms
            // depois, pelo `sc()`/`safeCalc()` que segue o `preencherExame()`.
            if (!paramsOn) {
              try { calcFn(); } catch (e) { console.warn('calc:', e); }
            }
          }

          // Override alertaIT — usar style.display em vez de classList.toggle
          (window as unknown as Record<string, unknown>).alertaIT = () => {
            const it = parseFloat((document.getElementById('b23') as HTMLInputElement)?.value || '0');
            const psap = parseFloat((document.getElementById('b37') as HTMLInputElement)?.value || '0');
            const msg = document.getElementById('alerta-psap');
            if (msg) msg.style.display = (it > 0 && !psap) ? 'block' : 'none';
          };

          // Wrap setDiastModo APÓS motor carregar (motor exporta window.setDiastModo)
          // fix (S5-T7 review, M2): remount por exame (nº16) roda este bloco
          // de novo a cada troca — sem a marca abaixo, `origSetDiastModo`
          // capturaria o WRAPPER da instância anterior (não o motor cru),
          // empilhando 1 nível de closure por exame aberto na sessão.
          // Idempotente (só repinta os mesmos botões), mas guarda a
          // referência ORIGINAL uma única vez.
          const wDiast = window as unknown as Record<string, unknown>;
          if (!wDiast.__setDiastModoOrig) wDiast.__setDiastModoOrig = wDiast.setDiastModo;
          const origSetDiastModo = wDiast.__setDiastModoOrig as ((m: string) => void) | undefined;
          (window as unknown as Record<string, unknown>).setDiastModo = (modo: string) => {
            if (origSetDiastModo) origSetDiastModo(modo);
            const btnAuto = document.getElementById('diast-btn-auto');
            const btnManual = document.getElementById('diast-btn-manual');
            const panel = document.getElementById('diast-manual-panel');
            if (btnAuto && btnManual && panel) {
              if (modo === 'manual') {
                btnManual.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-[#1E3A5F] text-white';
                btnAuto.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-transparent text-[#6B7280] hover:bg-white';
                panel.style.display = 'block';
              } else {
                btnAuto.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-[#1E3A5F] text-white';
                btnManual.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-transparent text-[#6B7280] hover:bg-white';
                panel.style.display = 'none';
              }
            }
          };
        } catch (e) { console.warn('motor:', e); setMotorErro(true); }
      }, 500);
    }

    // nº21 (S5-T7): remount por exame (nº16) faz este efeito rodar de novo a
    // cada troca. Remover a <script> do DOM (cleanup abaixo) NÃO desfaz a
    // execução do IIFE — `window.calc` sobrevive ao unmount. Reinjetar de
    // novo carregaria o motor inteiro outra vez à toa; se já existe, só
    // rebind: `motorInicializar()` religa os listeners na sidebar NOVA (DOM
    // fresco do remount) e reatribui `scRef.current`/`_onLaudoGerado` pros
    // closures desta instância — sem repetir o script/retry.
    if ((window as unknown as Record<string, unknown>).calc) {
      motorInicializar();
    } else {
      carregarScript();
    }
    return () => {
      // fix (S5-T7 review, C2+I1): mata o debounce órfão do Senna90 e o
      // `onload` zumbi de um `<script>` ainda em voo (ver os dois guards
      // acima) — a instância que está sendo desmontada não escreve mais
      // nada, ponto.
      vivoRef.current = false;
      try { document.querySelectorAll('script[src*="motorv8mp4"]').forEach(s => s.remove()); } catch {}
      // `_onLaudoGerado`/`_onInserirFrase` não sobrevivem ao exame que os
      // criou: se a página é desmontada de vez (sai do /laudo, não troca por
      // outro exame), ninguém mais reatribui esses globais — sem o delete,
      // ficariam apontando pro closure do exame antigo (editorRef já nulo)
      // até o próximo /laudo montar. Deletar é defensivo: uma chamada tardia
      // (ex.: timer de debounce do Senna90 ainda em voo) vira no-op silencioso
      // em vez de escrever num editor que não existe mais.
      const w = window as unknown as Record<string, unknown>;
      delete w._onLaudoGerado;
      delete w._onInserirFrase;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // nº12 (S5-T7): prefere o wrapper `sc` (calc + Senna90 + shadow, montado em
  // `scRef.current` por `motorInicializar`) — cai pro `calc()` cru do window
  // só enquanto o motor ainda não terminou de subir (scRef ainda vazio).
  // NB: NÃO escrito como `scRef.current?.() ?? calc()` — `sc()`/`calc()` são
  // void (sempre retornam undefined), e `undefined ?? calc()` chamaria as
  // DUAS toda vez que `scRef.current` já existisse (calc() rodaria 2x por
  // tecla). O guard explícito abaixo chama só uma.
  function safeCalc() {
    if (motorErro) return; // v3: nao tentar calcular se motor falhou
    try {
      if (scRef.current) { scRef.current(); return; }
      const c = (window as unknown as Record<string, unknown>).calc as (() => void);
      if (c) c();
      else if (motorLoaded) { console.warn('calc: funcao nao encontrada no window'); }
    } catch (e) { console.warn('calc:', e); }
  }

  function preencherExame() {
    if (!exame) return;

    // Bloco de restauração roda só na 1a chamada (S5-T1 fix2): guard
    // `restauracaoFeitaRef` — ver comentário na declaração do ref, acima.
    if (!restauracaoFeitaRef.current) {
      restauracaoFeitaRef.current = true;

      // v3: limpar rascunhos orfaos (mais de 7 dias)
      // nº19-baixo (S5-T7): `Object.keys(localStorage)` tira uma CÓPIA das
      // chaves antes de iterar — o loop antigo (`for i < localStorage.length`)
      // reindexava a cada `removeItem` (o storage encolhe e desloca os
      // índices seguintes pra trás), pulando a chave seguinte à removida.
      // Decisão de expiração é pura (`rascunhoExpirado`, testada em
      // `rascunho-restauracao.test.mjs`) — só o `removeItem` fica aqui.
      try {
        const agora = Date.now();
        Object.keys(localStorage).forEach((key) => {
          if (!key.startsWith('rascunho_')) return;
          if (rascunhoExpirado(localStorage.getItem(key), agora, SETE_DIAS_MS)) {
            localStorage.removeItem(key);
          }
        });
      } catch { /* */ }

      // Rascunho local x exame do servidor: decisão pura em rascunho-restauracao.ts
      // (testada em tests/unit). nº9: recusar NÃO apaga — plano B local continua
      // disponível depois. O `confirm()` (impuro) fica aqui, só a resposta viaja.
      let rascunhoLocal: RascunhoLocal = null;
      try {
        const raw = localStorage.getItem(`rascunho_${exameId}`);
        if (raw) rascunhoLocal = JSON.parse(raw);
      } catch { /* sem rascunho */ }
      let aceitouRascunho = false;
      if (rascunhoLocal) {
        const quando = new Date(rascunhoLocal.timestamp || 0);
        const fmt = quando.toLocaleDateString('pt-BR') + ' ' + quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        aceitouRascunho = confirm(`Rascunho salvo em ${fmt}. Deseja recuperar?`);
      }
      const fonte = decidirFontePreenchimento(rascunhoLocal, aceitouRascunho, {
        medidas: exame.medidas as Record<string, string> | undefined,
        laudoHtml: exame.laudoHtml as string | undefined,
      });
      if (fonte.medidas) {
        Object.entries(fonte.medidas).forEach(([id, val]) => {
          if (!val) return;
          // Identificação NUNCA vem de `medidas` (tríade final, I5): exames
          // antigos têm nome/dtnasc/dtexame/solicitante/sexo duplicados lá
          // dentro (hoje `coletarMedidas` não grava mais nenhum deles). As
          // medidas entram ANTES da identificação canônica e sem guarda de
          // campo vazio — o valor velho vencia o do topo do exame e a próxima
          // gravação/reemissão desfazia, em silêncio, a correção
          // administrativa da recepção (T5). Tolerância de leitura = ignorar.
          if (SO_DO_TOPO.has(id)) return;
          // legado (S5-T12): a chave antiga da Diastólica foi unificada com
          // 'b24' (SidebarLaudo.tsx:422, Contrato da Ponte D7 — teste
          // contrato-ponte-ids.test.mjs pina esta referência em 1). Exames
          // salvos ANTES da unificação ainda têm a chave extinta em
          // `medidas`; sem este redirecionamento o valor ficaria órfão (não
          // sobra elemento no DOM pro setVal escrever).
          setVal(id === 'b24_diast' ? 'b24' : id, val);
        });
        // S5-T3: `setVal` só escreve `.value` — o Senna90 já lê o select
        // direto do DOM (não depende disso pro texto sair certo), mas sem
        // isto o painel manual restaurado ficaria invisível (parecendo que
        // a seleção "sumiu"). A Task 5 cobre o dispatch de change genérico.
        const diastSel = document.getElementById('diast-manual-sel') as HTMLSelectElement | null;
        if (diastSel && parseInt(diastSel.value, 10) >= 0) {
          const panel = document.getElementById('diast-manual-panel');
          const btnAuto = document.getElementById('diast-btn-auto');
          const btnManual = document.getElementById('diast-btn-manual');
          if (panel) panel.style.display = 'block';
          if (btnManual) btnManual.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-[#1E3A5F] text-white';
          if (btnAuto) btnAuto.className = 'flex-1 text-[10px] font-semibold py-1 rounded transition bg-transparent text-[#6B7280] hover:bg-white';
        }
      }
      if (fonte.laudoHtml) {
        pendingHtml.current = fonte.laudoHtml;
        // Marca restauração (cobre os DOIS caminhos: rascunho aceito e
        // exame.laudoHtml — `decidirFontePreenchimento` já resolveu qual).
        // Ver comentário no `sc()` de motorInicializar (achado CRITICAL).
        textoRestauradoRef.current = true;
      }
    }

    // nº8: identificação SEMPRE preenchida a partir do exame (fallback se medidas não tiver)
    const idCampos: [string, string][] = [
      ['nome', exame.pacienteNome as string || ''],
      ['dtnasc', exame.pacienteDtnasc as string || ''],
      ['dtexame', exame.dataExame as string || dataLocalHoje()],
      ['convenio', exame.convenio as string || ''],
      ['solicitante', exame.solicitante as string || ''],
      ['sexo', exame.sexo as string || ''],
    ];
    idCampos.forEach(([id, val]) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el && !el.value && val) setVal(id, val);
    });

    // nº23: campos restaurados acima via `setVal` (só `.value`/`.checked`,
    // sem `dispatchEvent`) deixam condicionais que dependem de `change` pra
    // se revelar — ex.: b40p restaurado com valor mas #field-psmap continua
    // `display:none` porque quem o abre é `sincronizarCampoPmap()` (F3-T6;
    // era `refluxoPulmonar()` do motor), chamado só pelo `onChange` do
    // próprio select. UM change borbulhado no container
    // (tratado à parte no listener delegado — não marca dirty, não dispara
    // Senna90 de novo) resolve sem precisar mirar campo por campo.
    const sidebarEl = document.getElementById('laudo-sidebar');
    if (sidebarEl) sidebarEl.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setVal(id: string, val: string) {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
    if (!el) return;
    // nº15: único checkbox da tela — `.value` não marca/desmarca. Restaura
    // o check E reabre o painel (senão o escore salvo fica invisível até o
    // médico clicar de novo, e a próxima edição de medida o apagaria).
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = medidaParaChecked(val);
      if (el.id === 'wilkins-toggle') {
        const fields = document.getElementById('wilkins-fields');
        if (fields) fields.style.display = el.checked ? 'grid' : 'none';
        const icon = document.getElementById('wilkins-icon');
        if (icon) icon.textContent = el.checked ? '☑' : '☐';
      }
      return;
    }
    el.value = val;
  }

  function coletarMedidas(): Record<string, string> {
    // Identificação REMOVIDA daqui (fonte única): `convenio` saiu em 16/05 e
    // `nome`/`dtnasc`/`dtexame`/`solicitante`/`sexo` na tríade final da S5
    // (I5) — todos são canônicos no TOPO do exame (`coletarIdentificacao`,
    // lido por Worklist/Extrato/PDF). Duplicados em `medidas`, a cópia velha
    // vencia na abertura e desfazia a correção administrativa da recepção.
    // Ver `SO_DO_TOPO` (topo do arquivo) e o filtro em `preencherExame`.
    const campos = ['ritmo', 'peso', 'altura',
      'b7', 'b8', 'b9', 'b10', 'b11', 'b12', 'b13', 'b28', 'b29', 'b24', 'b25',
      'b19', 'b20', 'b21', 'b22', 'b23', 'b37', 'b38', 'b54', 'b32', 'b33', 'gls_ve', 'gls_vd', 'lars',
      'b34', 'b35', 'b34t', 'b36', 'b39', 'b40', 'b39p', 'b40p', 'psmap',
      'b41', 'b42', 'b45', 'b46', 'b47', 'b46t', 'b47t', 'b50', 'b51', 'b52', 'b50p',
      'b55', 'b56', 'b57', 'b58', 'b59', 'b60', 'b61', 'b62', 'wk-mob', 'wk-esp', 'wk-cal', 'wk-sub',
      'diast-manual-sel',
      // nº15 (background T2/T3): faltava aqui — o escore de Wilkins nunca
      // era persistido, então reabrir o laudo sempre voltava com o painel
      // fechado e a 1a medida editada apagava o cálculo salvo em silêncio.
      'wilkins-toggle'];
    const m: Record<string, string> = {};
    campos.forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      // Checkbox não tem `.value` significativo — grava '1'/'0' (setVal sabe ler de volta).
      // Codec extraído/testado em `src/lib/checkbox-codec.ts` (M4, revisão S5-T4).
      m[id] = el.type === 'checkbox' ? checkboxParaMedida(el.checked) : (el.value || '');
    });
    return m;
  }

  /** Extrai identificação do DOM — sempre sincronizada ao salvar */
  function coletarIdentificacao(): Record<string, string> {
    const g = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value || '';
    return {
      pacienteNome: g('nome').trim().toUpperCase(),
      pacienteDtnasc: g('dtnasc'),
      dataExame: g('dtexame'),
      convenio: g('convenio'),
      solicitante: g('solicitante'),
      sexo: g('sexo'),
    };
  }

  /** Detecta se identificação mudou em relação ao exame original */
  function identificacaoMudou(): boolean {
    if (!exame) return false;
    const atual = coletarIdentificacao();
    return (
      atual.pacienteNome !== ((exame.pacienteNome as string) || '').trim().toUpperCase() ||
      atual.pacienteDtnasc !== ((exame.pacienteDtnasc as string) || '') ||
      atual.dataExame !== ((exame.dataExame as string) || '') ||
      atual.convenio !== ((exame.convenio as string) || '')
    );
  }

  /** Save centralizado — medidas + identificação sempre juntos */
  async function salvarLaudo(status: 'rascunho' | 'andamento', extras?: Record<string, unknown>) {
    if (!workspace?.id || !exameId || !user?.uid) return false;
    // Laudo ASSINADO não volta pra rascunho por save (tríade final, I1). Os
    // dois chamadores (autosave de 60s e "Salvar rascunho") gravam
    // `status:'andamento'`; num exame EMITIDO isso o DES-EMITE:
    // a correção administrativa passa a responder 409 `nao_emitido`, o exame
    // some das listas de emitido e não pode mais ser cancelado/estornado — e
    // contradiz a promessa da própria tela (`handleVoltar`: "o laudo emitido
    // original continua valendo, a edição não reemitida será PERDIDA"). Na
    // reedição o único caminho que persiste é reemitir (`/api/emitir`), que
    // grava tudo junto e cobra o crédito. Plano B local (localStorage) segue
    // valendo — quem grava é `handleRascunho`, fora daqui. Cancelado entra no
    // mesmo gate (salvar o ressuscitaria); TRANSFERIDO não — ver `docFechado`.
    if (docFechado) return false;
    // medicoUid no save: assume o exame orfao (cadastrado pela recepcao) no
    // primeiro salvamento. Se ja e o autor, reenvia o mesmo valor (intacto
    // permite); se o autor e OUTRO medico, a regra nega — como deve.
    const dados = { id: exameId, medidas: coletarMedidas(), ...coletarIdentificacao(), status, medicoUid: user.uid, ...extras };
    return await saveExame(workspace.id, dados, user.uid);
  }

  // Lista de inputs importáveis MEMOIZADA (S4-T12, achado 25). Antes o JSX
  // chamava `getInputsImportaveis()` a cada render → array novo a cada render
  // → o `useEffect` de reset do modal (dep `inputs`) re-marcava TODAS as
  // medidas que o médico tinha acabado de desmarcar. Com o memo a referência
  // só muda quando `medidasDicom` muda de verdade.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inputsImportaveis = useMemo(() => getInputsImportaveis(), [exame?.medidasDicom, perfilAparelho]);
  // Schema antigo (Record<string, number>, sem unidade) não é importável — o
  // caminho seguro é reprocessar no Wader (Task 10). `totalRecebidas` só faz
  // sentido no schema novo; no antigo vale 0 e o rodapé some.
  const medidasDicomBrutas = exame?.medidasDicom as Record<string, MedidaSr | number> | undefined;
  const schemaAntigo = isSchemaAntigo(medidasDicomBrutas);
  const totalMedidasBrutas = Object.keys(medidasDicomBrutas || {}).length;
  const totalRecebidas = schemaAntigo ? 0 : totalMedidasBrutas;
  // No schema antigo o botão "📡 Importar" recebe a contagem BRUTA só pra
  // ficar clicável (com 0 ele nasce desabilitado e o legado não teria como
  // pedir o reprocesso); é o modal que explica que elas não são importáveis.

  /**
   * Abre o modal de IMPORTAÇÃO de medidas DICOM SR.
   *
   * Mudança 15/05/2026: antes o click no botão "📡 Vivid" importava DIRETO
   * sem validação. Agora abre `<DicomSrImport>` que mostra cada input com
   * checkbox individual — médico confirma item a item. Decisão clínica
   * com Sergio: "GOSTEI DA SUGESTAO B" (validação 1-a-1).
   *
   * Inputs vêm de `normalizarParaImport()` que lê `exame.medidasDicom` e
   * filtra só os mapeáveis na whitelist `SR_TO_MOTOR` (calculados são
   * ignorados — motor recalcula).
   */
  function handleImportarDicom() {
    if (!workspace?.id) return;
    // Schema antigo abre o modal MESMO com 0 importáveis — é lá que fica o
    // botão de pedir reprocesso ao Wader (S4-T12). Sem esta exceção o alerta
    // abaixo era o fim da linha pros exames legados.
    if (inputsImportaveis.length === 0 && !schemaAntigo) {
      alert(
        'Sem medidas DICOM SR mapeáveis pra importar.\n\n' +
        'Ou o Wader ainda não processou o estudo, ou as medidas SR não estão ' +
        'na whitelist conhecida (ver `src/lib/dicom-sr-mapping.ts`).'
      );
      return;
    }
    setSrImportOpen(true);
  }

  /**
   * Retorna a lista de inputs DICOM importáveis pro motor (filtrados via
   * whitelist SR_TO_MOTOR). Só funciona com schema NOVO (medidas com
   * contexto) — schema ANTIGO (Record<string, number>, sem unidade) sempre
   * devolve `[]` (Task 10 — reprocesso é o único caminho seguro, Task 12).
   */
  function getInputsImportaveis(): InputImport[] {
    const medidasDicom = exame?.medidasDicom as Record<string, MedidaSr | number> | undefined;
    return normalizarParaImport(medidasDicom, perfilAparelho);
  }

  /**
   * Pede ao Wader pra reprocessar o estudo deste exame (S4-T12).
   * Grava só a flag `reprocessarDicom` no doc — o worker do Wader varre
   * `where('reprocessarDicom','==',true)`, reprocessa com o parser novo e
   * limpa a flag (Task 9). O médico é o autor do exame, a regra permite.
   * A tela viva mostra as medidas novas chegando sem F5.
   */
  async function handleSolicitarReprocesso() {
    if (!workspace?.id || !exameId) return;
    try {
      await updateDoc(doc(db, 'workspaces', workspace.id, 'exames', exameId), { reprocessarDicom: true });
      toast('Reprocessamento solicitado — o Wader responde em instantes');
    } catch (e) {
      console.warn('reprocessarDicom:', e);
      toast('Não consegui solicitar o reprocessamento. Tente de novo.');
    }
  }

  /**
   * Callback do modal DicomSrImport — recebe os inputs que o médico
   * marcou e seta os campos do motor DIRETAMENTE via DOM.
   *
   * Por que NÃO chamar `window.importarDICOM`:
   *   - O motor V8 espera `measurements: Record<LOINC, number>` (formato
   *     antigo, com códigos LOINC universais como chave).
   *   - Nosso novo flow usa códigos contextualizados (LA_M-02550, etc) e
   *     mapeia pra IDs de campo do motor (b7, b8, ...) na whitelist.
   *   - Passar `{ b7: 3.71, ... }` pro motor antigo dá erro (ele tenta
   *     interpretar 'b7' como LOINC).
   *
   * Em vez disso: setar o `.value` do input DOM + dispatch de event
   * `input` (bubbles=true). O motor tem um listener delegated em
   * `#laudo-sidebar` que captura esses eventos e dispara recalc
   * automaticamente (cascade: Septo+Parede+DDVE → Massa, etc).
   *
   * Decisão 15/05/2026 (Sergio): valores entram brutos como vêm do SR
   * (atualmente em cm). Sergio vai ajustar o Vivid depois pra mandar em
   * mm direto — quando isso acontecer, nada muda aqui (valor passa direto).
   */
  function handleConfirmarImportSr(selecionados: InputImport[]) {
    if (selecionados.length === 0) return;
    let preenchidos = 0;
    // Medidas que o médico marcou mas não têm input no DOM (S4-T15 fix D4):
    // mapeamento aponta pra um campo que não existe nesta tela. Antes só ia
    // pro console — o médico via "3 importadas" de 5 marcadas e não sabia.
    const naoImportados: string[] = [];
    for (const s of selecionados) {
      const el = document.getElementById(s.campo) as HTMLInputElement | null;
      if (!el) {
        console.warn(`Campo motor "${s.campo}" não encontrado no DOM (input ${s.nomePt} pulado)`);
        naoImportados.push(`${s.nomePt} → ${s.campo}`);
        continue;
      }
      // Adaptador já arredondou (regra por tipo: lineares=inteiro, razões=1
      // casa). String() usa ponto decimal → parse-safe pro motor e aceito
      // pelo input type=number (vírgula quebraria parseFloat e o type=number).
      el.value = String(s.valor);
      // Dispatch event triggera o listener delegated do motor → recalc.
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      preenchidos++;
    }
    setDicomImportado(true);
    const aviso = naoImportados.length > 0
      ? `\n\n⚠️ ${naoImportados.length} não importada${naoImportados.length === 1 ? '' : 's'} — confira o Perfil do aparelho em Integrações:\n${naoImportados.join('\n')}`
      : '';
    alert(`✅ ${preenchidos} medida${preenchidos === 1 ? '' : 's'} importada${preenchidos === 1 ? '' : 's'}. Motor recalcula derivados automaticamente.${aviso}`);
  }

  function handleVoltar() {
    // Opção A (decisão 15/05/2026 — status canônico, Trava 3):
    // Se o médico desbloqueou um laudo JÁ EMITIDO pra editar mas NÃO
    // reemitiu, avisa que a edição será perdida (o PDF emitido original
    // continua sendo o documento oficial — status permanece 'emitido').
    if (reedicaoAtiva) {
      const ok = confirm(
        '⚠️ Você desbloqueou um laudo já emitido e editou, mas NÃO reemitiu.\n\n' +
        'As alterações serão PERDIDAS — o laudo emitido original continua valendo.\n\n' +
        'Para salvar as mudanças, cancele e clique em "Salvar / Emitir" (consome 1 crédito).\n\n' +
        'Sair mesmo assim e descartar a edição?'
      );
      if (!ok) return;
    }
    router.push('/dashboard');
  }

  function handleSalvarEmitir() {
    setPopupOpen(true);
  }

  // S5-T1: rascunho de verdade — grava no servidor via salvarLaudo (era
  // código morto). Plano B local continua como rede de segurança offline.
  async function handleRascunho() {
    setPopupOpen(false);
    const okServer = await salvarLaudo('andamento', { laudoHtml: editorRef.current?.getHTML() ?? '' });
    try {
      localStorage.setItem(`rascunho_${exameId}`, JSON.stringify({
        medidas: coletarMedidas(), laudoHtml: editorRef.current?.getHTML() ?? '', timestamp: Date.now(),
      }));
    } catch { /* */ }
    dirtyRef.current = false;
    // Documento fechado (emitido/cancelado): `salvarLaudo` recusa de propósito
    // (I1) — o rascunho fica só local e o médico precisa REEMITIR pra valer.
    // Dizer "sem conexão" aqui seria mentira.
    toast(okServer
      ? 'Rascunho salvo'
      : docFechado
        ? 'Laudo fechado — rascunho guardado só neste navegador. Reemita para valer.'
        : 'Rascunho salvo só neste navegador (sem conexão)');
  }

  async function handleEmitir(incluirImagens: boolean = true) {
    if (!workspace?.id || !exameId || !user?.uid) return;
    // nº11 (S5-T7): duplo-clique/duplo-submit — o guard de baixo (linha ~955)
    // só sobe DEPOIS dos `confirm()` de pendência DICOM; sem pendência não há
    // confirm bloqueando, e um segundo clique entre o primeiro clique e o
    // primeiro `await` cairia aqui de novo. `emitindoRef` também é
    // compartilhado com `handleCorrigirLaudo` — os dois fluxos gravam o
    // mesmo laudo, um por vez.
    if (emitindoRef.current) return;
    // Guarda de emissão (S4-T12): o Wader falhou ou ainda não trouxe as
    // imagens deste exame — emitir agora gera um PDF sem imagem nenhuma.
    // Decisão pura em `precisaConfirmarEmissao` (tem teste); aqui só o aviso.
    // A seleção VIVA vai junto (S4-T15 fix D6/X5): a guarda também avisa
    // quando há imagens mas nenhuma marcada — o PDF sairia sem imagem nenhuma.
    const pendenciaDicom = precisaConfirmarEmissao(exame, imagensSelecionadasPdf);
    if (pendenciaDicom && !confirm(
      pendenciaDicom.startsWith(SEM_SELECAO_PREFIXO)
        ? `${pendenciaDicom}. Emitir mesmo assim?`
        : `Imagens do exame ainda não chegaram ou falharam (${pendenciaDicom}). Emitir mesmo assim?`
    )) return;
    // Só fecha o popup DEPOIS da guarda (F4): cancelar no confirm mantinha
    // o popup fechado e o médico tinha que reabrir tudo pra emitir.
    setPopupOpen(false);
    // Guarda escolha do médico no state — `gerarPdfHtml()` consulta isso
    // antes de incluir as páginas extras de imagens
    setImagensIncluidasNoPdf(incluirImagens);

    // Corrida autosave × emissão (achado IMPORTANT do revisor): sobe o guard
    // ANTES do corpo assíncrono — o tick de 60s não pode salvar por cima de
    // uma emissão em curso. `finally` garante reset mesmo em erro/return
    // precoce (rede, plano sem saldo, etc).
    emitindoRef.current = true;
    try {
    const medidas = coletarMedidas();
    const achados = coletarAchados();
    const conclusoes = coletarConclusoes();

    // v3: Emissao atomica server-side (exame + billing numa transacao)
    const jaEmitido = !!(exame?.emitidoEm);
    const idMudou = jaEmitido && identificacaoMudou();
    const identificacao = coletarIdentificacao();

    const dadosFinais = {
      medidas, achados, conclusoes,
      // Texto ASSINADO no doc (tríade final, I2): `laudoHtml` só era gravado
      // pelo rascunho/autosave, então reabrir um emitido restaurava o último
      // autosave (até 60s ANTES da emissão) em vez do texto que foi pro PDF —
      // "Imprimir"/"Copiar"/"Word" da tela do emitido divergiam do laudo que
      // o paciente tem na mão. Mesma fonte que o PDF usa (o editor agora).
      laudoHtml: editorRef.current?.getHTML() ?? '',
      ...identificacao,
      cfgSnapshot: { clinica: clinicaNome, slogan: clinicaSlogan, localEnd: clinicaEnd, localTel: clinicaTel, medNome: profile?.nome, medCrm: profile?.crm, medUf: profile?.ufCrm, p1 },
      // nº5: pacienteNome NÃO reentra aqui — `...identificacao` (acima) já
      // traz o nome atual do DOM. A linha antiga sobrescrevia com
      // `exame.pacienteNome` (valor STALE do servidor) sempre que existia,
      // igual ao bug do `convenio` (comentário abaixo) — nome editado na tela
      // nunca chegava a salvar.
      tipoExame: (exame?.tipoExame as string) || '',
      // convenio: NÃO sobrescrever aqui. Vem de `...identificacao` (valor
      // do DOM = o que o médico vê). A linha antiga jogava o `exame.convenio`
      // STALE por cima → topo gravava "" mesmo com convênio digitado (bug
      // 16/05: laudo mostrava PARTICULAR, Worklist/Extrato viam vazio).
      reemissao: jaEmitido,
      identificacaoAlterada: idMudou,
    };

    // F3-T5 (revisão, I2): com a flag ON a tabela de medidas vem da ponte —
    // se ela falhou, `#params-tbody` está VAZIO e `gerarPdfHtml` raspa nada:
    // sairia um laudo ASSINADO sem tabela de medidas. Barra antes de montar o
    // pdfHtml (o `finally` do bloco libera o `emitindoRef`). Flag lida direto,
    // mesmo padrão do handler da ponte — o state `paramsOn` serve pro carimbo
    // de proveniência abaixo. Com OFF este guard nunca dispara.
    // F3-T6 (carona da re-revisão): "existe tabela" não bastava. `#params-tbody`
    // cheio pode ser a tabela da rodada ANTERIOR, já invalidada por uma rodada
    // que falhou (o médico mexeu numa medida e a ponte caiu) — assinar aquilo é
    // carimbar números velhos como novos. `tabelaFrescaRef` mede o frescor.
    if (senna93Params()
      && (document.querySelectorAll('#params-tbody tr').length === 0 || !tabelaFrescaRef.current)) {
      toast('Tabela de medidas não carregou — não é possível emitir');
      return;
    }

    // v3.1: gerar pdfHtml ANTES de emitir, mandar junto na requisicao
    // Servidor faz emissao + PDF tudo numa chamada (sem race condition).
    // Passa `incluirImagens` explícito pra evitar race do setState async
    // (decisão 15/05/2026 — médico escolhe no PopupSalvarEmitir).
    const pdfHtml = gerarPdfHtml(incluirImagens);
    // `nomeArq` NÃO vai mais no corpo (S5-T14, I3): quem nomeia o objeto do
    // laudo assinado no Storage é o servidor, a partir do que ele mesmo
    // acabou de gravar (tipo + nome do paciente). Aqui o mesmo texto ainda é
    // montado, mas só pro <title> do documento — ver `gerarPdfHtml`.

    toast('Emitindo laudo e gerando PDF...');

    let resultado: { ok: boolean; tipo?: string; motivo?: string; pdfUrl?: string; pdfErro?: string };
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({
          wsId: workspace.id,
          exameId,
          dadosFinais,
          medicoUid: user.uid,
          pdfHtml,
          emissaoKey: (emissaoKeyRef.current ||= crypto.randomUUID()),
          // F3-T5 (proveniência): QUEM produziu os números deste PDF
          // assinado. Carimbo aditivo — a F4 (sombra) e qualquer auditoria
          // clínica precisam saber se a tabela veio do motor legado ou do
          // Senna93 sem ter que adivinhar pela data do laudo.
          motorNumeros: paramsOn ? 'senna93' : 'legado',
        }),
      });
      resultado = await res.json();
    } catch {
      toast('Erro de conexao ao emitir. Tente novamente.');
      return;
    }

    if (!resultado.ok) {
      const msgs: Record<string, string> = {
        sem_plano: 'Sem plano ativo. Assine um plano para emitir laudos.',
        expirado: 'Seu plano expirou. Renove para continuar emitindo.',
        sem_saldo: 'Franquia esgotada e sem creditos extras.',
        nao_autenticado: 'Sessao expirada. Entre de novo para emitir.',
        sem_permissao: 'Voce nao tem permissao de emitir neste local.',
        nao_medico: 'Somente perfil medico assina laudo.',
        exame_de_outro_medico: 'Este laudo e de outro medico. Peca a transferencia ao responsavel.',
        nao_encontrado: 'Exame nao encontrado. Recarregue a lista.',
        erro: 'Erro ao emitir. Tente novamente.',
      };
      toast(msgs[resultado.motivo || 'erro'] || 'Erro ao emitir.');
      return;
    }

    try { localStorage.removeItem(`rascunho_${exameId}`); } catch { /* */ }

    // Atualizar status no Feegow se veio de lá
    if (exame?.feegowAppointId) {
      try {
        const fToken = await auth.currentUser?.getIdToken();
        await fetch(`/api/feegow?wsId=${workspace.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${fToken || ''}` },
          body: JSON.stringify({ action: 'atualizar_status', agendamento_id: exame.feegowAppointId, status_id: 3 }),
        });
      } catch { /* não bloquear emissão se Feegow falhar */ }
    }

    setEmitido(true);
    setReedicaoAtiva(false); // reemitiu com sucesso — não há edição pendente
    emissaoKeyRef.current = null;   // S7-T0.3: próxima emissão é intenção nova (cobra)

    // Abrir o PDF gerado (se ja foi salvo no Storage)
    if (resultado.pdfUrl) {
      toast('Laudo emitido — PDF pronto');
      window.open(resultado.pdfUrl, '_blank');
    } else if (resultado.pdfErro) {
      toast('Laudo emitido. PDF falhou — tente "Imprimir" depois.');
      console.warn('PDF gen error:', resultado.pdfErro);
    } else {
      toast('Laudo emitido e assinado');
    }
    } finally {
      emitindoRef.current = false;
    }
  }

  function handleDesbloquear() {
    if (!confirm('Ao editar e reemitir, será consumido 1 crédito da sua franquia.\n\nDeseja desbloquear para edição?')) return;
    setEmitido(false);
    setReedicaoAtiva(true); // marca: emitido reaberto — handleVoltar avisa se não reemitir
    toast('Laudo desbloqueado para edição');
  }

  // Phase E (17/05): corrige SÓ convênio + solicitante de um exame emitido,
  // SEM crédito, regerando o PDF. Não passa por /api/emitir (que sempre cobra).
  // Identidade (nome/datas) NÃO entra aqui — segue travada/Desbloquear.
  async function handleCorrigirLaudo() {
    if (!workspace?.id || !exameId || !user?.uid) return;
    // nº11 (S5-T7): mesmo guard de `handleEmitir` — os dois fluxos gravam o
    // mesmo laudo, um por vez (duplo-clique aqui, ou correção em cima de uma
    // emissão em curso).
    if (emitindoRef.current) return;
    // S5-T5: com reedição aberta a tela já não é o laudo emitido — corrigir
    // aqui gravaria o convênio por cima de um laudo que ainda vai ser reemitido.
    // Um fluxo por vez.
    if (reedicaoAtiva) {
      toast('Termine a reedição (emitir) ou saia sem salvar antes de corrigir');
      return;
    }
    const convenio = (document.getElementById('convenio') as HTMLInputElement)?.value || '';
    const solicitante = (document.getElementById('solicitante') as HTMLInputElement)?.value || '';
    toast('Salvando correção e regerando PDF...');
    emitindoRef.current = true;
    try {
      const token = await user.getIdToken();
      const res = await fetch('/api/corrigir-laudo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // Sem pdfHtml (S5-T5): o servidor regera o PDF do snapshot congelado
        // na emissão. O que sai daqui é só o dado administrativo.
        body: JSON.stringify({ wsId: workspace.id, exameId, convenio, solicitante }),
      });
      const r = await res.json();
      if (!r.ok) {
        toast(r.error === 'reemitido_durante_correcao'
          ? 'O laudo foi reemitido agora — a reemissão usa os dados da tela e pode ter desfeito esta correção. Confira e refaça se preciso.'
          : 'Erro ao salvar correção. Tente novamente.');
        return;
      }
      if (r.pdfUrl) {
        toast('Correção salva — PDF atualizado');
        window.open(r.pdfUrl, '_blank');
      } else if (r.pdfDesatualizado) {
        toast('Correção salva. Laudo antigo: o PDF continua com o dado velho — reemita para atualizá-lo.');
      } else {
        toast(r.pdfErro ? 'Correção salva. PDF falhou — tente "Imprimir".' : 'Correção salva.');
      }
    } catch {
      toast('Erro de conexão ao salvar correção.');
    } finally {
      emitindoRef.current = false;
    }
  }

  function handleFinalizar() {
    toast('Atendimento finalizado');
    router.push('/dashboard');
  }

  // ── Coletar achados e conclusões do TipTap ──
  function coletarAchados(): string[] {
    return editorRef.current?.getAchadosLines() || [];
  }

  function coletarConclusoes(): string[] {
    return editorRef.current?.getConclusoesLines() || [];
  }

  function getAchadosHTML(): string {
    return editorRef.current?.getAchadosHTML() || '';
  }
  function getConclusoesHTML(): string {
    return editorRef.current?.getConclusoesHTML() || '';
  }

  // ── Raspagem única da tabela de parâmetros (S5-T13) ──
  // Usada por gerarPdfHtml/handleCopiarFormatado (via montarParamsHtml,
  // pdf-params.ts) e por handleCopiarTexto/handleBaixarWord (direto —
  // formatação própria de cada um, não é HTML de tabela). `textContent`
  // (não innerHTML): o motor só escreve texto puro em cada `<td>`, nunca
  // markup aninhado — ver pdf-params.ts sobre o porquê disso ser seguro.
  function lerParamsDoDOM(): string[][] {
    const rows: string[][] = [];
    document.querySelectorAll('#params-tbody tr').forEach((tr) => {
      rows.push(Array.from(tr.querySelectorAll('td')).map((td) => td.textContent || ''));
    });
    return rows;
  }

  // ── Gerar HTML do PDF a partir do DOM ──
  // `incluirImagensParam` (decisão 15/05/2026): se passado, sobrescreve
  // o state `imagensIncluidasNoPdf` — usado pelo handleEmitir() que recebe
  // a escolha do médico via callback do PopupSalvarEmitir (state ainda não
  // foi commitado quando esta função é chamada).
  function gerarPdfHtml(incluirImagensParam?: boolean): string {
    const incluirImagens = incluirImagensParam !== undefined ? incluirImagensParam : imagensIncluidasNoPdf;
    const nome = (document.getElementById('nome') as HTMLInputElement)?.value || 'PACIENTE';
    // Nome do arquivo dinâmico por tipoExame
    const nomeArq = prefixoArquivoPorTipo(exame?.tipoExame as string | undefined) + ' ' + nome.trim().toUpperCase();

    // Tabela de parâmetros — raspagem e montagem de HTML compartilhadas
    // com handleCopiarFormatado() (S5-T13): mesmas rows, cabeçalho/rodapé
    // do PDF via opts.pdf=true (ver pdf-params.ts).
    const paramsHTML = montarParamsHtml(lerParamsDoDOM(), p1, { pdf: true });

    // Comentários e Conclusão — usar HTML do TipTap se disponível
    const achadosHTMLContent = getAchadosHTML();
    const concHTMLContent = getConclusoesHTML();
    const achadosHTML = achadosHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${achadosHTMLContent}</div>`
      : coletarAchados().map(t => `<li style="margin-bottom:2px;font-size:8.5pt;line-height:1.6;">${t}</li>`).join('');
    const concHTML = concHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${concHTMLContent}</div>`
      : coletarConclusoes().map((t, i) => `<li style="margin-bottom:2px;font-size:8.5pt;line-height:1.6;"><strong style="color:${p1};margin-right:4px;">${i + 1}</strong> ${t}</li>`).join('');

    // Identificação
    const outNome = document.getElementById('out-nome')?.textContent || '—';
    const outIdade = document.getElementById('out-idade')?.textContent || '—';
    const outDtnasc = document.getElementById('out-dtnasc')?.textContent || '—';
    const outConv = document.getElementById('out-convenio')?.textContent || '—';
    const outSolic = document.getElementById('out-solicitante')?.textContent || '—';
    const outDtex = document.getElementById('out-dtexame')?.textContent || '—';

    // Seção de imagens DICOM no PDF (decisão 14/05/2026, fix 15/05/2026):
    //  - Página(s) nova(s) após Conclusão (page-break-before: always)
    //  - Layout 2 colunas × 4 linhas = 8 imagens por A4
    //  - SEMPRE 8 slots — última pg pode ter slots vazios (decisão 15/05)
    //  - Fix CSS: `minmax(0, 1fr)` + `min-height: 0` força 4 linhas mesmo
    //    se imagem (aspect 4:3) tentar empurrar pra mais (bug 14/05 saía 6/pg)
    //  - Pulado se imagensIncluidasNoPdf=false (toggle no PopupSalvarEmitir)
    // S5-T13: as páginas em si (grid 2×4, padding de slots vazios) vêm de
    // `renderPaginas()` (DicomGallery.tsx) — mesma função que o botão
    // "Imprimir Seleção" da galeria usa. Reconciliação da deriva S4: essa
    // função usava classes/wording levemente diferentes (`.dicom-pg`/<h2>/
    // "Imagens —") da cópia que já vivia na galeria (`.pagina`/<h1>/
    // "Imagens DICOM —"); a versão da galeria é o padrão-ouro (ver relatório
    // da task). O CSS aqui só re-branda com a cor da clínica (p1) e usa
    // page-break-before (a folha do laudo já terminou antes desta seção).
    let imagensPdfHtml = '';
    if (incluirImagens && imagensSelecionadasPdf.length > 0) {
      const tipoLabel = (exame?.tipoExame as string | undefined) || '';
      const pgsHtml = renderPaginas(imagensSelecionadasPdf, outNome, tipoLabel);
      imagensPdfHtml = `<style>
.pagina{page-break-before:always;display:flex;flex-direction:column;height:calc(100vh - 16mm);padding:8mm;font-family:"IBM Plex Sans",sans-serif;}
.pagina h1{font-size:11pt;font-weight:700;color:${p1};margin-bottom:3mm;padding-bottom:2mm;border-bottom:1.5px solid ${p1};flex-shrink:0;}
.grid{flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:repeat(4, minmax(0, 1fr));gap:3mm;min-height:0;}
.slot{background:#000;border-radius:2px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center;min-height:0;}
.slot-vazio{background:transparent;}
.slot img{max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;}
.slot .num{position:absolute;bottom:2mm;right:2mm;background:rgba(0,0,0,.7);color:#fff;font-size:7.5pt;font-weight:600;padding:1mm 2mm;border-radius:2px;}
</style>${pgsHtml}`;
    }

    // S5-T10 (D6): a folha A4 é UMA só — `montarPdfMoldura` monta
    // cabeçalho/identificação/rodapé pro motor e pro laudo-texto. Aqui só
    // entra o que é do eco: título, os 6 campos e o corpo clínico.
    // A saída é byte-a-byte a mesma de antes da extração
    // (tests/unit/pdf-moldura.test.mjs guarda o template legado).
    const corpoHtml = [
      `<div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;-webkit-print-color-adjust:exact;print-color-adjust:exact;">MEDIDAS E PARÂMETROS</div>`,
      `<div style="border:1px solid #ddd;border-top:none;padding:0;">${paramsHTML}</div>`,
      `<div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">COMENTÁRIOS</div>`,
      `<div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${achadosHTML}</ul></div>`,
      `<div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:3mm;-webkit-print-color-adjust:exact;print-color-adjust:exact;">CONCLUSÃO</div>`,
      `<div style="border:1px solid #ddd;border-top:none;padding:4px 8px;"><ul>${concHTML}</ul></div>`,
    ].join('\n  ');

    return montarPdfMoldura({
      titulo: tituloExame,
      tituloDoc: nomeArq,   // <title> = nome do arquivo, como sempre foi
      identificacao: [
        [
          { label: 'NOME', valor: outNome, flex: 2 },
          { label: 'IDADE', valor: outIdade },
          { label: 'DATA DE NASCIMENTO', valor: outDtnasc },
        ],
        [
          { label: 'CONVÊNIO', valor: outConv },
          { label: 'MÉDICO SOLICITANTE', valor: outSolic },
          { label: 'DATA DO EXAME', valor: outDtex },
        ],
      ],
      corpoHtml,
      htmlPosTabela: imagensPdfHtml,
      cfg: { p1, clinicaNome, clinicaSlogan, clinicaEnd, clinicaTel: telCompleto, logoB64, sigB64, sigTexto },
    });
  }

  // ── PDF via window.open ──
  // FIX F3 (S4-T12 fix): `gerarPdfHtml()` monta as páginas de imagem com a
  // URL CANÔNICA. Nos exames novos o objeto nasce privado no Storage e a
  // janela de impressão (sem a sessão do médico) recebia 403 → páginas em
  // branco. Aqui trocamos textualmente canônica→assinada antes do
  // document.write, reusando o mesmo helper/contrato da galeria. Rota
  // falhou → segue com o HTML original (legados ainda são públicos).
  //
  // A janela abre ANTES do await: depois dele o clique já não conta como
  // gesto do usuário e o navegador bloqueia o popup em rota lenta.
  async function handleImprimir() {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    let html = gerarPdfHtml();
    if (workspace?.id && imagensIncluidasNoPdf && imagensSelecionadasPdf.length > 0) {
      const assinadas = await buscarUrlsAssinadas(workspace.id, exameId, imagensSelecionadasPdf);
      if (assinadas) {
        for (const [canonica, assinada] of Object.entries(assinadas)) {
          html = html.split(canonica).join(assinada);
        }
      }
    }
    // O popup pode ter sido fechado pelo usuário durante o await das URLs
    // assinadas (S4-T15 fix D5) — escrever num `document` morto lança e
    // derrubava o handler inteiro, sem aviso nenhum na tela.
    try {
      win.document.write(html);
      win.document.close();
    } catch {
      alert('A janela de impressão foi fechada. Clique em Imprimir de novo.');
    }
  }

  // ── Copiar para Prontuário ──
  function handleCopiarFormatado() {
    // Mesma raspagem/montagem do PDF — só o opts.pdf muda (S5-T13).
    const paramsHTML = montarParamsHtml(lerParamsDoDOM(), p1, { pdf: false });

    const achadosHTMLContent = getAchadosHTML();
    const concHTMLContent = getConclusoesHTML();
    const achadosHTML = achadosHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${achadosHTMLContent}</div>`
      : coletarAchados().map(t => `<div style="font-size:8.5pt;line-height:1.6;">${t}</div>`).join('');
    const concHTML = concHTMLContent
      ? `<div style="font-size:8.5pt;line-height:1.6;">${concHTMLContent}</div>`
      : coletarConclusoes().map((t, i) => `<div style="font-size:8.5pt;line-height:1.6;"><strong>${i + 1}</strong> ${t}</div>`).join('');

    const temp = document.createElement('div');
    temp.style.cssText = 'font-family:IBM Plex Sans,Arial,sans-serif;font-size:8.5pt;color:#1a1a1a;';
    temp.innerHTML = `
      <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;">MEDIDAS E PARÂMETROS</div>
      <div style="border:1px solid #ddd;border-top:none;padding:0;">${paramsHTML}</div>
      <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:4px;">COMENTÁRIOS</div>
      <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;">${achadosHTML}</div>
      <div style="background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin-top:4px;">CONCLUSÃO</div>
      <div style="border:1px solid #ddd;border-top:none;padding:4px 8px;">${concHTML}</div>
    `;

    document.body.appendChild(temp);
    const range = document.createRange();
    range.selectNodeContents(temp);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.execCommand('copy');
    sel?.removeAllRanges();
    temp.remove();
    toast('Copiado — cole com Ctrl+V no Word, Tasy ou MV');
  }

  function handleCopiarTexto() {
    const achados = coletarAchados().join('\n');
    const conclusoes = coletarConclusoes().map((t, i) => `${i + 1}. ${t}`).join('\n');

    // Tabela alinhada por padEnd/padStart — formato em pdf-params.ts (F3-T3),
    // mesma fonte única do HTML; rodapé = rodapeFontes() (B20).
    const params = paramsParaTexto(lerParamsDoDOM());

    const texto = `MEDIDAS E PARÂMETROS\n${'─'.repeat(80)}\n${params}${'─'.repeat(80)}\n${rodapeFontes()}\n\nCOMENTÁRIOS\n${achados}\n\nCONCLUSÃO\n${conclusoes}`;

    navigator.clipboard.writeText(texto).then(() => {
      toast('Copiado texto simples — cole no prontuário');
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copiado texto simples');
    });
  }

  async function handleBaixarWord() {
    // F3-T3: filtro/forma vêm de pdf-params.ts.
    const params = paramsParaDocx(lerParamsDoDOM());

    // F3-T5: identificação dos #out-*, igual ao PDF assinado (era input cru,
    // com a data do exame em ISO). Consequências declaradas na allowlist:
    // dtexame sai em pt-BR e campo vazio sai como '—' (o que o PDF já fazia).
    const outNome = document.getElementById('out-nome')?.textContent || 'PACIENTE';
    const outConv = document.getElementById('out-convenio')?.textContent || '';
    const outDtex = document.getElementById('out-dtexame')?.textContent || '';

    await gerarDocx({
      clinicaNome,
      medicoNome: (profile?.nome as string) || '',
      medicoCrm: `CRM/${profile?.ufCrm || ''} ${profile?.crm || ''}`,
      pacienteNome: outNome.trim().toUpperCase(),
      dataExame: outDtex,
      convenio: outConv,
      p1,
      params,
      achados: coletarAchados(),
      conclusoes: coletarConclusoes(),
    });

    toast('Word (.docx) baixado!');
  }

  // S5-T12: delega pro `window.showToast` (mesmo cssText — instalado no
  // efeito "Carregar motor", page.tsx:~421) em vez de duplicar o markup aqui.
  function toast(msg: string) {
    (window as unknown as { showToast?: (msg: string) => void }).showToast?.(msg);
  }

  function handleLimpar() {
    if (!confirm('Limpar todos os campos?')) return;
    limparCampos();
    // nº14-alto (S5 corr): "Limpar" zera as medidas mas deixava
    // `dicomImportado` true — o botão "📡 Importar" continuava mostrando o
    // selo de "já importado" mesmo com os campos todos vazios de novo.
    setDicomImportado(false);
  }

  /**
   * Zera os campos do motor pelos IDs conhecidos por id — funciona com a
   * seção aberta ou fechada (desde nº4/S5-T4, `Sec` monta os filhos SEMPRE e
   * só alterna `hidden`; getElementById por id nunca dependeu do container
   * estar visível, então esta função nunca teve o problema que o
   * event-delegation acima corrigiu — mas antes do nº4 uma seção fechada
   * podia nem ter o input no DOM pra zerar).
   *
   * Dois chamadores: o botão "Limpar" (com `confirm`, acima) e a TROCA de
   * exame (S5-T2 fix3). A wave 2 tinha escrito uma segunda limpeza a partir
   * de `Object.keys(coletarMedidas())` e foi por aí que dois campos do
   * paciente anterior vazaram pro exame novo: `convenio` (excluído de
   * `coletarMedidas` de propósito — fonte única) e `wilkins-toggle`
   * (checkbox: `.value = ''` nunca desmarca). Uma função só, dois
   * chamadores.
   *
   * @param trocaDeExame também limpa a identificação — ver dentro.
   */
  function limparCampos(trocaDeExame = false) {
    // I1 da revisão F3-T6: limpar campos NÃO limpa a tabela pintada nem dispara
    // rodada — com params ON, a tabela do exame ANTERIOR ficaria emitível na
    // janela do round-trip (troca de exame) ou pra sempre (botão Limpar).
    // Marcar velha aqui faz o guard de emissão segurar até a próxima pintura.
    tabelaFrescaRef.current = false;
    const camposNum = [
      'peso','altura',
      'b7','b8','b9','b10','b11','b12','b13','b28','b29',
      'b19','b20','b21','b22','b23','b24','b25','lars',
      'b54','b33','gls_ve','gls_vd',
      'b45','b46','b47','b50','b51','b52','b46t','b47t','b50p',
      'psmap','b37',
      'wk-mob','wk-esp','wk-cal','wk-sub',
    ];
    const camposSel = [
      'sexo','ritmo',
      'b32','b34','b35','b36','b34t','b39','b40','b39p','b40p','b41','b42','b38',
      'b55','b56','b57','b58','b59','b60','b61','b62',
      'wilkins-toggle','diast-manual-sel',
    ];
    camposNum.forEach(id => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (el) el.value = '';
    });
    camposSel.forEach(id => {
      const el = document.getElementById(id) as HTMLSelectElement | HTMLInputElement | null;
      if (!el) return;
      if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
      else if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = false;
    });
    // Painel do Wilkins: desmarcar o toggle não o esconde (quem faz isso é o
    // onClick da sidebar) — aberto com o toggle off, o médico preenche os 4
    // escores e nada entra no laudo.
    const wf = document.getElementById('wilkins-fields');
    if (wf) wf.style.display = 'none';
    // nº15: ícone tem estado próprio agora (☐/☑) — sem isto o "Limpar"
    // desmarcava o checkbox mas o ícone continuava mostrando ☑.
    const wi = document.getElementById('wilkins-icon');
    if (wi) wi.textContent = '☐';
    // Diastólica manual (review S5-T3, I1+I2): mesma classe de bug do Wilkins
    // acima. (I2) valor canônico explícito — não confia em selectedIndex==0
    // do <select> (se alguém reordenar as <option>, o loop de camposSel
    // acima selecionaria outro índice; esta linha corrige por cima, sempre).
    // (I1) quem sabe fechar #diast-manual-panel e repintar os botões
    // "Automático"/"Manual" é o wrapper de window.setDiastModo — sem chamá-lo
    // aqui a tela ficava dizendo "Manual" com o motor já em auto.
    setVal('diast-manual-sel', '-1');
    const setDiastModoFn = (window as unknown as Record<string, unknown>).setDiastModo as ((m: string) => void) | undefined;
    if (setDiastModoFn) setDiastModoFn('auto');
    // M1 (review S5-T4): mesma classe de bug do Wilkins/diastólica acima —
    // zerar `b40p` não esconde `#field-psmap` (quem faz isso é o handler do
    // próprio select). Sem isto o campo fica visível e vazio depois de
    // "Limpar".
    // F3-T6: era `window.refluxoPulmonar` (motor legado). O try/catch existia
    // porque um throw aqui pularia a limpeza de identificação logo abaixo (o
    // vazamento de paciente que este bloco existe pra impedir) — a função
    // local guarda os dois nós e não lança, então saiu junto.
    sincronizarCampoPmap();
    if (trocaDeExame) {
      // Identificação do paciente ANTERIOR: `preencherExame()` só escreve
      // campo vazio (`if (el && !el.value && val)`), então sem zerar aqui o
      // nome/convênio/data de A ficam na tela do exame de B — e
      // `salvarLaudo` grava `coletarIdentificacao()` lida do DOM. `convenio`
      // é o pior: canônico pra Worklist/Extrato e fora de `coletarMedidas`,
      // então nada o sobrescrevia. `dtexame` fica VAZIO (não "hoje") pra
      // `preencherExame()` conseguir escrever a data do exame novo.
      ['nome', 'dtnasc', 'dtexame', 'solicitante', 'convenio'].forEach((id) => setVal(id, ''));
    } else {
      const dtEx = document.getElementById('dtexame') as HTMLInputElement;
      if (dtEx) dtEx.value = dataLocalHoje();
    }
    safeCalc();
  }

  return (
    <div className={`h-screen grid grid-cols-[390px_1fr] overflow-hidden font-[family-name:var(--font-ibm-plex)] ${emitido ? 'laudo-locked' : ''}`}>
      {/* v3: alerta se motor falhou */}
      {motorErro && (
        <div className="fixed top-0 left-0 right-0 z-[9999] bg-red-600 text-white text-center py-2 text-sm font-semibold">
          Motor de calculos indisponivel. <button onClick={() => window.location.reload()} className="underline ml-2">Recarregar pagina</button>
        </div>
      )}
      <SidebarLaudo
        clinicaNome={clinicaNome}
        medicoInfo={medicoInfo}
        onVoltar={handleVoltar}
        onSalvarEmitir={handleSalvarEmitir}
        onLimpar={handleLimpar}
        onImportarDicom={handleImportarDicom}
        dicomImportado={dicomImportado}
        ortancAtivo={!!workspace?.ortancAtivo}
        totalMedidasDicom={schemaAntigo ? totalMedidasBrutas : inputsImportaveis.length}
        totalImagensDicom={((exame?.imagensDicom as string[] | undefined) || []).length}
        onAbrirGaleria={() => setGaleriaOpen(true)}
        emitido={emitido}
        readOnlyIdentificacao={!!(exame?.emitidoEm)}
        readOnlyMotor={emitido}
        exameOrigem={exame?.origem as string || ''}
        exameCpf={exame?.cpf as string || ''}
        exameAcc={exame?.acc as string || ''}
        onCorrigirAdmin={handleCorrigirLaudo}
        wsId={workspace?.id}
        onToast={toast}
        alertasMotor={alertasMotor}
        paramsOn={paramsOn}
        modoEmitido={
          <ModoEmitido
            onFinalizar={handleFinalizar}
            onEditar={handleDesbloquear}
            onImprimir={handleImprimir}
            onCopiarFormatado={handleCopiarFormatado}
            onCopiarTexto={handleCopiarTexto}
            onBaixarWord={handleBaixarWord}
          />
        }
      />
      <SheetA4
        p1={p1}
        clinicaNome={clinicaNome}
        clinicaSlogan={clinicaSlogan}
        clinicaEnd={clinicaEnd}
        clinicaTel={telCompleto}
        sigTexto={sigTexto}
        logoB64={logoB64}
        sigB64={sigB64}
        titulo={tituloExame}
        editorLaudo={
          <EditorLaudo
            // `key` por exame (S5-T2 fix, Critical 1 do review): navegar
            // /laudo/A → /laudo/B NÃO desmonta esta página, e o editor
            // continuava exibindo o texto do paciente A. Com `prevGer`
            // zerado no reset por exame, o merge tratava esse texto como
            // "frases manuais do médico" e as preservava DENTRO do laudo do
            // paciente B (escondendo os achados do B). Trocar a key remonta
            // o TipTap vazio: o merge passa a ver [] e a geração do B manda.
            key={exameId}
            ref={editorRef}
            placeholder="Achados e conclusões do exame..."
            // S5-T6: trava única do emitido chega no texto — `setContent`
            // (restauração/regen do motor) continua funcionando com
            // editable:false (ver comentário na prop em EditorLaudo.tsx).
            editable={!emitido}
            onDirty={() => { dirtyRef.current = true; }}
            onAddFrase={() => setBancoOpen(true)}
          />
        }
      />
      {/* Banco de Frases (F3-T7) — mesmo acervo (localStorage
          `medcardio_banco`), mesmas 34 frases de fábrica, agora em React. */}
      {bancoOpen && (
        <BancoFrases
          p1={p1}
          onClose={() => setBancoOpen(false)}
          onInserir={(txt) => editorRef.current?.insertLine(txt)}
        />
      )}
      {/* Popup Salvar/Emitir — agora mostra toggle "Incluir imagens DICOM"
          quando há selecionadas (decisão 15/05/2026). */}
      <PopupSalvarEmitir
        open={popupOpen}
        onClose={() => setPopupOpen(false)}
        onRascunho={handleRascunho}
        onEmitir={handleEmitir}
        totalImagensSelecionadas={imagensSelecionadasPdf.length}
      />
      {/* Modal de Import SR — validação 1-a-1 das medidas do Vivid antes
          de jogar no motor (decisão 15/05/2026). Aberto pelo botão
          "📡 Importar (N)" no sidebar. Filtra calculados (motor recalcula). */}
      <DicomSrImport
        open={srImportOpen}
        onClose={() => setSrImportOpen(false)}
        inputs={inputsImportaveis}
        pacienteNome={exame?.pacienteNome as string | undefined}
        onImportar={handleConfirmarImportSr}
        totalRecebidas={totalRecebidas}
        schemaAntigo={schemaAntigo}
        onSolicitarReprocesso={handleSolicitarReprocesso}
        reprocessoPendente={exame?.reprocessarDicom === true}
      />
      {/* Galeria DICOM — modal full-screen (z-1000) com thumbnails e lightbox.
          Aberta pelo botão "🖼️ Imagens (N)" no sidebar. Modo seleção ON
          (decisão 14/05/2026) — médico marca quais vão pro PDF. */}
      <DicomGallery
        open={galeriaOpen}
        onClose={() => setGaleriaOpen(false)}
        imagens={(exame?.imagensDicom as string[] | undefined) || []}
        wsId={workspace?.id}
        exameId={exameId}
        pacienteNome={exame?.pacienteNome as string | undefined}
        tipoExame={exame?.tipoExame as string | undefined}
        permitirSelecao
        selecionadas={imagensSelecionadasPdf}
        onToggleSelecao={handleToggleSelecaoImagem}
      />
      {/* CSS global */}
      <style jsx global>{`
        .sf{width:100%;border:1.5px solid #E5E7EB;border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#111827;background:#fff;transition:border-color .15s;}
        .sf:focus{outline:none;border-color:#1E3A5F;}

        /* ── TipTap: heading CONCLUSÃO dentro do editor ── */
        .tiptap h3{background:${p1};color:#fff;font-size:8pt;font-weight:700;padding:3px 8px;margin:8px -8px 4px;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
        .tiptap ol{list-style:decimal;padding-left:18px;margin:0;}
        .tiptap ol li{font-size:8.5pt;line-height:1.6;padding:1px 0;}
        .tiptap p{margin:0;padding:1px 0;}

        /* ── Botões achados/conclusões: +, ×, ⠿ ── */
        .btn-rm{background:none;border:none;color:#EF4444;font-size:14px;cursor:pointer;padding:0 2px;line-height:1;opacity:.4;transition:opacity .15s;flex-shrink:0;}
        .btn-rm:hover{opacity:1;}
        .btn-plus-inline{background:none;border:none;color:#F59E0B;font-size:16px;cursor:pointer;padding:0 2px;line-height:1;opacity:.4;transition:opacity .15s;flex-shrink:0;}
        .btn-plus-inline:hover{opacity:1;}
        .drag-handle{cursor:grab;color:#9CA3AF;font-size:10px;user-select:none;flex-shrink:0;padding:2px 0;opacity:.4;transition:opacity .15s;}
        .drag-handle:hover{opacity:1;color:#6B7280;}
        .drag-handle:active{cursor:grabbing;}
        .btn-add-top{display:block;width:100%;background:none;border:1px dashed #D1D5DB;border-radius:4px;padding:4px 0;color:#2563EB;font-size:9pt;font-weight:600;cursor:pointer;margin-top:4px;transition:background .15s,border-color .15s;}
        .btn-add-top:hover{background:#EFF6FF;border-color:#2563EB;}

        /* ── Drag & drop visual feedback ── */
        .conc-wrapper.dragging{opacity:.4;background:#DBEAFE;}
        .conc-wrapper.drag-over{border-top:2px solid #2563EB;}
        .conc-wrapper{position:relative;}

        /* ── Hover: mostrar botões só ao passar o mouse ── */
        .conc-wrapper .btn-rm,.conc-wrapper .drag-handle{opacity:0;transition:opacity .15s;}
        .conc-wrapper:hover .btn-rm,.conc-wrapper:hover .drag-handle{opacity:.6;}

        .params-divider{border-left:2px solid #8B1A1A!important;}

        /* ── Modal Banco de Frases ── */
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1000;display:none;align-items:center;justify-content:center;}
        .modal-overlay.open{display:flex;}
        .modal-box{background:#fff;border-radius:8px;width:680px;max-width:95vw;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;}
        .modal-header{color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
        .modal-header h2{font-size:14px;font-weight:600;margin:0;}
        .modal-close{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1;padding:0 4px;}
        .modal-search{padding:10px 16px;border-bottom:1px solid #E5E7EB;flex-shrink:0;}
        .modal-search input{width:100%;border:1.5px solid #E5E7EB;border-radius:5px;padding:7px 10px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;}
        .modal-search input:focus{outline:none;border-color:#1E3A5F;}
        .modal-cats{display:flex;gap:6px;padding:8px 16px;flex-wrap:wrap;border-bottom:1px solid #E5E7EB;flex-shrink:0;}
        .cat-btn{background:#F3F4F6;border:1.5px solid #E5E7EB;color:#6B7280;font-size:10.5px;padding:3px 10px;border-radius:20px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;transition:all .12s;}
        .cat-btn.active,.cat-btn:hover{background:#1E3A5F;border-color:#1E3A5F;color:#fff;}
        .modal-list{flex:1;overflow-y:auto;padding:8px 16px;}
        .frase-item{display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:5px;cursor:pointer;border:1px solid transparent;transition:all .12s;margin-bottom:3px;}
        .frase-item:hover{background:#EFF6FF;border-color:#E5E7EB;}
        .frase-item.selected{background:#EEF2F8;border-color:#1E3A5F;}
        .frase-text{flex:1;font-size:12px;color:#374151;line-height:1.4;}
        .frase-cat{font-size:10px;color:#6B7280;background:#F3F4F6;padding:1px 6px;border-radius:10px;flex-shrink:0;}
        .frase-btns{display:flex;gap:4px;flex-shrink:0;}
        .frase-btn-edit,.frase-btn-del{background:none;border:1px solid #E5E7EB;font-size:11px;padding:2px 6px;border-radius:3px;cursor:pointer;transition:all .12s;}
        .frase-btn-edit:hover{background:#EFF6FF;border-color:#1E3A5F;}
        .frase-btn-del:hover{background:#FEE2E2;border-color:#EF4444;color:#EF4444;}
        .modal-footer{padding:10px 16px;border-top:1px solid #E5E7EB;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-shrink:0;}
        .modal-nova-frase{display:flex;gap:6px;flex:1;}
        .modal-nova-frase input{flex:1;border:1.5px solid #E5E7EB;border-radius:5px;padding:6px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;}
        .modal-nova-frase input:focus{outline:none;border-color:#1E3A5F;}
        .modal-nova-frase select{border:1.5px solid #E5E7EB;border-radius:5px;padding:6px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;background:#fff;}
        .btn-nova-add{background:#1E3A5F;color:#fff;border:none;padding:6px 14px;border-radius:5px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;}
        .btn-inserir{background:#2563EB;color:#fff;border:none;padding:8px 20px;border-radius:5px;font-size:13px;font-weight:600;cursor:pointer;}
        .btn-inserir:disabled{background:#ccc;cursor:default;}

        /* ── Undo/Redo ── */
        .undo-redo-bar{display:flex;gap:4px;justify-content:flex-end;padding:2px 0;margin-bottom:2px;}
        .btn-undo,.btn-redo{background:none;border:1px solid #E5E7EB;color:#6B7280;font-size:12px;padding:2px 8px;border-radius:4px;cursor:pointer;font-family:'IBM Plex Sans',sans-serif;transition:all .12s;}
        .btn-undo:hover,.btn-redo:hover{background:#EFF6FF;border-color:#2563EB;color:#2563EB;}
        #params-tbody td{border:0.5px solid #ccc;padding:2px 5px;}
        /* F3-T3 (B15 parcial): o realce vermelho do valor fora de referência.
           ESCOPADO ao Senna93 (achado do teste ao vivo 27/08): o motor legado
           também emite class="alert", mas DESLOCADO 3 linhas — bug antigo que
           CSS nenhum revelava até a T3. O params-render.ts assina a pintura
           com data-engine="senna93"; a pintura do legado fica sem o atributo,
           sem realce (status quo de sempre) e o bug morre com ele na F5. */
        #params-tbody[data-engine="senna93"] td.alert{color:#B91C1C;font-weight:600;}
        /* S5-T6 fix (review Important 2): CSS trava mouse+visual de TODO
           campo do motor; convênio/solicitante ficam de fora (correção
           administrativa sem crédito, T5 — sempre editáveis) e nome/dtnasc/
           dtexame TAMBÉM ficam de fora — são da trava de IDENTIFICAÇÃO
           (idBloqueado, disabled nativo no JSX): sem esta exceção, o botão
           "🔓 Desbloquear nome/datas" liberava o campo no React mas o CSS
           continuava com pointer-events:none por cima (emitido ainda true —
           desbloquear identificação não é a reedição clínica) — o
           desbloqueio PAGO ficava morto pro mouse. Mesmos 5 ids no
           disabled-setter de SidebarLaudo.tsx (a lista 'livres') — as duas
           listas são o MESMO conjunto; teste unitário (laudo-trava-emitido)
           trava isso comparando as duas, não repetir um id só de um lado. */
        .laudo-locked #laudo-sidebar input:not(#convenio):not(#solicitante):not(#nome):not(#dtnasc):not(#dtexame),.laudo-locked #laudo-sidebar select:not(#convenio):not(#solicitante):not(#nome):not(#dtnasc):not(#dtexame),.laudo-locked #laudo-sidebar textarea:not(#convenio):not(#solicitante):not(#nome):not(#dtnasc):not(#dtexame){pointer-events:none;opacity:.6;background:#f1f5f9;}
        .laudo-locked #laudo-sidebar .section-btn{pointer-events:none;opacity:.5;}
        .laudo-locked #modo-edicao{display:none;}
      `}</style>
    </div>
  );
}
