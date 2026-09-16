# Prompt de abertura — sessão da revisão da Seção 4 (Wader/DICOM/Orthanc)

> Colar o bloco abaixo como primeira mensagem da sessão nova.

---

Executar a **revisão da Seção 4 (Wader / DICOM / Orthanc)** — a quarta do mapa de 8
seções do LEO — e, aprovado o desenho, a correção dos achados.

**Estado do projeto (20/08/2026):** Seções 1, 2 e 3 revisadas, corrigidas e NO AR.
A correção da Seção 3 subiu hoje (merge `0fb2191`, regra `9ebfc2fc`, índices
deployados); o cronograma de testes dela está em
`docs/planos/2026-08-20-cronograma-testes-secao3.md` — Fases 0 e 1 executadas com
2 bugs achados e corrigidos (`72c6eef`, `2d772d6`); **Fases 2 e 3 pendentes** (dia
de clínica + visita), não bloqueiam esta revisão. Ledger:
`.superpowers/sdd/progress.md` (seções "Sub-plano 5" e "Correcao Secao 3" têm as
decisões e os radares). Memória local e Obsidian (`Leo/Decisões/`) têm o histórico.

**Por que a Seção 4 agora, e com urgência logística:** há uma atualização do Wader
PENDENTE na máquina da clínica (acumula Sub-plano 5 + Seção 3). Todo conserto de
Wader que esta revisão achar deve ser corrigido ANTES da visita, para pegar a
MESMA atualização — senão é uma segunda ida à clínica.

**O que já foi varrido e o que nunca foi:** a superfície de segurança e fronteira
desta seção acabou de ser endurecida (Sub-plano 5 Tasks 5/7; Seção 3 Tasks 7/8):
corte nuvem-Orthanc (a rota `/api/orthanc` morreu — a Vercel NUNCA alcançou o
Orthanc), batimento do Wader reporta o Orthanc, `mwlStatus` escrito pelo próprio
Wader, fonte única de "hoje" em Belém (`clinica-tempo.ts`). O que a tríade NUNCA
varreu é a **lógica de ingestão** — o caminho da imagem do aparelho até o laudo:

- o casamento imagem↔exame pelo ACC (`apps/wader/src/workers/dicom-ingest.ts`,
  incluindo o fallback legado por doc id e os `candidatos()` de ACC);
- o extrator de medidas do SR e o `adaptador-motor.js` — **há registro desde
  12/05 de códigos LOINC errados no adaptador** (SR do Edwaldo, 32 medidas);
  medida errada entra no laudo clínico;
- o recovery de ACC digitado errado no aparelho (`acc-recovery-worker.ts`);
- `worklist-sync.ts` / `wl-writer.ts` (elegibilidade, remoção, tags DICOM — as 26
  tags fechadas em 09/05);
- `exames-repo.ts`, `orthanc-client.ts`, e o lado web que consome o resultado
  (`exame.medidasDicom`, botão "Importar DICOM" — que é lido pelo motor:
  `src/components/laudo/SidebarLaudo.tsx:187` via `ortancAtivo`, INTOCÁVEL).

**Método (o mesmo que fechou as Seções 2 e 3):**
1. Tríade em 3 óticas independentes, cada uma instruída a NÃO repetir a outra:
   corretude/casos-de-borda (opus), arquitetura/fronteiras (opus), Ponytail/o que
   deletar (sonnet). Cada achado com arquivo:linha, cenário concreto e gravidade;
   cada revisor diz também o que verificou e está CERTO. Formato-modelo:
   `docs/planos/2026-08-19-revisao-secao3-feegow.md`.
2. Consolidar em `docs/planos/2026-08-2X-revisao-secao4-wader.md`, achados por
   onda, e apresentar ao Sergio com as decisões que forem dele.
3. Aprovado o desenho: spec em `docs/superpowers/specs/`, plano em
   `docs/planos/`, esteira `superpowers:subagent-driven-development` (branch nova
   a partir da master, implementador por task + revisor por task + revisão final
   com o modelo mais capaz, commit+push por task, ledger).

**Contexto de domínio para os revisores:** o Wader roda NA CLÍNICA (Windows,
CommonJS, vitest); fala com o Orthanc por HTTP local e com o Firestore por
Service Account (passa por cima das regras). A worklist do Vivid são arquivos
`.wl` que o Orthanc serve por C-FIND. Identidade de exame importado:
`fg-{agendamento_id}-{dataExame}` (desde 20/08; os 182 antigos têm id aleatório e
`feegowAppointId` pode ser NÚMERO — igualdade do Firestore é sensível a tipo, já
mordeu uma vez). CPF é a chave do pareamento paciente↔imagem; ACC é a chave
exame↔estudo. Fuso: America/Belem, sem horário de verão.

**Lições/restrições que valem sempre:** Motor (`src/app/laudo/[id]/page.tsx`),
`src/components/laudo/**` e Direx INTOCÁVEIS (achado neles = reportar, task
própria). NÃO usar `git stash`. Commit+push por task (Dual Claude). `.superpowers/`
é git-ignored — conferir `git show --stat` do que subagentes commitam. Porta 8080
ocupada = matar java zumbi, nunca trocar a porta. Verificação manual: conta Gmail
de teste, NUNCA a Yahoo. `node --test` não resolve import local encadeado entre
`.ts`. `npm run x -- --commit` (sem o `--` o npm engole a flag). Deploy fora do
horário da clínica. Obsidian direto no disco. Placar atual da bateria: unit 67,
api 182, rules 132, wader vitest 41, e2e 5 — tsc e build limpos.

**Pendências vivas que a sessão NÃO deve atropelar:** (1) a limpeza dos campos
antigos (`integracoes:limpar -- --commit`) SÓ depois do Wader atualizado na
clínica — o binário instalado ainda lê os campos antigos; limpar antes MATA a
ingestão; (2) `FEEGOW_API_TOKEN` ainda no painel do Vercel (remover — ação
humana); (3) a senha do Orthanc está no histórico público do git — a troca
acontece na visita.

**Autorizações a pedir ao Sergio LOGO NO INÍCIO (em lote):** (1) rodar a tríade e
consolidar o relatório; (2) apresentar os achados e SÓ escrever plano/executar
depois das decisões dele; (3) na execução: commits/pushes por task; (4) regra
nova do Firestore, se houver, só com confirmação; merge+deploy ao final com
confirmação. A atualização do Wader na clínica e a limpeza ficam para a visita —
não pedir autorização antecipada.

**Ao concluir:** revisão consolidada no doc, decisões registradas, e (se a
execução rodar) ADR em `docs/decisoes/`, nota no Obsidian, memória local,
atualização do mapa das 8 seções na memória (`project_revisao_secao2_worklist`
tem o mapa), e o placar pro Sergio: ficam as Seções 5, 6 (motor — maior risco
clínico), 7 e 8.
