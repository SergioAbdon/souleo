# Checklist da visita à clínica MedCardio — atualização do Wader (Seção 4)

**Válido a partir de:** 22/08/2026 · **Tempo estimado:** ~1h ·
**Acumula:** Sub-plano 5 (18/08) + Correção Seção 3 (20/08) + Correção Seção 4 (22/08).
**Regra de ouro: a ORDEM abaixo é obrigatória.** Limpar antes de atualizar MATA a ingestão.

## Antes de sair de casa
- [ ] `git pull` na máquina da clínica ANTES de tudo (este checklist e o código vêm pelo git).
- [ ] Conferir que a branch é `master` e o último commit inclui `S4` (`git log --oneline -3`).
- [ ] Avisar a recepção: ~15 min sem worklist durante a troca (fazer fora de exame, se possível).

## 1) Atualizar o Wader (PRIMEIRO de tudo)
- [ ] Parar o Wader atual (fechar o processo/console na máquina da clínica).
- [ ] Rodar o procedimento de atualização de sempre (`update-wader.ps1` — copia o código novo;
      o arquivo de estado `.wader-ingest-state.json` fica na RAIZ e NÃO é apagado).
- [ ] `cd apps/wader && npm install` (dependências podem ter mudado) e subir o Wader.
- [ ] **Verificar a versão**: abrir `http://localhost:8043/version` — deve mostrar a versão
      REAL do package.json (não mais "0.1.0"). Se mostrar 0.1.0, o update não pegou.
- [ ] Conferir no log: worker de ingest com **tick de 5s** (o clamp derruba o 30 antigo do
      config para ≤15; se quiser exato, editar `wader.config.json`: `"orthancChangesSec": 5`).
- [ ] Abrir `http://localhost:8043/conferencia` — a tela nova de conferência deve carregar
      (órfãos + exames do dia). Link também existe no /admin. NÃO criar atalho na recepção.

## 2) SÓ DEPOIS do Wader novo rodando: limpeza dos campos antigos
- [ ] `npm run integracoes:limpar` (dry-run — conferir a lista).
- [ ] `npm run integracoes:limpar -- --commit` (ATENÇÃO ao `--` duplo; sem ele o npm engole a flag).

## 3) Segredos (pendências das Seções 3/5)
- [ ] **Trocar a senha do Orthanc** (a atual está no histórico público do git):
      editar o `orthanc.json` da instalação (Registered Users) + atualizar a credencial
      na tela de Integrações do LEO (usuário/senha write-only). Reiniciar o serviço do Orthanc.
- [ ] **Remover `FEEGOW_API_TOKEN` do painel do Vercel** (pode ser feito de qualquer lugar,
      mas está aqui para não esquecer — o token agora vive só no Firestore).

## 4) Config do Orthanc — latência (Seção 4, pacote aprovado)
- [ ] No `orthanc.json`: `"StableAge": 30` (era 60). Reiniciar o Orthanc.
      Efeito: medidas no LEO ~10-15s após encerrar o exame no Vivid.
- [ ] Porta 8080 ocupada em algum passo = matar java zumbi; NUNCA trocar a porta.

## 5) Três testes de 2 minutos no aparelho (respostas que a Seção 4 precisa)
- [ ] **Reexportação re-renderiza?** Paciente de teste no Vivid → salvar 1 imagem →
      editar o cadastro (nome) → reexportar → conferir no Orthanc/LEO se o nome NA IMAGEM
      mudou. (Define o texto do aviso da tela de conferência: pixels corrigíveis ou não.)
- [ ] **Retenção do arquivo do Vivid:** conferir na config do aparelho se ele purga exames
      antigos sozinho quando o disco enche (Vivid = registro-mãe da decisão do DELETE direto;
      se purgar, reavaliar a quarentena).
- [ ] **Cursor do Orthanc:** reiniciar o serviço do Orthanc com o Wader rodando e conferir
      no log do Wader se aparece `cursor à frente do feed` seguido de recuperação normal
      (valida o conserto do achado 10).

## 6) Reprocesso dos exames antigos (opcional, decidir na hora)
- [ ] `npm run reprocessar-legado` (dry-run — lista quantos dos 182 têm estudo no Orthanc).
- [ ] Se a lista fizer sentido e a clínica estiver tranquila: `-- --commit` (o Wader
      reprocessa em lote; pode deixar rodando).

## 7) DEPOIS da visita (de casa, Claude executa quando o Sergio mandar)
- [ ] `node scripts/imagens-privar.mjs` (dry-run) → conferir contagem →
      `-- --commit` = imagens antigas deixam de ser públicas.
      (Só depois do Wader novo: o antigo ainda subia imagem pública.)

## Verificação final antes de ir embora
- [ ] Fazer 1 exame de teste (ou esperar o 1º real): worklist aparece no Vivid →
      encerrar → medidas no LEO em ~15s → imagens na sequência → pílula/estado corretos
      na fila. Batimento verde no cartão de Integrações com a versão nova.
