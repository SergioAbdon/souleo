# Correção da Seção 3 — Integração Feegow (ADR)

> **Status:** no ar em 20/08/2026. Regra publicada (ruleset
> `9ebfc2fc-7a68-45cc-97de-df4efb3dc188`), índices do Firestore deployados, merge na
> master (`0fb2191`), deploy verificado (`/api/orthanc` → 404 em produção).
> **Pendente:** atualizar o Wader na clínica (acumula Sub-plano 5 + esta fase) e,
> SÓ DEPOIS, a limpeza dos campos antigos.
> **Origem:** revisão da tríade `docs/planos/2026-08-19-revisao-secao3-feegow.md`
> (22 achados). **Spec:** `docs/superpowers/specs/2026-08-19-secao3-correcao-design.md`
> (D1–D6). **Plano:** `docs/planos/2026-08-19-plano-correcao-secao3-feegow.md`.

## O diagnóstico

Os 22 achados eram 6 doenças: (A) a nuvem achava que alcançava o Orthanc; (B) vazio
tratado como valor; (C) identidade mal escolhida para o exame importado; (D) falha
silenciosa como padrão; (E) tempo sem fonte única no Wader; (F) a tradução do Feegow
fora da camada testável.

## As decisões (aprovadas pelo Sergio em 19/08)

| # | Decisão | O que mudou |
|---|---|---|
| D1 | **Cada lado fala só com quem alcança.** A nuvem nunca alcançou o Orthanc (`localhost` da clínica; 16/16 chamadas falharam desde sempre). | Rota `/api/orthanc` deletada inteira (386 linhas). O botão "Testar conexão" do cartão Orthanc saiu; o estado vem do **batimento do Wader** (verifica `GET /system` de dentro da rede e grava `integracoes/orthanc.status`). O indicador "SEM MWL" da fila passa a ser escrito pelo Wader **quando escreve o `.wl`** — acabou o alarme falso em 100% dos exames importados. |
| D2 | **Identidade = agendamento + data** (`fg-{id}-{dataExame}`). O Feegow preserva o `agendamento_id` ao remarcar (provado na API real, caso 66890). | Paciente remarcado volta a entrar na fila no dia do exame. Sem migração — os 205 exames antigos convivem (nenhum leitor depende do formato do doc id; verificado). |
| D3 | **Reconciliação na própria importação.** | A consulta do dia traz todos os status; {6,11,22,15} (faltou/desmarcou) → exames FEEGOW `aguardando` de HOJE viram `nao-realizado` (nunca apaga, nunca toca {2,3,5}). Índice composto novo deployado. |
| D4 | **Estado sem mentira estendido ao Feegow.** | A importação devolve e a tela mostra: criados · ignorados (procedimento não mapeado, com ids) · falhas de busca · já estavam na fila · não-realizados. O "Atendido" que falha grava `feegowStatusOk: false` no exame (padrão do `mwlStatus`), sem travar a emissão e sem tocar no motor. |
| D5 | **Config completa no cartão Feegow.** | `profMap` migrou do LocalModal (que ficou sem NENHUMA config de integração); liga/desliga com toggle, **respeitado pela importação** (`feegow_desligado`). `PROC_MAP` embutido (3 IDs da MedCardio no código do produto) morreu: mapa vazio = erro claro, não adivinhação. |
| D6 | **Endurecimentos.** | #7c na ficha da importação (vazio = não mexe — o crítico do CPF apagado); CPF validado por dígitos; dedup de ficha por CPF (sem renomear a ficha alheia); `hojeClinica()` fonte única no Wader (o bug que apagava a worklist do aparelho às 21h — morto também no console da recepção); `montarCandidatos` na camada testável com `fetchImpl`; tipo `AcaoFeegow` com dentes; regra `intacto('ortancAtivo')` fechou o outro lado do espelho. |

## O que a esteira pegou além da revisão original

- **O dedup por CPF renomearia a ficha do outro paciente** se o CPF viesse trocado no
  Feegow — ficha achada por CPF agora só ganha o vínculo, nunca a identidade.
- **`marcarAtendido` nunca acharia os exames antigos** — o importador legado gravava
  o número do agendamento como número, e a query é sensível a tipo.
- **O primeiro "Salvar" no cartão Feegow apagaria o profMap** — a tela não lia o campo
  legado, e não existe migração de profMap: o fallback da tela É a migração.
- **O `feegowStatusOk` iria para o exame errado** quando o mesmo agendamento tem dois
  exames (falta + remarcado) — agora vai para o mais recente.
- **A trava de esquema http/https morreu com a rota** e voltou na fronteira de escrita.
- **`ultimoErro` do batimento podia vazar credencial** embutida na URL — mascarada.
- **Orthanc desligado de propósito viraria cartão vermelho** — sem conexão resolvida,
  o batimento não escreve (spec §5.2).

## A ordem da virada (o que já foi e o que falta)

Feito em 20/08, nesta ordem (provada, não deduzida — o payload do LocalModal velho
foi testado contra a regra nova no emulador antes de publicar):

1. ✅ Regra publicada (`9ebfc2fc`).
2. ✅ `firebase deploy --only firestore:indexes`.
3. ✅ Merge + deploy Vercel, fora do horário da clínica (a duplicação da fila do dia
   era a única exposição — importar de manhã com código velho e à tarde com novo).
4. ⏳ **Atualizar o Wader na máquina da clínica** — acumula Sub-plano 5 (segredo no
   lugar novo + batimento) e esta fase (fuso, batimento→Orthanc, `mwlStatus`, procMap
   vazio). Prova de sucesso: cartão Wader "No ar", cartão Orthanc "Conexão OK —
   verificada pela clínica", imagem real entrando.
5. ⏳ **Só depois do passo 4:** `npm run integracoes:limpar -- --commit`. **NUNCA
   antes** — o binário instalado na clínica ainda lê os campos antigos do documento
   do local; limpar antes mata a ingestão.
6. ⏳ Remover `FEEGOW_API_TOKEN` do painel do Vercel (nada mais lê).
7. ⏳ Trocar a senha do Orthanc (continua no histórico público do git — pendência
   do Sub-plano 5).

## Janela de transição (entre o deploy e o passo 4)

- A importação funciona integralmente (é 100% nuvem).
- O `.wl` continua saindo — sempre veio do Wader, que lê por campos, não por doc id.
- O indicador SEM MWL fica **mudo** (não falso): ninguém escreve o campo até o Wader
  novo chegar. Exames antigos ainda mostram o selo `falhou` gravado até envelhecerem.
- O cartão do Orthanc fica "nunca testado" até o primeiro batimento do Wader novo.
- **O bug das 21h continua vivo na clínica até o passo 4** — é o Wader instalado que
  apaga a worklist do aparelho.

## Follow-ups registrados (não bloqueiam)

- Guard `feegow_sem_procmap`/`feegow_desligado` inline na rota sem teste executável
  (nenhum teste importa `route.ts` — padrão do repo).
- `SidebarLaudo.tsx:106` chama `action=paciente`, que não existe (sempre 400) —
  pré-existente, arquivo intocável, fluxo "Desbloquear ID" morto em silêncio.
- `criados[].pac` na resposta do importar carrega PII sem consumidor (só `.length` é
  usado) — encolher.
- Cache de 5 min do Wader após trocar URL/toggle (auto-corrige na batida seguinte).
