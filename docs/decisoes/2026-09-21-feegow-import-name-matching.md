# 2026-09-21 — Import do Feegow casa por NOME (fim do procMap manual pra eco)

> **Status:** 🔧 **Implementado na branch `feat/wader-console` (commit `fa29db2`), NÃO
> testado na clínica** (o PC da clínica não tem `node_modules` da web nem o emulador
> Firebase — usa o app do Vercel). **Aguardando:** o notebook rodar `npm run test:api`,
> tríade/Codex, merge no master e deploy no Vercel.
> **Dono:** Claude da clínica (MedCardio). **Origem:** worklist do Feegow parando de
> descer quase todo dia.

## O problema

O import do Feegow (`montarCandidatos` em `src/lib/feegow-admin.ts`) casa o
procedimento por **ID fixo** no procMap (`workspaces/{ws}/integracoes/feegow.procMap`
+ fallback `workspace.feegowProcMap`). O Feegow cria um `procedimento_id` **novo** de
"Exame - Ecocardiograma Transtorácico" por convênio/agendamento — e cada código novo
**sumia do import** até ser adicionado à mão no procMap.

Histórico real: 16/09 add **369 + 377**; 19/09 add **379** e, minutos depois, **380**.
Em 3 dias, 4 códigos. Todo dia a recepção reclamava "o exame do paciente X não
aparece no LEO". O token estava OK — era só o mapeamento por ID que não acompanha.

## A solução

`classificarProcedimentoPorNome(nome)` — rede de segurança por **nome**:

- `ecocardiograma` / `strain` → `eco_tt`
- `carótidas` / `vasos cervicais` → `doppler_carotidas`
- `estresse` / `stress` → `eco_stress`
- exige `exame` no nome; normaliza acento (NFD); ordem: carótida → estresse → eco
  (senão "Ecodopplercardiograma com estresse" cairia em eco). Não-exames (consulta,
  ECG, ergometria) → `null` (continuam ignorados).

Em `montarCandidatos`: busca `/procedures/list` uma vez (igual ao `insurance/list`),
monta `procNome[id]`. No laço:

```
const tipoExame = procMap[procId] || classificarProcedimentoPorNome(procNome[procId] || '');
if (!tipoExame) { ignora; continue; }
```

**procMap por ID mantém PRECEDÊNCIA** — o dono ainda pode forçar/sobrescrever um
código específico. O name-matching só preenche a lacuna. Degrada gracioso: se
`/procedures/list` falha/volta vazio, `procNome` fica `{}` e volta ao comportamento
antigo (só procMap por ID). Uma chamada a mais por import (aceitável).

## Testes (escritos, a rodar no notebook)

`tests/api/feegow-admin.test.mjs`: 3 casos em `montarCandidatos` (name-matching
importa como eco_tt; consulta continua ignorada; procMap por ID vence o nome) + 9
unit de `classificarProcedimentoPorNome`. `fetchStubFeegow` estendido pra
`/procedures/list`. **Não executados na clínica** (sem ambiente) — `npm run test:api`
no notebook antes do merge.

## Band-aids já aplicados em produção (enquanto o deploy não sai)

Adicionados ao procMap (nos 2 lugares) direto no Firestore, pra destravar o dia a
dia: **369, 377, 379, 380 → eco_tt**. Depois do deploy do name-matching, esses
viram redundantes (mas não atrapalham — precedência por ID). Ver memória local da
clínica `feedback_feegow_procmap_codigo_novo_eco`.

## Para o notebook (próximos passos)

1. `git fetch` + revisar `git show fa29db2` (diff isolado).
2. `npm run test:api` (emulador) — confirmar verde.
3. Tríade/Codex se achar necessário (mudança pequena, 1 função + fallback).
4. Merge no master → deploy Vercel.
5. Depois do deploy, testar: reimportar Feegow com um eco de código novo e ver
   entrar sem tocar no procMap.

## Fora de escopo (registrado)

Exclusão explícita ("este código eco NÃO importar") não existe — procMap só mapeia,
ausência = ignora, e agora o nome preenche. Se algum dia precisar excluir um eco
específico, um mapa negativo resolve. Não é necessário hoje.
