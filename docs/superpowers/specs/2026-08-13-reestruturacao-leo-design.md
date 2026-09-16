# Reestruturação do LEO — Design/Spec

**Data:** 13/08/2026 · **Status:** aprovado em conversa (brainstorm com mockups), aguardando revisão final do Sergio
**Objetivo:** transformar o LEO numa plataforma SaaS vendável — navegação por seções com URLs reais, identidade V7 consolidada em design system, e as três entidades que faltavam: Pacientes, Catálogo de tipos de laudo e Integrações.
**Prazo declarado:** 5 dias (12/08 → ~18/08). Tudo que não cabe está nomeado em "Fase 2".

## 1. Contexto (por que reestruturar)

Levantamento completo em `docs/planos/` + espelho no Obsidian (`Leo/Decisões/2026-08-12 Pré-definições de design (V7) e retrato do app.md`):

- O app do médico é um monólito sem menu: `/dashboard` com 4 abas em `useState` (sem URL, sem back), configurações em modais, laudo em outro universo visual. O Direx é o único lugar com navegação de verdade.
- Zero tokens de design (185× `#1E3A5F` hardcoded), zero dark mode, mobile inexistente.
- Motor: o motor do LEO é o **Senna** (senna90, server-side; motor v8 legado ainda convive atrás de flag).
- Funcionalidades sem lugar: histórico por paciente não tem tela (os dados JÁ são armazenados por paciente — ficha + exames ligados por `pacienteId`, CPF como chave DICOM); integrações esfareladas em modais e campos soltos; tipos de exame hardcoded.

## 2. Direção visual (decidida com mockups no painel de brainstorm)

**Escolha do Sergio: estrutura "Shell SaaS por seções" com pele clean clara — "sidebar branca" (opção 1).**

- Identidade **V7 mantida** (pré-definição encontrada em `Desktop/LEO/v7/css/leo_v9.1.css`):
  IBM Plex Sans (+ Plex Mono p/ ACC e laudo) · navy `#1E3A5F` (--P1) · azul ação `#2563EB` (--P2) ·
  fundo `#F1F5F9` · cards brancos, borda `#E2E8F0`, radius 10–18px ·
  status: aguardando `#FEF3C7/#92400E`, andamento `#DBEAFE/#1E40AF`, emitido `#D1FAE5/#065F46`, rascunho cinza ·
  alerta `#F59E0B`, crítico `#EF4444` · gradiente assinatura 135° navy→azul SÓ em logo e botões primários.
- **Sidebar branca** com borda sutil; item ativo em `#EEF2F8` navy; conteúdo em `#F1F5F9` com cards brancos e sombras leves (`0 1px 3px rgba(15,23,42,.04)`).
- Tokens CSS de verdade (`--p1`, `--p2`, `--surface`, `--border`, `--status-*`…) em `globals.css` (que hoje é boilerplate morto do create-next-app — será reescrito). Nenhum hex novo hardcoded; migração das telas troca hex → token.
- Laudo impresso continua com cor por local (`workspace.corPrimaria`, default `#8B1A1A`) — não muda.
- **Dark mode: Fase 2** (os tokens nascem preparados; o Direx permanece dark como está).
- Mockups de referência: `.superpowers/brainstorm/390-1786581297/content/` (`visual-style-v7.html`, `layout-fusao.html` — card "sidebar-branca").

## 3. Navegação — shell por seções

Layout novo `src/app/(plataforma)/layout.tsx` (route group) com sidebar fixa + conteúdo. Cada seção é rota real:

| Rota | Seção | Papéis que veem |
|------|-------|-----------------|
| `/agenda` | 📋 Agenda — fila do dia (Worklist), cadastro, importar Feegow, não-realizados, espera | todos |
| `/pacientes` | 👥 Pacientes — busca nome/CPF → ficha → linha do tempo de exames | todos |
| `/laudos` | 🗂 Laudos — histórico de emitidos, filtros, imprimir, corrigir | todos |
| `/financeiro` | 💰 Financeiro — extrato por convênio, honorários | dono, médico (`podeVerFinanceiro`) |
| `/integracoes` | 🔌 Integrações — Feegow · Orthanc/aparelho · Wader | dono |
| `/clinica` | 🏥 Clínica — subseções: Dados do local · Equipe · **Tipos de laudo** · Plano & franquia | dono (Equipe/Tipos/Plano); dados básicos visíveis a todos |

- **Menu de conta** no rodapé da sidebar (avatar): Perfil, trocar de local, sair.
- `/dashboard` passa a redirecionar pra `/agenda` (bookmarks e links antigos continuam funcionando).
- `/laudo/[id]` continua rota própria em tela cheia (bancada de trabalho); ganha apenas topo coerente (voltar pra origem, nome do paciente, ACC) — o motor NÃO é tocado nesta fase.
- Direx: intocado. Login/cadastro/convite: ganham a pele nova (primeira impressão de venda), sem mudar o fluxo de auth da Seção 1.
- Responsivo básico: sidebar colapsa em drawer abaixo de `lg`; tabelas ganham `overflow-x-auto`. Laudo continua desktop.
- Componentes compartilhados mínimos do shell: `Sidebar`, `PageHeader`, `StatusPill`, `MetricCard` — extraídos UMA vez e reusados (hoje `Pill`/`MetricCard` são reescritos em 4+ páginas do Direx; Direx migra pra eles na Fase 2).

## 4. Catálogo de tipos de laudo (nova entidade) — "cada laudo escolhe como é alimentado"

Decisão central do Sergio: **a modalidade de laudo é configuração editável por tipo de exame**, na subseção **Clínica → Tipos de laudo** (edição: dono).

**Modelo de dados:** `workspaces/{wsId}/tiposLaudo/{tipoId}`

```
{ id, nome, icone, ativo, ordem,
  modalidade: 'motor' | 'texto' | 'pdf',
  motorId?: 'senna' | <futuros>,     // modalidade 'motor'. Registry de motores no código.
  modeloTexto?: string,              // modalidade 'texto': modelo TipTap (HTML) editável
  criadoEm, atualizadoEm }
```

**Seed padrão (migração cria estes docs por workspace existente):**

| tipoId | Nome | Modalidade | Detalhe |
|--------|------|-----------|---------|
| `eco_tt` | Eco Transtorácico | motor | motorId: senna |
| `eco_te` | Eco Transesofágico | motor | motorId: senna |
| `eco_stress` | Eco Stress | motor | motorId: senna |
| `doppler_carotidas` | Doppler de Carótidas | **texto** | modelo inicial incluso; vira `motor` na Fase 2 (motor do V7 portado) |
| `ecg` | ECG | pdf | novo tipo |
| `mapa` | MAPA | pdf | novo tipo |
| `holter` | Holter | pdf | novo tipo |
| `ergometrico` | Teste Ergométrico | pdf | novo tipo |

- Os `tipoId` legados são preservados (`exame.tipoExame` continua a mesma string — zero migração de exames).
- Trocar modalidade de um tipo (ex.: carótidas texto→motor) é editar o doc — as telas obedecem ao catálogo.
- Criar tipo novo pela UI (ex.: "Doppler venoso") = doc novo; aparece no cadastro da Agenda automaticamente.
- **Provável segundo motor** (além do Senna) já contemplado: `motorId` é referência a um registry (`src/lib/motores.ts` mapeia id → rota/handler do motor). Motor novo = entrada no registry.

**Fluxo de laudo por modalidade** (decidido no clique "Laudar" da Agenda, olhando o catálogo):

- `motor` → `/laudo/[id]` como hoje (Senna).
- `texto` → `/laudo/[id]` em modo editor: TipTap abre com `modeloTexto` do tipo; sem sidebar de medidas; emitir gera PDF pelo mesmo `/api/emitir`/pipeline atual.
- `pdf` → diálogo de anexar: upload do PDF do aparelho (Holter/MAPA/ECG) → rota server (`/api/emitir` com modo anexo, valida tipo/tamanho, guarda em `laudos/{wsId}/…`) → exame vira `emitido` com `pdfUrl`, entra na timeline do paciente e no histórico.
- **Decisão pendente do Sergio (default proposto: SIM):** exame por PDF anexado consome franquia como laudo emitido.

**Regras Firestore:** `tiposLaudo` — leitura: membro do local; escrita: dono (payload whitelisted). Entra em `firestore.rules` com teste de payload real na suíte existente.

## 5. Seção Pacientes (nova tela sobre dados existentes)

- `/pacientes`: busca por nome/CPF (client-side sobre a coleção `pacientes` do local; a coleção já existe).
- Ficha: dados cadastrais + **linha do tempo** de todos os exames (`getExames(wsId, pacienteId)` — função já existe em `src/lib/firestore.ts`), qualquer tipo/modalidade, com status, data, PDF.
- Ações na ficha: abrir laudo/PDF, editar cadastro (mesmas regras de permissão da Worklist).
- Fase 2: comparativo de medidas entre ecos seriados; visão cross-local da mesma conta (hoje paciente é por local; CPF permite unificar depois).

## 6. Seção Integrações (realiza o ADR `docs/decisoes/2026-08-10-secao-integracoes.md`)

- `/integracoes` (dono): um cartão por integração — **Feegow** (escopo conta) · **Orthanc/aparelho** (escopo local) · **Wader** (on-prem).
- Cada cartão: estado (conectado/erro/nunca configurado), última sincronização, botão **Testar conexão** (rotas `/api/feegow?action=teste` e `/api/orthanc` já existem), configuração.
- **Credenciais write-only**: campo digita-e-nunca-volta. Nesta fase os segredos são gravados via rota server nos campos atuais (`workspaces/{id}.feegowToken` etc.) e a UI nunca os lê de volta; a migração completa pro cofre (`workspaces/{id}/privado/*`, que as regras já trancam) é o passo seguinte da mesma seção, sem mudar a tela.
- Mapeamentos Feegow (procedimentos/profissionais) saem do LocalModal pra cá.

## 7. Rollout nos 5 dias (ordem de execução)

1. **Fundação:** tokens em `globals.css` reescrito + shell `(plataforma)` com sidebar/rotas + redirects. Telas existentes entram no shell SEM redesign interno primeiro (Worklist/Histórico/Extrato/Membros viram páginas).
2. **Agenda:** migração visual da Worklist + **execução do plano de correção da Seção 2** (`docs/planos/2026-08-12-plano-correcao-secao2-worklist.md`, já revisado pela tríade) — mesma tela, um trabalho só.
3. **Catálogo de tipos de laudo** (dados + subseção em Clínica) + fluxo `texto` e `pdf`.
4. **Pacientes** (busca + ficha + timeline).
5. **Integrações** (cartões + testar conexão + write-only).
6. **Clínica** (dados do local + equipe + plano — conteúdo dos modais atuais vira página).
7. **Login/cadastro/convite** com a pele nova + varredura final (tríade da reestruturação, build, deploy).

Cada bloco: branch única `feat/reestruturacao-plataforma`, commits pequenos, push contínuo (Dual Claude), testes existentes verdes (`test:rules`, `test:unit`, `test:api`) + testes novos onde há regra/lógica nova. Publicação de regras: uma vez, com confirmação do Sergio.

## 8. Fora de escopo desta fase (Fase 2 nomeada)

- Motor de carótidas portado do V7; ECG estruturado; segundo motor no registry.
- Dark mode da plataforma; migração do Direx pros componentes novos.
- Comparativo seriado de medidas; pacientes cross-local.
- Landing page pública de marketing (souleo.com.br hoje cai no login — a tela de login nova É a primeira impressão desta fase).
- Migração dos segredos pro cofre `privado/` (desenho pronto na seção Integrações).
- Agendamento WhatsApp, TISS/conferência de convênios na plataforma.

## 9. Riscos e mitigação

- **Motor do laudo é intocável** nesta fase: `/laudo/[id]` só ganha topo novo. Qualquer regressão no motor quebra a clínica — mudanças internas ficam pra depois do prazo.
- **Migração incremental**: nenhuma tela antiga é apagada antes da nova estar no ar na mesma URL; `/dashboard` redireciona.
- **Regras**: mudanças (tiposLaudo + as da Seção 2) publicadas juntas, uma vez, antes do merge (regras aditivas primeiro — lição da tríade do plano da Seção 2).
- **Conta de teste**: toda verificação manual na conta Gmail PJ; NUNCA na Yahoo (dados reais da clínica).
