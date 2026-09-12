import z from "zod";

export const emailSchema = z
  .string()
  .trim()
  .pipe(z.email({ error: "Podaj poprawny adres." }));
export const nameSchema = z.string().trim().min(1, { error: "Podaj imię." });
export const passwordSchema = z.string().min(6, {
  error: "Hasło musi mieć przynajmniej 6 znaków.",
});
