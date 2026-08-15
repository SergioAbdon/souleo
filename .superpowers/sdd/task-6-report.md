# Task 6b — Fluxo de Edição de Laudos Emitidos (Sub-plano 3)

## Status
✅ **CONCLUÍDO**

## Commit Hash
`ecd4e56` — fix(laudo-texto): dispatch de emitido por modalidade, guard de modalidade e trava de reemissao

## Resumo Executivo
Implementadas 3 correções no fluxo de reedição de laudos emitidos para suportar múltiplas modalidades (motor + texto):

1. **Dispatch por modalidade em Worklist** — Botão "✏️ Editar" agora direciona para `/laudo-texto/` se tipo tem modalidade 'texto', senão `/laudo/` (motor). Reutiliza lógica de `abrirLaudo`.

2. **Validação de modalidade na carga** — laudo-texto/[id]/page.tsx valida se exame é realmente tipo 'texto'; se não, redireciona pra `/laudo/` (guard defensivo contra URLs diretas em exames de motor).

3. **Trava e avisos de reemissão** — Se exame.status === 'emitido', o botão mostra "Reemitir (consome 1 franquia)"; confirm anuncia "Uma NOVA franquia será consumida"; POST inclui `reemissao: true` em dadosFinais.

## Cobertura de Testes
- ✅ **Type checking**: `npx tsc --noEmit` — sem erros
- ✅ **Unit tests**: `npm run test:unit` — 34/34 PASSANDO

## Detalhes Técnicos

### Arquivo 1: src/components/Worklist.tsx

**Mudança 1** — Redefinição da função `editarLaudoEmitido` (linhas 452–461):
```typescript
function editarLaudoEmitido(exameId: string, tipoExame: string) {
  const modalidade = tiposMap[tipoExame || '']?.modalidade || 'motor';
  if (modalidade === 'texto') {
    router.push('/laudo-texto/' + exameId);
  } else {
    router.push('/laudo/' + exameId);
  }
}
```

**Mudança 2** — Call-site do botão "✏️ Editar" emitido (linha 676):
```typescript
<Btn cor="amber" onClick={() => editarLaudoEmitido(item.id, item.tipoExame as string)}>✏️ Editar</Btn>
```

### Arquivo 2: src/app/laudo-texto/[id]/page.tsx

**Mudança 1** — Validação de modalidade na carga (linhas 44–62):
```typescript
useEffect(() => {
  if (!workspace?.id || !exameId) return;
  (async () => {
    // ... carrega exame + tipo ...
    if (t && t.modalidade && t.modalidade !== 'texto') {
      router.replace('/laudo/' + exameId);
      return;
    }
    // ... aplica modelo ...
  })();
}, [workspace?.id, exameId, router]);
```

**Mudança 2** — Confirm de reemissão (linhas 95–101):
```typescript
async function handleEmitir() {
  const jaEmitido = (exame.status as string) === 'emitido';
  const msg = jaEmitido
    ? 'Reemitir o laudo? Uma NOVA franquia será consumida (1 laudo).'
    : 'Emitir o laudo? A emissão consome 1 laudo da franquia.';
  if (!confirm(msg)) return;
  // ...
}
```

**Mudança 3** — Inclusão de flag de reemissão (linhas 136–150):
```typescript
body: JSON.stringify({
  // ...
  dadosFinais: {
    // ... campos anteriores ...
    ...(jaEmitido ? { reemissao: true } : {}),
  },
  // ...
}),
```

**Mudança 4** — Rótulo do botão (linha 202–204):
```typescript
<button onClick={handleEmitir} disabled={salvando || emitindo}>
  {emitindo ? 'Emitindo…' : (exame?.status === 'emitido' ? 'Reemitir (consome 1 franquia)' : 'Emitir laudo')}
</button>
```

## Observações Técnicas

- **Dispatch defensivo**: Tipo desconhecido/falta catálogo → fallback 'motor' (comportamento anterior preservado).
- **Validação em carga**: Redireciona ANTES de aplicar conteúdo, evitando estado inconsistente.
- **Flag de reemissão**: Paridade com motor (`reemissao: jaEmitido` em laudo.tsx); back-end pode consultar para contabilizar corretamente.
- **UX clara**: Botão + confirm deixam explícito que nova franquia será consumida.

## Próximas Etapas
- Validação no back-end (/api/emitir) confirma que `reemissao: true` só é aceito se exame.status === 'emitido'
- Motor (laudo.tsx) pode precisar de mesmos fixes (se não tiver já)

---

## Task 6c — Fechamento Sub-plano 3 (Reanexo PDF + Semear com erro)

### Status
✅ **CONCLUÍDO**

### Commit Hash
`6c00100` — fix(catalogo): reanexo de pdf emitido, semear com erro tratado, gitignore limpo

### Resumo (1 linha)
Três pequenos fixes: (1) reanexo de PDF emitido, (2) semear com tratamento de erro, (3) gitignore limpo.

### Detalhes

**Fix 1: Worklist.tsx — Reanexo de PDF emitido**
- Função `editarLaudoEmitido` agora recebe `item: ExameItem` completo em vez de id/tipoExame
- Despacha por modalidade: se 'pdf', abre modal de anexo (`setAnexarPdf(item)`); senão router.push
- Call-site atualizado: `onClick={() => editarLaudoEmitido(item)}`
- Caso de uso: ECG emitido cujo PDF falhou ao salvar precisa reanexar

**Fix 2: TiposLaudo.tsx — Semear com erro tratado**
- `semear()` envolvida em try/catch/finally
- No catch: alert("Não foi possível semear o catálogo. Verifique a conexão.")
- No finally: `setSemeando(false)` (destravaISENCO)
- Garante estado limpo mesmo em falha de conexão

**Fix 3: .gitignore — Linha corrupta removida**
- Removida linha `".superpowers/" ; git add .gitignore` (era lixo de edição anterior)
- Mantida apenas `.superpowers/` como pattern limpo

### Cobertura
- ✅ TypeScript: `npx tsc --noEmit` — zero erros
- ✅ Unit tests: `npm run test:unit` — **34/34 PASSANDO**
