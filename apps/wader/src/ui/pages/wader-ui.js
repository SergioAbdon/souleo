/*
 * Helpers compartilhados das telas do Wader (admin + conferência).
 * Servido pelo fastifyStatic de ui/server.ts como `/static/wader-ui.js`.
 *
 * Escopo global de propósito: as páginas usam `onclick="..."` inline, que só
 * enxerga `window`. Sem módulos, sem bundler — é uma tela local de 2 páginas.
 */

/** Atalho de getElementById (as duas telas tinham a mesma linha). */
const $ = (id) => document.getElementById(id);

/**
 * fetch + json tolerante: resposta não-JSON vira `{}` em vez de exceção, e o
 * status HTTP volta junto (a conferência usa pra distinguir 409 de 500).
 */
async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  return { httpStatus: res.status, ...body };
}
