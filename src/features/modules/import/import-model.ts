import type { NoteContent } from "@/features/notes/types/model";
import { normalizeTitle } from "@/features/notes/lib/title-utils";
import { normalizeModuleName } from "../lib/module-validation";
import {
  normalizeQuestionForm,
  type QuestionFormValue,
} from "@/features/questions/model/question-form";
import { createUniqueSlug } from "@/features/notes/lib/slug-utils";

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

export type ImportedQuestionDraft = QuestionFormValue;

export type QuestionModuleImportDraft = ModuleImportDraftBase & {
  kind: "questions";
  source: "quizlet" | "anki";
  questions: ImportedQuestionDraft[];
};

export type ModuleImportDraft =
  ContentModuleImportDraft | QuestionModuleImportDraft;

export const MAX_QUESTION_IMPORT_COUNT = 2_000;
export const MAX_QUESTION_FIELD_LENGTH = 10_000;

export function createContentImportPayload(draft: ContentModuleImportDraft) {
  const chapterSlugs = new Set<string>();
  return draft.chapters.map((chapter, chapterIndex) => {
    const chapterSlug = createUniqueSlug(
      chapter.title,
      chapterSlugs,
      "rozdzial",
    );
    chapterSlugs.add(chapterSlug);
    const topicSlugs = new Set<string>();
    return {
      title: chapter.title,
      slug: chapterSlug,
      position: (chapterIndex + 1) * 1000,
      topics: chapter.topics.map((topic, topicIndex) => {
        const slug = createUniqueSlug(topic.title, topicSlugs, "temat");
        topicSlugs.add(slug);
        return {
          title: topic.title,
          slug,
          position: (topicIndex + 1) * 1000,
          content: topic.content,
        };
      }),
    };
  });
}

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

export function normalizeQuestionImportDraft(
  draft: QuestionModuleImportDraft,
): QuestionModuleImportDraft {
  return {
    ...draft,
    name: normalizeModuleName(draft.name),
    questions: draft.questions.map(normalizeQuestionForm),
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
