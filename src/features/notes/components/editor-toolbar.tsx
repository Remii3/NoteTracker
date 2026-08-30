import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  Heading2,
  Heading3,
  Italic,
  Link,
  List,
  ListOrdered,
  Palette,
  Pilcrow,
  Quote,
  Redo2,
  Rows3,
  Strikethrough,
  Table2,
  TableColumnsSplit,
  TableRowsSplit,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export function EditorToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      bold: currentEditor.isActive("bold"),
      italic: currentEditor.isActive("italic"),
      underline: currentEditor.isActive("underline"),
      strike: currentEditor.isActive("strike"),
      paragraph: currentEditor.isActive("paragraph"),
      heading2: currentEditor.isActive("heading", { level: 2 }),
      heading3: currentEditor.isActive("heading", { level: 3 }),
      bulletList: currentEditor.isActive("bulletList"),
      orderedList: currentEditor.isActive("orderedList"),
      blockquote: currentEditor.isActive("blockquote"),
      code: currentEditor.isActive("code"),
      link: currentEditor.isActive("link"),
      highlight: currentEditor.isActive("highlight"),
      alignLeft:
        currentEditor.isActive({ textAlign: "left" }) ||
        (!currentEditor.getAttributes("paragraph").textAlign &&
          !currentEditor.getAttributes("heading").textAlign),
      alignCenter: currentEditor.isActive({ textAlign: "center" }),
      alignRight: currentEditor.isActive({ textAlign: "right" }),
      alignJustify: currentEditor.isActive({ textAlign: "justify" }),
      table: currentEditor.isActive("table"),
      canUndo: currentEditor.can().chain().focus().undo().run(),
      canRedo: currentEditor.can().chain().focus().redo().run(),
    }),
  });

  return (
    <div
      role="toolbar"
      aria-label="Formatowanie notatki"
      className="border-b bg-muted/30 p-2"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden">
        <ToolbarGroup>
          <ToolbarButton
            label="Akapit"
            active={state.paragraph}
            onClick={() => editor.chain().focus().setParagraph().run()}
          >
            <Pilcrow />
          </ToolbarButton>
          <ToolbarButton
            label="Nagłówek 2"
            active={state.heading2}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
          >
            <Heading2 />
          </ToolbarButton>
          <ToolbarButton
            label="Nagłówek 3"
            active={state.heading3}
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
          >
            <Heading3 />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label="Pogrubienie"
            active={state.bold}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold />
          </ToolbarButton>
          <ToolbarButton
            label="Kursywa"
            active={state.italic}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic />
          </ToolbarButton>
          <ToolbarButton
            label="Podkreślenie"
            active={state.underline}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline />
          </ToolbarButton>
          <ToolbarButton
            label="Przekreślenie"
            active={state.strike}
            onClick={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough />
          </ToolbarButton>
          <ToolbarButton
            label="Kod inline"
            active={state.code}
            onClick={() => editor.chain().focus().toggleCode().run()}
          >
            <Code2 />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label="Lista punktowana"
            active={state.bulletList}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List />
          </ToolbarButton>
          <ToolbarButton
            label="Lista numerowana"
            active={state.orderedList}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered />
          </ToolbarButton>
          <ToolbarButton
            label="Cytat"
            active={state.blockquote}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label="Wyrównaj do lewej"
            active={state.alignLeft}
            onClick={() => editor.chain().focus().setTextAlign("left").run()}
          >
            <AlignLeft />
          </ToolbarButton>
          <ToolbarButton
            label="Wyśrodkuj"
            active={state.alignCenter}
            onClick={() => editor.chain().focus().setTextAlign("center").run()}
          >
            <AlignCenter />
          </ToolbarButton>
          <ToolbarButton
            label="Wyrównaj do prawej"
            active={state.alignRight}
            onClick={() => editor.chain().focus().setTextAlign("right").run()}
          >
            <AlignRight />
          </ToolbarButton>
          <ToolbarButton
            label="Wyjustuj"
            active={state.alignJustify}
            onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          >
            <AlignJustify />
          </ToolbarButton>
        </ToolbarGroup>
        <ToolbarGroup>
          <LinkControl editor={editor} active={state.link} />
          <ToolbarButton
            label="Usuń link"
            disabled={!state.link}
            onClick={() => editor.chain().focus().unsetLink().run()}
          >
            <Unlink />
          </ToolbarButton>
          <ColorControl editor={editor} active={state.highlight} />
        </ToolbarGroup>
        <ToolbarGroup>
          <TableControl editor={editor} active={state.table} />
        </ToolbarGroup>
        <ToolbarGroup>
          <ToolbarButton
            label="Cofnij"
            disabled={!state.canUndo}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton
            label="Ponów"
            disabled={!state.canRedo}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 />
          </ToolbarButton>
        </ToolbarGroup>
      </div>
    </div>
  );
}

function TableControl({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);

  function run(command: () => void) {
    command();
    setOpen(false);
  }

  function insertCustomTable() {
    run(() =>
      editor
        .chain()
        .focus()
        .insertTable({
          rows,
          cols,
          withHeaderRow: true,
        })
        .run(),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={active ? "secondary" : "ghost"}
            title="Tabela"
            aria-label="Tabela"
            aria-pressed={active}
          />
        }
      >
        <Table2 />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-2 p-3">
        {!active ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-medium">Wstaw tabelę</p>
              <p className="text-xs text-muted-foreground">
                Wybierz liczbę kolumn i wierszy.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label
                  htmlFor="table-rows"
                  className="text-xs text-muted-foreground"
                >
                  Wiersze
                </label>

                <Input
                  id="table-rows"
                  type="number"
                  min={1}
                  max={50}
                  value={rows}
                  onChange={(event) =>
                    setRows(
                      Math.max(1, Math.min(50, Number(event.target.value))),
                    )
                  }
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="table-columns"
                  className="text-xs text-muted-foreground"
                >
                  Kolumny
                </label>

                <Input
                  id="table-columns"
                  type="number"
                  min={1}
                  max={20}
                  value={cols}
                  onChange={(event) =>
                    setCols(
                      Math.max(1, Math.min(20, Number(event.target.value))),
                    )
                  }
                />
              </div>
            </div>

            <Button
              type="button"
              className="w-full"
              onClick={insertCustomTable}
            >
              <Table2 />
              Wstaw {rows} × {cols}
            </Button>
          </div>
        ) : (
          <>
            <TableMenuButton
              icon={<Rows3 />}
              label="Dodaj wiersz poniżej"
              onClick={() =>
                run(() => editor.chain().focus().addRowAfter().run())
              }
            />
            <TableMenuButton
              icon={<TableRowsSplit />}
              label="Usuń bieżący wiersz"
              onClick={() =>
                run(() => editor.chain().focus().deleteRow().run())
              }
            />
            <TableMenuButton
              icon={<TableColumnsSplit />}
              label="Dodaj kolumnę po prawej"
              onClick={() =>
                run(() => editor.chain().focus().addColumnAfter().run())
              }
            />
            <TableMenuButton
              icon={<TableColumnsSplit />}
              label="Usuń bieżącą kolumnę"
              onClick={() =>
                run(() => editor.chain().focus().deleteColumn().run())
              }
            />
            <TableMenuButton
              icon={<Table2 />}
              label="Włącz lub wyłącz nagłówek"
              onClick={() =>
                run(() => editor.chain().focus().toggleHeaderRow().run())
              }
            />
            <div className="my-1 h-px bg-border" />
            <TableMenuButton
              destructive
              icon={<Trash2 />}
              label="Usuń tabelę"
              onClick={() =>
                run(() => editor.chain().focus().deleteTable().run())
              }
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function TableMenuButton({
  icon,
  label,
  destructive = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={
        destructive
          ? "w-full justify-start text-destructive hover:text-destructive"
          : "w-full justify-start"
      }
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

function LinkControl({ editor, active }: { editor: Editor; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      setUrl((editor.getAttributes("link").href as string | undefined) ?? "");
    }
  }

  function saveLink() {
    const href = url.trim();
    if (!href) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={active ? "secondary" : "ghost"}
            title="Link"
            aria-label="Dodaj lub edytuj link"
            aria-pressed={active}
          />
        }
      >
        <Link />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 gap-3">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveLink();
          }}
        >
          <div>
            <label htmlFor="note-link" className="text-sm font-medium">
              Adres linku
            </label>
            <Input
              id="note-link"
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              className="mt-2"
            />
          </div>
          <div className="flex justify-end gap-2">
            {active && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  editor
                    .chain()
                    .focus()
                    .extendMarkRange("link")
                    .unsetLink()
                    .run();
                  setOpen(false);
                }}
              >
                Usuń
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!url.trim()}>
              Zastosuj
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

const textColors = [
  "#18181b",
  "#dc2626",
  "#ea580c",
  "#16a34a",
  "#2563eb",
  "#9333ea",
];
const highlightColors = ["#fef08a", "#fed7aa", "#bbf7d0", "#bfdbfe", "#e9d5ff"];

function ColorControl({ editor, active }: { editor: Editor; active: boolean }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="icon-xs"
            variant={active ? "secondary" : "ghost"}
            title="Kolory"
            aria-label="Kolory tekstu i wyróżnienia"
          />
        }
      >
        <Palette />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-3">
        <ColorPalette
          label="Kolor tekstu"
          colors={textColors}
          onSelect={(color) => editor.chain().focus().setColor(color).run()}
          onReset={() => editor.chain().focus().unsetColor().run()}
        />
        <ColorPalette
          label="Wyróżnienie"
          colors={highlightColors}
          onSelect={(color) =>
            editor.chain().focus().setHighlight({ color }).run()
          }
          onReset={() => editor.chain().focus().unsetHighlight().run()}
        />
      </PopoverContent>
    </Popover>
  );
}

function ColorPalette({
  label,
  colors,
  onSelect,
  onReset,
}: {
  label: string;
  colors: string[];
  onSelect: (color: string) => void;
  onReset: () => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={`${label}: ${color}`}
            className="aspect-square size-6 shrink-0 rounded-full border p-0 shadow-xs outline-none hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring"
            style={{ backgroundColor: color }}
            onClick={() => onSelect(color)}
          />
        ))}
        <Button type="button" size="xs" variant="ghost" onClick={onReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  active = false,
  disabled = false,
  onClick,
  children,
  className,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="icon-xs"
      variant={active ? "secondary" : "ghost"}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      {children}
    </Button>
  );
}

function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <span className="relative flex shrink-0 items-center gap-1 before:absolute before:top-1/2 before:-left-1.5 before:h-5 before:w-px before:-translate-y-1/2 before:bg-border">
      {children}
    </span>
  );
}
