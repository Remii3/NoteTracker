import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAuth } from "./auth-context";
import { getUserDisplayName } from "./user-display-name";

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { updateName, updatePassword, user } = useAuth();
  const [name, setName] = useState(user ? getUserDisplayName(user) : "");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || (password && password.length < 6)) return;
    setIsSubmitting(true);
    try {
      await updateName(nextName);
      if (password) await updatePassword(password);
      toast.success("Zaktualizowano konto.");
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nie udało się zapisać zmian.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ustawienia konta</DialogTitle>
          <DialogDescription>
            Zmień imię lub ustaw nowe hasło.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="account-name">
              Imię
            </label>
            <Input
              id="account-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="account-password">
              Nowe hasło
            </label>
            <Input
              id="account-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Pozostaw puste bez zmiany"
            />
            <p className="text-xs text-muted-foreground">Minimum 6 znaków.</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              type="submit"
              disabled={
                !name.trim() ||
                Boolean(password && password.length < 6) ||
                isSubmitting
              }
            >
              {isSubmitting ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
