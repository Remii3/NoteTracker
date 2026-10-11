# Sylabio — strona marketingowa

Statyczna strona Astro dla `sylabio.com`. Właściwa aplikacja pozostaje w katalogu głównym repozytorium i docelowo działa pod `app.sylabio.com`.

## Praca lokalna

Z katalogu głównego repozytorium:

```bash
pnpm marketing:dev
pnpm marketing:check
pnpm marketing:build
```

## Wdrożenie na Vercel

Utwórz osobny projekt Vercel z tego samego repozytorium i ustaw:

- Root Directory: `marketing`
- Framework Preset: Astro
- domena główna: `sylabio.com`
- przekierowanie: `www.sylabio.com` → `sylabio.com`

Drugi projekt Vercel obsługuje aplikację z katalogu głównego pod `app.sylabio.com`.

## Elementy wymagające uzupełnienia przed publikacją

- zmień tymczasowy e-mail `test@gmail.com` w `src/config.ts`,
- uzupełnij dane administratora i usługodawcy,
- zweryfikuj prawnie politykę prywatności oraz regulamin,
- potwierdź docelowe ścieżki `/login` i `/register` w aplikacji.
