import type { NoteContent } from "@/features/notes/types/model";
import { normalizeTitle } from "@/features/notes/lib/title-utils";
import { normalizeModuleName } from "../lib/module-validation";

export type ModuleImportSource = "docx" | "quizlet" | "anki";

type ModuleImportDraftBase = {
  source: ModuleImportSource;
  name: string;
  warnings: string[];
};

export type ImportedTopicDraft = {
  title: string;
  content: NoteContent;
};

export type ImportedChapterDraft = {
  title: string;
  topics: ImportedTopicDraft[];
};

export type ContentModuleImportDraft = ModuleImportDraftBase & {
  kind: "content";
  source: "docx";
  chapters: ImportedChapterDraft[];
};

export type ImportedFlashcardDraft = {
  front: string;
  back: string;
};

export type FlashcardModuleImportDraft = ModuleImportDraftBase & {
  kind: "flashcards";
  source: "quizlet" | "anki";
  cards: ImportedFlashcardDraft[];
};

export type ModuleImportDraft =
  ContentModuleImportDraft | FlashcardModuleImportDraft;

export const MAX_FLASHCARD_IMPORT_COUNT = 2_000;
export const MAX_FLASHCARD_SIDE_LENGTH = 10_000;

export function normalizeContentImportDraft(
  draft: ContentModuleImportDraft,
): ContentModuleImportDraft {
  const chapterNames: string[] = [];
  return {
    ...draft,
    name: normalizeModuleName(draft.name),
    chapters: draft.chapters.map((chapter) => {
      const title = createUniqueImportTitle(chapter.title, chapterNames);
      chapterNames.push(title);
      const topicNames: string[] = [];
      return {
        ...chapter,
        title,
        topics: chapter.topics.map((topic) => {
          const topicTitle = createUniqueImportTitle(topic.title, topicNames);
          topicNames.push(topicTitle);
          return { ...topic, title: topicTitle };
        }),
      };
    }),
  };
}

export function normalizeFlashcardImportDraft(
  draft: FlashcardModuleImportDraft,
): FlashcardModuleImportDraft {
  return {
    ...draft,
    name: normalizeModuleName(draft.name),
    cards: draft.cards.map((card) => ({
      front: card.front.trim(),
      back: card.back.trim(),
    })),
  };
}

export function createUniqueImportTitle(value: string, usedNames: string[]) {
  const trimmed = value.trim().replace(/\s+/g, " ") || "Bez tytułu";
  const used = new Set(usedNames.map(normalizeTitle));
  if (!used.has(normalizeTitle(trimmed))) return trimmed;
  let suffix = 2;
  while (used.has(normalizeTitle(`${trimmed} (${suffix})`))) suffix += 1;
  return `${trimmed} (${suffix})`;
}
