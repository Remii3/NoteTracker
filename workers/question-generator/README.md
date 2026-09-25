# Generator pytań AI

Worker uwierzytelnia użytkownika tokenem Supabase, pobiera wyłącznie jego
wybrane tematy przez RLS, generuje propozycje w OpenAI i zapisuje cache zależny
od treści notatki.

Wymagane sekrety:

```sh
pnpm exec wrangler secret put OPENAI_API_KEY
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_PUBLISHABLE_KEY
```

Ustaw `ALLOWED_ORIGINS` w `wrangler.jsonc` na listę originów oddzielonych
przecinkami. Po wdrożeniu dodaj adres Workera do frontendu jako
`VITE_QUESTION_GENERATOR_API_URL`.

Sprawdzenie przed wdrożeniem:

```sh
pnpm typecheck
pnpm exec wrangler deploy --dry-run
```
