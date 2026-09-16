# Login dos testes E2E — feito UMA vez

Os testes rodam com um estado de login salvo em `tests/e2e/.auth/state.json`
(fora do git). Pra criar/renovar esse estado:

1. Suba o dev server num terminal: `npm run dev`
2. Noutro terminal: `npm run test:e2e:login`
3. Na janela que abre, entre com a **conta Gmail PJ de teste** (email + senha).
4. Ao cair na plataforma, o script salva o estado e fecha sozinho.

Pronto — `npm run test:e2e` passa a rodar sem pedir login. Se a sessão
expirar (testes voltando pro /login), repita os passos.

> Nota técnica: não usamos `playwright codegen --save-storage` porque o
> Firebase Auth guarda a sessão no IndexedDB e o codegen não captura
> IndexedDB — o estado salvo por ele não loga. O script `save-auth.mjs`
> salva com `indexedDB: true`, que funciona.
