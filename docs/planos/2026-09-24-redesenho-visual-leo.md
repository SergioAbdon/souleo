# Redesenho visual do LEO — plano de aplicação

> Execução: seguir superpowers:subagent-driven-development ou superpowers:executing-plans conforme o protocolo e os papéis do projeto.

**Objetivo:** aplicar as referências aprovadas somente à apresentação do LEO.

**Arquitetura:** reusar componentes, estados e handlers existentes. Alterar tokens, classes, ícones e agrupamentos visuais locais, sem reestruturar serviços ou persistência.

**Stack:** Next.js 16.2.3, React 19.2.4, Tailwind 4, TipTap existente.

**Spec:** `docs/design/2026-09-24-layout-aprovado/README.md` e decisão de 08/09 atualizada.

## Restrições globais

- Somente layout, tipografia, ícones, cores e posicionamento dos controles existentes.
- Preservar condições de visibilidade por papel, estados disabled, contratos de props, IDs DOM, refs e handlers.
- Não alterar API, Firestore, motor Senna, preços, autenticação, integrações ou geração de documentos.
- PDF e documento impresso mantêm a identidade do local; Direx fica fora.
- Não importar o JavaScript nem os dados demonstrativos das prévias.
- Não incluir mudanças de outros trabalhos no commit; não usar stash.
- Antes de código: checkout isolado, verificar decisões recentes e ler a documentação local relevante em `node_modules/next/dist/docs/`.
- Aprovação visual existe; publicação na master/deploy continua sujeita ao protocolo do projeto.

## Pontos de revisão

1. Nomes longos, zoom e tela estreita: nenhum controle essencial perdido.
2. Perfis restritos: mesmas ações e dados que antes.
3. Laudo emitido: mesmas travas, correções e confirmação de emissão.
4. Ausência de dados, falhas e carregamento: não substituir estado real por status fictício.
5. Editor: mesmos IDs e ferramentas TipTap; tabela, assinatura e PDF sem mudança.

## 1. Base visual e navegação

Arquivos: `src/app/globals.css`, `src/components/shell/Sidebar.tsx`, `src/components/shell/PageHeader.tsx`, `src/app/(plataforma)/layout.tsx`.

- [ ] Capturar visual atual com dados de teste e papéis representativos.
- [ ] Acrescentar tokens de sidebar sem redefinir globalmente `card` ou `ativo` (evitar afetar Direx).
- [ ] Aplicar D original no Sidebar, branco no item ativo, espaçamento e tipografia das referências.
- [ ] Substituir marca e ícones preservando `itensVisiveis`, links, callbacks e menu da conta.
- [ ] Confirmar a disponibilidade real de Lucide antes de escolher o mecanismo de importação: o host das prévias fornece a biblioteca, o package.json atual não. Usar assets locais licenciados com atribuição ou dependência explicitamente avaliada, nunca CDN runtime.
- [ ] Conferir teclado, drawer e movimento reduzido da marca.

## 2. Agenda e lista de laudos

Arquivos: `src/components/Worklist.tsx`, `src/components/Historico.tsx`, páginas existentes de Agenda e Laudos.

- [ ] Trocar apenas apresentação dos filtros/ações existentes, preservando busca, importação, ordenação e status.
- [ ] Usar linhas espaçadas e ACC legível; conservar horário de chegada e semântica de espera.
- [ ] Organizar a toolbar de Laudos em uma linha quando couber; quebrar em telas menores.
- [ ] Conferir vazio, carregamento, erro e nomes longos em 1440, 1024 e 390 px.

## 3. Pacientes e Financeiro

Arquivos: `src/app/(plataforma)/pacientes/page.tsx`, `src/app/(plataforma)/pacientes/[id]/page.tsx`, `src/components/Extrato.tsx`.

- [ ] Aplicar ficha B: cadastro à esquerda, histórico à direita, empilhados no estreito.
- [ ] Preservar o histórico real já vinculado ao paciente e as ações existentes de cada exame.
- [ ] Reorganizar o extrato e o resumo sem tocar seletores, somas, honorários, consultas ou critérios de datas.
- [ ] Comparar totais antes/depois sobre o mesmo conjunto de teste e confirmar as mesmas ações por papel.

## 4. Clínica, Integrações e Perfil

Arquivos: `src/app/(plataforma)/clinica/page.tsx`, `src/app/(plataforma)/integracoes/page.tsx`, `src/components/integracoes/CartaoIntegracao.tsx`, `src/components/PerfilModal.tsx`.

- [ ] Aplicar grupos e espaçamentos mantendo campos, validações, abas e contratos atuais.
- [ ] Apresentar estados de integração reais; últimas atividades só se já disponíveis. Campo ausente não vira horário inventado.
- [ ] Recolher configurações técnicas sem desmontar formulários com alterações pendentes.
- [ ] Manter o fluxo atual do perfil: não converter modal em nova rota apenas porque a prévia usa uma página.
- [ ] Qualquer controle novo de dirty-state, preview dinâmico ou consulta de integração não existente é separado do redesenho.

## 5. Editor completo

Arquivos: `src/components/laudo/SidebarLaudo.tsx`, `src/components/laudo/EditorLaudo.tsx`, `src/app/laudo/[id]/page.tsx`.

- [ ] Preservar as sete seções e todos os IDs/refs. Agrupar com azul D e bordas leves.
- [ ] Reorganizar comandos em uma linha no desktop usando callbacks existentes. Não criar uma segunda ação de emissão ou bypass de confirmação.
- [ ] Manter ACC copiável e retirar apenas a observação explicativa pedida.
- [ ] Aplicar os sete ícones aprovados e barra TipTap sem caixas individuais: N/I/S, listas, undo/redo e frases.
- [ ] Não alterar `SheetA4`, `MolduraA4`, geradores PDF, textos clínicos ou chamadas do motor.
- [ ] Rodar testes unitários existentes, incluindo contratos DOM/ponte e editor; conferir manualmente emitido bloqueado, importação, galeria e banco de frases.

## 6. Entrada e cadastro

Arquivo: `src/app/login/page.tsx`.

- [ ] Aplicar composição visual da entrada, recuperação e cadastro sem mudar abas/handlers.
- [ ] Manter validações, PF médico/assistente, CRM/UF condicionais, cadastro PJ e verificações de e-mail.
- [ ] Conferir erros, loading, teclado e layout estreito com credenciais de teste; nunca criar conta real para validar estilo.

## 7. Verificação e entrega

- [ ] `npm run typecheck`.
- [ ] `npm run lint` (distinguir falhas preexistentes).
- [ ] `npm run test:unit` quando houver mudança em componentes com contratos/testes, especialmente editor.
- [ ] `npm run build` para validar compilação final.
- [ ] Comparar screenshots das telas alteradas com a escolha correta do manifesto, incluindo desktop e estreito.
- [ ] Revisão independente do diff: alterações limitadas à apresentação, sem perda de controles ou estados.
- [ ] Atualizar decisões e Obsidian com o que foi efetivamente implementado, sem confundir planejamento com conclusão.

## Estado desta entrega

Implementação visual local em andamento em codex/layout-visual-aprovado. Typecheck, 771 unitários e build passaram em 26/09/2026. A conclusão integral depende das verificações descritas em docs/design/2026-09-24-layout-aprovado/ESTADO-IMPLEMENTACAO.md. Checkboxes não conferidos continuam pendentes.


## Validação local — 09/10/2026
Implementação visual concluída na branch codex/layout-visual-aprovado, incluindo A4 de carótidas, sidebar D original, ECG a 88 bpm, ficha B e editor minimalista. TypeScript/build aprovados, 771 testes unitários e 26 verificações de interface em 11 telas (1440 e 390 px). Campos preservados ao recolher seções, trava de emitido e configurações mantidas. Corrigido overflow dos rótulos acessíveis das tabelas. Revisões independentes não encontraram regressões funcionais. Funções clínicas, persistência e geração PDF preservadas.

Evidências: docs/design/2026-09-24-layout-aprovado/validacao-final. Reproduzir com npm run build e node tests/visual/layout-check.mjs. Componentes reais com dados fictícios, rede externa e gravações bloqueadas. APIs reais, emissão clínica e PDF gerado não foram exercitados. Catálogo de ícones permanece como referência, sem afirmar migração de todo ícone legado do produto.

Lint geral tem 25 erros e 20 avisos anteriores; comparação inicial dos arquivos alterados com HEAD sem novos achados. Última checagem dos arquivos de produção finais passou. Build conserva aviso anterior de rastreamento amplo em pdf-browser/next.config. Obsidian atualizado (decisões, visão geral e roadmap). Implementação local concluída; publicação/merge/deploy ainda dependem de autorização do Sergio.
