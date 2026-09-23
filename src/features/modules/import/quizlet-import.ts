import { normalizeModuleName } from "../lib/module-validation";
import {
  createUniqueImportTitle,
  MAX_FLASHCARD_IMPORT_COUNT,
  MAX_FLASHCARD_SIDE_LENGTH,
  type FlashcardModuleImportDraft,
  type ImportedFlashcardDraft,
} from "./import-model";

export type QuizletTermSeparator = "auto" | "tab" | "comma" | "dash";
export type QuizletRowSeparator = "newline" | "semicolon";

export type QuizletImportOptions = {
  termSeparator: QuizletTermSeparator;
  rowSeparator: QuizletRowSeparator;
  swapSides: boolean;
};

const DEFAULT_OPTIONS: QuizletImportOptions = {
  termSeparator: "auto",
  rowSeparator: "newline",
  swapSides: false,
};

export function parseQuizletText(
  text: string,
  moduleName: string,
  existingModuleNames: string[],
  options: QuizletImportOptions = DEFAULT_OPTIONS,
): FlashcardModuleImportDraft {
  const normalizedText = text.replace(/\r\n?/g, "\n").trim();
  if (!normalizedText)
    throw new Error("Wklej fiszki wyeksportowane z Quizleta.");

  const rows = splitRows(normalizedText, options.rowSeparator).filter((row) =>
    row.trim(),
  );
  if (rows.length > MAX_FLASHCARD_IMPORT_COUNT) {
    throw new Error(
      `Jednorazowo możesz zaimportować maksymalnie ${MAX_FLASHCARD_IMPORT_COUNT} fiszek.`,
    );
  }

  const separator =
    options.termSeparator === "auto"
      ? detectTermSeparator(rows)
      : options.termSeparator;
  const cards: ImportedFlashcardDraft[] = [];
  let invalidRows = 0;
  let duplicateRows = 0;
  const seen = new Set<string>();

  for (const row of rows) {
    const pair = splitPair(row, separator);
    if (!pair) {
      invalidRows += 1;
      continue;
    }
    let [front, back] = pair.map(cleanField);
    if (options.swapSides) [front, back] = [back, front];
    if (!front || !back) {
      invalidRows += 1;
      continue;
    }
    if (
      front.length > MAX_FLASHCARD_SIDE_LENGTH ||
      back.length > MAX_FLASHCARD_SIDE_LENGTH
    ) {
      throw new Error(
        `Przód i tył fiszki mogą mieć maksymalnie ${MAX_FLASHCARD_SIDE_LENGTH} znaków.`,
      );
    }
    const duplicateKey = `${front.toLocaleLowerCase("pl")}\u0000${back.toLocaleLowerCase("pl")}`;
    if (seen.has(duplicateKey)) duplicateRows += 1;
    seen.add(duplicateKey);
    cards.push({ front, back });
  }

  if (!cards.length) {
    throw new Error(
      "Nie znaleziono poprawnych fiszek. Sprawdź wybrane separatory.",
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

  return {
    kind: "flashcards",
    source: "quizlet",
    name: createUniqueImportTitle(
      normalizeModuleName(moduleName),
      existingModuleNames,
    ),
    cards,
    warnings,
  };
}

function splitRows(text: string, separator: QuizletRowSeparator) {
  return separator === "newline"
    ? splitQuoted(text, "\n", false)
    : splitQuoted(text, ";", false);
}

function detectTermSeparator(
  rows: string[],
): Exclude<QuizletTermSeparator, "auto"> {
  const candidates = ["tab", "comma", "dash"] as const;
  let best: (typeof candidates)[number] = "tab";
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = rows.reduce(
      (count, row) => count + (splitPair(row, candidate) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function splitPair(
  row: string,
  separator: Exclude<QuizletTermSeparator, "auto">,
): [string, string] | null {
  if (separator === "dash") {
    const match = /\s[-–—]\s/.exec(row);
    if (!match || match.index <= 0) return null;
    return [
      row.slice(0, match.index),
      row.slice(match.index + match[0].length),
    ];
  }
  const fields = splitQuoted(row, separator === "tab" ? "\t" : ",");
  if (fields.length < 2) return null;
  return [fields[0], fields.slice(1).join(separator === "tab" ? "\t" : ",")];
}

function splitQuoted(value: string, separator: string, stripQuotes = true) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') {
        current += stripQuotes ? '"' : '""';
        index += 1;
      } else {
        quoted = !quoted;
        if (!stripQuotes) current += character;
      }
      continue;
    }
    if (!quoted && value.startsWith(separator, index)) {
      result.push(current);
      current = "";
      index += separator.length - 1;
      continue;
    }
    current += character;
  }
  result.push(current);
  return result;
}

function cleanField(value: string) {
  return value.trim().replace(/[ \t]+/g, " ");
}
