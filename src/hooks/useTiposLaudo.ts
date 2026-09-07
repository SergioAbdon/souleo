'use client';
// ══════════════════════════════════════════════════════════════════
// LEO · useTiposLaudo — catálogo de tipos de laudo (Ponytail-7)
// Worklist, Histórico e a ficha do paciente tinham o MESMO efeito
// (getDocs ordenado em workspaces/{wsId}/tiposLaudo, fallback pro default
// embutido quando a coleção ainda não foi semeada ou a leitura falha)
// reescrito 3x, verbatim. Dono único agora — mecânico, sem mudar o
// comportamento de nenhuma das 3 telas.
// ══════════════════════════════════════════════════════════════════
import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TIPOS_LAUDO_PADRAO, type TipoLaudo } from '@/lib/tipos-laudo';

// Lido 1x no mount (não precisa de onSnapshot aqui; a página de edição em
// Clínica é quem observa live).
export function useTiposLaudo(wsId: string | undefined): { tipos: TipoLaudo[]; tiposMap: Record<string, TipoLaudo> } {
  // Carga ETIQUETADA pelo local (triade S8 onda3): o catalogo so vale pro
  // wsId que o carregou — na troca de local a derivacao abaixo volta pro
  // padrao ate a carga nova chegar, sem setState sincrono no effect.
  const [carga, setCarga] = useState<{ ws: string; tipos: TipoLaudo[] } | null>(null);

  useEffect(() => {
    if (!wsId) return;
    let vivo = true; // resposta velha nao pode clobrar a carga do local novo
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'workspaces', wsId, 'tiposLaudo'), orderBy('ordem', 'asc')));
        if (!vivo) return;
        const lista = snap.docs.map(d => d.data() as TipoLaudo);
        setCarga({ ws: wsId, tipos: lista.length > 0 ? lista : TIPOS_LAUDO_PADRAO });
      } catch (e) {
        console.error('carregar tiposLaudo:', e);
        if (vivo) setCarga({ ws: wsId, tipos: TIPOS_LAUDO_PADRAO });
      }
    })();
    return () => { vivo = false; };
  }, [wsId]);

  const tipos = carga && carga.ws === wsId ? carga.tipos : TIPOS_LAUDO_PADRAO;
  const tiposMap: Record<string, TipoLaudo> = {};
  for (const t of tipos) tiposMap[t.id] = t;

  return { tipos, tiposMap };
}
