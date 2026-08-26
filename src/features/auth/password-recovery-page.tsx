import { useState, type SubmitEvent } from "react";
import { KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "./auth-context";

export function PasswordRecoveryPage() {
  const { completePasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6 || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await completePasswordRecovery(password);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Nie udało się ustawić hasła.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-5">
      <section className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm">
        <KeyRound className="mb-5 size-8 text-primary" />
        <h1 className="text-2xl font-semibold">Ustaw nowe hasło</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nowe hasło musi mieć co najmniej 6 znaków.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Input
            type="password"
            autoComplete="new-password"
            autoFocus
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full"
            disabled={password.length < 6 || isSubmitting}
          >
            {isSubmitting ? "Zapisywanie…" : "Zapisz nowe hasło"}
          </Button>
        </form>
      </section>
    </main>
  );
}
