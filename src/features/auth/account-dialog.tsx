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

import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getUserDisplayName } from "./user-display-name";
import { toast } from "sonner";
import { useAuth } from "./auth-context";
import { zodResolver } from "@hookform/resolvers/zod";

const optionalPassword = z.union([
  z.literal(""),
  z.string().min(6, {
    error: "Hasło musi mieć przynajmniej 6 znaków.",
  }),
]);

const formSchema = z
  .object({
    name: z.string().trim().min(1, { error: "Podaj imię." }),
    newPassword: optionalPassword,
    oldPassword: optionalPassword,
  })
  .superRefine(({ newPassword, oldPassword }, context) => {
    if (newPassword && !oldPassword) {
      context.addIssue({
        code: "custom",
        message: "Podaj stare hasło.",
        path: ["oldPassword"],
      });
    }
    if (oldPassword && !newPassword) {
      context.addIssue({
        code: "custom",
        message: "Podaj nowe hasło.",
        path: ["newPassword"],
      });
    }
  });

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { updateName, updatePassword, user } = useAuth();
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: user ? getUserDisplayName(user) : "",
      newPassword: "",
      oldPassword: "",
    },
  });

  async function submit(data: z.infer<typeof formSchema>) {
    form.clearErrors();

    try {
      if (data.newPassword) {
        await updatePassword(data.oldPassword, data.newPassword);
      }
      await updateName(data.name);
      toast.success("Zaktualizowano konto.");
      onClose();
    } catch (error) {
      form.setError("root", {
        message:
          error instanceof Error
            ? error.message
            : "Nie udało się aktualizować danych",
      });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ustawienia konta</DialogTitle>
          <DialogDescription>
            Zmień imię lub ustaw nowe hasło.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState, formState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Imię</FieldLabel>
                  <Input
                    {...field}
                    type="text"
                    autoComplete="name"
                    aria-invalid={fieldState.invalid}
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
            <Collapsible>
              <CollapsibleTrigger
                render={<Button variant="ghost" className="w-full" />}
              >
                Zmień hasło
                <ChevronDown className="ml-auto group-data-panel-open/button:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col items-start gap-2 p-2.5 pt-0 text-sm">
                <Controller
                  name="newPassword"
                  control={form.control}
                  render={({ field, fieldState, formState }) => (
                    <Field data-invalid={fieldState.invalid} className="mt-2">
                      <FieldLabel htmlFor={field.name}>Nowe hasło</FieldLabel>
                      <Input
                        {...field}
                        type="password"
                        aria-invalid={fieldState.invalid}
                        disabled={formState.isSubmitting}
                        autoComplete="new-password"
                        placeholder="Pozostaw puste bez zmiany"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
                <Controller
                  name="oldPassword"
                  control={form.control}
                  render={({ field, fieldState, formState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={field.name}>Stare hasło</FieldLabel>
                      <Input
                        {...field}
                        type="password"
                        aria-invalid={fieldState.invalid}
                        autoComplete="current-password"
                        disabled={formState.isSubmitting}
                        placeholder="Pozostaw puste bez zmiany"
                      />
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
          {form.formState.errors.root && (
            <FieldError errors={[form.formState.errors.root]} />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button
              type="submit"
              disabled={!form.formState.isDirty || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? "Zapisywanie…" : "Zapisz"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
