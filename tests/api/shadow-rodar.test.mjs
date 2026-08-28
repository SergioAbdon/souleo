// ══════════════════════════════════════════════════════════════════
// Senna93 F4-T3 · Core da sombra (`rodarShadow`) — deps injetadas
// ══════════════════════════════════════════════════════════════════
// Testa a FUNÇÃO, não o handler HTTP (padrão do repo): listagem e
// persistência entram como deps falsas, o resto é o orquestrador de
// verdade (motor + simulador + comparadores + allowlist).
// ══════════════════════════════════════════════════════════════════
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rodarShadow,
  dadosParaMedidas,
  entradaLegadoDe,
  ERA_SENNA90_DESDE,
} from '../../src/lib/shadow/rodar.ts';
import { simularTabelaLegado } from '../../src/lib/shadow/legado-tabela.ts';

function exameFixture(over = {}) {
  return {
    id: 'ex1',
    dados: {
      status: 'emitido',
      emitidoEm: { toDate: () => new Date('2026-08-20T12:00:00Z') },
      pacienteNome: 'Paciente Teste',
      pacienteDtnasc: '1980-05-15', dataExame: '2026-08-20',
      medidas: { sexo: 'M', peso: '80', altura: '170', b7: '34', b8: '40', b9: '50',
                 b10: '10', b11: '10', b12: '30' },
      achados: ['Ritmo cardíaco regular.'],
      conclusoes: ['Exame dentro dos limites da normalidade.'],
      ...over,
    },
  };
}

describe('rodarShadow', () => {
  test('persiste execução com resumo e só exames divergentes; devolve execId', async () => {
    const gravados = [];
    const deps = {
      listarExames: async () => [exameFixture()],
      persistir: async (wsId, exec) => { gravados.push({ wsId, exec }); return 'exec-1'; },
    };
    const { execId, exec } = await rodarShadow(deps, {
      wsId: 'ws1', from: new Date('2026-08-01'), to: new Date('2026-08-28'),
      origem: 'script', uid: null,
    });
    assert.equal(execId, 'exec-1');
    assert.equal(gravados.length, 1);
    assert.equal(exec.resumo.totalExames, 1);
    assert.equal(exec.resumo.comparados, 1);
    // nenhum doc de exame carrega pacienteNome
    for (const ex of exec.exames) assert.ok(!('pacienteNome' in ex));
  });

  test('exame sem medidas é pulado com motivo, não comparado', async () => {
    const deps = { listarExames: async () => [exameFixture({ medidas: {} })],
                   persistir: async () => 'e' };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.resumo.pulados, 1);
    assert.equal(exec.exames[0].pulado, 'sem-medidas');
  });

  test('exame sem achados nem conclusões é pulado como sem-texto', async () => {
    const deps = { listarExames: async () => [exameFixture({ achados: [], conclusoes: [] })],
                   persistir: async () => 'e' };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(0), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.resumo.pulados, 1);
    assert.equal(exec.resumo.comparados, 0);
    assert.equal(exec.exames[0].pulado, 'sem-texto');
  });

  test('era: emitido antes de 2026-05-17 → frases vão pro balde eraLegado, não inesperadas', async () => {
    const deps = {
      listarExames: async () => [exameFixture({
        emitidoEm: { toDate: () => new Date('2026-04-10T12:00:00Z') },
        achados: ['Frase antiga do legado que o motor de hoje não gera.'],
      })],
      persistir: async () => 'e',
    };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(0), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.exames[0].era, 'legado');
    assert.equal(exec.resumo.frases.inesperadas, 0);
    assert.ok(exec.resumo.frases.eraLegado >= 1);
  });

  test('células: paciente-padrão não gera INESPERADA (allowlist cobre as diferenças reais)', async () => {
    const deps = { listarExames: async () => [exameFixture()], persistir: async () => 'e' };
    const { exec } = await rodarShadow(deps, { wsId: 'w', from: new Date(0), to: new Date(),
                                               origem: 'script', uid: null });
    assert.equal(exec.resumo.celulas.inesperadas, 0);
  });

  test('ERA_SENNA90_DESDE é o dia seguinte à virada em produção (16/05/2026)', () => {
    assert.equal(ERA_SENNA90_DESDE, '2026-05-17');
  });
});

// ══════════════════════════════════════════════════════════════════
// Fuso horário — revisão da T1
// ══════════════════════════════════════════════════════════════════
// `idadeAnos` do legado é `new Date('AAAA-MM-DD')` (meia-noite UTC) lido
// com getters LOCAIS: em UTC (Vercel) e em UTC−3 (navegador da clínica) o
// resultado difere em 8 de 691.920 pares de datas — gatilho 01/03 de ano
// bissexto nas fronteiras de idade 40/65. Rodando na Vercel, o simulador
// concordaria com o Senna93 e CALARIA uma divergência real.
// `entradaLegadoDe` sufixa 'T12:00' → meio-dia LOCAL, mesma data de
// calendário em qualquer fuso. Este teste prova a independência de TZ.
describe('entradaLegadoDe · idade do legado independe do fuso do servidor', () => {
  test('01/03 bissexto na fronteira dos 65 anos dá a mesma VR em qualquer TZ', () => {
    const entrada = entradaLegadoDe(dadosParaMedidas({
      pacienteDtnasc: '1960-03-01', dataExame: '2026-03-01',
      medidas: { sexo: 'M', b7: '34' },
    }));
    const tzOriginal = process.env.TZ;
    try {
      for (const tz of ['UTC', 'America/Sao_Paulo', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        // 66 anos de calendário → waseRaizUpper ♂ >65 = 41.
        // (O navegador da clínica, com o bug de fuso, diria 65 → '≤ 40 mm'.
        //  A sombra NÃO reproduz esse off-by-one: se aparecer divergência
        //  aqui, é bug REAL do legado aparecendo — que é a função da sombra.)
        assert.equal(simularTabelaLegado(entrada)[3][3], '≤ 41 mm', `TZ=${tz}`);
      }
    } finally {
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }
  });
});
