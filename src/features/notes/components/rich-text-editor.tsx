import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { TableKit } from "@tiptap/extension-table";
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
  TableKit.configure({
    table: {
      resizable: true,
      lastColumnResizable: false,
      renderWrapper: true,
    },
  }),
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
      handleDOMEvents: {
        keydown: (_view, event) => {
          event.stopPropagation();
          return false;
        },
      },
      attributes: {
        class:
          "tiptap-content max-h-[60vh] overflow-y-auto prose prose-neutral min-h-72 max-w-none px-4 py-3 outline-none prose-p:leading-6 prose-li:leading-6 dark:prose-invert",
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
        class:
          "tiptap-content prose prose-neutral min-h-40 max-w-none outline-none prose-p:leading-6 prose-li:leading-6 dark:prose-invert",
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
