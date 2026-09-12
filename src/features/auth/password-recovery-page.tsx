import * as z from "zod";

import { Controller, useForm } from "react-hook-form";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthErrorMessage } from "./auth-error";
import { passwordSchema } from "@/features/auth/auth-schema";
import { useAuth } from "./auth-context";
import { zodResolver } from "@hookform/resolvers/zod";

const formSchema = z
  .object({
    password: passwordSchema,
    passwordVerification: passwordSchema,
  })
  .refine((val) => val.password === val.passwordVerification, {
    error: "Hasła muszą być identyczne",
    path: ["passwordVerification"],
  });

export function PasswordRecoveryPage() {
  const { completePasswordRecovery } = useAuth();

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
      passwordVerification: "",
    },
  });

  async function submit(data: z.infer<typeof formSchema>) {
    form.clearErrors("root");

    try {
      await completePasswordRecovery(data.password);
    } catch (caughtError) {
      form.setError("root", {
        message: getAuthErrorMessage(caughtError, "recover-password"),
      });
    }
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 px-5">
      <section className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Ustaw nowe hasło</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nowe hasło musi mieć co najmniej 6 znaków.
        </p>
        <form className="mt-6 space-y-4" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState, formState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Nowe hasło</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    aria-invalid={fieldState.invalid}
                    autoComplete="new-password"
                    autoFocus
                    disabled={formState.isSubmitting}
                    minLength={6}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="passwordVerification"
              control={form.control}
              render={({ field, fieldState, formState }) => (
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
                    disabled={formState.isSubmitting}
                    minLength={6}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          {form.formState.errors.root && (
            <FieldError errors={[form.formState.errors.root]} />
          )}
          <Button
            type="submit"
            className="w-full"
            disabled={
              !(
                form.formState.dirtyFields.password &&
                form.formState.dirtyFields.passwordVerification
              ) || form.formState.isSubmitting
            }
          >
            {form.formState.isSubmitting ? "Zapisywanie…" : "Zapisz nowe hasło"}
          </Button>
        </form>
      </section>
    </main>
  );
}
