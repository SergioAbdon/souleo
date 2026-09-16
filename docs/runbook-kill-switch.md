# Runbook — Kill-switch do motor de números (Senna93)

**Quando usar:** a tabela de medidas do laudo não carrega, mostra números errados, ou a
emissão está bloqueada com "Tabela de medidas não carregou" — e você precisa voltar AGORA
ao comportamento antigo, neste computador, sem esperar ninguém.

## O cartão (30 segundos, funciona em qualquer navegador)

1. Na tela do laudo, aperte **F12** (abre as ferramentas do navegador).
2. Clique na aba **Console**.
3. Cole esta linha e aperte Enter:

```
localStorage.setItem('leo:params-engine','off')
```

4. Aperte **F5** (recarregar a página).

Pronto: este computador volta ao motor antigo pintando a tabela — igualzinho era antes.
Nada muda para os outros computadores nem para outros usuários.

## Para religar o motor novo (depois que o problema for entendido)

```
localStorage.setItem('leo:params-engine','senna93')
```

e **F5**. Para voltar ao padrão do sistema (o que a produção mandar):

```
localStorage.removeItem('leo:params-engine')
```

e **F5**.

## Notas

- O kill-switch é POR COMPUTADOR (localStorage). Vence qualquer configuração global.
- A mesma família tem a chave `leo:primary-engine` (frases do laudo, Senna90) — o cartão
  acima só mexe nos NÚMEROS da tabela; as frases continuam como estão.
- Este cartão morre junto com o motor antigo na F5b (quando não houver mais para o que
  voltar).
