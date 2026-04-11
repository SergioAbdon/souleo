'use client';
// ══════════════════════════════════════════════════════════════════
// SOULEO · Editor Rico — TipTap
// Motor atualiza automaticamente ATÉ o médico editar manualmente
// Após edição manual, motor para de sobrescrever
// Undo/redo 100% nativo do TipTap
// ══════════════════════════════════════════════════════════════════

import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Placeholder from '@tiptap/extension-placeholder';
import { useImperativeHandle, forwardRef, useRef } from 'react';

function Toolbar({ editor, onAddFrase }: { editor: Editor | null; onAddFrase?: () => void }) {
  if (!editor) return null;
  const btn = (active: boolean) =>
    `px-1.5 py-0.5 rounded text-[11px] cursor-pointer transition ${active ? 'bg-[#1E3A5F] text-white' : 'text-gray-500 hover:bg-gray-100'}`;
  const dis = (can: boolean) =>
    `${btn(false)} ${!can ? 'opacity-30 cursor-default' : ''}`;

  return (
    <div className="flex items-center gap-0.5 flex-wrap border-b border-gray-200 pb-1 mb-1">
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))} title="Negrito"><strong>B</strong></button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))} title="Itálico"><em>I</em></button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive('underline'))} title="Sublinhado"><u>U</u></button>
      <span className="w-px h-4 bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))} title="Lista">&#8226; Lista</button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))} title="Lista numerada">1. Lista</button>
      <span className="w-px h-4 bg-gray-200 mx-1" />
      <button type="button" onClick={() => editor.chain().focus().undo().run()} className={dis(editor.can().undo())} title="Desfazer (Ctrl+Z)">↩ Desfazer</button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()} className={dis(editor.can().redo())} title="Refazer (Ctrl+Y)">↪ Refazer</button>
      {onAddFrase && (
        <>
          <span className="w-px h-4 bg-gray-200 mx-1" />
          <button type="button" onClick={onAddFrase} className="px-2 py-0.5 rounded text-[11px] cursor-pointer transition text-[#2563EB] hover:bg-blue-50 font-semibold" title="Banco de frases">＋ Adicionar frase</button>
        </>
      )}
    </div>
  );
}

export type EditorLaudoRef = {
  getHTML: () => string;
  getText: () => string;
  getLines: () => string[];
  setContent: (html: string) => void;
  forceContent: (html: string) => void;
  insertLine: (text: string) => void;
  isUserEdited: () => boolean;
  resetUserEdited: () => void;
};

type Props = {
  placeholder?: string;
  onAddFrase?: () => void;
  minHeight?: string;
};

const EditorLaudo = forwardRef<EditorLaudoRef, Props>(({ placeholder, onAddFrase, minHeight = '50px' }, ref) => {
  const userEdited = useRef(false);
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
        style: `font-size:8.5pt;font-family:'IBM Plex Sans',sans-serif;line-height:1.6;min-height:${minHeight};`,
      },
    },
    onUpdate: () => {
      // Se o update foi causado por setContent programático, ignorar
      if (settingContent.current) return;
      // Médico editou manualmente — motor para de sobrescrever
      userEdited.current = true;
    },
  });

  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() || '',
    getText: () => editor?.getText() || '',
    getLines: () => {
      if (!editor) return [];
      const div = document.createElement('div');
      div.innerHTML = editor.getHTML();
      const lines: string[] = [];
      div.querySelectorAll('p, li').forEach(el => {
        const text = el.textContent?.trim();
        if (text) lines.push(el.innerHTML);
      });
      return lines;
    },
    // setContent: SEMPRE atualiza (motor controla, médico edita depois)
    setContent: (html: string) => {
      if (!editor || editor.isDestroyed) return;
      settingContent.current = true;
      editor.commands.setContent(html);
      settingContent.current = false;
    },
    // forceContent: atualiza SEMPRE (para preencher exame salvo)
    forceContent: (html: string) => {
      if (!editor || editor.isDestroyed) return;
      settingContent.current = true;
      editor.commands.setContent(html);
      settingContent.current = false;
    },
    insertLine: (text: string) => {
      if (!editor || editor.isDestroyed) return;
      userEdited.current = true;
      // Inserir na posição do cursor, ou no final se não tem foco
      editor.chain().focus().insertContent(`<p>${text}</p>`).run();
    },
    isUserEdited: () => userEdited.current,
    resetUserEdited: () => { userEdited.current = false; },
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
