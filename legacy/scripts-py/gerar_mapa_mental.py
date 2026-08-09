#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Gera PDF do Mapa Mental: Acoplamento Motor x Chassi do LEO"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm, cm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.enums import TA_LEFT, TA_CENTER

W, H = A4  # 210x297mm
P1 = HexColor('#8B1A1A')
P2 = HexColor('#1E3A5F')
GRAY = HexColor('#666666')
LIGHT = HexColor('#F0F4F8')
GREEN = HexColor('#059669')
ORANGE = HexColor('#D97706')

def draw_box(c, x, y, w, h, title, items, color=P2, bg=None):
    """Desenha caixa com titulo e itens"""
    if bg:
        c.setFillColor(bg)
        c.roundRect(x, y, w, h, 4, fill=1, stroke=0)
    c.setStrokeColor(color)
    c.setLineWidth(1.5)
    c.roundRect(x, y, w, h, 4, fill=0, stroke=1)
    # Titulo
    c.setFillColor(color)
    c.roundRect(x, y+h-16, w, 16, 4, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 8)
    c.drawCentredString(x+w/2, y+h-12, title)
    # Itens
    c.setFillColor(black)
    c.setFont('Helvetica', 6.5)
    ty = y+h-28
    for item in items:
        if ty < y+4:
            break
        c.drawString(x+6, ty, item)
        ty -= 9

def draw_arrow(c, x1, y1, x2, y2, color=P2):
    """Desenha seta"""
    c.setStrokeColor(color)
    c.setLineWidth(1)
    c.line(x1, y1, x2, y2)
    # Ponta da seta
    import math
    angle = math.atan2(y2-y1, x2-x1)
    sz = 4
    c.line(x2, y2, x2-sz*math.cos(angle-0.4), y2-sz*math.sin(angle-0.4))
    c.line(x2, y2, x2-sz*math.cos(angle+0.4), y2-sz*math.sin(angle+0.4))

def page1(c):
    """Pagina 1: Fluxo geral + Entrada no laudo"""
    # Header
    c.setFillColor(P2)
    c.rect(0, H-30*mm, W, 30*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 18)
    c.drawCentredString(W/2, H-18*mm, 'LEO - Mapa Mental de Acoplamento')
    c.setFont('Helvetica', 10)
    c.drawCentredString(W/2, H-25*mm, 'Motor V8 MP4  x  Chassi V7  |  08/04/2026')

    # Fluxo do usuario
    y = H-42*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y, '1. FLUXO DO USUARIO (jornada completa)')
    y -= 5*mm

    steps = ['CADASTRO', 'LOGIN', 'PERFIL', 'LOCAL', 'WORKLIST', 'LAUDO', 'EMISSAO', 'PDF']
    modules = ['05-auth', '05-auth', '05-auth', 'v7f.html', '07-wl', 'MOTOR', '11-ui', '11-ui']
    sx = 15*mm
    bw = 20*mm
    for i, (step, mod) in enumerate(zip(steps, modules)):
        x = sx + i*(bw+3*mm)
        # Box
        color = GREEN if step == 'LAUDO' else P2
        c.setFillColor(color)
        c.roundRect(x, y-10*mm, bw, 10*mm, 3, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 6.5)
        c.drawCentredString(x+bw/2, y-5*mm, step)
        # Module
        c.setFillColor(GRAY)
        c.setFont('Helvetica', 5.5)
        c.drawCentredString(x+bw/2, y-14*mm, mod)
        # Arrow
        if i < len(steps)-1:
            c.setStrokeColor(P1)
            c.setLineWidth(1)
            draw_arrow(c, x+bw, y-5*mm, x+bw+3*mm, y-5*mm, P1)

    # Secao 2: Fontes de dados -> CFG
    y2 = H-80*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y2, '2. FONTES DE DADOS -> CFG (objeto ponte)')

    # Caixa _fbProfile
    draw_box(c, 15*mm, y2-55*mm, 45*mm, 45*mm, '_fbProfile (Firestore)', [
        '.nome', '.crm', '.ufCrm', '.especialidade', '.sigB64'
    ], P2, LIGHT)

    # Caixa _fbWorkspace
    draw_box(c, 65*mm, y2-55*mm, 45*mm, 45*mm, '_fbWorkspace (Firestore)', [
        '.nomeClinica', '.corPrimaria', '.slogan', '.logoUrl'
    ], P2, LIGHT)

    # Caixa getClinicas()
    draw_box(c, 115*mm, y2-55*mm, 45*mm, 45*mm, 'getClinicas() (local)', [
        '.nome', '.end', '.tel', '.tel2',
        '.logoB64', '.p1, .p2', '.slogan'
    ], P2, LIGHT)

    # Setas para CFG
    draw_arrow(c, 37*mm, y2-55*mm, 80*mm, y2-65*mm, P1)
    draw_arrow(c, 87*mm, y2-55*mm, 90*mm, y2-65*mm, P1)
    draw_arrow(c, 137*mm, y2-55*mm, 100*mm, y2-65*mm, P1)

    # Caixa CFG central
    draw_box(c, 50*mm, y2-100*mm, 100*mm, 30*mm, 'CFG (objeto ponte)', [
        'CABECALHO: .clinica, .slogan, .logoB64, .p1',
        'RODAPE LOCAL: .localEnd, .localTel',
        'ASSINATURA: .medNome, .medCrm, .medUf, .sigTexto',
    ], P1, HexColor('#FFF5F5'))

    # Secao 3: Titulo do exame
    y3 = H-195*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y3, '3. TITULO DO EXAME (dinamico)')

    draw_box(c, 15*mm, y3-35*mm, 80*mm, 28*mm, 'TIPOS_EXAME (08-laudo.js)', [
        "eco_tt -> 'Ecocardiograma Transtoracico'",
        "doppler_carotidas -> 'Doppler de Carotidas'",
        "eco_te -> 'Ecocardiograma Transesofagico'",
        "eco_stress -> 'Ecocardiograma de Estresse'",
    ], P2, LIGHT)

    draw_arrow(c, 95*mm, y3-20*mm, 120*mm, y3-20*mm, P1)

    draw_box(c, 120*mm, y3-30*mm, 60*mm, 18*mm, '#laudo-titulo-exame', [
        'Texto muda conforme tipo',
        'selecionado na worklist'
    ], GREEN, HexColor('#F0FFF4'))

    # Rodape pagina
    c.setFillColor(GRAY)
    c.setFont('Helvetica', 7)
    c.drawCentredString(W/2, 8*mm, 'LEO - Sistema de Laudos Medicos | Dr. Sergio Abdon | Pagina 1/4')

def page2(c):
    """Pagina 2: Motor + Navegacao"""
    c.setFillColor(P2)
    c.rect(0, H-18*mm, W, 18*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(W/2, H-13*mm, 'Motor V8 MP4 (NAO MODIFICAR) + Navegacao')

    # Motor box
    y = H-30*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y, '4. MOTOR -> SAIDA (calc -> A4 preview)')

    draw_box(c, 15*mm, y-70*mm, 85*mm, 62*mm, 'motorv8mp4.js (1.523 linhas - NAO TOCAR)', [
        'calc() -> calcAll() -> renderizarLaudo(d)',
        '',
        'LE DO DOM:               ESCREVE NO DOM:',
        '#b7..#b62                #out-nome, #out-idade',
        '#nome, #sexo, #ritmo    #out-dtnasc, #out-convenio',
        '#peso, #altura          #params-tbody',
        '#gls_ve, #gls_vd, #lars #achados-body',
        '#b54 (Simpson)           #conclusao-list',
        '#wilkins-toggle          #calc-imc, #calc-asc...',
        '',
        'registrarMotor("eco_tt", {',
        '  calcular, gerarAchados, gerarConclusao,',
        '  renderizar, calc, importarDICOM,',
        '  setDiastModo, setDiastManual })',
    ], P1, HexColor('#FFF5F5'))

    # Navegacao
    draw_box(c, 110*mm, y-70*mm, 80*mm, 62*mm, 'NAVEGACAO (06-dashboard + 11-laudo-ui)', [
        'ABRIR LAUDO:',
        '1. dashAbrirLaudo(itemId)',
        '2. Esconde #tela-clinica',
        '3. Mostra #tela-laudo',
        '4. popularCFG() <- Firestore',
        '5. preencherPaciente(pac)',
        '6. restaurarMedidas(exame)',
        '7. calc()',
        '',
        'VOLTAR:',
        '1. voltarWorklist()',
        '2. Salva snapshot -> Firestore',
        '3. Esconde laudo, mostra dashboard',
    ], P2, LIGHT)

    # Secao 5: Paciente -> Sidebar
    y5 = H-115*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y5, '5. PACIENTE (Worklist -> Sidebar do Motor)')

    draw_box(c, 15*mm, y5-50*mm, 75*mm, 42*mm, 'Worklist Item (07-worklist.js)', [
        '.pacNome ---------> #nome',
        '.pacDtnasc -------> #dtnasc',
        '.dataExame -------> #dtexame',
        '.convenio --------> #convenio',
        '.solicitante -----> #solicitante',
        '.sexo ------------> #sexo',
        '',
        'Se rascunho/andamento:',
        'exame.medidas.b7 -> #b7',
        'exame.medidas.b8 -> #b8',
        '...todos campos... -> #b9..#b62',
    ], P2, LIGHT)

    draw_arrow(c, 90*mm, y5-25*mm, 110*mm, y5-25*mm, P1)

    draw_box(c, 110*mm, y5-50*mm, 80*mm, 42*mm, 'SIDEBAR (DOM inputs)', [
        '#nome, #dtnasc, #dtexame',
        '#convenio, #solicitante, #sexo',
        '#peso, #altura, #ritmo',
        '#b7..#b13 (camaras)',
        '#b19..#b23 (diastolica)',
        '#b34..#b42 (valvulas)',
        '#b54, #b32, #b33 (sistolica)',
        '#b55..#b62 (segmentar)',
        '#gls_ve, #gls_vd, #lars (strain)',
        '',
        'Tudo com oninput="calc()"',
    ], GREEN, HexColor('#F0FFF4'))

    # Rodape
    c.setFillColor(GRAY)
    c.setFont('Helvetica', 7)
    c.drawCentredString(W/2, 8*mm, 'LEO - Sistema de Laudos Medicos | Dr. Sergio Abdon | Pagina 2/4')

def page3(c):
    """Pagina 3: Salvar/Emitir + Firestore"""
    c.setFillColor(P2)
    c.rect(0, H-18*mm, W, 18*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(W/2, H-13*mm, 'Salvar / Emitir + Documento Firestore')

    y = H-30*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y, '6. SALVAR / EMITIR (Motor -> Firestore)')

    # 11-laudo-ui
    draw_box(c, 15*mm, y-75*mm, 55*mm, 67*mm, '11-laudo-ui.js', [
        'salvarRascunho()',
        '  coleta DOM -> objeto',
        '  fsSalvarExame()',
        '  status: rascunho',
        '',
        'emitirLaudo()',
        '  coleta DOM + cfgSnapshot',
        '  checkEmissao() <- cota?',
        '  fsEmitirExame()',
        '  consumirEmissao()',
        '  trava sidebar (.locked)',
        '  mostra modo-emitido',
        '  gerarPDFEmitido()',
        '',
        'desbloquearEdicao()',
        '  destrava sidebar',
        '  status -> rascunho',
    ], P2, LIGHT)

    # Firestore
    draw_box(c, 80*mm, y-50*mm, 50*mm, 42*mm, '03-firestore.js', [
        'fsSalvarExame(wsId, dados)',
        '  cria/atualiza doc',
        '',
        'fsEmitirExame(wsId, id, dados)',
        '  status: emitido',
        '  emitidoEm: now',
        '  consumirEmissao()',
        '  fsLog("emissao")',
        '',
        'fsGetExame(wsId, id) NOVO',
    ], P1, HexColor('#FFF5F5'))

    # Billing
    draw_box(c, 140*mm, y-40*mm, 50*mm, 32*mm, '04-billing.js', [
        'checkEmissao(wsId)',
        '  franquia disponivel?',
        '  plano ativo?',
        '',
        'consumirEmissao(wsId)',
        '  franquiaUsada++',
        '  ou creditosExtras--',
    ], ORANGE, HexColor('#FFFBEB'))

    # Setas
    draw_arrow(c, 70*mm, y-35*mm, 80*mm, y-30*mm, P1)
    draw_arrow(c, 130*mm, y-30*mm, 140*mm, y-25*mm, ORANGE)

    # Documento Firestore
    y6 = H-120*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y6, '7. DOCUMENTO FIRESTORE: workspaces/{wsId}/exames/{exameId}')

    draw_box(c, 15*mm, y6-95*mm, 175*mm, 88*mm, 'Estrutura do Documento', [
        'IDENTIFICACAO',
        '  pacienteId, pacienteNome, pacienteDtnasc, medicoUid',
        '  tipoExame: "eco_tt", dataExame, horarioChegada',
        '  status: rascunho | andamento | emitido,  versao: number',
        '',
        'INPUTS (source of truth) - permite reconstruir laudo completo',
        '  medidas: { nome, sexo, ritmo, peso, altura, b7..b62, gls_ve, gls_vd, lars,',
        '             _diastModo, _diastManualSelecao }',
        '',
        'OUTPUTS (cache para exibicao rapida sem motor)',
        '  achados: [{tipo:"texto", txt:string}]',
        '  conclusoes: [string]',
        '  paramsTbody: string (HTML)',
        '',
        'BRANDING (congelado na emissao - nao muda se clinica mudar depois)',
        '  cfgSnapshot: { clinica, slogan, localEnd, localTel, medNome, medCrm, medUf, p1, p2 }',
        '',
        'TIMESTAMPS',
        '  criadoEm, atualizadoEm, emitidoEm (null ate emitir)',
    ], P2, LIGHT)

    # Rodape
    c.setFillColor(GRAY)
    c.setFont('Helvetica', 7)
    c.drawCentredString(W/2, 8*mm, 'LEO - Sistema de Laudos Medicos | Dr. Sergio Abdon | Pagina 3/4')

def page4(c):
    """Pagina 4: Arquivo novo + Scripts + Telas"""
    c.setFillColor(P2)
    c.rect(0, H-18*mm, W, 18*mm, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 14)
    c.drawCentredString(W/2, H-13*mm, 'Arquivo Novo + Ordem de Scripts + Telas')

    y = H-30*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y, '8. ARQUIVO NOVO: 11-laudo-ui.js (~300 linhas)')

    draw_box(c, 15*mm, y-80*mm, 80*mm, 72*mm, '11-laudo-ui.js (funcoes)', [
        'NAVEGACAO',
        '  abrirTelaLaudo(itemId, tipoExame)',
        '  voltarWorklist()',
        '  popularCFG()',
        '  preencherPaciente(pac)',
        '  restaurarMedidas(exame)',
        '',
        'COLETA / RESTAURACAO',
        '  coletarDadosExame() -> Firestore',
        '  restaurarDadosExame(exame) -> DOM',
        '',
        'SALVAR / EMITIR',
        '  abrirSalvarEmitir() / fecharSalvarEmitir()',
        '  salvarRascunho() / emitirLaudo()',
        '  desbloquearEdicao() / finalizarAtendimento()',
        '',
        'IMPRESSAO',
        '  imprimirLaudo() / _montarHTMLImpressao()',
        '  copiarFormatado() / copiarTextoSimples()',
        '  baixarDocx()',
        '',
        'HELPERS',
        '  sincronizarLAVI() / trocarDiastModo()',
        '  selDiastManual() / limpar()',
    ], GREEN, HexColor('#F0FFF4'))

    # Ordem scripts
    draw_box(c, 110*mm, y-80*mm, 80*mm, 72*mm, 'ORDEM DE CARREGAMENTO', [
        '01-firebase-config.js  <- Firebase',
        '02-utils.js            <- Helpers',
        '03-firestore.js        <- CRUD',
        '04-billing.js          <- Franquia',
        '05-auth.js             <- Login',
        '06-dashboard.js        <- Dashboard',
        '07-worklist.js         <- Worklist',
        '08-laudo.js            <- registrarMotor  NOVO',
        'motorv8mp4.js          <- Motor (auto-reg) NOVO',
        'adaptador-motor.js     <- DICOM adapter    NOVO',
        '09-config.js           <- CFG, branding',
        '10-export.js           <- Export',
        '11-laudo-ui.js         <- Navegacao/UI     NOVO',
    ], P2, LIGHT)

    # Telas
    y9 = H-125*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y9, '9. TELAS (visibilidade - so 1 por vez)')

    telas = [
        ('#login-overlay', 'Login/Cadastro', P2),
        ('#ctx-overlay', 'Selecao Workspace', P2),
        ('#tela-clinica', 'Dashboard + Worklist', P2),
        ('#tela-laudo', 'LAUDO (NOVO)', GREEN),
    ]
    for i, (tid, desc, color) in enumerate(telas):
        x = 15*mm + i*46*mm
        c.setFillColor(color)
        c.roundRect(x, y9-25*mm, 42*mm, 18*mm, 4, fill=1, stroke=0)
        c.setFillColor(white)
        c.setFont('Helvetica-Bold', 7)
        c.drawCentredString(x+21*mm, y9-15*mm, tid)
        c.setFont('Helvetica', 6)
        c.drawCentredString(x+21*mm, y9-21*mm, desc)

    # Regra
    c.setFillColor(GRAY)
    c.setFont('Helvetica-Oblique', 8)
    c.drawString(15*mm, y9-32*mm, 'Regra: so 1 tela visivel por vez. Transicao via display:none / display:block')

    # Riscos
    y10 = y9 - 45*mm
    c.setFillColor(P1)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(15*mm, y10, '10. RISCOS E MITIGACOES')

    riscos = [
        ('Colisao IDs DOM', 'Motor usa b7-b62, dashboard usa pac-nome, dash-*'),
        ('Colisao funcoes', 'calc(), tog(), T() globais do motor - sem conflito'),
        ('CFG duplicado', 'Nao declarar no v7f - popular do Firestore'),
        ('Doc Firestore >1MB', 'Nao salvar sigB64/logoB64 no cfgSnapshot'),
        ('Motor modificado', 'NUNCA - usar 11-laudo-ui.js para extensoes'),
    ]
    c.setFont('Helvetica', 7)
    ty = y10 - 10*mm
    for risco, mitiga in riscos:
        c.setFillColor(P1)
        c.setFont('Helvetica-Bold', 7)
        c.drawString(15*mm, ty, risco)
        c.setFillColor(GRAY)
        c.setFont('Helvetica', 7)
        c.drawString(60*mm, ty, mitiga)
        ty -= 8*mm

    # Rodape
    c.setFillColor(GRAY)
    c.setFont('Helvetica', 7)
    c.drawCentredString(W/2, 8*mm, 'LEO - Sistema de Laudos Medicos | Dr. Sergio Abdon | Pagina 4/4')

# Gerar PDF
output = 'C:/Users/sergi/Desktop/LEO/LEO_Mapa_Mental_Acoplamento.pdf'
c = canvas.Canvas(output, pagesize=A4)

page1(c)
c.showPage()
page2(c)
c.showPage()
page3(c)
c.showPage()
page4(c)
c.showPage()
c.save()

print(f'PDF gerado: {output}')
