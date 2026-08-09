# -*- coding: utf-8 -*-
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.pdfgen import canvas

W, H = A4
P1 = HexColor('#8B1A1A')
P2 = HexColor('#1E3A5F')
GRAY = HexColor('#666666')
GREEN = HexColor('#059669')
ORANGE = HexColor('#D97706')
BLUE = HexColor('#2563EB')

def draw_etapa(c, y, num, titulo, prazo, items, color):
    c.setFillColor(color)
    c.roundRect(15*mm, y, W-30*mm, 14, 4, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(20*mm, y+3, 'ETAPA ' + num + ' - ' + titulo)
    c.setFont('Helvetica', 8)
    c.drawRightString(W-20*mm, y+3, prazo)
    ty = y - 8*mm
    for item in items:
        if item == '':
            ty -= 2*mm
            continue
        if item.startswith('BACKUP'):
            c.setFillColor(ORANGE)
            c.setFont('Helvetica-Bold', 6.5)
        elif item.startswith('STATUS'):
            c.setFillColor(GREEN)
            c.setFont('Helvetica-Bold', 6.5)
        else:
            c.setFillColor(black)
            c.setFont('Helvetica', 7)
        c.drawString(20*mm, ty, item)
        ty -= 7*mm
    return ty

output = 'C:/Users/sergi/OneDrive/souleo/LEO_CRONOGRAMA_PROJETO.pdf'
c = canvas.Canvas(output, pagesize=A4)

# ══ PAGINA 1 ══
c.setFillColor(P2)
c.rect(0, H-35*mm, W, 35*mm, fill=1, stroke=0)
c.setFillColor(white)
c.setFont('Helvetica-Bold', 22)
c.drawCentredString(W/2, H-18*mm, 'SOULEO - Cronograma do Projeto')
c.setFont('Helvetica', 11)
c.drawCentredString(W/2, H-27*mm, 'Next.js + TypeScript + Tailwind + Firebase | 09/04/2026')

y = H-50*mm
c.setFillColor(GREEN)
c.roundRect(15*mm, y-14*mm, W-30*mm, 14*mm, 4, fill=1, stroke=0)
c.setFillColor(white)
c.setFont('Helvetica-Bold', 9)
c.drawCentredString(W/2, y-7*mm, 'BACKUPS OK: V9.1 em Desktop/LEO/v7/ | Motor _separado | Projeto Next em OneDrive/souleo/')

y -= 24*mm
y = draw_etapa(c, y, '1', 'INFRAESTRUTURA', 'Dia 1 (manha)', [
    'Configurar Firebase no Next.js (projeto: leo-sistema-laudos)',
    'Criar lib/firebase.ts, lib/firestore.ts, lib/billing.ts',
    'CRUD: profissionais, workspaces, vinculos, subscriptions, exames',
    'Tudo no Firestore - ZERO localStorage',
    '',
    'BACKUP: js/01-firebase-config.js, js/03-firestore.js, js/04-billing.js',
    'STATUS: Credenciais Firebase existem no V7',
], P2)

y -= 5*mm
y = draw_etapa(c, y, '2', 'LOGIN / CADASTRO', 'Dia 1 (tarde)', [
    'app/login/page.tsx - login com email/senha',
    'app/cadastro/page.tsx - cadastro PF e PJ',
    'Completar perfil (CPF, CRM, especialidade)',
    'Selecao de contexto, aceitar/recusar convites',
    '',
    'BACKUP: js/05-auth.js (onboardingPF, onboardingPJ)',
    'STATUS: Logica completa no V7, migrar para React',
], P2)

y -= 5*mm
y = draw_etapa(c, y, '3', 'PERFIL + LOCAL DE TRABALHO', 'Dia 2 (manha)', [
    'components/PerfilModal.tsx - nome, CRM, assinatura',
    'components/LocalModal.tsx - endereco, telefone, logo, cores',
    'Salvar DIRETO no Firestore (sem localStorage)',
    'Upload logo/assinatura para Firebase Storage',
    '',
    'BACKUP: v7f.html (salvarPerfil, salvarLocal)',
    'STATUS: Layout aprovado, Firestore corrigido V9.1',
], P2)

c.setFillColor(GRAY)
c.setFont('Helvetica', 7)
c.drawCentredString(W/2, 8*mm, 'SOULEO - Dr. Sergio Abdon | Pagina 1/4')
c.showPage()

# ══ PAGINA 2 ══
c.setFillColor(P2)
c.rect(0, H-20*mm, W, 20*mm, fill=1, stroke=0)
c.setFillColor(white)
c.setFont('Helvetica-Bold', 14)
c.drawCentredString(W/2, H-14*mm, 'Etapas 4-6: Dashboard, Motor e Emissao')

y = H-32*mm
y = draw_etapa(c, y, '4', 'DASHBOARD + WORKLIST', 'Dia 2 (tarde)', [
    'app/dashboard/page.tsx - tela principal',
    'Topbar: nome, CRM, seletor local, sair',
    'Sidebar: avatar, locais, assistentes',
    'Billing: plano, franquia, creditos, emitidos hoje',
    'Worklist: pacientes do dia com status',
    'Botoes: +Paciente, Laudar, Continuar, Ver, Imprimir',
    'Historico e Extrato',
    '',
    'BACKUP: js/06-dashboard.js, js/07-worklist.js',
    'STATUS: Layout aprovado no V7',
], P2)

y -= 5*mm
y = draw_etapa(c, y, '5', 'MOTOR DE LAUDO (CORE)', 'Dia 3', [
    'app/laudo/[id]/page.tsx - tela de laudo',
    'components/Sidebar.tsx - formulario medidas',
    'components/SheetA4.tsx - preview folha A4',
    'components/Cabecalho.tsx - 2 linhas (logo+clinica / titulo)',
    'components/Rodape.tsx - local + assinatura + selo LEO',
    'Copiar motorv8mp4.js INTACTO para motor/',
    'Motor le DOM, React renderiza inputs - mesma interface',
    '',
    'BACKUP: motorv8mp4.js (1.523 linhas) - NAO MODIFICAR',
    'STATUS: Motor 100% funcional e aprovado',
], P1)

y -= 5*mm
y = draw_etapa(c, y, '6', 'SALVAR / EMITIR / PDF', 'Dia 4 (manha)', [
    'Popup: Rascunho ou Emitir',
    'Rascunho: salva medidas no Firestore',
    'Emitir: checkEmissao + fsEmitirExame + consumirEmissao',
    'Travar campos, gerar PDF via window.open()',
    'Nome PDF: ECOTT + nome paciente',
    '',
    'BACKUP: js/11-laudo-ui.js (_montarHTMLImpressao)',
    'STATUS: Impressao via janela limpa funcionando V9.1',
], P2)

c.setFillColor(GRAY)
c.setFont('Helvetica', 7)
c.drawCentredString(W/2, 8*mm, 'SOULEO - Dr. Sergio Abdon | Pagina 2/4')
c.showPage()

# ══ PAGINA 3 ══
c.setFillColor(P2)
c.rect(0, H-20*mm, W, 20*mm, fill=1, stroke=0)
c.setFillColor(white)
c.setFont('Helvetica-Bold', 14)
c.drawCentredString(W/2, H-14*mm, 'Etapas 7-10: Integracoes e Futuro')

y = H-32*mm
y = draw_etapa(c, y, '7', 'INTEGRACAO FEEGOW', 'Dia 4 (tarde)', [
    'app/api/feegow/route.ts - API segura (token no servidor)',
    'GET /api/feegow/sala-espera - pacientes aguardando',
    'Mapear procedimento -> tipo exame (9=eco, 8=carotidas)',
    'Importar para worklist automaticamente',
    '',
    'BACKUP: reference_feegow.md (mapeamento completo)',
    'STATUS: API testada, 15 endpoints confirmados',
], BLUE)

y -= 5*mm
y = draw_etapa(c, y, '8', 'RECEPTOR DICOM', 'Dia 5', [
    'motor/adaptador.ts - traducao DICOM SR -> DOM',
    'Importacao arquivo DICOM SR (Vivid T8)',
    'Pasta local/OneDrive monitorada',
    'Cada local recebe imagens separadamente',
    '',
    'BACKUP: adaptador-motor.js (59 campos, 15 DICOM)',
    'STATUS: Adaptador funcional',
], BLUE)

y -= 5*mm
y = draw_etapa(c, y, '9', 'BILLING / PAGAMENTO', 'Dia 6', [
    'Trial: 100 laudos, 30 dias',
    'Pro: franquia configuravel',
    'Creditos extras, bloqueio sem saldo',
    'Stripe ou Pix',
    'Extrato honorarios por clinica/convenio',
    '',
    'BACKUP: js/04-billing.js',
    'STATUS: Logica implementada no V7',
], ORANGE)

y -= 5*mm
y = draw_etapa(c, y, '10', 'DEPLOY + SEGURANCA', 'Dia 7', [
    'Deploy Vercel, dominio souleo.com.br',
    'Ofuscar motorv8mp4.js',
    'Registrar no INPI',
    'Firestore Security Rules',
    '',
    'STATUS: Pronto para deploy',
], GREEN)

c.setFillColor(GRAY)
c.setFont('Helvetica', 7)
c.drawCentredString(W/2, 8*mm, 'SOULEO - Dr. Sergio Abdon | Pagina 3/4')
c.showPage()

# ══ PAGINA 4: Inventario ══
c.setFillColor(P2)
c.rect(0, H-20*mm, W, 20*mm, fill=1, stroke=0)
c.setFillColor(white)
c.setFont('Helvetica-Bold', 14)
c.drawCentredString(W/2, H-14*mm, 'Inventario de Backups + Checklist')

y = H-35*mm
c.setFillColor(P1)
c.setFont('Helvetica-Bold', 11)
c.drawString(15*mm, y, 'INVENTARIO DE BACKUPS')
y -= 8*mm

backups = [
    ('Motor V8 MP4', 'motorv8mp4.js', 'Desktop/LEO/v7/motores/', 'OK'),
    ('Motor V9.1', 'motorv8mp4_v9.1.js', 'Desktop/LEO/v7/motores/', 'OK'),
    ('Motor separado', 'motorv8mp4_separado.js', 'Desktop/LEO/v7/motores/', 'OK'),
    ('Preview separado', 'preview-motor_separado.html', 'Desktop/LEO/v7/motores/', 'OK'),
    ('Adaptador DICOM', 'adaptador-motor_separado.js', 'Desktop/LEO/v7/motores/', 'OK'),
    ('Shell V9.1', 'v7f_v9.1.html', 'Desktop/LEO/v7/', 'OK'),
    ('CSS dashboard V9.1', 'leo_v9.1.css', 'Desktop/LEO/v7/css/', 'OK'),
    ('CSS motor V9.1', 'leo-motor_v9.1.css', 'Desktop/LEO/v7/css/', 'OK'),
    ('Laudo UI V9.1', '11-laudo-ui_v9.1.js', 'Desktop/LEO/v7/js/', 'OK'),
    ('Dashboard V9.1', '06-dashboard_v9.1.js', 'Desktop/LEO/v7/js/', 'OK'),
    ('Auth V9.1', '05-auth_v9.1.js', 'Desktop/LEO/v7/js/', 'OK'),
    ('Firebase config', '01-firebase-config.js', 'Desktop/LEO/v7/js/', 'OK'),
    ('Firestore CRUD', '03-firestore.js', 'Desktop/LEO/v7/js/', 'OK'),
    ('Billing', '04-billing.js', 'Desktop/LEO/v7/js/', 'OK'),
    ('Projeto Next.js', 'souleo/', 'OneDrive/souleo/', 'CRIADO'),
    ('Mapa Mental PDF', 'LEO_Mapa_Mental.pdf', 'Desktop/LEO/', 'OK'),
    ('Memoria projeto', '.claude/memory/', 'Projeto LEO', 'OK'),
]

c.setFont('Helvetica-Bold', 7)
c.setFillColor(P2)
c.drawString(15*mm, y, 'COMPONENTE')
c.drawString(55*mm, y, 'ARQUIVO')
c.drawString(115*mm, y, 'LOCAL')
c.drawString(178*mm, y, 'OK?')
y -= 3*mm
c.line(15*mm, y, W-15*mm, y)
y -= 7*mm

c.setFont('Helvetica', 6.5)
for comp, arq, local, status in backups:
    c.setFillColor(black)
    c.drawString(15*mm, y, comp)
    c.drawString(55*mm, y, arq)
    c.drawString(115*mm, y, local)
    c.setFillColor(GREEN if status == 'OK' else ORANGE)
    c.setFont('Helvetica-Bold', 6.5)
    c.drawString(178*mm, y, status)
    c.setFont('Helvetica', 6.5)
    y -= 7*mm

y -= 5*mm
c.setFillColor(P1)
c.setFont('Helvetica-Bold', 11)
c.drawString(15*mm, y, 'CHECKLIST PRE-REESCRITA')
y -= 10*mm

checks = [
    'Projeto Next.js criado em OneDrive/souleo',
    'Node.js v24 + npm 11 instalados',
    'Firebase SDK instalado no projeto',
    'Motor V8 MP4 com backup _separado',
    'Adaptador DICOM com backup _separado',
    'Shell V9.1 com backup completo',
    'Mapa mental em PDF',
    'Cronograma em PDF',
    'Memoria do projeto atualizada',
    'Credenciais Firebase disponiveis',
    'Layout cabecalho/rodape aprovado (28 pontos)',
    'Modelo Firestore de exames definido',
    'Mapeamento Feegow completo',
    'Mapeamento DICOM completo (59 campos)',
]

c.setFont('Helvetica', 7.5)
for texto in checks:
    c.setFillColor(GREEN)
    c.drawString(15*mm, y, '[X]')
    c.setFillColor(black)
    c.drawString(22*mm, y, texto)
    y -= 7*mm

c.setFillColor(GRAY)
c.setFont('Helvetica', 7)
c.drawCentredString(W/2, 8*mm, 'SOULEO - Dr. Sergio Abdon | Pagina 4/4')
c.showPage()
c.save()
print('Cronograma gerado:', output)
