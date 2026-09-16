// Merge por linha "última alteração vence" (S5-T2, decisão D2-c do Sergio).
//
// Contrato: o motor regera achados/conclusões a cada medida digitada, mas o
// texto do médico não pode ser perdido nem duplicado. Cada teste aqui é um
// caso clínico real — errar significa frase médica sumindo ou repetida.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mesclarLinhas, colapsarWilkins } from '../../src/lib/laudo-merge.ts';

// Linhas de verdade do motor (encurtadas mas com a cara das reais)
const VE_LEVE = 'Ventrículo esquerdo com dimensões aumentadas em grau leve.';
const VE_MOD = 'Ventrículo esquerdo com dimensões aumentadas em grau moderado.';
const VE_EDIT = 'Ventrículo esquerdo com dimensões aumentadas em grau leve, com trabeculações.';
const AE = 'Átrio esquerdo com dimensões normais.';
const AORTA = 'Aorta com dimensões normais.';
const IM = 'Insuficiência mitral de grau discreto.';
const MANUAL = 'Janela acústica limitada.';

// Frases REAIS do motor (src/senna90/conclusoes/index.ts e achados/*.ts) —
// os pares adversariais do review S5-T2 (Critical 3) usam estas strings.
const IM_LEVE = 'Insuficiência Mitral leve.';
const IM_LEVE_MOD = 'Insuficiência Mitral leve a moderada.';
const IA_LEVE = 'Insuficiência Aórtica leve.';
const IT_LEVE = 'Insuficiência Tricúspide leve.';
const EAO_LEVE = 'Estenose Aórtica Leve.';
const EMI_LEVE = 'Estenose Mitral Leve.';
const DISF_VE = 'Disfunção sistólica do ventrículo esquerdo.';
const DISF_VD = 'Disfunção sistólica do ventrículo direito.';
const DISF_BIV = 'Disfunção sistólica biventricular.';
const DISF_VE_DISC = 'Disfunção sistólica do ventrículo esquerdo, discreta.';
const DISF_VE_MOD = 'Disfunção sistólica do ventrículo esquerdo, moderada.';
const HIP_CONC = 'Hipertrofia concêntrica do ventrículo esquerdo.';
const HIP_EXC = 'Hipertrofia excêntrica do ventrículo esquerdo.';

describe('mesclarLinhas — sem edição do médico', () => {
  test('(d) atuais ≡ prevGer → devolve novaGer inteira', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_MOD, AE];
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_LEVE, AE]), [VE_MOD, AE]);
  });

  test('(e) achado novo do motor entra na posição do motor', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_LEVE, IM, AE];
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_LEVE, AE]), [VE_LEVE, IM, AE]);
  });

  test('(f) achado intocado que sumiu do motor sai do laudo', () => {
    const prev = [VE_LEVE, AE];
    const nova = [AE];
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_LEVE, AE]), [AE]);
  });

  test('primeira geração (prev vazio, editor vazio) → novaGer', () => {
    assert.deepEqual(mesclarLinhas([], [VE_LEVE, AE], []), [VE_LEVE, AE]);
  });
});

describe('mesclarLinhas — cenário do Sergio (linha do VE editada)', () => {
  test('(b) linha editada + DDVE MUDA → sai a linha nova do motor', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_MOD, AE];
    // médico editou a linha do VE acrescentando "com trabeculações"
    const out = mesclarLinhas(prev, nova, [VE_EDIT, AE]);
    assert.deepEqual(out, [VE_MOD, AE]);
    assert.equal(out.filter((l) => l.includes('Ventrículo esquerdo')).length, 1, 'não duplica a linha do VE');
  });

  test('(c) linha editada + DDVE NÃO muda → a edição do médico fica', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_LEVE, AE]; // motor recalculou e deu a mesma coisa
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_EDIT, AE]), [VE_EDIT, AE]);
  });

  test('(a) frase acrescentada pelo médico sobrevive à mudança de medida', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_MOD, AE];
    const out = mesclarLinhas(prev, nova, [VE_LEVE, MANUAL, AE]);
    assert.deepEqual(out, [VE_MOD, MANUAL, AE]);
  });
});

describe('mesclarLinhas — âncora das linhas manuais', () => {
  test('(i) linha manual entre duas do motor mantém a posição', () => {
    const prev = [VE_LEVE, AE, AORTA];
    const nova = [VE_LEVE, AE, AORTA];
    const out = mesclarLinhas(prev, nova, [VE_LEVE, AE, MANUAL, AORTA]);
    assert.deepEqual(out, [VE_LEVE, AE, MANUAL, AORTA]);
  });

  test('linha manual no topo (antes de qualquer linha do motor) fica no topo', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_MOD, AE];
    assert.deepEqual(mesclarLinhas(prev, nova, [MANUAL, VE_LEVE, AE]), [MANUAL, VE_MOD, AE]);
  });

  test('linha manual sobrevive mesmo quando a linha-âncora some do motor', () => {
    const prev = [VE_LEVE, AE];
    const nova = [AE]; // VE normalizou
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_LEVE, MANUAL, AE]), [MANUAL, AE]);
  });

  test('(j) heurística 60% NÃO confunde linha manual curta com linha do motor', () => {
    const prev = [VE_LEVE, AE, AORTA];
    const nova = [VE_MOD, AE, AORTA];
    const out = mesclarLinhas(prev, nova, [VE_LEVE, AE, AORTA, MANUAL]);
    assert.deepEqual(out, [VE_MOD, AE, AORTA, MANUAL]);
  });

  test('linha manual idêntica a uma linha do motor não sai duplicada', () => {
    const prev = [VE_LEVE];
    const nova = [VE_LEVE, IM]; // motor passou a gerar a frase que o médico já tinha digitado
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_LEVE, IM]), [VE_LEVE, IM]);
  });
});

describe('mesclarLinhas — médico apagou linha do motor', () => {
  test('motor NÃO mudou a linha → fica apagada (última alteração vence)', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_LEVE, AE];
    assert.deepEqual(mesclarLinhas(prev, nova, [AE]), [AE]);
  });

  test('motor MUDOU a linha → volta (conteúdo novo vence a remoção antiga)', () => {
    const prev = [VE_LEVE, AE];
    const nova = [VE_MOD, AE];
    assert.deepEqual(mesclarLinhas(prev, nova, [AE]), [VE_MOD, AE]);
  });

  test('(n) linha EDITADA cujo slot sumiu do motor some junto', () => {
    const prev = [VE_LEVE, AE];
    const nova = [AE]; // DDVE normalizou: o achado do VE não existe mais
    assert.deepEqual(mesclarLinhas(prev, nova, [VE_EDIT, AE]), [AE]);
  });
});

describe('mesclarLinhas — restauração de rascunho (emenda: prev := nova)', () => {
  test('1ª regeneração pós-restauração preserva a frase manual do rascunho', () => {
    const nova = [VE_LEVE, AE];
    const restaurado = [VE_LEVE, MANUAL, AE];
    assert.deepEqual(mesclarLinhas(nova, nova, restaurado), [VE_LEVE, MANUAL, AE]);
  });

  test('1ª regeneração pós-restauração preserva a linha do motor EDITADA no rascunho', () => {
    const nova = [VE_LEVE, AE];
    assert.deepEqual(mesclarLinhas(nova, nova, [VE_EDIT, AE]), [VE_EDIT, AE]);
  });

  test('pseudo-prev é idempotente quando o rascunho é igual à geração', () => {
    const nova = [VE_LEVE, AE, AORTA];
    assert.deepEqual(mesclarLinhas(nova, nova, nova), [VE_LEVE, AE, AORTA]);
  });
});

describe('mesclarLinhas — conclusões e listas vazias', () => {
  test('(g) conclusões: item editado fica, item recalculado troca', () => {
    const prev = ['Ventrículo esquerdo com disfunção sistólica discreta.', 'Insuficiência mitral discreta.'];
    const nova = ['Ventrículo esquerdo com disfunção sistólica moderada.', 'Insuficiência mitral discreta.'];
    const atuais = ['Ventrículo esquerdo com disfunção sistólica discreta.', 'Insuficiência mitral discreta, com refluxo central.'];
    assert.deepEqual(mesclarLinhas(prev, nova, atuais), [
      'Ventrículo esquerdo com disfunção sistólica moderada.',
      'Insuficiência mitral discreta, com refluxo central.',
    ]);
  });

  test('conclusões com 1 item só, editado, motor inalterado → edição fica', () => {
    const prev = ['Exame dentro dos limites da normalidade.'];
    const nova = ['Exame dentro dos limites da normalidade.'];
    const atuais = ['Exame dentro dos limites da normalidade para a idade.'];
    assert.deepEqual(mesclarLinhas(prev, nova, atuais), ['Exame dentro dos limites da normalidade para a idade.']);
  });

  test('conclusões com 1 item só, motor trocou → motor vence', () => {
    const prev = ['Exame dentro dos limites da normalidade.'];
    const nova = ['Hipertrofia ventricular esquerda concêntrica.'];
    assert.deepEqual(mesclarLinhas(prev, nova, prev), ['Hipertrofia ventricular esquerda concêntrica.']);
  });

  test('listas vazias em qualquer combinação não explodem', () => {
    assert.deepEqual(mesclarLinhas([], [], []), []);
    assert.deepEqual(mesclarLinhas([], [AE], []), [AE]);
    assert.deepEqual(mesclarLinhas([AE], [], [AE]), []);
    assert.deepEqual(mesclarLinhas([], [], [MANUAL]), [MANUAL]);
    assert.deepEqual(mesclarLinhas(null, null, null), []);
  });
});

// ── Fixes do review S5-T2 ──────────────────────────────────────────
// Cada teste aqui reproduz um achado do revisor com as frases REAIS do
// motor. Errar = frase de outra válvula/ventrículo apagada em silêncio.

describe('heurística NÃO casa estruturas diferentes (Critical 3)', () => {
  test('(4b) conclusão AÓRTICA do médico sobrevive quando o motor muda a MITRAL', () => {
    const out = mesclarLinhas([IM_LEVE], [IM_LEVE_MOD], [IA_LEVE]);
    assert.ok(out.includes(IA_LEVE), 'conclusão do médico (aórtica) não pode sumir');
    assert.ok(out.includes(IM_LEVE_MOD), 'conclusão nova do motor (mitral) tem de entrar');
  });

  test('(4c) linha do VD escrita pelo médico sobrevive à mudança da linha do VE', () => {
    const out = mesclarLinhas([DISF_VE], [DISF_BIV], [DISF_VD]);
    assert.ok(out.includes(DISF_VD), 'linha do ventrículo direito não pode sumir');
    assert.ok(out.includes(DISF_BIV));
  });

  test('(4f) VE e VD não se confundem: sem apagar o VD e sem 2 graus do mesmo VE', () => {
    const out = mesclarLinhas([DISF_VE], [DISF_VE_MOD], [DISF_VD, DISF_VE_DISC]);
    assert.deepEqual(out, [DISF_VD, DISF_VE_MOD]);
  });

  test('mitral × aórtica × tricúspide nunca são o mesmo slot', () => {
    assert.deepEqual(mesclarLinhas([IM_LEVE], [IM_LEVE], [IT_LEVE]), [IT_LEVE]);
    assert.deepEqual(mesclarLinhas([EAO_LEVE], [EAO_LEVE], [EMI_LEVE]), [EMI_LEVE]);
  });

  test('hipertrofia concêntrica × excêntrica não são o mesmo slot', () => {
    const out = mesclarLinhas([HIP_CONC], [HIP_CONC], [HIP_EXC]);
    assert.deepEqual(out, [HIP_EXC], 'o que o médico escreveu fica; o motor não sobrescreve');
  });

  test('mudança de GRAU na mesma válvula continua casando (o caso de uso)', () => {
    const out = mesclarLinhas([IM_LEVE, AE], [IM_LEVE_MOD, AE], [IM_LEVE, AE, MANUAL]);
    assert.deepEqual(out, [IM_LEVE_MOD, AE, MANUAL]);
  });
});

describe('editor vazio não apaga o laudo (Critical 2)', () => {
  test('atuais vazio com prev cheio → geração nova inteira', () => {
    assert.deepEqual(mesclarLinhas([VE_LEVE, AE], [VE_LEVE, AE], []), [VE_LEVE, AE]);
    assert.deepEqual(mesclarLinhas([VE_LEVE, AE], [VE_MOD, AE], []), [VE_MOD, AE]);
  });
});

describe('dedup não engole linha legitimamente repetida (Important 4)', () => {
  test('linha repetida sobrevive quando OUTRA linha foi editada', () => {
    const prev = [VE_LEVE, AE, AE];
    assert.deepEqual(mesclarLinhas(prev, [...prev], [VE_EDIT, AE, AE]), [VE_EDIT, AE, AE]);
  });

  test('linha manual igual a uma linha do motor não reposiciona a do motor', () => {
    const prev = [VE_LEVE, AE];
    assert.deepEqual(mesclarLinhas(prev, [...prev], [AE, VE_LEVE, AE]), [VE_LEVE, AE]);
  });
});

describe('médico reordena parágrafo (regressão do fix1)', () => {
  test('subir um parágrafo NÃO apaga a linha que ele ultrapassou', () => {
    const prev = [VE_LEVE, AE, AORTA];
    assert.deepEqual(mesclarLinhas(prev, [...prev], [AE, VE_LEVE, AORTA]), [AE, VE_LEVE, AORTA]);
  });

  test('reordenar 2 linhas mantém as 2, na ordem do médico', () => {
    const prev = [VE_LEVE, AE];
    assert.deepEqual(mesclarLinhas(prev, [...prev], [AE, VE_LEVE]), [AE, VE_LEVE]);
  });

  test('reordenar com frase manual junto mantém as 3', () => {
    const prev = [VE_LEVE, AE];
    assert.deepEqual(mesclarLinhas(prev, [...prev], [AE, VE_LEVE, MANUAL]), [AE, VE_LEVE, MANUAL]);
  });
});

describe('colapsarWilkins — bloco renderizado no editor volta a ser sentinela', () => {
  const SENT = '__WILKINS__{"mob":2,"esp":2,"sub":1,"cal":1,"sc":6,"concFrase":"Favorável."}';
  const RENDER = [
    'Escore Ecocardiográfico de Wilkins & Block:',
    '• Mobilidade do folheto (2 pts): Redução da mobilidade na porção média e na base dos folhetos',
    '• Calcificação valvar (1 pts): Uma única área de calcificação',
    'TOTAL: 6 pontos. Favorável.',
  ];

  test('bloco renderizado colapsa na sentinela do motor', () => {
    assert.deepEqual(colapsarWilkins([VE_LEVE, ...RENDER, AE], [VE_LEVE, SENT, AE]), [VE_LEVE, SENT, AE]);
  });

  test('sem sentinela no motor, o bloco renderizado some (score foi apagado)', () => {
    assert.deepEqual(colapsarWilkins([VE_LEVE, ...RENDER, AE], [VE_LEVE, AE]), [VE_LEVE, AE]);
  });

  test('(imp6) frase do médico no meio do bloco não duplica a sentinela', () => {
    const partido = [RENDER[0], RENDER[1], MANUAL, RENDER[3]];
    assert.deepEqual(colapsarWilkins(partido, [SENT]), [SENT, MANUAL]);
  });

  test('(p) merge não duplica o bloco de Wilkins quando o motor regenera', () => {
    const prev = [VE_LEVE, SENT];
    const nova = [VE_MOD, SENT];
    const out = mesclarLinhas(prev, nova, [VE_LEVE, ...RENDER]);
    assert.deepEqual(out, [VE_MOD, SENT]);
  });
});
