import type { NoteContent } from "@/features/notes/types/model";
import { normalizeModuleName } from "../lib/module-validation";
import { normalizeTitle } from "@/features/notes/lib/title-utils";

export type ImportedTopicDraft = {
  title: string;
  content: NoteContent;
};

export type ImportedChapterDraft = {
  title: string;
  topics: ImportedTopicDraft[];
};

export type ImportedModuleDraft = {
  name: string;
  chapters: ImportedChapterDraft[];
  warnings: string[];
};

type MammothParagraph = {
  type: string;
  styleName?: string | null;
  numbering?: { level: string; isOrdered: boolean } | null;
};

type MammothRuntime = typeof import("mammoth") & {
  transforms: {
    paragraph: (
      transform: (paragraph: MammothParagraph) => MammothParagraph,
    ) => (document: unknown) => unknown;
  };
};

const STRUCTURE_STYLE_NAMES = [
  "NoteTracker Import Chapter",
  "NoteTracker Import Topic",
  "NoteTracker Import Subpoint",
] as const;

export async function parseDocxFile(
  file: File,
  existingModuleNames: string[],
): Promise<ImportedModuleDraft> {
  if (!file.name.toLocaleLowerCase("pl").endsWith(".docx")) {
    throw new Error("Wybierz dokument programu Word w formacie .docx.");
  }

  const imported = await import("mammoth");
  const loaded = imported as unknown as { default?: MammothRuntime };
  const mammoth = loaded.default ?? (imported as unknown as MammothRuntime);
  const transformDocument = mammoth.transforms.paragraph((paragraph) => {
    if (!paragraph.numbering?.isOrdered) return paragraph;
    const level = Number(paragraph.numbering.level);
    if (!Number.isInteger(level) || level < 0 || level > 2) return paragraph;
    return { ...paragraph, styleName: STRUCTURE_STYLE_NAMES[level] };
  });
  const result = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      transformDocument,
      styleMap: [
        `p[style-name='${STRUCTURE_STYLE_NAMES[0]}'] => h1:fresh`,
        `p[style-name='${STRUCTURE_STYLE_NAMES[1]}'] => h2:fresh`,
        `p[style-name='${STRUCTURE_STYLE_NAMES[2]}'] => h3:fresh`,
        "u => u",
      ],
    },
  );

  const warnings = result.messages.map((message) => message.message);
  return parseImportedHtml(
    uniqueName(moduleNameFromFile(file.name), existingModuleNames),
    result.value,
    warnings,
  );
}

export function parseImportedHtml(
  moduleName: string,
  html: string,
  sourceWarnings: string[] = [],
): ImportedModuleDraft {
  const document = new DOMParser().parseFromString(html, "text/html");
  const chapters: ImportedChapterDraft[] = [];
  const warnings = [...sourceWarnings];
  let currentChapter: ImportedChapterDraft | null = null;
  let currentTopic: ImportedTopicDraft | null = null;
  let ignoredBlocks = 0;

  for (const element of Array.from(document.body.children)) {
    const boundary = readBoundary(element);
    if (boundary?.depth === 1) {
      currentChapter = {
        title: uniqueName(
          boundary.title,
          chapters.map((chapter) => chapter.title),
        ),
        topics: [],
      };
      chapters.push(currentChapter);
      currentTopic = null;
      continue;
    }
    if (boundary?.depth === 2) {
      if (!currentChapter) {
        ignoredBlocks += 1;
        continue;
      }
      currentTopic = {
        title: uniqueName(
          boundary.title,
          currentChapter.topics.map((topic) => topic.title),
        ),
        content: emptyDocument(),
      };
      currentChapter.topics.push(currentTopic);
      continue;
    }
    if (!currentTopic) {
      if (element.textContent?.trim() || element.querySelector("img")) {
        ignoredBlocks += 1;
      }
      continue;
    }

    const content =
      boundary?.depth === 3
        ? [headingNode(boundary.title, 3)]
        : convertBlock(element);
    appendContent(currentTopic.content, content);
  }

  if (!chapters.length) {
    throw new Error(
      "Nie znaleziono rozdziałów. Użyj numeracji 1, 2, 3 albo stylu Nagłówek 1.",
    );
  }
  if (!chapters.some((chapter) => chapter.topics.length)) {
    throw new Error(
      "Nie znaleziono tematów. Użyj numeracji 1.1, 1.2 albo stylu Nagłówek 2.",
    );
  }
  if (ignoredBlocks) {
    warnings.push(
      `Pominięto ${ignoredBlocks} ${ignoredBlocks === 1 ? "fragment" : "fragmentów"} poza tematami.`,
    );
  }

  return { name: normalizeModuleName(moduleName), chapters, warnings };
}

export function normalizeImportedDraftTitles(
  draft: ImportedModuleDraft,
): ImportedModuleDraft {
  const chapterNames: string[] = [];
  return {
    ...draft,
    name: normalizeModuleName(draft.name),
    chapters: draft.chapters.map((chapter) => {
      const title = uniqueName(chapter.title, chapterNames);
      chapterNames.push(title);
      const topicNames: string[] = [];
      return {
        ...chapter,
        title,
        topics: chapter.topics.map((topic) => {
          const topicTitle = uniqueName(topic.title, topicNames);
          topicNames.push(topicTitle);
          return { ...topic, title: topicTitle };
        }),
      };
    }),
  };
}

function moduleNameFromFile(filename: string) {
  return normalizeModuleName(filename.replace(/\.docx$/i, ""));
}

function uniqueName(value: string, usedNames: string[]) {
  const trimmed = value.trim().replace(/\s+/g, " ") || "Bez tytułu";
  const used = new Set(usedNames.map(normalizeTitle));
  if (!used.has(normalizeTitle(trimmed))) return trimmed;
  let suffix = 2;
  while (used.has(normalizeTitle(`${trimmed} (${suffix})`))) suffix += 1;
  return `${trimmed} (${suffix})`;
}

function readBoundary(element: Element) {
  const headingDepth = /^H([1-3])$/.exec(element.tagName)?.[1];
  const text = element.textContent?.trim().replace(/\s+/g, " ") ?? "";
  const numbered = /^(\d+(?:\.\d+)*)(?:[.)])?\s+(.+)$/.exec(text);
  if (numbered) {
    return {
      depth: Math.min(3, numbered[1].split(".").length),
      title: numbered[2].trim(),
    };
  }
  if (headingDepth && text) {
    return { depth: Number(headingDepth), title: text };
  }
  return null;
}

function emptyDocument(): NoteContent {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

function appendContent(document: NoteContent, nodes: NoteContent[]) {
  document.content ??= [];
  if (
    document.content.length === 1 &&
    document.content[0].type === "paragraph" &&
    !document.content[0].content?.length
  ) {
    document.content = [];
  }
  document.content.push(...nodes);
}

function headingNode(text: string, level: number): NoteContent {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  };
}

function convertBlock(element: Element): NoteContent[] {
  switch (element.tagName) {
    case "P":
      return [{ type: "paragraph", content: convertInline(element) }];
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return [
        {
          type: "heading",
          attrs: { level: Math.min(3, Number(element.tagName.slice(1))) },
          content: convertInline(element),
        },
      ];
    case "UL":
      return [listNode(element, "bulletList")];
    case "OL":
      return [listNode(element, "orderedList")];
    case "BLOCKQUOTE":
      return [{ type: "blockquote", content: convertBlockChildren(element) }];
    case "PRE":
      return [
        {
          type: "codeBlock",
          content: [{ type: "text", text: element.textContent ?? "" }],
        },
      ];
    case "HR":
      return [{ type: "horizontalRule" }];
    case "TABLE":
      return [tableNode(element)];
    case "IMG":
      return [{ type: "paragraph", content: [imageNode(element)] }];
    default: {
      const children = convertBlockChildren(element);
      return children.length
        ? children
        : [{ type: "paragraph", content: convertInline(element) }];
    }
  }
}

function convertBlockChildren(element: Element) {
  return Array.from(element.children).flatMap(convertBlock);
}

function listNode(element: Element, type: "bulletList" | "orderedList") {
  const attrs =
    type === "orderedList"
      ? { start: Number(element.getAttribute("start") ?? 1) || 1 }
      : undefined;
  return {
    type,
    ...(attrs ? { attrs } : {}),
    content: Array.from(element.children)
      .filter((child) => child.tagName === "LI")
      .map(listItemNode),
  } satisfies NoteContent;
}

function listItemNode(element: Element): NoteContent {
  const content: NoteContent[] = [];
  const inlineWrapper = document.createElement("span");
  for (const child of Array.from(element.childNodes)) {
    if (
      child instanceof Element &&
      ["UL", "OL", "P", "TABLE", "BLOCKQUOTE"].includes(child.tagName)
    ) {
      if (inlineWrapper.childNodes.length) {
        content.push({
          type: "paragraph",
          content: convertInline(inlineWrapper),
        });
        inlineWrapper.replaceChildren();
      }
      content.push(...convertBlock(child));
    } else {
      inlineWrapper.append(child.cloneNode(true));
    }
  }
  if (inlineWrapper.childNodes.length) {
    content.push({
      type: "paragraph",
      content: convertInline(inlineWrapper),
    });
  }
  if (!content.length) content.push({ type: "paragraph" });
  return { type: "listItem", content };
}

function tableNode(element: Element): NoteContent {
  const rows = Array.from(
    element.querySelectorAll(
      ":scope > tbody > tr, :scope > thead > tr, :scope > tr",
    ),
  );
  return {
    type: "table",
    content: rows.map((row) => ({
      type: "tableRow",
      content: Array.from(row.children)
        .filter((cell) => cell.tagName === "TD" || cell.tagName === "TH")
        .map((cell) => ({
          type: cell.tagName === "TH" ? "tableHeader" : "tableCell",
          attrs: {
            colspan: Number(cell.getAttribute("colspan") ?? 1) || 1,
            rowspan: Number(cell.getAttribute("rowspan") ?? 1) || 1,
            colwidth: null,
          },
          content: convertBlockChildren(cell).length
            ? convertBlockChildren(cell)
            : [{ type: "paragraph", content: convertInline(cell) }],
        })),
    })),
  };
}

function convertInline(element: Element, marks: NoteContent["marks"] = []) {
  const content: NoteContent[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) {
        content.push({
          type: "text",
          text: child.textContent,
          ...(marks?.length ? { marks } : {}),
        });
      }
      continue;
    }
    if (!(child instanceof Element)) continue;
    if (child.tagName === "BR") {
      content.push({ type: "hardBreak" });
      continue;
    }
    if (child.tagName === "IMG") {
      content.push(imageNode(child));
      continue;
    }
    content.push(
      ...convertInline(child, [...(marks ?? []), ...marksFor(child)]),
    );
  }
  return content;
}

function marksFor(element: Element): NonNullable<NoteContent["marks"]> {
  const marks: NonNullable<NoteContent["marks"]> = [];
  if (element.matches("strong, b")) marks.push({ type: "bold" });
  if (element.matches("em, i")) marks.push({ type: "italic" });
  if (element.matches("u")) marks.push({ type: "underline" });
  if (element.matches("s, strike, del")) marks.push({ type: "strike" });
  if (element.matches("code")) marks.push({ type: "code" });
  if (element.matches("a[href]")) {
    const href = safeLink(element.getAttribute("href") ?? "");
    if (href) {
      marks.push({
        type: "link",
        attrs: {
          href,
          target: element.getAttribute("target"),
          rel: "noopener noreferrer nofollow",
          class: null,
        },
      });
    }
  }
  return marks;
}

function safeLink(href: string) {
  if (href.startsWith("#") || href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol)
      ? href
      : null;
  } catch {
    return null;
  }
}

function imageNode(element: Element): NoteContent {
  return {
    type: "image",
    attrs: {
      src: element.getAttribute("src") ?? "",
      alt: element.getAttribute("alt"),
      title: element.getAttribute("title"),
    },
  };
}
