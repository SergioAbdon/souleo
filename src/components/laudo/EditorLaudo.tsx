'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Editor Rico — TipTap (v2 — editor único)
// Um único editor para achados + conclusões
// Toolbar única, undo/redo nativo, banco de frases
// Motor gera HTML completo → setContent sem afetar history manual
// ══════════════════════════════════════════════════════════════════

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useImperativeHandle, forwardRef, useRef, useState, useEffect } from 'react';
import { linhasAchados, linhasConclusoes } from '@/lib/laudo-linhas';

// ── Toolbar ──
function Toolbar({ editor, onAddFrase, editable }: { editor: Editor | null; onAddFrase?: () => void; editable: boolean }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const handler = () => forceUpdate(n => n + 1);
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor]);

  if (!editor) return null;
  // S5-T6: os botões chamam `editor.chain()...run()` — dispatch PROGRAMÁTICO,
  // que `editable:false` do ProseMirror NÃO intercepta (só bloqueia digitação/
  // gesto nativo do usuário no DOM). Sem isto, Negrito/Lista/Desfazer/Banco de
  // Frases reescreveriam um laudo assinado mesmo com o editor "read-only" —
  // mesmo furo que os botões do Wilkins/diastólica tinham na sidebar (T4).
  // Esconder a barra inteira segue o mesmo padrão de `#modo-edicao` (CSS
  // .laudo-locked em page.tsx): a UI de edição some, não fica cinza clicável.
  if (!editable) return null;

  const btn = (active: boolean) =>
    `px-1.5 py-0.5 rounded text-[11px] cursor-pointer transition ${active ? 'bg-[#1E3A5F] text-white' : 'text-gray-500 hover:bg-gray-100'}`;
  const dis = (can: boolean) =>
    `${btn(false)} ${!can ? 'opacity-30 cursor-default' : ''}`;

  return (
    <div className="flex items-center gap-0.5 flex-wrap bg-white border border-gray-200 rounded-lg px-2 py-1 mb-1 shadow-md sticky top-0 z-20">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Negrito (Ctrl+B)"><strong>B</strong></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Itálico (Ctrl+I)"><em>I</em></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))} title="Sublinhado (Ctrl+U)"><u>U</u></button>
      <span className="w-px h-4 bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Lista">&#8226;</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Lista numerada">1.</button>
      <span className="w-px h-4 bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={dis(editor.can().undo())} title="Desfazer (Ctrl+Z)">↩</button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={dis(editor.can().redo())} title="Refazer (Ctrl+Y)">↪</button>
      {onAddFrase && (
        <>
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <button type="button" onClick={onAddFrase} className="px-2 py-0.5 rounded text-[11px] cursor-pointer transition text-[#2563EB] hover:bg-blue-50 font-semibold" title="Banco de frases">＋ Banco de Frases</button>
        </>
      )}
    </div>
  );
}

// ── Ref exposto ──
export type EditorLaudoRef = {
  getHTML: () => string;
  getAchadosHTML: () => string;
  getConclusoesHTML: () => string;
  getAchadosLines: () => string[];
  getConclusoesLines: () => string[];
  setContent: (html: string) => void;
  insertLine: (text: string) => void;
};

type Props = {
  placeholder?: string;
  onAddFrase?: () => void;
  // Dirty flag (S5-T1): chamado a cada mudança REAL do médico (digitar,
  // formatar, inserir frase) — NÃO quando o motor reescreve o documento
  // via `setContent` (gate `settingContent` abaixo, `emitUpdate:false`
  // também evitaria o disparo). Task 2 reusa este mesmo mecanismo.
  onDirty?: () => void;
  /**
   * S5-T6: trava única do emitido — texto do laudo assinado também não
   * edita mais (antes só o CSS/disabled da sidebar travavam; o editor
   * ficava de fora). `editor.commands.setContent` (usado pra restaurar o
   * HTML salvo e pro Senna90 recalcular) NÃO passa pelo `editable` do
   * ProseMirror — esse prop só bloqueia entrada do USUÁRIO (digitação,
   * teclado, DOM); dispatch programático continua funcionando com
   * `editable:false`. Confirmado em @tiptap/core/commands/setContent.ts
   * e Editor.ts (Editable extension só liga o `editable` do EditorView).
   * @default true
   */
  editable?: boolean;
};

const EditorLaudo = forwardRef<EditorLaudoRef, Props>(({ placeholder, onAddFrase, onDirty, editable = true }, ref) => {
  const settingContent = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      Underline,
      Placeholder.configure({ placeholder: placeholder || 'Digite aqui...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'outline-none',
        style: "font-size:8.5pt;font-family:'IBM Plex Sans',sans-serif;line-height:1.6;min-height:120px;",
      },
    },
    onUpdate: () => {
      if (!settingContent.current) onDirty?.();
    },
  });

  useEffect(() => {
    // S5-T6 fix (review Important 1): `setEditable(editable, true)` (default)
    // emite 'update' → dispara `onDirty` mesmo sem o médico ter tocado em
    // nada (laudo aberto e nunca editado virava dirty sozinho ao montar,
    // armando autosave 'andamento'+medicoUid e o aviso de saída). `false`
    // aqui é silencioso — sem side-effect, só troca `options.editable`.
    editor?.setEditable(editable, false);
  }, [editor, editable]);

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() || '',

    // Separar achados e conclusões do HTML unificado
    getAchadosHTML: () => {
      if (!editor) return '';
      const div = document.createElement('div');
      div.innerHTML = editor.getHTML();
      // Tudo antes do <h3> de conclusão
      const h3 = div.querySelector('h3');
      if (!h3) return div.innerHTML;
      let html = '';
      let node = div.firstChild;
      while (node && node !== h3) {
        if (node instanceof HTMLElement) html += node.outerHTML;
        else if (node.textContent?.trim()) html += node.textContent;
        node = node.nextSibling;
      }
      return html;
    },

    getConclusoesHTML: () => {
      if (!editor) return '';
      const div = document.createElement('div');
      div.innerHTML = editor.getHTML();
      const h3 = div.querySelector('h3');
      if (!h3) return '';
      let html = '';
      let node = h3.nextSibling;
      while (node) {
        if (node instanceof HTMLElement) html += node.outerHTML;
        else if (node.textContent?.trim()) html += node.textContent;
        node = node.nextSibling;
      }
      return html;
    },

    // Extração PURA (laudo-linhas.ts, testada em tests/unit): o walker de
    // primeiro nível que havia aqui não enxergava lista com marcadores /
    // numerada da toolbar nem conclusão digitada depois do <ol> — e o que
    // o merge não lê, a regeneração do motor apaga (S5-T2 fix, Imp-5).
    getAchadosLines: () => (editor ? linhasAchados(editor.getHTML()) : []),
    getConclusoesLines: () => (editor ? linhasConclusoes(editor.getHTML()) : []),

    setContent: (html: string) => {
      if (!editor || editor.isDestroyed) return;
      if (editor.getHTML() === html) return;
      settingContent.current = true;
      editor.commands.setContent(html, { emitUpdate: false });
      settingContent.current = false;
    },

    insertLine: (text: string) => {
      if (!editor || editor.isDestroyed) return;
      editor.chain().focus().insertContent(`<p>${text}</p>`).run();
    },
  }), [editor]);

  return (
    <div>
      <Toolbar editor={editor} onAddFrase={onAddFrase} editable={editable} />
      <EditorContent editor={editor} />
    </div>
  );
});

EditorLaudo.displayName = 'EditorLaudo';
export default EditorLaudo;
