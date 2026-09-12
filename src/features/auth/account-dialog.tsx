import * as z from "zod";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Controller, useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { nameSchema, passwordSchema } from "@/features/auth/auth-schema";

import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getAuthErrorMessage } from "./auth-error";
import { getUserDisplayName } from "./user-display-name";
import { toast } from "sonner";
import { useAuth } from "./auth-context";
import { zodResolver } from "@hookform/resolvers/zod";

const profileFormSchema = z.object({
  name: nameSchema,
});

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

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { updateName, updatePassword, user } = useAuth();
  const profileForm = useForm<z.infer<typeof profileFormSchema>>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: user ? getUserDisplayName(user) : "",
    },
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
    profileForm.formState.isSubmitting || passwordForm.formState.isSubmitting;

  async function submitProfile(data: z.infer<typeof profileFormSchema>) {
    profileForm.clearErrors("root");

    try {
      await updateName(data.name);
      toast.success("Zaktualizowano imię.");
      onClose();
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
      toast.success("Zmieniono hasło.");
      onClose();
    } catch (error) {
      passwordForm.setError("root", {
        message: getAuthErrorMessage(error, "update-password"),
      });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ustawienia konta</DialogTitle>
          <DialogDescription>
            Zmień imię lub ustaw nowe hasło.
          </DialogDescription>
        </DialogHeader>
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
                  autoFocus
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
        <Collapsible>
          <CollapsibleTrigger
            render={
              <Button
                variant="ghost"
                className="w-full"
                disabled={isSubmitting}
              />
            }
          >
            Zmień hasło
            <ChevronDown className="ml-auto group-data-panel-open/button:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="p-2.5 pt-0 text-sm">
            <form
              className="space-y-4"
              onSubmit={passwordForm.handleSubmit(submitPassword)}
            >
              <FieldGroup>
                <Controller
                  name="oldPassword"
                  control={passwordForm.control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid} className="mt-2">
                      <FieldLabel htmlFor={field.name}>Stare hasło</FieldLabel>
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
          </CollapsibleContent>
        </Collapsible>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={onClose}
          >
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
