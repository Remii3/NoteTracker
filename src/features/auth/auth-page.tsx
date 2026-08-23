import { useState, type FormEvent } from "react";
import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./auth-context";

type Mode = "sign-in" | "sign-up";

function getAuthErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Nie udało się wykonać operacji.";
  if (error.message.toLowerCase().includes("invalid login credentials"))
    return "Nieprawidłowy e-mail lub hasło.";
  if (error.message.toLowerCase().includes("user already registered"))
    return "Konto z tym adresem e-mail już istnieje.";
  return error.message;
}

export function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canSubmit =
    (mode === "sign-in" || name.trim().length > 0) &&
    email.trim().length > 0 &&
    password.length >= 6;

  function changeMode(nextMode: Mode) {
    setMode(nextMode);
    setError(null);
    setMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signIn(email.trim(), password);
      } else {
        const result = await signUp(name.trim(), email.trim(), password);
        if (result.confirmationRequired) {
          setMessage(
            "Sprawdź skrzynkę e-mail i potwierdź rejestrację, a następnie się zaloguj.",
          );
          setMode("sign-in");
          setPassword("");
        }
      }
    } catch (caughtError) {
      setError(getAuthErrorMessage(caughtError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-5" />
          </span>
          <div>
            <p className="font-semibold leading-tight">NoteTracker</p>
            <p className="text-xs text-muted-foreground">
              Twoja przestrzeń nauki
            </p>
          </div>
        </div>
        <section className="rounded-2xl border bg-background p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">
            {mode === "sign-in" ? "Zaloguj się" : "Utwórz konto"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "sign-in"
              ? "Wróć do swoich rozdziałów i notatek."
              : "Zacznij budować własną bazę wiedzy."}
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            {mode === "sign-up" && (
              <div className="space-y-2">
                <label htmlFor="auth-name" className="text-sm font-medium">
                  Imię
                </label>
                <Input
                  id="auth-name"
                  type="text"
                  autoComplete="name"
                  autoFocus
                  value={name}
                  disabled={isSubmitting}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError(null);
                  }}
                  placeholder="Jak mamy się do Ciebie zwracać?"
                />
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="auth-email" className="text-sm font-medium">
                E-mail
              </label>
              <Input
                id="auth-email"
                type="email"
                autoComplete="email"
                autoFocus={mode === "sign-in"}
                value={email}
                disabled={isSubmitting}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                placeholder="ty@example.com"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="auth-password" className="text-sm font-medium">
                Hasło
              </label>
              <Input
                id="auth-password"
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                value={password}
                disabled={isSubmitting}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                minLength={6}
              />
              {mode === "sign-up" && (
                <p className="text-xs text-muted-foreground">
                  Minimum 6 znaków.
                </p>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-primary">
                {message}
              </p>
            )}
            <Button
              type="submit"
              className="w-full"
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting
                ? "Proszę czekać…"
                : mode === "sign-in"
                  ? "Zaloguj się"
                  : "Utwórz konto"}
            </Button>
          </form>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {mode === "sign-in" ? "Nie masz konta?" : "Masz już konto?"}{" "}
            <button
              type="button"
              className="font-medium text-primary hover:underline"
              disabled={isSubmitting}
              onClick={() =>
                changeMode(mode === "sign-in" ? "sign-up" : "sign-in")
              }
            >
              {mode === "sign-in" ? "Zarejestruj się" : "Zaloguj się"}
            </button>
          </p>
        </section>
      </div>
    </main>
  );
}
