import type { PostgrestError } from "@supabase/supabase-js";

const CONSTRAINT_MESSAGES: Record<string, string> = {
  flashcards_answer_not_blank: "Odpowiedź fiszki nie może być pusta.",
  flashcards_question_not_blank: "Pytanie fiszki nie może być puste.",
  chapters_id_users_id_unique:
    "Nie udało się zapisać rozdziału. Odśwież stronę i spróbuj ponownie.",
  chapters_title_not_blank: "Nazwa rozdziału nie może być pusta.",
  chapters_user_id_slug_key:
    "Rozdział o takim adresie już istnieje. Spróbuj ponownie.",
  chapters_user_title_unique_idx: "Rozdział o tej nazwie już istnieje.",
  topics_chapter_id_slug_key:
    "Temat o takim adresie już istnieje w tym rozdziale. Spróbuj ponownie.",
  topics_chapter_title_unique_idx:
    "Temat o tej nazwie już istnieje w tym rozdziale.",
  topics_title_not_blank: "Nazwa tematu nie może być pusta.",
};

function findConstraintMessage(error: PostgrestError) {
  const description = `${error.message} ${error.details ?? ""}`;
  return Object.entries(CONSTRAINT_MESSAGES).find(([constraint]) =>
    description.includes(constraint),
  )?.[1];
}

function getPostgrestErrorMessage(error: PostgrestError) {
  const constraintMessage = findConstraintMessage(error);
  if (constraintMessage) return constraintMessage;

  switch (error.code) {
    case "23503":
      return "Powiązany element już nie istnieje. Odśwież stronę i spróbuj ponownie.";
    case "23505":
      return "Taki element już istnieje.";
    case "23514":
      return "Wprowadzone dane są nieprawidłowe.";
    case "42501":
      return "Nie masz uprawnień do wykonania tej operacji.";
    case "PGRST116":
      return "Nie znaleziono elementu lub nie masz już do niego dostępu.";
    default:
      break;
  }

  const message = error.message.toLowerCase();
  if (
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror")
  ) {
    return "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie.";
  }

  return "Wystąpił błąd podczas komunikacji z bazą danych. Spróbuj ponownie.";
}

export function throwIfPostgrestError(error: PostgrestError | null) {
  if (!error) return;
  throw new Error(getPostgrestErrorMessage(error), { cause: error });
}
