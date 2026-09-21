# Wdrożenie

Frontend i Worker są wdrażane niezależnie. Zmiana adresu Workera lub originu
frontendu wymaga aktualizacji obu stron.

## Frontend — Vercel

Skonfiguruj projekt jako Vite z katalogiem głównym repozytorium. Komenda buildu
to `npm run build`, a katalog wynikowy to `dist`.

W ustawieniach środowiska dodaj:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_R2_IMAGES_API_URL
VITE_TURNSTILE_SITE_KEY
VITE_SENTRY_DSN                 # opcjonalne
VITE_SENTRY_RELEASE             # opcjonalne
SENTRY_AUTH_TOKEN               # opcjonalny sekret builda
SENTRY_ORG                      # wymagane do source map
SENTRY_PROJECT                  # wymagane do source map
```

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
cd workers/topic-images
npm ci
npm run typecheck
npx wrangler deploy --dry-run
npm run deploy
```

Nie uruchamiaj `wrangler types` w tym projekcie. Typy środowiska są utrzymywane
bez generowanego pliku przez `@cloudflare/workers-types` oraz interfejs `Env`
w kodzie Workera.

## Checklista przed wdrożeniem

- working tree zawiera wyłącznie zamierzone zmiany;
- `npm test`, `npm run lint`, `npm run format:check` i `npm run build` kończą
  się powodzeniem;
- Worker przechodzi `npm run typecheck` i dry run;
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
- sekrety nie znajdują się w repozytorium ani zmiennych `VITE_*`.

## Smoke test po wdrożeniu

1. Otwórz aplikację w prywatnym oknie i sprawdź Turnstile oraz rejestrację lub
   logowanie.
2. Utwórz rozdział i temat, zapisz sformatowaną treść, odśwież stronę i sprawdź
   dane.
3. Dodaj, otwórz, przestaw i usuń zdjęcie.
4. Dodaj pytanie i ukończ krótką sesję nauki.
5. Sprawdź konsolę przeglądarki, Sentry oraz błędy Workera w Cloudflare.
6. Potwierdź, że niezalogowane żądanie do Workera zwraca `401`, a origin spoza
   allowlisty nie otrzymuje nagłówka CORS.
7. Zainstaluj PWA, uruchom je w osobnym oknie i sprawdź ikonę oraz ekran
   startowy.
8. Po wcześniejszym otwarciu aplikacji odłącz sieć: shell powinien się otworzyć,
   a interfejs powinien pokazać stan offline bez potwierdzania zapisów.
9. Wdróż kolejną wersję i sprawdź, że aplikacja proponuje aktualizację zamiast
   przeładować się automatycznie.

## Rollback

Frontend przywróć przez wybór ostatniego poprawnego deploymentu w Vercel.
Worker można cofnąć interaktywnie:

```bash
cd workers/topic-images
npx wrangler versions list
npx wrangler rollback
```

Nie cofaj migracji SQL bez przygotowanego i przetestowanego skryptu odwrotnego.
W przypadku problemu z danymi użyj procedury z
[`backup-and-restore.md`](backup-and-restore.md).
