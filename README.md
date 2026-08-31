# NoteTracker

NoteTracker to aplikacja do tworzenia hierarchicznych notatek i nauki na ich
podstawie. Użytkownik może organizować materiał w rozdziały i tematy, edytować
treść w TipTap, dodawać zdjęcia oraz korzystać z banku pytań i sesji nauki.

## Stos technologiczny

- React 19, TypeScript, Vite i Tailwind CSS;
- Supabase Auth, Postgres, REST API i RLS;
- Cloudflare Worker oraz prywatny bucket R2 dla zdjęć;
- Vercel dla frontendu;
- Sentry i Cloudflare Observability dla monitoringu.

Opis granic systemu i przepływów danych znajduje się w
[`docs/architecture.md`](docs/architecture.md).

## Uruchomienie lokalne

Wymagane są Node.js 22+ i npm. Projekt korzysta z dwóch osobnych paczek npm:
aplikacji oraz Workera.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Uzupełnij w `.env.local`:

| Zmienna                         | Wymagana      | Znaczenie                               |
| ------------------------------- | ------------- | --------------------------------------- |
| `VITE_SUPABASE_URL`             | tak           | URL projektu Supabase                   |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | tak           | publiczny klucz klienta Supabase        |
| `VITE_R2_IMAGES_API_URL`        | tak dla zdjęć | URL Workera Cloudflare                  |
| `VITE_SENTRY_DSN`               | nie           | publiczny identyfikator projektu Sentry |
| `VITE_SENTRY_RELEASE`           | nie           | identyfikator wydania widoczny w Sentry |

Zmienne z prefiksem `VITE_` trafiają do kodu przeglądarki. Nie umieszczaj w
nich `service_role`, prywatnych kluczy ani tokenów administracyjnych.

Konfiguracja bazy jest opisana w
[`docs/database-setup.md`](docs/database-setup.md), a lokalne uruchomienie
Workera w [`workers/topic-images/README.md`](workers/topic-images/README.md).

## Komendy

| Komenda                | Działanie                                         |
| ---------------------- | ------------------------------------------------- |
| `npm run dev`          | uruchamia frontend deweloperski                   |
| `npm run build`        | sprawdza TypeScript i buduje produkcyjny frontend |
| `npm run preview`      | uruchamia lokalny podgląd buildu                  |
| `npm test`             | wykonuje testy logiki jeden raz                   |
| `npm run test:watch`   | uruchamia testy w trybie obserwowania             |
| `npm run lint`         | uruchamia ESLint                                  |
| `npm run format:check` | sprawdza formatowanie Prettierem                  |

Przed wysłaniem zmian uruchom:

```bash
npm test
npm run lint
npm run format:check
npm run build
```

Po zmianie Workera dodatkowo uruchom:

```bash
cd workers/topic-images
npm ci
npm run typecheck
npx wrangler deploy --dry-run
```

Projekt używa `@cloudflare/workers-types`; nie generujemy i nie commitujemy
pliku `worker-configuration.d.ts`.

## Wdrożenie i utrzymanie

- [`docs/deployment.md`](docs/deployment.md) — konfiguracja Vercel, wdrożenie
  Workera, checklista i rollback;
- [`docs/monitoring.md`](docs/monitoring.md) — Sentry, logi i trace'y Workera;
- [`docs/backup-and-restore.md`](docs/backup-and-restore.md) — backup Supabase i
  R2 oraz procedura odtworzenia;
- [`docs/troubleshooting.md`](docs/troubleshooting.md) — typowe problemy i ich
  diagnostyka.

## Struktura repozytorium

```text
src/features/              funkcje biznesowe frontendu
src/lib/                   klienci usług i monitoring
supabase/manual/           ręczne skrypty SQL
workers/topic-images/      Worker obsługujący prywatne zdjęcia R2
docs/                      dokumentacja operacyjna
```

Notatki nie mają autosave. Zmiany w edytorze są utrwalane po użyciu akcji
zapisu.
