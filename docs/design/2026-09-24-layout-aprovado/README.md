# Redesenho visual aprovado — LEO

Consolidado em 24/09/2026. Fonte das escolhas: `docs/decisoes/2026-09-08-identidade-layout-icones-leo.md`.

## Escopo fechado com Sergio

Apenas redesenho do layout. Preservar handlers, validações, permissões, rotas, consultas, cálculos, contratos, integrações, cobrança e emissão. Não transportar JavaScript demonstrativo para produção. Os arquivos desta pasta são referências visuais com dados fictícios, não implementações das funcionalidades.

| Tela | Referência | Escolha final |
|---|---|---|
| Agenda / shell | leo-agenda-paletas-d-f.html | D original, sem escurecer |
| Paciente | leo-ficha-opcoes.html | B, ficha única com histórico de todos os exames |
| Laudos | leo-laudos-a-toolbar.html | A, cabeçalho em uma linha no desktop |
| Financeiro | leo-financeiro-refinado.html | Extrato + resumo por convênio |
| Clínica | leo-clinica-refinada.html | Grupos de campos e abas |
| Integrações | leo-integracoes-refinada.html | Visão geral + configurações recolhidas |
| Editor completo | leo-editor-barra-leve.html | Comandos unificados, ACC sem observação, barra leve |
| Perfil | leo-perfil-previa.html | Dados pessoais, profissionais e acesso |
| Entrada / recuperação | leo-acesso-previa.html | Composição clara e azul D |
| Cadastros | leo-cadastro-previa.html | Profissional / clínica |

As opções alternativas presentes nos comparadores não são aprovadas. A barra leve do editor foi aceita provisoriamente. A ficha B deve preservar a relação real paciente→exames, não repetir os dados fictícios das prévias.

## Identidade

IBM Plex Sans. Sidebar #EAF1FA, borda #D6E2F1, item ativo branco, texto #1E3A5F. Ação #2563EB, fundo #F1F5F9, superfícies brancas. Espaçamento confortável, contornos discretos. Logo L/ECG + EO; varredura no ECG a 88 bpm, respeitando movimento reduzido.

Ícones das seções do editor: Identificação user-round; Medidas ruler; Câmaras layout-grid; Diastólica waves; Válvulas símbolo 5A em `valvulas-opcoes.svg`; Sistólica zap; Segmentar target. Demais ícones: registro completo na decisão citada.

## Limites das prévias

- Os fragmentos dependem do ambiente de visualização para ícones Lucide; não são páginas standalone prontas para implantação.
- Não simular conectado, emitido, salvo, pago ou verificado em produção.
- Não criar novos filtros ou alterar a base de datas dos totais se isso modificar a lógica existente. Esses pontos precisam de escopo funcional separado.
- Não alterar a identidade, estrutura ou conteúdo do PDF/folha A4. O redesenho do editor fica no ambiente de trabalho.
- Não substituir TipTap pelo contenteditable simplificado das prévias.
- Não esconder erros, confirmações, travas ou controles por serem visualmente inconvenientes.
- Não alterar Direx.

Plano: `docs/planos/2026-09-24-redesenho-visual-leo.md`.


## Validação local — 09/10/2026
Implementação visual concluída na branch codex/layout-visual-aprovado, incluindo A4 de carótidas, sidebar D original, ECG a 88 bpm, ficha B e editor minimalista. TypeScript/build aprovados, 771 testes unitários e 26 verificações de interface em 11 telas (1440 e 390 px). Campos preservados ao recolher seções, trava de emitido e configurações mantidas. Corrigido overflow dos rótulos acessíveis das tabelas. Revisões independentes não encontraram regressões funcionais. Funções clínicas, persistência e geração PDF preservadas.

Evidências: docs/design/2026-09-24-layout-aprovado/validacao-final. Reproduzir com npm run build e node tests/visual/layout-check.mjs. Componentes reais com dados fictícios, rede externa e gravações bloqueadas. APIs reais, emissão clínica e PDF gerado não foram exercitados. Catálogo de ícones permanece como referência, sem afirmar migração de todo ícone legado do produto.

Lint geral tem 25 erros e 20 avisos anteriores; comparação inicial dos arquivos alterados com HEAD sem novos achados. Última checagem dos arquivos de produção finais passou. Build conserva aviso anterior de rastreamento amplo em pdf-browser/next.config. Obsidian atualizado (decisões, visão geral e roadmap). Implementação local concluída; publicação/merge/deploy ainda dependem de autorização do Sergio.
