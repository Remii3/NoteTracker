import * as z from "zod";

import { Controller, useForm, useWatch } from "react-hook-form";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  emailSchema,
  nameSchema,
  passwordSchema,
} from "@/features/auth/auth-schema";

import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/features/theme";
import { getAuthErrorMessage } from "./auth-error";
import { TurnstileWidget } from "./turnstile-widget";
import { useAuth } from "./auth-context";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z
  .discriminatedUnion("mode", [
    z.object({
      mode: z.literal("sign-in"),
      email: emailSchema,
      password: passwordSchema,
    }),
    z.object({
      mode: z.literal("sign-up"),
      email: emailSchema,
      name: nameSchema,
      password: passwordSchema,
      passwordConfirmation: passwordSchema,
    }),
    z.object({
      mode: z.literal("reset"),
      email: emailSchema,
    }),
  ])
  .refine(
    (data) =>
      data.mode !== "sign-up" || data.password === data.passwordConfirmation,
    {
      error: "Hasła muszą być identyczne.",
      path: ["passwordConfirmation"],
    },
  );

type AuthFormValues = z.infer<typeof formSchema>;
type Mode = AuthFormValues["mode"];

export function AuthPage() {
  const { requestPasswordReset, signIn, signUp } = useAuth();
  const [message, setMessage] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const form = useForm<AuthFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: "sign-in",
      email: "",
      password: "",
    },
  });

  const mode = useWatch({
    control: form.control,
    name: "mode",
  });

  function changeMode(nextMode: Mode) {
    setMessage(null);
    setCaptchaToken(null);
    setCaptchaResetKey((key) => key + 1);

    form.clearErrors();

    if (nextMode === "sign-in") {
      form.reset({
        mode: "sign-in",
        email: form.getValues("email"),
        password: "",
      });

      return;
    }

    if (nextMode === "sign-up") {
      form.reset({
        mode: "sign-up",
        email: form.getValues("email"),
        name: "",
        password: "",
        passwordConfirmation: "",
      });

      return;
    }

    form.reset({
      mode: "reset",
      email: form.getValues("email"),
    });
  }

  async function handleSubmit(data: AuthFormValues) {
    form.clearErrors("root");
    setMessage(null);
    if (!captchaToken) {
      form.setError("root", {
        message: "Potwierdź, że nie jesteś robotem.",
      });
      return;
    }

    try {
      if (data.mode === "reset") {
        await requestPasswordReset(data.email, captchaToken);
        setMessage("Wysłaliśmy link do ustawienia nowego hasła.");
      } else if (data.mode === "sign-in") {
        await signIn(data.email, data.password, captchaToken);
      } else {
        const result = await signUp(
          data.name.trim(),
          data.email,
          data.password,
          captchaToken,
        );
        if (result.confirmationRequired) {
          setMessage(
            "Sprawdź skrzynkę e-mail i potwierdź rejestrację, a następnie się zaloguj.",
          );
        }
      }
    } catch (caughtError) {
      form.setError("root", {
        message: getAuthErrorMessage(
          caughtError,
          data.mode === "reset" ? "request-password-reset" : data.mode,
        ),
      });
    } finally {
      setCaptchaToken(null);
      setCaptchaResetKey((key) => key + 1);
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-5 py-10">
      <ThemeToggle className="fixed top-4 right-4 z-10 border bg-background shadow-xs" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <BookOpen className="size-5" />
          </span>
          <div>
            <p className="font-semibold leading-tight">NoteTracker</p>
            <p className="text-xs text-foreground/70">Twoja przestrzeń nauki</p>
          </div>
        </div>
        <section className="rounded-2xl border bg-background p-6 shadow-sm">
          <h1 className="text-2xl font-semibold">
            {mode === "sign-in"
              ? "Zaloguj się"
              : mode === "sign-up"
                ? "Utwórz konto"
                : "Zresetuj hasło"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "sign-in"
              ? "Wróć do swoich rozdziałów i notatek."
              : mode === "sign-up"
                ? "Zacznij budować własną bazę wiedzy."
                : "Podaj e-mail przypisany do konta."}
          </p>
          <form
            className="mt-6 space-y-4"
            onSubmit={form.handleSubmit(handleSubmit)}
          >
            <FieldGroup>
              {mode === "sign-up" && (
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState, formState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Imię</FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="text"
                        aria-invalid={fieldState.invalid}
                        autoComplete="name"
                        autoFocus
                        disabled={formState.isSubmitting}
                        placeholder="Jak mamy się do Ciebie zwracać?"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              )}
              <Controller
                name={"email"}
                control={form.control}
                render={({ field, fieldState, formState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                    <Input
                      {...field}
                      id={field.name}
                      type="email"
                      autoComplete="email"
                      autoFocus={mode === "sign-in"}
                      aria-invalid={fieldState.invalid}
                      disabled={formState.isSubmitting}
                      placeholder="ty@example.com"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              {mode !== "reset" && (
                <Controller
                  name={"password"}
                  control={form.control}
                  render={({ field, fieldState, formState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Hasło</FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="password"
                        autoComplete={
                          mode === "sign-in"
                            ? "current-password"
                            : "new-password"
                        }
                        aria-invalid={fieldState.invalid}
                        disabled={formState.isSubmitting}
                        minLength={6}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              )}
              {mode === "sign-up" && (
                <Controller
                  name="passwordConfirmation"
                  control={form.control}
                  render={({ field, fieldState, formState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>
                        Powtórz hasło
                      </FieldLabel>
                      <Input
                        {...field}
                        id={field.name}
                        type="password"
                        autoComplete="new-password"
                        aria-invalid={fieldState.invalid}
                        disabled={formState.isSubmitting}
                        minLength={6}
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              )}
              <TurnstileWidget
                action={
                  mode === "sign-in"
                    ? "login"
                    : mode === "sign-up"
                      ? "signup"
                      : "password-reset"
                }
                onTokenChange={setCaptchaToken}
                resetKey={captchaResetKey}
              />
              {form.formState.errors.root && (
                <FieldError errors={[form.formState.errors.root]} />
              )}
              {message && (
                <p role="status" className="text-sm text-primary">
                  {message}
                </p>
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={!captchaToken || form.formState.isSubmitting}
              >
                {form.formState.isSubmitting
                  ? "Proszę czekać…"
                  : mode === "sign-in"
                    ? "Zaloguj się"
                    : mode === "sign-up"
                      ? "Utwórz konto"
                      : "Wyślij link"}
              </Button>
            </FieldGroup>
          </form>
          {mode === "sign-in" && (
            <p className="mt-5 text-center">
              <Button
                variant={"link"}
                type="button"
                disabled={form.formState.isSubmitting}
                onClick={() => changeMode("reset")}
              >
                Nie pamiętasz hasła?
              </Button>
            </p>
          )}
          {mode === "reset" ? (
            <p className="mt-5 text-center">
              <Button
                variant={"link"}
                type="button"
                disabled={form.formState.isSubmitting}
                onClick={() => changeMode("sign-in")}
              >
                Wróć do logowania
              </Button>
            </p>
          ) : (
            <p className="mt-5 text-center">
              {mode === "sign-in" ? "Nie masz konta?" : "Masz już konto?"}{" "}
              <Button
                type="button"
                variant={"link"}
                disabled={form.formState.isSubmitting}
                onClick={() =>
                  changeMode(mode === "sign-in" ? "sign-up" : "sign-in")
                }
              >
                {mode === "sign-in" ? "Zarejestruj się" : "Zaloguj się"}
              </Button>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
