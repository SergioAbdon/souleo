// Bootstrap: registra o hook de resolução (ver ts-relative-resolve-hook.mjs)
// via `module.register()` — API recomendada pelo Node no lugar da flag
// `--experimental-loader` (que ele mesmo avisa que pode sumir).
import { register } from 'node:module';

register('./ts-relative-resolve-hook.mjs', import.meta.url);
