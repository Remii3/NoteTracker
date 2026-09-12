import { isAuthError } from "@supabase/supabase-js";

type AuthAction =
  | "sign-in"
  | "sign-up"
  | "request-password-reset"
  | "update-name"
  | "update-password"
  | "recover-password";

const fallbackMessages: Record<AuthAction, string> = {
  "sign-in": "Nie udało się zalogować.",
  "sign-up": "Nie udało się zarejestrować.",
  "request-password-reset": "Nie udało się wysłać wiadomości.",
  "update-name": "Nie udało się zaktualizować imienia.",
  "update-password": "Nie udało się zmienić hasła.",
  "recover-password": "Nie udało się ustawić nowego hasła.",
};

export function getAuthErrorMessage(error: unknown, action: AuthAction) {
  if (!isAuthError(error)) return fallbackMessages[action];

  switch (error.code) {
    case "invalid_credentials":
      return action === "update-password"
        ? "Stare hasło jest nieprawidłowe."
        : "Nieprawidłowy email lub hasło.";
    case "email_not_confirmed":
      return "Najpierw potwierdź adres email.";
    case "weak_password":
      return "Hasło nie spełnia wymagań bezpieczeństwa.";
    case "same_password":
      return "Nowe hasło musi różnić się od obecnego.";
    case "over_email_send_rate_limit":
      return "Wysłano zbyt wiele wiadomości. Spróbuj ponownie później.";
    case "over_request_rate_limit":
      return "Wykonano zbyt wiele prób. Spróbuj ponownie później.";
    case "signup_disabled":
      return "Rejestracja nowych kont jest obecnie wyłączona.";
    case "email_address_invalid":
      return "Podaj poprawny adres email.";
    case "email_address_not_authorized":
      return "Ten adres email nie jest dozwolony.";
    case "session_expired":
    case "session_not_found":
    case "refresh_token_not_found":
    case "refresh_token_already_used":
      return "Sesja wygasła. Zaloguj się ponownie.";
    default:
      return fallbackMessages[action];
  }
}
