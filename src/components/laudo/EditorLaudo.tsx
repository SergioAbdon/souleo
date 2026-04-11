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

// ── Toolbar ──
function Toolbar({ editor, onAddFrase }: { editor: Editor | null; onAddFrase?: () => void }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    const handler = () => forceUpdate(n => n + 1);
    editor.on('transaction', handler);
    return () => { editor.off('transaction', handler); };
  }, [editor]);

  if (!editor) return null;

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
  getText: () => string;
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
};

const EditorLaudo = forwardRef<EditorLaudoRef, Props>(({ placeholder, onAddFrase }, ref) => {
  const settingContent = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
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
  });

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() || '',
    getText: () => editor?.getText() || '',

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

    getAchadosLines: () => {
      if (!editor) return [];
      const div = document.createElement('div');
      div.innerHTML = editor.getHTML();
      const lines: string[] = [];
      const h3 = div.querySelector('h3');
      let node = div.firstChild;
      while (node) {
        if (node === h3) break;
        if (node instanceof HTMLElement && (node.tagName === 'P' || node.tagName === 'LI')) {
          const text = node.textContent?.trim();
          if (text) lines.push(text);
        }
        node = node.nextSibling;
      }
      return lines;
    },

    getConclusoesLines: () => {
      if (!editor) return [];
      const div = document.createElement('div');
      div.innerHTML = editor.getHTML();
      const lines: string[] = [];
      const h3 = div.querySelector('h3');
      if (!h3) return [];
      const ol = h3.nextElementSibling;
      if (ol) {
        ol.querySelectorAll('li').forEach(li => {
          const text = li.textContent?.trim();
          if (text) lines.push(text);
        });
      }
      return lines;
    },

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
      <Toolbar editor={editor} onAddFrase={onAddFrase} />
      <EditorContent editor={editor} />
    </div>
  );
});

EditorLaudo.displayName = 'EditorLaudo';
export default EditorLaudo;
