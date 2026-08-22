import type { NoteContent } from "./types";

export const EMPTY_RICH_TEXT: NoteContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
