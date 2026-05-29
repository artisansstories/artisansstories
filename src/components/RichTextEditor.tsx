"use client";

import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

const GOLD = "#8B6914";

interface RichTextEditorProps {
  value?: string;       // HTML string (preferred)
  content?: string;     // alias for value (backward compat)
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

function ToolbarBtn({
  active,
  title,
  onClick,
  children,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        padding: "4px 8px",
        borderRadius: 5,
        border: active ? `1.5px solid ${GOLD}` : "1.5px solid #e0d5c5",
        background: active ? "rgba(139,105,20,0.1)" : "#fff",
        color: active ? GOLD : "#5a4a38",
        cursor: "pointer",
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        lineHeight: 1,
        minWidth: 28,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({
  value,
  content,
  onChange,
  placeholder = "Start typing...",
  minHeight = 120,
}: RichTextEditorProps) {
  const resolvedValue = value ?? content ?? "";
  const [showMarkdownInput, setShowMarkdownInput] = useState(false);
  const [mdText, setMdText] = useState("");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "rte-link" } }),
      Placeholder.configure({ placeholder }),
    ],
    content: resolvedValue || "",
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  // Sync external value changes (e.g. when form resets)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const normalized = current === "<p></p>" ? "" : current;
    if (resolvedValue !== current && resolvedValue !== normalized) {
      editor.commands.setContent(resolvedValue || "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedValue, editor]);

  async function handlePasteMarkdown() {
    if (!mdText.trim() || !editor) return;
    const { marked } = await import("marked");
    const html = await marked(mdText, { breaks: true });
    editor.commands.setContent(html);
    onChange(html);
    setMdText("");
    setShowMarkdownInput(false);
  }

  if (!editor) return null;

  return (
    <div style={{ border: "1.5px solid #e0d5c5", borderRadius: 8, overflow: "hidden", background: "#fff" }}>
      {/* Toolbar */}
      <div style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 4,
        padding: "8px 10px",
        borderBottom: "1px solid #ede8df",
        background: "#faf7f2",
        alignItems: "center",
      }}>
        <ToolbarBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </ToolbarBtn>
        <ToolbarBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </ToolbarBtn>
        <ToolbarBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolbarBtn>
        <ToolbarBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolbarBtn>
        <div style={{ width: 1, height: 20, background: "#e0d5c5", margin: "0 2px" }} />
        <ToolbarBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          ≡
        </ToolbarBtn>
        <ToolbarBtn title="Ordered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1≡
        </ToolbarBtn>
        <ToolbarBtn title="Blockquote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          "
        </ToolbarBtn>
        <div style={{ width: 1, height: 20, background: "#e0d5c5", margin: "0 2px" }} />
        <ToolbarBtn title="Undo" active={false} onClick={() => editor.chain().focus().undo().run()}>
          ↩
        </ToolbarBtn>
        <ToolbarBtn title="Redo" active={false} onClick={() => editor.chain().focus().redo().run()}>
          ↪
        </ToolbarBtn>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() => setShowMarkdownInput((v) => !v)}
          style={{
            padding: "4px 10px",
            borderRadius: 5,
            border: `1.5px solid ${showMarkdownInput ? GOLD : "#c9b99a"}`,
            background: showMarkdownInput ? "rgba(139,105,20,0.08)" : "#fff",
            color: showMarkdownInput ? GOLD : "#9a876e",
            cursor: "pointer",
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            fontWeight: 500,
          }}
        >
          MD
        </button>
      </div>

      {/* Markdown paste panel */}
      {showMarkdownInput && (
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #ede8df", background: "#fffdf7" }}>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 11, color: "#9a876e", margin: "0 0 6px" }}>
            Paste markdown — click Convert to replace editor content
          </p>
          <textarea
            rows={5}
            value={mdText}
            onChange={(e) => setMdText(e.target.value)}
            placeholder="# Heading&#10;**Bold**, *italic*, - list items..."
            style={{
              width: "100%",
              border: "1px solid #e0d5c5",
              borderRadius: 6,
              padding: "8px 10px",
              fontFamily: "monospace",
              fontSize: 12,
              color: "#3a2e24",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={handlePasteMarkdown}
              style={{
                padding: "6px 14px",
                background: GOLD,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Convert
            </button>
            <button
              type="button"
              onClick={() => { setShowMarkdownInput(false); setMdText(""); }}
              style={{
                padding: "6px 14px",
                background: "#fff",
                color: "#9a876e",
                border: "1px solid #e0d5c5",
                borderRadius: 6,
                fontFamily: "'Inter', sans-serif",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Editor area */}
      <style>{`
        .rte-content { padding: 12px 14px; min-height: ${minHeight}px; outline: none; font-family: 'Inter', sans-serif; font-size: 14px; color: #3a2e24; line-height: 1.7; }
        .rte-content p { margin: 0 0 0.75em; }
        .rte-content p:last-child { margin-bottom: 0; }
        .rte-content h2 { font-family: 'Cormorant Garamond', serif; font-size: 1.3em; font-weight: 600; color: #2a1f14; margin: 0.8em 0 0.4em; }
        .rte-content h3 { font-family: 'Cormorant Garamond', serif; font-size: 1.1em; font-weight: 600; color: #2a1f14; margin: 0.7em 0 0.3em; }
        .rte-content ul, .rte-content ol { padding-left: 1.4em; margin: 0.5em 0; }
        .rte-content li { margin-bottom: 0.25em; }
        .rte-content strong { font-weight: 600; color: #2a1f14; }
        .rte-content em { font-style: italic; }
        .rte-content blockquote { border-left: 3px solid ${GOLD}; margin: 0.75em 0; padding: 0.5em 1em; color: #7a6a55; background: rgba(139,105,20,0.04); border-radius: 0 6px 6px 0; }
        .rte-content a.rte-link { color: ${GOLD}; text-decoration: underline; }
        .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #bba98a; pointer-events: none; float: left; height: 0; font-style: italic; }
      `}</style>
      <EditorContent editor={editor} className="rte-content" />
    </div>
  );
}
