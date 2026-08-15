// Catálogo de tipos de laudo (spec §4): cada tipo define COMO o laudo é
// alimentado. Docs em workspaces/{wsId}/tiposLaudo/{tipoId}; estes defaults
// semeiam contas novas (signup-server duplica inline — sem import lá) e
// servem de fallback quando a coleção ainda não foi semeada.

export type ModalidadeLaudo = 'motor' | 'texto' | 'pdf';

export type TipoLaudo = {
  id: string;
  nome: string;
  icone: string;
  ativo: boolean;
  ordem: number;
  modalidade: ModalidadeLaudo;
  motorId?: string; // modalidade 'motor' — registry: 'senna' (futuros entram aqui)
  modeloTexto?: string; // modalidade 'texto' — HTML inicial do TipTap
};

export const MODELO_CAROTIDAS = [
  '<h2>DOPPLER DE CARÓTIDAS E VERTEBRAIS</h2>',
  '<p><strong>Técnica:</strong> exame realizado com transdutor linear, em repouso, com análise bidimensional, Doppler colorido e espectral.</p>',
  '<p><strong>Carótidas comuns:</strong> trajeto, calibre e fluxo preservados bilateralmente.</p>',
  '<p><strong>Bulbos e bifurcações:</strong> sem placas ou espessamento médio-intimal significativo.</p>',
  '<p><strong>Carótidas internas:</strong> fluxo preservado, sem estenoses hemodinamicamente significativas.</p>',
  '<p><strong>Carótidas externas:</strong> sem alterações.</p>',
  '<p><strong>Vertebrais:</strong> fluxo anterógrado bilateral.</p>',
  '<h3>CONCLUSÃO</h3>',
  '<p>Exame dentro dos limites da normalidade.</p>',
].join('');

export const TIPOS_LAUDO_PADRAO: TipoLaudo[] = [
  {
    id: 'eco_tt',
    nome: 'Eco Transtorácico',
    icone: '🫀',
    ativo: true,
    ordem: 1,
    modalidade: 'motor',
    motorId: 'senna',
  },
  {
    id: 'eco_te',
    nome: 'Eco Transesofágico',
    icone: '🫀',
    ativo: true,
    ordem: 2,
    modalidade: 'motor',
    motorId: 'senna',
  },
  {
    id: 'eco_stress',
    nome: 'Eco Stress',
    icone: '🫀',
    ativo: true,
    ordem: 3,
    modalidade: 'motor',
    motorId: 'senna',
  },
  {
    id: 'doppler_carotidas',
    nome: 'Doppler de Carótidas',
    icone: '🩺',
    ativo: true,
    ordem: 4,
    modalidade: 'texto',
    modeloTexto: MODELO_CAROTIDAS,
  },
  {
    id: 'ecg',
    nome: 'ECG',
    icone: '📈',
    ativo: true,
    ordem: 5,
    modalidade: 'pdf',
  },
  {
    id: 'mapa',
    nome: 'MAPA',
    icone: '🩸',
    ativo: true,
    ordem: 6,
    modalidade: 'pdf',
  },
  {
    id: 'holter',
    nome: 'Holter',
    icone: '📟',
    ativo: true,
    ordem: 7,
    modalidade: 'pdf',
  },
  {
    id: 'ergometrico',
    nome: 'Teste Ergométrico',
    icone: '🏃',
    ativo: true,
    ordem: 8,
    modalidade: 'pdf',
  },
];
