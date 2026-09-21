// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const { useEditor } = vi.hoisted(() => ({ useEditor: vi.fn() }));

vi.mock("@tiptap/react", () => ({
  EditorContent: () => null,
  useEditor,
  useEditorState: vi.fn(),
}));

import { RichTextViewer } from "./rich-text-editor";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("does not synchronize content after TipTap has destroyed the editor", () => {
  const getJSON = vi.fn();
  const destroyedEditor = {
    isDestroyed: true,
    isEmpty: false,
    getJSON,
    get commands(): never {
      throw new TypeError("Cannot read properties of null (reading 'commands')");
    },
  };
  useEditor.mockReturnValue(destroyedEditor);

  expect(() =>
    render(
      <RichTextViewer
        content={{ type: "doc", content: [{ type: "paragraph" }] }}
      />,
    ),
  ).not.toThrow();
  expect(getJSON).not.toHaveBeenCalled();
});
