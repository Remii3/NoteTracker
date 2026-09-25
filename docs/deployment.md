# Wdrożenie

Frontend i Worker są wdrażane niezależnie. Zmiana adresu Workera lub originu
frontendu wymaga aktualizacji obu stron.

## Frontend — Vercel

Skonfiguruj projekt jako Vite z katalogiem głównym repozytorium.

W ustawieniach środowiska dodaj:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_R2_IMAGES_API_URL
VITE_QUESTION_GENERATOR_API_URL
VITE_TURNSTILE_SITE_KEY
VITE_SENTRY_DSN                 # opcjonalne
VITE_SENTRY_RELEASE             # opcjonalne
SENTRY_AUTH_TOKEN               # opcjonalny sekret builda
SENTRY_ORG                      # wymagane do source map
SENTRY_PROJECT                  # wymagane do source map
```

Komenda instalacji to `pnpm install --frozen-lockfile`, komenda buildu to
`pnpm build`, a katalog wynikowy to `dist`.

Po zmianie zmiennych wykonaj nowy deploy — Vite wstawia wartości `VITE_*` w
czasie budowania. `vercel.json` zapewnia fallback SPA i nagłówki
bezpieczeństwa.

Build generuje również `manifest.webmanifest` oraz `sw.js`. Vercel nie może
długotrwale cache'ować tych dwóch plików; reguły w `vercel.json` wymuszają ich
rewalidację. Wersjonowane pliki z `/assets` mogą być cache'owane bezterminowo.

Aktualizacja service workera oczekuje na zgodę użytkownika. Po wdrożeniu nowej
wersji aplikacja pokazuje komunikat z akcją odświeżenia, dzięki czemu nie
przerywa automatycznie edycji notatki ani budowania planu egzaminu.

## Zdjęcia — Cloudflare Worker

Pierwsze wdrożenie wykonaj według
[`workers/topic-images/README.md`](../workers/topic-images/README.md). Przy
kolejnych zmianach:

```bash
pnpm --filter notetracker-topic-images-worker typecheck
pnpm --filter notetracker-topic-images-worker exec wrangler deploy --dry-run
pnpm --filter notetracker-topic-images-worker deploy
```

Nie uruchamiaj `wrangler types` w tym projekcie. Typy środowiska są utrzymywane
bez generowanego pliku przez `@cloudflare/workers-types` oraz interfejs `Env`
w kodzie Workera.

## Pytania AI — Cloudflare Worker

Pierwsze wdrożenie wykonaj według
[`workers/question-generator/README.md`](../workers/question-generator/README.md).
Klucz `OPENAI_API_KEY` musi być sekretem Cloudflare, a model i limit tematów
są zwykłymi zmiennymi w `wrangler.jsonc`. Następnie ustaw publiczny adres
Workera w `VITE_QUESTION_GENERATOR_API_URL` i przebuduj frontend.

```bash
pnpm --filter notetracker-question-generator-worker typecheck
pnpm --filter notetracker-question-generator-worker exec wrangler deploy --dry-run
pnpm --filter notetracker-question-generator-worker deploy
```

## Checklista przed wdrożeniem

- working tree zawiera wyłącznie zamierzone zmiany;
- `pnpm test`, `pnpm lint`, `pnpm format:check` i `pnpm build` kończą
  się powodzeniem;
- Worker przechodzi `pnpm --filter notetracker-topic-images-worker typecheck`
  i dry run;
- Worker generatora pytań przechodzi typecheck i dry run;
- wymagane skrypty SQL zostały sprawdzone na projekcie testowym;
- wykonano backup przed zmianą schematu;
- `Authentication > URL Configuration` w Supabase zawiera produkcyjny origin
  jako `Site URL` oraz `<origin>/update-password` na liście `Redirect URLs`;
- widget Cloudflare Turnstile zawiera produkcyjną domenę frontendu, a jego
  secret i provider są skonfigurowane w
  `Authentication > Bot and Abuse Protection` w Supabase;
- `VITE_TURNSTILE_SITE_KEY` zawiera publiczny site key tego samego widgetu;
- `ALLOWED_ORIGINS` zawiera dokładny produkcyjny origin Vercel;
- bucket `notetracker-images` nie ma publicznego dostępu;
- sekrety nie znajdują się w repozytorium ani zmiennych `VITE_*`;
- `MAX_TOPICS_PER_GENERATION` ma oczekiwaną wartość dla aktualnego pakietu;

## Smoke test po wdrożeniu

1. Otwórz aplikację w prywatnym oknie i sprawdź Turnstile oraz rejestrację lub
   logowanie.
2. Utwórz rozdział i temat, zapisz sformatowaną treść, odśwież stronę i sprawdź
   dane.
3. Dodaj, otwórz, przestaw i usuń zdjęcie.
4. Dodaj pytanie i ukończ krótką sesję nauki.
5. Wygeneruj pytania dla tematu, wykonaj reroll, usuń odpowiedź, zatwierdź
   partię i sprawdź podsumowanie pominiętych duplikatów.
6. Sprawdź konsolę przeglądarki, Sentry oraz błędy Workerów w Cloudflare.
7. Potwierdź, że niezalogowane żądanie do Workera zwraca `401`, a origin spoza
   allowlisty nie otrzymuje nagłówka CORS.
8. Zainstaluj PWA, uruchom je w osobnym oknie i sprawdź ikonę oraz ekran
   startowy.
9. Oznacz moduł jako dostępny offline, odłącz sieć i sprawdź nawigację oraz
   odczyt jego tematów. Powtórz próbę z opcją zdjęć wyłączoną i włączoną.
10. Zmień notatkę offline, przywróć sieć i sprawdź automatyczny zapis oraz
    zachowanie szkicu w przypadku konfliktu z wersją serwerową. Wywołaj konflikt
    zmianą tej samej notatki w drugiej karcie i sprawdź obie decyzje w dialogu.
11. Wdróż kolejną wersję i sprawdź, że aplikacja proponuje aktualizację zamiast
    przeładować się automatycznie.

## Rollback

Frontend przywróć przez wybór ostatniego poprawnego deploymentu w Vercel.
Worker można cofnąć interaktywnie:

```bash
cd workers/topic-images
pnpm exec wrangler versions list
pnpm exec wrangler rollback
```

Nie cofaj migracji SQL bez przygotowanego i przetestowanego skryptu odwrotnego.
W przypadku problemu z danymi użyj procedury z
[`backup-and-restore.md`](backup-and-restore.md).
