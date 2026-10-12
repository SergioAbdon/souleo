# Índice de Decisões Arquiteturais (ADRs)

Ordem cronológica. Ler o(s) recente(s) antes de mexer na área relacionada.

| Data | Decisão | Área |
|---|---|---|
| 2026-05-12 | [teste-handshake](2026-05-12-teste-handshake.md) | Protocolo dual-Claude |
| 2026-05-13 | [bug ACC duplicado + remap + Wader SR](2026-05-13-bug-acc-duplicado-remap-e-wader-sr.md) | Wader / DICOM SR / status |
| 2026-05-16 | [bugs cadastro/convênio/Feegow](2026-05-16-bugs-cadastro-convenio-feegow.md) | Worklist / cadastro / convênio |
| 2026-05-16 | [migração Senna90 motor primário](2026-05-16-migracao-senna90-motor-primario.md) | Motor de laudo |
| 2026-05-16 | [spec da aorta + j9 Massa](2026-05-16-spec-aorta.md) | Senna90 / motor |
| 2026-05-18 | [Wader ingest resiliente](2026-05-18-wader-ingest-resiliente.md) | Wader / DICOM ingest |
| 2026-06-26 | [Wader: console de reconciliação](2026-06-26-wader-console-reconciliacao.md) | Wader / UI |
| 2026-08-09 | [Seção 1: contas, acesso e regras do Firestore](2026-08-09-secao1-contas-e-acesso.md) ⚠️ **Fase 6 é do Claude da clínica** | Contas / auth / segurança |
| 2026-08-10 | [Seção "Integrações"](2026-08-10-secao-integracoes.md) 💡 ideia registrada, não implementada | Integrações / Feegow / Orthanc / Wader |
| 2026-08-10 | [Conta duplicada Yahoo×Gmail trava a clínica](2026-08-10-conta-duplicada-yahoo-gmail-quebra-clinica.md) ⚠️ **login da clínica = Yahoo; Gmail órfã** | Contas / auth / Feegow / segurança |
| 2026-08-16 | [Seção Pacientes (Sub-plano 4)](2026-08-16-secao-pacientes.md) ✅ no ar (merge `be3cfc2`+`5b8ee60`) | Pacientes / busca / ficha |
| 2026-08-19 | [Sub-plano 5: Seção Integrações](2026-08-19-sub-plano-5-integracoes.md) ✅ no ar (regra `bbc98256`, merge `f2c9e78`) — pendente Wader na clínica | Integrações / Feegow / Orthanc / Wader |
| 2026-08-20 | [Correção da Seção 3 — Feegow](2026-08-20-correcao-secao3-feegow.md) ✅ no ar (regra `9ebfc2fc`, merge `0fb2191`) — pendente Wader antes da limpeza | Feegow / segurança |
| 2026-08-22 | [Correção da Seção 4 — Wader/DICOM/Orthanc](2026-08-22-correcao-secao4-wader.md) implementada, aguardando merge/deploy/regra | Wader / DICOM / Orthanc |
| 2026-08-22 | [Contrato da Ponte tela↔motor (D7)](2026-08-22-contrato-ponte-tela-motor.md) aprovado, teste automático no ar | Motor / tela do laudo |
| 2026-08-25 | [Correção da Seção 5 — Tela do Laudo](2026-08-25-correcao-secao5-tela-laudo.md) código completo, tríade final aprovada; pendente merge+deploy | Tela do laudo |
| 2026-08-26 | [Senna93: motor unificado (decisão de direção)](2026-08-26-senna93-motor-unificado.md) direção aprovada pelo Sergio | Motor de laudo |
| 2026-08-28 | [Senna93 Fases 0-3](2026-08-28-senna93-fases-0-3.md) merge master `e365426` — esqueleto, vetos, textos, teste ao vivo | Senna93 / motor |
| 2026-08-28 | [Senna93 Fase 4: sombra persistida](2026-08-28-senna93-fase4-sombra.md) código PRONTO, aguardando OK do Sergio p/ merge+deploy | Senna93 / motor / shadow |
| 2026-08-29 | [Diastologia conforme ASE/EACVI 2016](2026-08-29-diastologia-ase2016.md) — regra permanente "os resultados seguem os guidelines" | Senna90 / motor / diastologia |
| 2026-08-29 | [Seção 7 onda 0: velocidade + dinheiro](2026-08-29-secao7-onda0-velocidade.md) merge `f3025d2` + fixes da tríade — gru1, Chromium reutilizado, trava anti-cobrança-dupla (C1/I1) | PDF/Puppeteer / billing / emitir |
| 2026-08-30 | [Seção 7 onda 1: bugs com dente](2026-08-30-secao7-onda1-bugs-com-dente.md) ✅ merge `18ae790` — corte X1, corSegura, allowlist Chrome, CAS cancelar×emitir, Regerar sem 2ª franquia, publicação transacional do PDF, ⚠️ emissaoKey OBRIGATÓRIA | Emissão / PDF / billing / exportação |
| 2026-08-30 | [Regra do `status` do exame + whitelist de `dadosFinais` (E10/E22/E14)](2026-08-30-secao7-regra-status.md) ✅ DECIDIDO + implementado onda 2b, fix-wave tríade fechou o `allow create` (emitidoEm/pdfUrl plantados) | Firestore rules / emissão / segurança |
| 2026-08-30 | [Renovação do ciclo de franquia — Opção D (E11)](2026-08-30-secao7-renovacao-ciclo.md) ✅ DECIDIDO + implementado onda 2b, `ciclo.ts` vira fonte única do predicado/`vigente()` na fix-wave tríade | Billing / emissão |
| 2026-08-30 | [Seção 7 ondas 2+2b: servidor dono dos carimbos, status e ciclo](2026-08-30-secao7-onda2-servidor-dono.md) ✅ merges `2bc333b`+`cb6beb7`, ⚠️ REGRA PUBLICADA 30/08 — E3 servidor, E11-D giro ao emitir, E10/E14 status/whitelist | Emissão / billing / regras / Direx |
| 2026-08-31 | [SEÇÃO 7 FECHADA — Emissão/PDF/exportação](2026-08-31-secao7-FECHADA.md) ✅ 5 merges (ondas 0-4), 68 achados tratados, regra publicada 30/08, tríade em toda onda — unit 757 api 301 rules 150 | Emissão / PDF / billing / exportação |
| 2026-09-07 | [SEÇÃO 8 FECHADA — Histórico/Extrato (última do mapa!)](2026-09-07-secao8-FECHADA.md) ✅ 3 merges (81d248e/07fc253/c1277f0), 30 achados por tríade, extrato sem truncar, contador monotônico, logs assinados — unit 771 rules 162. ⚠️ REGRA PUBLICADA 07/09 | Histórico / Extrato / billing / regras |
| 2026-09-08 | [Identidade, layout e ícones LEO](2026-09-08-identidade-layout-icones-leo.md) — redesenho local aplicado; typecheck, 771 testes e build aprovados; 26 verificações visuais aprovadas | Design / memória |
| 2026-09-21 | [Import Feegow casa por NOME](2026-09-21-feegow-import-name-matching.md) 🔧 branch `feat/wader-console` commit `fa29db2`, NÃO testado na clínica — notebook: test:api + tríade + merge/deploy | Feegow / import / worklist |
| 2026-10-11 | [Publicação do layout aprovado](2026-10-11-publicacao-layout-aprovado.md) ✅ redesenho visual em produção (8ac762c→db1a88d), 771 testes, 26 verificações visuais | Design / deploy |
| 2026-10-11 | [Coluna do laudo unificada](2026-10-11-coluna-laudo-unificada.md) 🎨 geometria antiga (390px, cabeçalho navy) + pele minimalista em ECO e laudo de texto; emitido em 2 linhas; tríade Codex/Ruflo/Ponytail — ✅ NO AR 11/10 (merge 21ee2ce, aval Sergio) | Design / laudo / editor |
| 2026-10-11 | [Imagens e SR em todo laudo](2026-10-11-imagens-e-sr-em-todo-laudo.md) 🖼️ ECO emitido mostra Imagens + Importar (3ª linha, galeria só leitura); laudo de texto emite igual ao ECO (galeria, seleção, popup, imagens no PDF); saneamento no servidor + regra; replay amarrado ao conteúdo (fecha o C1 de 30/08); tríade pré-merge ✅ NO AR 11/10 (merge a63f3fa, regra publicada, aval Sergio) | Laudo / imagens / emissão / regras |
| 2026-10-11 | [PDF abortava em toda emissão com imagem — guard de URL assinada](2026-10-11-pdf-guard-url-assinada.md) 🚨 guard de 22/08 confundia signed URL com canônica; produção sem PDF desde 31/08 (eco 47/69 com pdfErro); fix + log pdf_erro + seleção no texto — branch claude/pdf-guard-url-assinada, aguarda aval | PDF / emissão / produção |
| 2026-10-11 | [Wader nova versão — Fase A desenhada](2026-10-11-wader-fase-a-decisao.md) 🛠️ decomposição A→B→C, abordagem exe único + Inno + WinSW (pensando em vender), atualização com ok, toast na clínica; spec rev.2 após tríade; **IMPLEMENTADA 11–12/10** na branch `claude/wader-fase-a` (13 commits, 7 tasks, 181 vitest + 11 Pester), tríade pré-merge ✅, ensaio de instalação no notebook ✅, **NO AR 12/10** (merge d7e72bf, release `wader-v1.0.0` pelo 1º CI) — falta a visita à clínica | Wader / produto / infra |


## Validação local — 09/10/2026
Implementação visual concluída na branch codex/layout-visual-aprovado, incluindo A4 de carótidas, sidebar D original, ECG a 88 bpm, ficha B e editor minimalista. TypeScript/build aprovados, 771 testes unitários e 26 verificações de interface em 11 telas (1440 e 390 px). Campos preservados ao recolher seções, trava de emitido e configurações mantidas. Corrigido overflow dos rótulos acessíveis das tabelas. Revisões independentes não encontraram regressões funcionais. Funções clínicas, persistência e geração PDF preservadas.

Evidências: docs/design/2026-09-24-layout-aprovado/validacao-final. Reproduzir com npm run build e node tests/visual/layout-check.mjs. Componentes reais com dados fictícios, rede externa e gravações bloqueadas. APIs reais, emissão clínica e PDF gerado não foram exercitados. Catálogo de ícones permanece como referência, sem afirmar migração de todo ícone legado do produto.

Lint geral tem 25 erros e 20 avisos anteriores; comparação inicial dos arquivos alterados com HEAD sem novos achados. Última checagem dos arquivos de produção finais passou. Build conserva aviso anterior de rastreamento amplo em pdf-browser/next.config. Obsidian atualizado (decisões, visão geral e roadmap). Implementação local concluída; publicação/merge/deploy ainda dependem de autorização do Sergio.
