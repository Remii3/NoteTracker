import { normalizeModuleName } from "../lib/module-validation";
import {
  createUniqueImportTitle,
  MAX_QUESTION_FIELD_LENGTH,
  MAX_QUESTION_IMPORT_COUNT,
  type ImportedQuestionDraft,
  type QuestionModuleImportDraft,
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
): QuestionModuleImportDraft {
  const normalizedText = text.replace(/\r\n?/g, "\n").trim();
  if (!normalizedText)
    throw new Error("Wklej fiszki wyeksportowane z Quizleta.");

  const sourceRows = splitRows(normalizedText, options.rowSeparator).filter(
    (row) => row.trim(),
  );
  const separator =
    options.termSeparator === "auto"
      ? detectTermSeparator(sourceRows)
      : options.termSeparator;
  const rows =
    options.rowSeparator === "newline" && separator === "tab"
      ? joinMultilineTabRows(sourceRows)
      : sourceRows;
  if (rows.length > MAX_QUESTION_IMPORT_COUNT) {
    throw new Error(
      `Jednorazowo możesz zaimportować maksymalnie ${MAX_QUESTION_IMPORT_COUNT} fiszek.`,
    );
  }
  const questions: ImportedQuestionDraft[] = [];
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
      front.length > MAX_QUESTION_FIELD_LENGTH ||
      back.length > MAX_QUESTION_FIELD_LENGTH
    ) {
      throw new Error(
        `Przód i tył fiszki mogą mieć maksymalnie ${MAX_QUESTION_FIELD_LENGTH} znaków.`,
      );
    }
    const duplicateKey = `${front.toLocaleLowerCase("pl")}\u0000${back.toLocaleLowerCase("pl")}`;
    if (seen.has(duplicateKey)) duplicateRows += 1;
    seen.add(duplicateKey);
    questions.push({
      mode: "flashcard",
      content: front,
      explanation: "",
      options: [{ content: back, isCorrect: true }],
    });
  }

  if (!questions.length) {
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
      `Wykryto ${duplicateRows} ${duplicateRows === 1 ? "powtórzoną fiszkę" : "powtórzonych fiszek"}; zostaną pominięte.`,
    );
  }

  return {
    kind: "questions",
    source: "quizlet",
    name: createUniqueImportTitle(
      normalizeModuleName(moduleName),
      existingModuleNames,
    ),
    questions,
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
  // A tab is an unambiguous field boundary in Quizlet exports. Prefer it over
  // commas that may naturally occur many times inside a multiline term.
  if (rows.some((row) => splitQuoted(row, "\t").length >= 2)) return "tab";

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

function joinMultilineTabRows(rows: string[]) {
  const joined: string[] = [];
  let pending: string[] = [];

  for (const row of rows) {
    pending.push(row);
    const candidate = pending.join("\n");
    if (splitPair(candidate, "tab")) {
      joined.push(candidate);
      pending = [];
    }
  }
  if (pending.length) joined.push(pending.join("\n"));
  return joined;
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
