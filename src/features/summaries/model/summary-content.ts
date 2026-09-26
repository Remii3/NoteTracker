import type { NoteContent } from "@/features/notes/types/model";
import type { GeneratedSummary, SummarySourceTopic } from "./types";

function textNode(text: string): NoteContent {
  return { type: "text", text };
}

function paragraph(text: string, marks?: NoteContent["marks"]): NoteContent {
  return {
    type: "paragraph",
    content: [{ ...textNode(text), marks }],
  };
}

function paragraphs(text: string) {
  return text
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => paragraph(value));
}

function heading(text: string, level: number): NoteContent {
  return {
    type: "heading",
    attrs: { level },
    content: [textNode(text)],
  };
}

function bulletList(items: string[]): NoteContent | null {
  if (!items.length) return null;
  return {
    type: "bulletList",
    content: items.map((item) => ({
      type: "listItem",
      content: [paragraph(item)],
    })),
  };
}

export function summaryToNoteContent(
  summary: GeneratedSummary,
  sources: SummarySourceTopic[],
): NoteContent {
  const content: NoteContent[] = [...paragraphs(summary.introduction)];
  for (const section of summary.sections) {
    content.push(heading(section.title, 2), ...paragraphs(section.summary));
    const points = bulletList(section.keyPoints);
    if (points) content.push(points);
  }
  if (summary.connections.length) {
    content.push(heading("Powiązania między tematami", 2));
    const connections = bulletList(summary.connections);
    if (connections) content.push(connections);
  }
  if (summary.thingsToRemember.length) {
    content.push(heading("Najważniejsze do zapamiętania", 2));
    const reminders = bulletList(summary.thingsToRemember);
    if (reminders) content.push(reminders);
  }
  content.push(
    paragraph(
      `Streszczenie wygenerowane przez AI na podstawie: ${sources
        .map((source) => `${source.chapterTitle} — ${source.topicTitle}`)
        .join(", ")}.`,
      [{ type: "italic" }],
    ),
  );
  return { type: "doc", content };
}

export function summaryToPlainText(
  title: string,
  summary: GeneratedSummary,
  sources: SummarySourceTopic[],
) {
  const parts = [title, "", summary.introduction];
  for (const section of summary.sections) {
    parts.push(
      "",
      section.title,
      section.summary,
      ...section.keyPoints.map((point) => `• ${point}`),
    );
  }
  if (summary.connections.length) {
    parts.push(
      "",
      "Powiązania między tematami",
      ...summary.connections.map((item) => `• ${item}`),
    );
  }
  if (summary.thingsToRemember.length) {
    parts.push(
      "",
      "Najważniejsze do zapamiętania",
      ...summary.thingsToRemember.map((item) => `• ${item}`),
    );
  }
  parts.push(
    "",
    `Źródła: ${sources
      .map((source) => `${source.chapterTitle} — ${source.topicTitle}`)
      .join(", ")}`,
  );
  return parts.join("\n");
}
