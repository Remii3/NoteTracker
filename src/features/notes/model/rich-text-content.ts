import type { NoteContent } from "../types/model";

export const EMPTY_RICH_TEXT: NoteContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
