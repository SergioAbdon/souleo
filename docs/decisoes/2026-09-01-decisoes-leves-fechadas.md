# Decisões leves fechadas pelo Sergio (01/09) — E12/E13/X6/X23/X24 + frases diastologia

**Data:** 01/09/2026 · **Decisor:** Sergio ("aceito as suas recomendações") · **Status:** E13/E12 implementados nesta onda; demais são registro sem código.

## Cobrança

- **E12 — excedente:** o código MANTÉM o bloqueio no limite da franquia. O texto
  comercial (prompt da Marina, `src/app/api/marina/route.ts`) deixou de prometer
  "excedente R$X/laudo" e passou a oferecer o que existe: **créditos avulsos** ao
  mesmo preço. Implementar excedente automático fica pra onda de billing do fim
  do projeto (junto das mitigações). Os campos `excedente` no catálogo de planos
  ficam como estão (dados pra essa onda futura).
- **E13 — crédito só em conta VIGENTE** (implementado): `emitirComCobranca`
  (servidor) e `checkEmissao` (pré-voo) só aceitam `creditosExtras` quando
  `vigente()` (ciclo.ts) — o mesmo predicado de dinheiro/churn do Direx. Trial
  vencido com crédito agora dá `expirado` (antes emitia pra sempre). Semântica
  nova de borda: conta SEM `cicloFim` não emite por crédito (sem ciclo não há
  vigência — coerente com o comentário do próprio `vigente()`).
- **Créditos na suspensão:** NÃO são apagados — ficam guardados e voltam a valer
  quando a conta reativar. (Já era o comportamento: nada apaga `creditosExtras`;
  o E13 só impede o USO enquanto não-vigente.)
- **Verificação de impacto em produção antes do deploy:** 4 assinaturas, todas
  trial, ZERO créditos extras; a única vencida já não emitia. Ninguém afetado.

## Laudo/PDF (registro, sem código)

- **X6:** realce vermelho de fora-de-referência NÃO sai no PDF assinado —
  documento oficial sóbrio; o realce é ferramenta de conferência na tela.
- **X23:** confirmado intencional — o ledger `consumo` guarda pacienteNome e
  convênio (a conferência de convênio precisa).
- **X24:** laudo-texto sem Imprimir/Copiar/Word = lacuna leve assumida;
  adicionar só se fizer falta no uso real.

## Diastologia ASE 2016 — frases APROVADAS pelo Sergio

1. Achado: "Disfunção Diastólica do ventrículo esquerdo presente, de grau não determinado."
2. Conclusão: "Disfunção diastólica do ventrículo esquerdo de grau não determinado."
3. Alerta: "Massa do VE calculada mas não indexável — informe peso e altura para o índice de massa."
4. Alerta: "Sexo não informado — referências e classificações dependentes de sexo podem ficar suprimidas ou limitadas."
5. Ciente da mudança C-I2: FE deprimida sem fluxo mitral medido afirma presença
   (Algoritmo B), grau não determinado.

## Item 1 da lista de 31/08

Nome do laudo: Sergio renomeia "Eco Transtorácico" → "Ecocardiograma
Transtorácico" no catálogo (Clínica → Tipos de Exame), sem código.

## Sobra da Seção 5 (ainda aberta — explicada ao Sergio em 01/09)

1. `sexo` na whitelist administrativa das rules contradiz a decisão nº24 (sexo é
   trava do motor). Fechar = tirar da whitelist + publicar regra (pede
   confirmação do Sergio).
2. Reemissão desfaz correção administrativa em silêncio (o modal avisa).
   Conviver ou fechar de vez — aguardando o Sergio entender/decidir.
