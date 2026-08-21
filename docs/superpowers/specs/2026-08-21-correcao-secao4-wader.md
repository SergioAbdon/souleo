# Spec — Correção da Seção 4 (Wader / DICOM / Orthanc)

**Data:** 21/08/2026 · **Origem:** revisão da tríade
(`docs/planos/2026-08-20-revisao-secao4-wader.md` — 30 achados + adendo) com
TODAS as decisões tomadas pelo Sergio no 1-a-1 de 20-21/08 (tabela "DECISÕES
FINAIS" no doc da revisão — é parte integrante desta spec).

**Objetivo:** o caminho da imagem do aparelho ao laudo passa a ser: identidade
conferida (CPF), casamento estrito (ACC exato), correção humana com porta de
saída (tela de conferência), dado transparente (repasse total do SR + perfil
customizável), tela viva no laudo, e imagens privadas. Tudo que é binário do
Wader entra na MESMA atualização da visita à clínica.

## Restrições globais (valem para toda task)

- Branch `feat/secao4-wader` a partir da `master`. Commit+push por task (Dual Claude).
- Motor (`src/app/laudo/[id]/page.tsx`), `src/components/laudo/**` e Direx são
  INTOCÁVEIS — exceção única e cirúrgica: Task da tela viva (D6), só leitura
  reativa + modal + guarda de emissão; zero mudança em cálculo/fórmula/template.
- NÃO usar `git stash`. `.superpowers/` é git-ignored — conferir `git show --stat`.
- Wader = CommonJS + vitest (`cd apps/wader && npx vitest run`); web = Next.js
  (`npm run test:unit`, `npm run test:api`, `npm run test:rules`, `npx tsc --noEmit`, `npm run build`).
- Regra nova do Firestore (perfil do aparelho, auditoria): publicar SÓ com
  confirmação do Sergio; regra + código no mesmo commit, teste com payload real
  em `tests/rules/fixtures.mjs`.
- Placar de partida: unit 67, api 182+, rules 132, wader vitest 41, e2e 5; tsc e
  build limpos. Nenhuma task pode terminar com placar menor.
- Deploy/merge ao final com confirmação do Sergio, fora do horário da clínica.
- Fuso: `hojeClinica()` de `apps/wader/src/lib/clinica-tempo.ts` é a ÚNICA fonte
  de "hoje" no Wader.
- Identidade: `fg-{agendamento_id}-{dataExame}`; exames antigos têm id
  aleatório; `feegowAppointId` pode ser number OU string. CPF = chave
  paciente↔imagem; ACC = chave exame↔estudo.

## O que cada frente entrega (mapa achado→task no plano)

### Frente Wader (binário da visita — prioridade 1)
1. **Identidade no match** (achados 3, 4, 28): bloqueio por CPF divergente;
   `dicomOrthancStudyId` vence ACC; limpeza do dono anterior no vínculo manual;
   logs com `exameId` e `acc` corretos.
2. **Recovery estrito** (achados 8, 15, 26): régua (i) — auto só ACC exato+CPF;
   wildcard vira SUGESTÃO (persistida p/ tela); `exameIdOverride` no que entrar;
   query com `dataExame >= cutoff` (4 dias por `hojeClinica()`) + limit.
3. **ACC no cartório** (achados 5, 6): `editar-exame` com troca em batch no
   `accIndex` (409 em duplicata); `criarManual` gera `acc` padrão + grava `cpf`
   + reserva.
4. **Worklist verdade** (achados 7, 21, 22, 27): `wlHash` no exame → regrava
   `.wl` quando divergir; `mwlStatus` atualizado nos dois sentidos; remoção só
   quando `dataAlvo === hojeClinica()`; `horaHHMMParaDicom` com replace global.
5. **Ingest robusto** (achados 9, 10, 12, 18): assinatura com `nImgTentadas`;
   detecção de `changes.Last < lastSeq` → reset com warn; path de imagem por
   `orthancInstanceId`; merge de imagens por instância; emitido = cofre
   (`medidasDicomPendente` + aviso).
6. **Visibilidade e velocidade** (achados 11, 13, 14, 29 + pacote latência):
   detecção de 2 Waders no batimento; cliente Orthanc/WorkspaceRepo únicos
   compartilhados; `dicomUltimoErro`/`dicomUltimoErroEm` no exame +
   `ultimoErroIngest` no batimento; `/version` real; tick 30s→5s; SR processado
   na chegada (medidas antes do assentamento).
7. **Tela de conferência** (D3 + excluir-reenviar + achado 23): página no
   console (fora da reception.html) com órfãos + estudos do dia vinculados,
   sugestões por CPF/nome/data, ações vincular / trocar vínculo / excluir p/
   reenvio (DELETE direto com as ressalvas técnicas da tríade: trava
   anti-corrida, ordem fixa, limpeza total incl. Storage, `deleteSignature` na
   instância viva, recusa emitido, 409 UI-only, botão reprocessar, auditoria
   append-only no Firestore com hostname + operador declarado + retrato);
   `listStudies` com `StudyDate` do dia pedido.
8. **Repasse total do SR** (16-Wader, 17-Wader, 19a): parser nunca descarta
   item (não-classificado = marcado); `parserVersao` no meta; empate de grupo =
   `general` + warn quando código conhecido cair fora; unidade vazia preservada
   como vazia (quem barra é o web).
9. **Reprocesso sob demanda** (D1b lado Wader): worker consome flag
   `reprocessarDicom` do exame e reprocessa o estudo vinculado; script mutirão
   opcional (`--commit`).

### Frente web (Vercel — prioridade 2)
10. **Schema antigo não importa** (D1b lado web, achado 17-web): ramo legado
    devolve `[]`; UI mostra "formato antigo — solicitar reprocessamento" (grava
    flag); unidade vazia em campo com alvo ≠ '' fica fora do modal; bateria de
    testes do `dicom-sr-mapping.ts` (hoje zero).
11. **Perfil do aparelho** (16 ampliado, 19b rejeitado): doc
    `workspaces/{ws}/integracoes/perfilAparelho` semeado com o mapa Vivid T8;
    editor no cartão Integrações (padrão procMap/profMap) com "Mapeadas" +
    "Recebidas sem destino"; fallback embutido se doc ausente; SEM validação de
    faixa (decisão 19b); modal com rodapé "N de M mapeadas"; regra Firestore
    (admin edita) com confirmação do Sergio.
12. **Tela viva** (D6, achados 24+25): `onSnapshot` no doc do exame no
    `page.tsx`; `DicomSrImport` com dependência `[open]`/memo (desmarcações
    respeitadas); guarda de emissão "X de N imagens ainda subindo".
13. **Imagens privadas** (D5b, achado 20): URLs assinadas com validade na
    galeria e na montagem do PDF; `removerImagensExame` chamado na exclusão do
    exame; fim do `publicRead` para novos uploads (migração dos existentes:
    avaliar na task).
14. **Cortes Ponytail** (D7 + achado 30): P1-P7 + campos decorativos de backup.

### Fechamento
15. Tríade final adversarial sobre o diff completo; bateria inteira; ADR em
    `docs/decisoes/`; Obsidian (Leo/Decisões, direto no disco); memória local;
    atualização do mapa das 8 seções; merge+deploy com confirmação; placar.

## Fora de escopo (registrado, não construir)
DICOM completo na nuvem; disparo autenticado de exclusão via LEO web; perfis
multi-marca prontos; push/webhook do Orthanc; quarentena/ZIP; lixeira/undo;
autenticação no console local; migração de URL assinada para PDFs já emitidos.

## Pendências da visita à clínica (inalteradas + novas)
(1) atualizar Wader (agora acumula Sub-plano 5 + Seção 3 + Seção 4); (2) SÓ
DEPOIS `integracoes:limpar -- --commit`; (3) FEEGOW_API_TOKEN fora do Vercel;
(4) trocar senha do Orthanc; (5) NOVO: teste de 2 min — T8 re-renderiza
cabeçalho na reexportação?; (6) NOVO: retenção do arquivo do Vivid (purga
sozinho?); (7) NOVO: `StableAge` do Orthanc 60→30s.
