import { PostgrestError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { throwIfPostgrestError } from "./supabase-error";

function postgrestError(
  code: string,
  message: string,
  details = "",
): PostgrestError {
  return new PostgrestError({ code, message, details, hint: "" });
}

describe("Supabase error mapping", () => {
  it("does nothing when there is no error", () => {
    expect(() => throwIfPostgrestError(null)).not.toThrow();
  });

  it("maps a named database constraint to a useful message", () => {
    const error = postgrestError(
      "23505",
      "duplicate key",
      "chapters_user_title_unique_idx",
    );

    expect(() => throwIfPostgrestError(error)).toThrow(
      "Rozdział o tej nazwie już istnieje.",
    );
  });

  it.each([
    ["23503", "Powiązany element już nie istnieje."],
    ["23505", "Taki element już istnieje."],
    ["23514", "Wprowadzone dane są nieprawidłowe."],
    ["42501", "Nie masz uprawnień"],
    ["PGRST116", "Nie znaleziono elementu"],
  ])("maps Postgres code %s", (code, message) => {
    expect(() => throwIfPostgrestError(postgrestError(code, "error"))).toThrow(
      message,
    );
  });

  it("maps network failures and preserves the original error as the cause", () => {
    const error = postgrestError("", "Failed to fetch");

    try {
      throwIfPostgrestError(error);
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).toContain("połączyć z serwerem");
      expect((thrown as Error).cause).toBe(error);
    }
  });

  it("uses a safe fallback for unknown errors", () => {
    expect(() =>
      throwIfPostgrestError(postgrestError("UNKNOWN", "unknown")),
    ).toThrow("Wystąpił błąd podczas komunikacji z bazą danych.");
  });
});
