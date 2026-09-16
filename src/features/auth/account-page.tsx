import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { LogOut, Trash2, UserRound } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { PreferencesPanel } from "@/features/preferences/components/preferences-panel";
import {
  clearDeletedUserLocalData,
  clearUserMemoryCache,
} from "@/lib/memory-cache";
import { getAuthErrorMessage } from "./auth-error";
import { nameSchema, passwordSchema } from "./auth-schema";
import { useAuth } from "./auth-context";
import { getUserDisplayName } from "./user-display-name";

const profileFormSchema = z.object({ name: nameSchema });
const passwordFormSchema = z
  .object({
    oldPassword: passwordSchema,
    newPassword: passwordSchema,
    newPasswordConfirmation: passwordSchema,
  })
  .refine(
    ({ newPassword, newPasswordConfirmation }) =>
      newPassword === newPasswordConfirmation,
    {
      error: "Hasła muszą być identyczne.",
      path: ["newPasswordConfirmation"],
    },
  );

export function AccountPage() {
  const { deleteAccount, signOut, updateName, updatePassword, user } =
    useAuth();
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"account" | "preferences">(
    "account",
  );
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name: user ? getUserDisplayName(user) : "" },
  });
  const passwordForm = useForm<z.infer<typeof passwordFormSchema>>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      oldPassword: "",
      newPassword: "",
      newPasswordConfirmation: "",
    },
  });
  const isSubmitting =
    profileForm.formState.isSubmitting ||
    passwordForm.formState.isSubmitting ||
    isDeleting;

  if (!user) return null;
  const userId = user.id;

  async function submitProfile(data: z.infer<typeof profileFormSchema>) {
    profileForm.clearErrors("root");
    try {
      await updateName(data.name);
      profileForm.reset({ name: data.name.trim() });
      toast.add({
        data: { type: "success" },
        description: "Zaktualizowano imię.",
      });
    } catch (error) {
      profileForm.setError("root", {
        message: getAuthErrorMessage(error, "update-name"),
      });
    }
  }

  async function submitPassword(data: z.infer<typeof passwordFormSchema>) {
    passwordForm.clearErrors("root");
    try {
      await updatePassword(data.oldPassword, data.newPassword);
      passwordForm.reset();
      toast.add({
        data: { type: "success" },
        description: "Zmieniono hasło.",
      });
    } catch (error) {
      passwordForm.setError("root", {
        message: getAuthErrorMessage(error, "update-password"),
      });
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
      clearUserMemoryCache(userId);
      navigate("/");
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się wylogować. Spróbuj ponownie.",
      });
    }
  }

  async function handleDeleteAccount() {
    if (deleteConfirmation !== "USUŃ") return;
    setDeleteError(null);
    setIsDeleting(true);
    try {
      await deleteAccount();
      clearDeletedUserLocalData(userId);
      await signOut();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "Nie udało się usunąć konta. Spróbuj ponownie.",
      );
      setIsDeleting(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 sm:px-6 sm:py-10">
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-full bg-secondary">
              <UserRound className="size-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                Ustawienia
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {user.email}
              </p>
            </div>
          </div>
        </header>

        <div
          className="grid grid-cols-2 rounded-lg bg-muted p-1"
          role="tablist"
          aria-label="Ustawienia użytkownika"
        >
          <Button
            type="button"
            variant={activeTab === "account" ? "secondary" : "ghost"}
            className={activeTab === "account" ? "shadow-sm" : undefined}
            role="tab"
            aria-selected={activeTab === "account"}
            onClick={() => setActiveTab("account")}
          >
            Konto
          </Button>
          <Button
            type="button"
            variant={activeTab === "preferences" ? "secondary" : "ghost"}
            className={activeTab === "preferences" ? "shadow-sm" : undefined}
            role="tab"
            aria-selected={activeTab === "preferences"}
            onClick={() => setActiveTab("preferences")}
          >
            Preferencje
          </Button>
        </div>

        {activeTab === "account" ? (
          <>
            <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h2 className="font-semibold">Profil</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  To imię jest widoczne w interfejsie aplikacji.
                </p>
              </div>
              <form
                className="space-y-4"
                onSubmit={profileForm.handleSubmit(submitProfile)}
              >
                <Controller
                  name="name"
                  control={profileForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Imię</FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="text"
                        autoComplete="name"
                        aria-invalid={fieldState.invalid}
                        disabled={isSubmitting}
                        placeholder="Jak mamy się do Ciebie zwracać?"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                {profileForm.formState.errors.root && (
                  <FieldError errors={[profileForm.formState.errors.root]} />
                )}
                <Button
                  type="submit"
                  disabled={!profileForm.formState.isDirty || isSubmitting}
                >
                  {profileForm.formState.isSubmitting
                    ? "Zapisywanie…"
                    : "Zapisz imię"}
                </Button>
              </form>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
              <div className="mb-5">
                <h2 className="font-semibold">Hasło</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ustaw nowe hasło do logowania na konto.
                </p>
              </div>
              <form
                className="space-y-4"
                onSubmit={passwordForm.handleSubmit(submitPassword)}
              >
                <FieldGroup>
                  <Controller
                    name="oldPassword"
                    control={passwordForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={field.name}>
                          Obecne hasło
                        </FieldLabel>
                        <Input
                          {...field}
                          id={field.name}
                          type="password"
                          aria-invalid={fieldState.invalid}
                          autoComplete="current-password"
                          disabled={isSubmitting}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="newPassword"
                    control={passwordForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={field.name}>Nowe hasło</FieldLabel>
                        <Input
                          {...field}
                          id={field.name}
                          type="password"
                          aria-invalid={fieldState.invalid}
                          autoComplete="new-password"
                          disabled={isSubmitting}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                  <Controller
                    name="newPasswordConfirmation"
                    control={passwordForm.control}
                    render={({ field, fieldState }) => (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={field.name}>
                          Powtórz nowe hasło
                        </FieldLabel>
                        <Input
                          {...field}
                          id={field.name}
                          type="password"
                          aria-invalid={fieldState.invalid}
                          autoComplete="new-password"
                          disabled={isSubmitting}
                        />
                        {fieldState.invalid && (
                          <FieldError errors={[fieldState.error]} />
                        )}
                      </Field>
                    )}
                  />
                </FieldGroup>
                {passwordForm.formState.errors.root && (
                  <FieldError errors={[passwordForm.formState.errors.root]} />
                )}
                <Button
                  type="submit"
                  disabled={!passwordForm.formState.isDirty || isSubmitting}
                >
                  {passwordForm.formState.isSubmitting
                    ? "Zapisywanie…"
                    : "Zmień hasło"}
                </Button>
              </form>
            </section>

            <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
              <h2 className="font-semibold">Sesja</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Zakończ bieżącą sesję na tym urządzeniu.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-5"
                disabled={isSubmitting}
                onClick={() => void handleSignOut()}
              >
                <LogOut /> Wyloguj
              </Button>
            </section>

            <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 sm:p-6">
              <h2 className="font-semibold text-destructive">
                Strefa niebezpieczna
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Usunięcie konta jest trwałe. Wszystkie moduły, rozdziały,
                tematy, statystyki oraz zdjęcia zostaną bezpowrotnie usunięte.
              </p>
              <Button
                type="button"
                variant="destructive"
                className="mt-5"
                disabled={isSubmitting}
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 /> Usuń konto
              </Button>
            </section>
          </>
        ) : (
          <PreferencesPanel userId={userId} />
        )}
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (isDeleting) return;
          setDeleteOpen(open);
          if (!open) {
            setDeleteConfirmation("");
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trwale usunąć konto?</AlertDialogTitle>
            <AlertDialogDescription>
              Tej operacji nie można cofnąć. Wpisz USUŃ, aby potwierdzić
              usunięcie konta wraz ze wszystkimi danymi i zdjęciami.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field data-invalid={Boolean(deleteError)}>
            <FieldLabel htmlFor="delete-account-confirmation">
              Potwierdzenie
            </FieldLabel>
            <Input
              id="delete-account-confirmation"
              value={deleteConfirmation}
              onChange={(event) => {
                setDeleteConfirmation(event.target.value);
                setDeleteError(null);
              }}
              autoComplete="off"
              autoFocus
              disabled={isDeleting}
              placeholder="USUŃ"
              aria-invalid={Boolean(deleteError)}
            />
            {deleteError && <FieldError>{deleteError}</FieldError>}
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Anuluj</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteConfirmation !== "USUŃ" || isDeleting}
              onClick={() => void handleDeleteAccount()}
            >
              {isDeleting ? "Usuwanie…" : "Usuń konto na zawsze"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
