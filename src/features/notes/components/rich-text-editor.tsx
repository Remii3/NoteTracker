import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { NoteContent } from "../model/types";
import { EditorToolbar } from "./editor-toolbar";

const baseExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: "https",
    },
  }),
  TextStyleKit,
  Highlight.configure({ multicolor: true }),
];

const editorExtensions = [
  ...baseExtensions,
  Placeholder.configure({ placeholder: "Zacznij pisać notatkę…" }),
];

type EditorProps = {
  content: NoteContent;
  onChange: (content: NoteContent) => void;
};

export function RichTextEditor({ content, onChange }: EditorProps) {
  const editor = useEditor({
    immediatelyRender: true,
    extensions: editorExtensions,
    content,
    editorProps: {
      attributes: {
        class:
          "tiptap-content min-h-72 px-4 py-3 text-base leading-7 outline-none",
      },
    },
    onUpdate: ({ editor: currentEditor }) => onChange(currentEditor.getJSON()),
  });

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-md border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
      <EditorToolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

export function RichTextViewer({ content }: { content: NoteContent }) {
  const editor = useEditor({
    immediatelyRender: true,
    editable: false,
    extensions: baseExtensions,
    content,
    editorProps: {
      attributes: {
        class: "tiptap-content min-h-40 text-base leading-7 outline-none",
      },
    },
  });

  if (editor?.isEmpty) {
    return (
      <p className="py-10 text-sm text-muted-foreground">
        Ten temat nie ma jeszcze notatki.
      </p>
    );
  }

  return <EditorContent editor={editor} />;
}
