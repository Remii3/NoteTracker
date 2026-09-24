import { normalizeModuleName } from "../lib/module-validation";
import {
  createUniqueImportTitle,
  MAX_QUESTION_FIELD_LENGTH,
  MAX_QUESTION_IMPORT_COUNT,
  type ImportedQuestionDraft,
  type QuestionModuleImportDraft,
} from "./import-model";

export const MAX_ANKI_TEXT_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_ANKI_PACKAGE_FILE_SIZE = 50 * 1024 * 1024;
const MAX_ANKI_COLLECTION_SIZE = 100 * 1024 * 1024;
const COLLECTION_FILE_NAMES = [
  "collection.21b",
  "collection.anki21b",
  "collection.anki21",
  "collection.anki2",
] as const;

type InitSqlJs = (typeof import("sql.js"))["default"];
let sqlJsPromise: ReturnType<InitSqlJs> | null = null;

type ParsedHeaders = {
  separator?: string;
  html: boolean;
  specialColumns: Set<number>;
};

export async function parseAnkiFile(
  file: File,
  existingModuleNames: string[],
): Promise<QuestionModuleImportDraft> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase("pl");
  if (extension === "apkg") {
    if (file.size > MAX_ANKI_PACKAGE_FILE_SIZE) {
      throw new Error("Paczka Anki może mieć maksymalnie 50 MB.");
    }
    return parseAnkiPackage(
      new Uint8Array(await file.arrayBuffer()),
      file.name,
      existingModuleNames,
    );
  }

  if (extension === "txt" || extension === "csv") {
    if (file.size > MAX_ANKI_TEXT_FILE_SIZE) {
      throw new Error("Tekstowy eksport Anki może mieć maksymalnie 5 MB.");
    }
    return parseAnkiText(await file.text(), file.name, existingModuleNames);
  }

  throw new Error("Wybierz eksport Anki w formacie APKG, TXT lub CSV.");
}

export async function parseAnkiPackage(
  packageBytes: Uint8Array,
  fileName: string,
  existingModuleNames: string[],
): Promise<QuestionModuleImportDraft> {
  const { unzipSync } = await import("fflate");
  let oversizedCollection = false;
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(packageBytes, {
      filter(entry) {
        const isCollection = COLLECTION_FILE_NAMES.includes(
          archiveBaseName(entry.name) as (typeof COLLECTION_FILE_NAMES)[number],
        );
        if (isCollection && entry.originalSize > MAX_ANKI_COLLECTION_SIZE) {
          oversizedCollection = true;
          return false;
        }
        return isCollection;
      },
    });
  } catch {
    throw new Error(
      "Nie udało się otworzyć paczki Anki. Plik może być uszkodzony.",
    );
  }
  if (oversizedCollection) {
    throw new Error("Baza w paczce Anki może mieć maksymalnie 100 MB.");
  }

  const collectionEntry = findCollectionEntry(archive);
  if (!collectionEntry) {
    throw new Error("Paczka nie zawiera obsługiwanej bazy kolekcji Anki.");
  }

  let collectionBytes = collectionEntry.bytes;
  if (
    collectionEntry.name === "collection.21b" ||
    collectionEntry.name === "collection.anki21b"
  ) {
    collectionBytes = await decompressZstd(collectionBytes);
  }
  if (collectionBytes.length > MAX_ANKI_COLLECTION_SIZE) {
    throw new Error("Baza w paczce Anki może mieć maksymalnie 100 MB.");
  }
  if (!hasSqliteHeader(collectionBytes)) {
    throw new Error("Paczka Anki zawiera nieprawidłową bazę kolekcji.");
  }

  const SQL = await loadSqlJs();
  const database = new SQL.Database(collectionBytes);
  let noteFields: string[][];
  try {
    const result = database.exec(
      `select flds from notes order by id limit ${MAX_QUESTION_IMPORT_COUNT + 1}`,
    )[0];
    if (!result) {
      throw new Error("Paczka Anki nie zawiera żadnych notatek.");
    }
    if (result.values.length > MAX_QUESTION_IMPORT_COUNT) {
      throw new Error(
        `Jednorazowo możesz zaimportować maksymalnie ${MAX_QUESTION_IMPORT_COUNT} notatek Anki.`,
      );
    }
    noteFields = result.values.map(([fields]) =>
      String(fields ?? "").split("\u001f"),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Jednorazowo")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("Paczka Anki")) {
      throw error;
    }
    throw new Error("Nie udało się odczytać notatek z bazy Anki.", {
      cause: error,
    });
  } finally {
    database.close();
  }
  return createPackageDraft(noteFields, fileName, existingModuleNames);
}

export function parseAnkiText(
  text: string,
  fileName: string,
  existingModuleNames: string[],
): QuestionModuleImportDraft {
  const normalizedText = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!normalizedText.trim()) throw new Error("Plik Anki jest pusty.");

  const { content, headers } = extractHeaders(normalizedText);
  const separator = headers.separator ?? detectSeparator(content);
  const rows = parseDelimitedRows(content, separator).filter((row) =>
    row.some((field) => field.trim()),
  );

  if (rows.length > MAX_QUESTION_IMPORT_COUNT) {
    throw new Error(
      `Jednorazowo możesz zaimportować maksymalnie ${MAX_QUESTION_IMPORT_COUNT} pozycji.`,
    );
  }

  const questions: ImportedQuestionDraft[] = [];
  const seen = new Set<string>();
  let invalidRows = 0;
  let duplicateRows = 0;
  let ignoredFields = false;
  let removedFormatting = false;
  let removedMedia = false;

  for (const row of rows) {
    const fields = row.filter((_, index) => !headers.specialColumns.has(index));
    if (fields.length > 2) ignoredFields = true;
    if (fields.length < 2) {
      invalidRows += 1;
      continue;
    }

    const rawFront = fields[0];
    const rawBack = fields[1];
    removedFormatting ||= /<[^>]+>|&(?:#\d+|#x[\da-f]+|\w+);/i.test(
      `${rawFront}${rawBack}`,
    );
    removedMedia ||= /\[sound:[^\]]+\]|<img\b/i.test(`${rawFront}${rawBack}`);
    const front = cleanAnkiField(rawFront, headers.html);
    const back = cleanAnkiField(rawBack, headers.html);
    if (!front || !back) {
      invalidRows += 1;
      continue;
    }
    if (
      front.length > MAX_QUESTION_FIELD_LENGTH ||
      back.length > MAX_QUESTION_FIELD_LENGTH
    ) {
      throw new Error(
        `Treść pytania i odpowiedzi mogą mieć maksymalnie ${MAX_QUESTION_FIELD_LENGTH} znaków.`,
      );
    }

    const question = parseAnkiQuestion(front, back);
    const duplicateKey = `${question.content.toLocaleLowerCase("pl")}\u0000${question.options
      .map((option) => option.content.toLocaleLowerCase("pl"))
      .join("\u0001")}`;
    if (seen.has(duplicateKey)) duplicateRows += 1;
    seen.add(duplicateKey);
    questions.push(question);
  }

  if (!questions.length) {
    throw new Error(
      "Nie znaleziono fiszek z dwoma polami. Wyeksportuj z Anki notatki jako zwykły tekst.",
    );
  }

  const warnings: string[] = [];
  if (invalidRows) {
    warnings.push(
      `Pominięto ${invalidRows} ${invalidRows === 1 ? "niepełny wiersz" : "niepełnych wierszy"}.`,
    );
  }
  if (duplicateRows) {
    warnings.push(
      `Wykryto ${duplicateRows} ${duplicateRows === 1 ? "powtórzoną fiszkę" : "powtórzonych fiszek"}; zostaną zaimportowane.`,
    );
  }
  if (ignoredFields) {
    warnings.push(
      "Notatki mają więcej niż dwa pola; zaimportowano pierwsze dwa pola każdej notatki.",
    );
  }
  if (removedFormatting) {
    warnings.push("Formatowanie HTML zostało zamienione na zwykły tekst.");
  }
  if (removedMedia) {
    warnings.push("Obrazy i dźwięki z Anki nie zostały zaimportowane.");
  }

  const baseName = fileName.replace(/\.(?:txt|csv)$/i, "") || "Import z Anki";
  return {
    kind: "questions",
    source: "anki",
    name: createUniqueImportTitle(
      normalizeModuleName(baseName),
      existingModuleNames,
    ),
    questions,
    warnings,
  };
}

function createPackageDraft(
  noteFields: string[][],
  fileName: string,
  existingModuleNames: string[],
): QuestionModuleImportDraft {
  const questions: ImportedQuestionDraft[] = [];
  const seen = new Set<string>();
  let invalidNotes = 0;
  let duplicateCards = 0;
  let ignoredFields = false;
  let removedFormatting = false;
  let removedMedia = false;
  let clozeCards = 0;

  for (const fields of noteFields) {
    const raw = fields.join("");
    removedFormatting ||= /<[^>]+>|&(?:#\d+|#x[\da-f]+|\w+);/i.test(raw);
    removedMedia ||= /\[sound:[^\]]+\]|<img\b/i.test(raw);
    if (fields.length > 2) ignoredFields = true;

    const noteQuestions = createQuestionsFromFields(fields);
    if (!noteQuestions.length) {
      invalidNotes += 1;
      continue;
    }
    if (noteQuestions.length > 1 || findClozeNumbers(fields[0] ?? "").length) {
      clozeCards += noteQuestions.length;
    }

    for (const question of noteQuestions) {
      const optionContents = question.options.map((option) => option.content);
      if (
        question.content.length > MAX_QUESTION_FIELD_LENGTH ||
        optionContents.some(
          (option) => option.length > MAX_QUESTION_FIELD_LENGTH,
        )
      ) {
        throw new Error(
          `Treść pytania i odpowiedzi mogą mieć maksymalnie ${MAX_QUESTION_FIELD_LENGTH} znaków.`,
        );
      }
      const duplicateKey = `${question.content.toLocaleLowerCase("pl")}\u0000${optionContents
        .map((option) => option.toLocaleLowerCase("pl"))
        .join("\u0001")}`;
      if (seen.has(duplicateKey)) duplicateCards += 1;
      seen.add(duplicateKey);
      questions.push(question);
      if (questions.length > MAX_QUESTION_IMPORT_COUNT) {
        throw new Error(
          `Jednorazowo możesz zaimportować maksymalnie ${MAX_QUESTION_IMPORT_COUNT} pozycji.`,
        );
      }
    }
  }

  if (!questions.length) {
    throw new Error("Paczka Anki nie zawiera notatek z treścią do importu.");
  }

  const warnings: string[] = [];
  if (invalidNotes) {
    warnings.push(
      `Pominięto ${invalidNotes} ${invalidNotes === 1 ? "niepełną notatkę" : "niepełnych notatek"}.`,
    );
  }
  if (duplicateCards) {
    warnings.push(
      `Wykryto ${duplicateCards} ${duplicateCards === 1 ? "powtórzoną fiszkę" : "powtórzonych fiszek"}; zostaną zaimportowane.`,
    );
  }
  if (clozeCards) {
    warnings.push(
      `Utworzono ${clozeCards} ${clozeCards === 1 ? "fiszkę z luki cloze" : "fiszek z luk cloze"}.`,
    );
  }
  if (ignoredFields) {
    warnings.push(
      "Notatki mają więcej niż dwa pola; dodatkowe pola zostały pominięte.",
    );
  }
  if (removedFormatting) {
    warnings.push("Formatowanie HTML zostało zamienione na zwykły tekst.");
  }
  if (removedMedia) {
    warnings.push("Obrazy i dźwięki z Anki nie zostały zaimportowane.");
  }

  const baseName = fileName.replace(/\.apkg$/i, "") || "Import z Anki";
  return {
    kind: "questions",
    source: "anki",
    name: createUniqueImportTitle(
      normalizeModuleName(baseName),
      existingModuleNames,
    ),
    questions,
    warnings,
  };
}

function createQuestionsFromFields(fields: string[]) {
  const firstField = fields[0] ?? "";
  const secondField = fields[1] ?? "";
  const clozeNumbers = findClozeNumbers(firstField);
  if (clozeNumbers.length) {
    const answer = cleanAnkiField(renderCloze(firstField), true);
    const extra = cleanAnkiField(secondField, true);
    const back = [answer, extra].filter(Boolean).join("\n\n");
    return clozeNumbers
      .map((number) => ({
        mode: "flashcard" as const,
        content: cleanAnkiField(renderCloze(firstField, number), true),
        explanation: "",
        options: [{ content: back, isCorrect: true }],
      }))
      .filter((question) => question.content && question.options[0].content);
  }

  const front = cleanAnkiField(firstField, true);
  const back = cleanAnkiField(secondField, true);
  return front && back ? [parseAnkiQuestion(front, back)] : [];
}

function parseAnkiQuestion(front: string, back: string): ImportedQuestionDraft {
  const answerMatch =
    /(?:^|\n)\s*(?:(?:prawidłowa|poprawna)\s+odpowiedź|odpowiedź|correct\s+answer)\s*:\s*([A-Za-z]|\d+)[.)]?(?=\s|$)/i.exec(
      back,
    );

  if (answerMatch) {
    const correctLabel = answerMatch[1].toLocaleLowerCase("pl");
    const parsedFront =
      parseLineSeparatedOptions(front, correctLabel) ??
      parseInlineOptions(front, correctLabel);

    if (parsedFront) {
      const answerStart = answerMatch.index;
      const explanation = [
        back.slice(0, answerStart),
        back.slice(answerStart + answerMatch[0].length),
      ]
        .filter((part) => part.trim())
        .join("\n")
        .trim();
      return {
        mode: "test",
        content: parsedFront.content,
        explanation,
        options: parsedFront.options,
      };
    }
  }

  return {
    mode: "flashcard",
    content: front,
    explanation: "",
    options: [{ content: back, isCorrect: true }],
  };
}

type ParsedAnkiOption = {
  label: string;
  content: string;
};

function createParsedTestQuestion(
  content: string,
  options: ParsedAnkiOption[],
  correctLabel: string,
) {
  const labels = options.map((option) => option.label);
  if (
    !content.trim() ||
    options.length < 2 ||
    new Set(labels).size !== labels.length ||
    !labels.includes(correctLabel) ||
    options.some((option) => !option.content.trim())
  ) {
    return null;
  }

  return {
    content: content.trim(),
    options: options.map((option) => ({
      content: option.content.trim(),
      isCorrect: option.label === correctLabel,
    })),
  };
}

function parseLineSeparatedOptions(front: string, correctLabel: string) {
  const lines = front.split("\n");
  const markers = lines.flatMap((line, index) => {
    const match = /^\s*([A-Za-z]|\d+)[.)]\s*(.*)$/.exec(line);
    return match
      ? [
          {
            index,
            label: match[1].toLocaleLowerCase("pl"),
            content: match[2],
          },
        ]
      : [];
  });
  if (markers.length < 2) return null;

  const options = markers.map((marker, markerIndex) => {
    const nextIndex = markers[markerIndex + 1]?.index ?? lines.length;
    return {
      label: marker.label,
      content: [marker.content, ...lines.slice(marker.index + 1, nextIndex)]
        .join("\n")
        .trim(),
    };
  });
  return createParsedTestQuestion(
    lines.slice(0, markers[0].index).join("\n"),
    options,
    correctLabel,
  );
}

function parseInlineOptions(front: string, correctLabel: string) {
  const answerUsesNumber = /^\d+$/.test(correctLabel);
  const markerPattern = /(?:^|\s)([A-Za-z]|\d+)([.)])\s*/g;
  const markers = [...front.matchAll(markerPattern)]
    .map((match) => {
      const label = match[1].toLocaleLowerCase("pl");
      const markerText = match[0];
      const labelOffset = markerText.lastIndexOf(match[1]);
      return {
        label,
        delimiter: match[2],
        index: (match.index ?? 0) + labelOffset,
        contentIndex: (match.index ?? 0) + markerText.length,
      };
    })
    .filter((marker) => /^\d+$/.test(marker.label) === answerUsesNumber);

  // Do not mix `a)` list markers with abbreviations such as `2020 r.`.
  // Parentheses are less ambiguous, so try that convention first.
  for (const delimiter of [")", "."] as const) {
    const matchingMarkers = markers.filter(
      (marker) => marker.delimiter === delimiter,
    );
    for (let start = 0; start <= matchingMarkers.length - 2; start += 1) {
      const candidates = matchingMarkers.slice(start);
      const questionContent = front.slice(0, candidates[0].index).trim();
      if (!questionContent) continue;
      const options = candidates.map((marker, markerIndex) => ({
        label: marker.label,
        content: front
          .slice(
            marker.contentIndex,
            candidates[markerIndex + 1]?.index ?? front.length,
          )
          .trim(),
      }));
      const parsed = createParsedTestQuestion(
        questionContent,
        options,
        correctLabel,
      );
      if (parsed) return parsed;
    }
  }
  return null;
}

function findClozeNumbers(value: string) {
  const numbers = new Set<number>();
  for (const match of value.matchAll(/\{\{c(\d+)::[\s\S]*?\}\}/gi)) {
    numbers.add(Number(match[1]));
  }
  return [...numbers].sort((left, right) => left - right);
}

function renderCloze(value: string, hiddenNumber?: number) {
  return value.replace(
    /\{\{c(\d+)::([\s\S]*?)(?:::(.*?))?\}\}/gi,
    (_, number: string, answer: string, hint: string | undefined) =>
      Number(number) === hiddenNumber ? `[${hint?.trim() || "…"}]` : answer,
  );
}

function archiveBaseName(path: string) {
  return path.split("/").pop() ?? path;
}

function findCollectionEntry(archive: Record<string, Uint8Array>) {
  for (const collectionName of COLLECTION_FILE_NAMES) {
    const entry = Object.entries(archive).find(
      ([path]) => archiveBaseName(path) === collectionName,
    );
    if (entry) return { name: collectionName, bytes: entry[1] };
  }
  return null;
}

async function decompressZstd(bytes: Uint8Array) {
  const { Decompress } = await import("fzstd");
  const chunks: Uint8Array[] = [];
  let totalSize = 0;
  let exceededLimit = false;
  try {
    const decompressor = new Decompress((chunk) => {
      totalSize += chunk.length;
      if (totalSize > MAX_ANKI_COLLECTION_SIZE) {
        exceededLimit = true;
        throw new Error("collection-too-large");
      }
      chunks.push(chunk);
    });
    decompressor.push(bytes, true);
  } catch {
    if (exceededLimit) {
      throw new Error("Baza w paczce Anki może mieć maksymalnie 100 MB.");
    }
    throw new Error("Nie udało się rozpakować nowego formatu paczki Anki.");
  }

  const result = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function hasSqliteHeader(bytes: Uint8Array) {
  const header = "SQLite format 3\u0000";
  return header
    .split("")
    .every((character, index) => bytes[index] === character.charCodeAt(0));
}

function loadSqlJs() {
  if (!sqlJsPromise) {
    sqlJsPromise = Promise.all([
      import("sql.js"),
      import("sql.js/dist/sql-wasm.wasm?url"),
    ]).then(async ([{ default: initSqlJs }, { default: wasmUrl }]) => {
      let wasmBinary: ArrayBuffer | undefined;
      if (import.meta.env.SSR) {
        const { readFile } = await import("node:fs/promises");
        const file = await readFile(`${process.cwd()}${wasmUrl}`);
        wasmBinary = file.buffer.slice(
          file.byteOffset,
          file.byteOffset + file.byteLength,
        ) as ArrayBuffer;
      }
      return initSqlJs({ locateFile: () => wasmUrl, wasmBinary });
    });
  }
  return sqlJsPromise;
}

function extractHeaders(text: string) {
  const lines = text.split("\n");
  const headers: ParsedHeaders = {
    html: false,
    specialColumns: new Set<number>(),
  };
  let firstContentLine = 0;

  for (; firstContentLine < lines.length; firstContentLine += 1) {
    const line = lines[firstContentLine];
    if (!line.startsWith("#")) break;
    const separatorIndex = line.indexOf(":");
    if (separatorIndex < 0) continue;
    const key = line.slice(1, separatorIndex).trim().toLocaleLowerCase("en");
    const value = line.slice(separatorIndex + 1).trim();
    if (key === "separator") headers.separator = parseSeparatorHeader(value);
    if (key === "html") headers.html = value.toLocaleLowerCase("en") === "true";
    if (
      ["tags column", "guid column", "deck column", "notetype column"].includes(
        key,
      )
    ) {
      const column = Number.parseInt(value, 10);
      if (Number.isInteger(column) && column > 0) {
        headers.specialColumns.add(column - 1);
      }
    }
  }

  return { content: lines.slice(firstContentLine).join("\n"), headers };
}

function parseSeparatorHeader(value: string) {
  const normalized = value.toLocaleLowerCase("en");
  const named: Record<string, string> = {
    tab: "\t",
    comma: ",",
    semicolon: ";",
    space: " ",
    pipe: "|",
    colon: ":",
  };
  return named[normalized] ?? (value.slice(0, 1) || undefined);
}

function detectSeparator(text: string) {
  const sample = text.split("\n").find((line) => line.trim()) ?? "";
  const candidates = ["\t", ";", ",", "|", ":"];
  return candidates.reduce(
    (best, candidate) =>
      countOutsideQuotes(sample, candidate) > countOutsideQuotes(sample, best)
        ? candidate
        : best,
    "\t",
  );
}

function countOutsideQuotes(value: string, separator: string) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && value[index] === separator) count += 1;
  }
  return count;
}

function parseDelimitedRows(value: string, separator: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === separator) {
      row.push(field);
      field = "";
    } else if (!quoted && character === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function cleanAnkiField(value: string, html: boolean) {
  let result = value.replace(/\[sound:[^\]]+\]/gi, "");
  if (html || /<[^>]+>/.test(result)) {
    result = result
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:div|p|li)>/gi, "\n")
      .replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, "$1")
      .replace(/<[^>]+>/g, "");
  }
  return decodeHtmlEntities(result)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith("#")) {
      return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
    }
    return named[entity.toLocaleLowerCase("en")] ?? match;
  });
}
