# legacy/ — material de origem do Leo

Conteúdo da antiga pasta `Desktop\LEO` (protótipos pré-Next.js), trazido para cá
em 2026-08-09 para ter versionamento e ficar tudo num repositório só.

**Isto é referência histórica, não código vivo.** O código em produção é `src/`.

| Pasta | O que é | Status |
|---|---|---|
| `motores/` | Motores de laudo em JS (`motorv8mp4.js`, `motorv6.js`, `eco-tt.js`, `carotidas.js`) | Substituídos por `src/senna90/` (TS) |
| `prototipos/` | Telas HTML de preview e teste (v7b–v7f, laudo v6, dashboard) + css/js | Substituídos por `src/app/` |
| `admin/` | Tela admin HTML | Substituída por `src/app/` |
| `scripts-py/` | Python de planos, mapa mental, cronograma + `planos_leo.xlsx` + `firestore.rules` antigo | Ferramentas avulsas |

## Deduplicação

7 arquivos eram cópias byte-a-byte de outros (sufixos `_backup_20260408b`,
`_separado`, `_v9.1`) e não foram trazidos — o conteúdo está preservado no
arquivo original de cada grupo. Nada de conteúdo único foi perdido.

Backup integral do LEO original: `Desktop\_BACKUP_LEO_2026-08-09` (apagar quando
tiver confiança de que está tudo aqui).

## Motor: qual é qual

- `legacy/motores/motorv8mp4.js` — versão do protótipo
- `src/motor/motorv8mp4.js` — versão que o app usava (**difere** da acima)
- `src/senna90/` — migração TypeScript, organizada por domínio. **É a fonte da verdade.**
