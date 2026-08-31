# Rozwiązywanie problemów

## Aplikacja zatrzymuje się na ekranie ładowania

1. Sprawdź konsolę i zakładkę Network w DevTools.
2. Potwierdź obecność `VITE_SUPABASE_URL` i
   `VITE_SUPABASE_PUBLISHABLE_KEY` w `.env.local`.
3. Po zmianie pliku env uruchom ponownie `npm run dev`.
4. Sprawdź status usług Supabase oraz błędy Auth i REST w dashboardzie.

## Logowanie wraca na nieprawidłowy adres

Dodaj lokalny i produkcyjny URL do Site URL oraz Redirect URLs w konfiguracji
Supabase Auth. Sprawdź także, czy protokół, domena i port są identyczne z
adresem w przeglądarce.

## Zdjęcia zwracają 401

- wyloguj się i zaloguj ponownie, aby odświeżyć sesję;
- sprawdź, czy frontend wysyła nagłówek `Authorization: Bearer ...`;
- sprawdź `SUPABASE_URL` i `SUPABASE_PUBLISHABLE_KEY` w sekretach Workera;
- przejrzyj błędy: `npx wrangler tail notetracker-topic-images --status error`.

## Przeglądarka blokuje zdjęcia przez CORS

Dodaj dokładny origin, bez końcowego ukośnika i ścieżki, do sekretu
`ALLOWED_ORIGINS`. Wartości rozdziel przecinkami. Następnie wykonaj ponowny
deploy Workera.

```text
http://localhost:5173,https://twoja-domena.example
```

Nie używaj `*`, ponieważ endpointy przyjmują uwierzytelnione żądania.

## Worker zwraca 429

To limit tempa chroniący koszty i endpointy, nie limit liczby plików. Odczekaj
do następnego okna limitu i sprawdź, czy frontend nie zapętla żądań. Aktualne
wartości znajdują się w `workers/topic-images/wrangler.jsonc`.

## Upload zwraca „Invalid image”

Worker przyjmuje WebP o dodatnich wymiarach i maksymalnie 10 MB na pojedyncze
żądanie. Liczba zdjęć użytkownika nie jest ograniczona. Sprawdź wynik
przetwarzania obrazu w `src/features/notes/lib/prepare-image.ts`.

## Brak zdarzeń w Sentry

`VITE_SENTRY_DSN` musi być dostępne podczas buildu, nie dopiero po wdrożeniu.
Po zmianie zmiennej wykonaj nowy deploy. Source mapy wymagają dodatkowo
`SENTRY_AUTH_TOKEN`, `SENTRY_ORG` i `SENTRY_PROJECT`. Szczegóły są w
[`monitoring.md`](monitoring.md).

## Szybka diagnostyka

```bash
npm test
npm run lint
npm run build

cd workers/topic-images
npm run typecheck
npx wrangler whoami
npx wrangler tail notetracker-topic-images --status error
```

Nie wklejaj do zgłoszeń tokenów JWT, zawartości `.env.local`, sekretów Workera
ani pełnej treści prywatnych notatek.
