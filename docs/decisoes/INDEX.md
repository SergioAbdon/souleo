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
