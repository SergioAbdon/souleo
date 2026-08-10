# Motor V6 — Mapa de Strings para i18n

## Instruções para tradução futura

Quando for hora de traduzir o motor:

1. No motorv6.js, adicionar no topo:
```javascript
const _lang = 'pt-BR'; // idioma ativo
const _i18n = {}; // será carregado de arquivo externo
function t(chave, fallback, params){
  let txt = (_i18n[_lang] && _i18n[_lang][chave]) || fallback;
  if(params) Object.entries(params).forEach(([k,v])=> txt = txt.replace('{'+k+'}',v));
  return txt;
}
```

2. Substituir cada string por: `t('chave', 'texto original em PT')`
3. Criar arquivos de idioma (pt-BR.json, en-US.json, etc.)

## Quantidade de strings

- Total de `return '...'`: 163
- Total de `return \`...\``: 20
- **Total: ~183 strings traduzíveis**

## Strings organizadas por função

### Ritmo (j2)
- "Ritmo cardíaco sinusal." → `ritmo_sinusal`
- "Ritmo de fibrilação atrial." → `ritmo_fa`

### Câmaras (j3)
- "Cavidades cardíacas com dimensões normais." → `camaras_normais`
- "Átrio esquerdo aumentado" → `ae_aumentado`
- "Ventrículo esquerdo dilatado" → `ve_dilatado`

### Função Sistólica (j10, concSistolica)
- "Função sistólica global do VE preservada" → `fe_preservada`
- "Disfunção sistólica leve do VE" → `fe_disf_leve`
- "Disfunção sistólica moderada do VE" → `fe_disf_moderada`
- "Disfunção sistólica grave do VE" → `fe_disf_grave`

### Função Diastólica (j5, j6, j7)
- "Função diastólica do VE normal" → `diast_normal`
- "Disfunção diastólica grau I" → `diast_grau1`
- "Disfunção diastólica grau II" → `diast_grau2`
- "Disfunção diastólica grau III" → `diast_grau3`

### Valvas
- "Valvas cardíacas com morfologia e mobilidade normais" → `valvas_normais`
- "Insuficiência mitral {grau}" → `insuf_mitral`
- "Insuficiência aórtica {grau}" → `insuf_aortica`
- "Insuficiência tricúspide {grau}" → `insuf_tricuspide`
- "Estenose mitral {grau}" → `estenose_mitral`
- "Estenose aórtica {grau}" → `estenose_aortica`

### PSAP (j12)
- "Pressão sistólica da artéria pulmonar normal" → `psap_normal`
- "Hipertensão pulmonar leve" → `hp_leve`
- "Hipertensão pulmonar moderada" → `hp_moderada`
- "Hipertensão pulmonar grave" → `hp_grave`

### Pericárdio (j36)
- "Pericárdio normal" → `pericardio_normal`
- "Derrame pericárdico {grau}" → `derrame_pericardico`

### Hipertrofia (j8, j9)
- "Hipertrofia ventricular esquerda" → `hipertrofia_ve`
- "Espessura relativa aumentada" → `er_aumentada`

### Contratilidade segmentar (j13-j20, wallText)
- "Hipocinesia basal" → `wall_hipo_basal`
- "Acinesia" → `wall_acinesia`
- "Discinesia" → `wall_discinesia`
- Parede anterior, inferior, lateral, septal, apical → `wall_anterior`, `wall_inferior`, etc.

### Wilkins
- "Escore de Wilkins" → `wilkins_score`
- "Mobilidade" → `wilkins_mob`
- "Espessamento" → `wilkins_esp`
- "Calcificação" → `wilkins_cal`
- "Aparelho subvalvar" → `wilkins_sub`

### Conclusão
- "Ecocardiograma dentro dos limites da normalidade" → `conc_normal`
- "Função sistólica global do VE preservada" → `conc_fe_preservada`
- Todas as conclusões seguem o padrão: `conc_` + descrição

## Tempo estimado para tradução completa
- Mapear 183 strings → chaves: ~2 horas
- Traduzir para EN-US: ~1 hora
- Traduzir para ES: ~1 hora
- Testar: ~1 hora
- **Total: ~5 horas de trabalho**
