import * as fs from 'node:fs';
import * as path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReleaseInfo } from './estado';

/**
 * Atualização com ok (spec §5): releases/latest do repo público (o GitHub já
 * exclui draft e prerelease). Versão nova = tag `wader-v{X}` com X ≠ atual.
 * Sem semver de propósito (corte Ponytail 5): reintroduzir se o repo ganhar
 * outra linha de release. Só baixa — quem confere SHA é o lançador (§4).
 */
export const URL_RELEASE = 'https://api.github.com/repos/SergioAbdon/souleo/releases/latest';
const PREFIXO = 'wader-v';

export function versaoNova(tagName: string | undefined, atual: string): string | null {
  if (!tagName || !tagName.startsWith(PREFIXO)) return null;
  const v = tagName.slice(PREFIXO.length);
  if (!/^\d+\.\d+\.\d+$/.test(v)) return null; // vira nome de arquivo: nada de path/lixo
  return v === atual ? null : v;
}

/** `undefined` = a checagem falhou (rede/HTTP/JSON); `null` = falou com o GitHub e não há versão nova. */
export async function checarRelease(atual: string, fetchFn: typeof fetch = fetch): Promise<ReleaseInfo | null | undefined> {
  try {
    const r = await fetchFn(URL_RELEASE, { headers: { 'User-Agent': 'wader', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { tag_name?: string; assets?: { name: string; browser_download_url: string }[] };
    const versao = versaoNova(j.tag_name, atual);
    if (!versao) return null;
    const assets: Record<string, string> = {};
    for (const a of j.assets ?? []) assets[a.name] = a.browser_download_url;
    return { versao, assets };
  } catch {
    return undefined; // sem rede = silêncio, tenta na próxima hora
  }
}

async function baixarPara(url: string, destino: string, fetchFn: typeof fetch, timeoutMs: number): Promise<void> {
  const r = await fetchFn(url, { headers: { 'User-Agent': 'wader' }, signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok || !r.body) throw new Error(`download falhou (${r.status}): ${url}`);
  await pipeline(Readable.fromWeb(r.body as never), fs.createWriteStream(destino + '.tmp'));
  fs.renameSync(destino + '.tmp', destino);
}

/** Grava `updates/wader-v{X}.exe` e `.sha256`. Lança se a release não tem os dois assets. */
export async function baixarRelease(info: ReleaseInfo, dir: string, fetchFn: typeof fetch = fetch, timeoutMs = 10 * 60_000): Promise<void> {
  const exe = info.assets['wader.exe'];
  const sha = info.assets['wader.exe.sha256'];
  if (!exe || !sha) throw new Error('release sem os assets wader.exe / wader.exe.sha256');
  fs.mkdirSync(dir, { recursive: true });
  const alvo = path.join(dir, `wader-v${info.versao}.exe`);
  await baixarPara(sha, alvo + '.sha256', fetchFn, timeoutMs);
  await baixarPara(exe, alvo, fetchFn, timeoutMs);
}

export function iniciarChecagemRelease(
  atual: string,
  aoAchar: (info: ReleaseInfo | null | undefined) => void,
  intervaloMs = 60 * 60_000,
  fetchFn: typeof fetch = fetch,
): () => void {
  const checar = async () => aoAchar(await checarRelease(atual, fetchFn));
  void checar();
  const timer = setInterval(() => void checar(), intervaloMs);
  return () => clearInterval(timer);
}
