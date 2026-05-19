# 2026-05-17 — Visão: Wader como produto + arquitetura de motores plugáveis

Decisões de **direção** (Sergio 17/05). **NÃO implementar agora** — pós
estabilização do núcleo (D+E em teste, #8a/#9/#10, faxina arquitetural).
Registrado aqui porque memória é per-máquina (não chega no Claude clínica).

## 1. Wader = plugin gerenciado do LEO

Refina o "app autônomo" de 09/05. NÃO roda dentro do LEO (DICOM é LAN →
Wader **on-prem obrigatório**), mas vira o **braço on-premise gerenciado
pela nuvem**: config + monitor + auth + auto-update pelo **painel do LEO**
(conta da clínica). Resolve as 2 dores-raiz: deploy manual + observabilidade
espalhada. Caveat: resiliência offline (nuvem cai → segue servindo última
worklist) + segurança (auth por clínica, menor privilégio).

⚠️ **NÃO reescrever o Wader do zero.** Núcleo carrega ~2 semanas de
correções DICOM (AE Title, ISO_IR 100, ACC≤16, Type 2, ACC-dup, SR).
Rewrite = re-introduz tudo. Evoluir + adicionar camadas de produto.

## 2. Projeto futuro: instalador Orthanc + multi-aparelho

Agente instalador que instala+configura Orthanc e **auto-linka com o
Wader** (wizard) — setup de 2 semanas vira assistente. Lado PC/Orthanc =
automático; lado-aparelho (apontar device, AE Title, licença MWL) =
humano no device, checklist pelo perfil. Escopo amplo: receber **todas
as imagens** de **todos os aparelhos** (Orthanc central). Caveat:
storage/banda + **retenção/LGPD**.

## 3. Conformance Statements — públicas e padronizadas (pesquisado 17/05)

DICOM MWL é padrão (DICOM Part 4 / IHE SWF). TODOS os fabricantes = mesmo
protocolo + mesmos campos de query. → **1 Wader + 1 perfil JSON por
modelo** (não 1 Wader/clínica). Onde pegar: GE/Philips/Canon/Mindray/
Siemens em portais públicos (PDFs diretos); Samsung via Download Center
(mais fechado). Processo: modelo+versão exatos → baixar CS → ler seção
"Modality Worklist SCU" → vira perfil → validar 1x no Orthanc+DCMTK local.
⚠️ **Licença MWL é frequentemente OPÇÃO PAGA** no aparelho — confirmar
ANTES de vender (sem licença não há worklist; nenhum software resolve).

## 4. Arquitetura LEO: HOST genérico + MOTORES plugáveis por `tipoExame`

```
CADASTRO/LAUDAR (host genérico) ──┬── eco_*  → MOTOR SENNA (cálculo)
                                  ├── carótida → MOTOR CAROTIDA (texto+img)
                                  └── outros → OUTROS MOTORES (LEO Universal)
```

- **Host** (cadastro, identificação, imagens, PDF [`pdf-server.ts`],
  billing, worklist) = genérico, já existe. **Motor** = entrada + cálculo
  + gera achados/conclusões, plugável por `tipoExame`.
- **Construir POR ACRÉSCIMO**, nunca framework-first (YAGNI): Senna →
  +Carótida → com 2 motores reais extrair a interface → Outros.
- **Carótida v1 = só texto + imagens** (sem cálculo; v2 futuro = NASCET/
  velocidades). É o 2º motor que valida o encaixe.
- ⚠️ **page.tsx é muito acoplado ao Senna.** Decisão: **Opção B** —
  carótida vira **página "laudo livre" SEPARADA** (Cadastro/Laudar
  despacha por tipoExame), **NÃO mexer no page.tsx do Senna** (risco
  baixo; Senna intocado). O trabalho real = variante PDF carótida +
  **sanitizar paste do Word** (HTML do Word é sujo).
- Alinhado ao "LEO Universal" já em `memory/product_vision_wader.md`
  (Cardio=Senna premium · Universal=texto/templates · Obstétrico=futuro).

## Sequência

NÃO agora. Ordem: testar D+E na clínica → estabilizar núcleo (#8a, modelo
CPF-pasta, soft-delete) → então Carótida (Opção B) como 1ª fatia do LEO
Universal → depois extrair interface de motor → Wader-plugin/instalador.
