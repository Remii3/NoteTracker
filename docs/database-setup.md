# Konfiguracja Supabase

## Pełny schemat

Źródłem schematu dla nowych środowisk jest
[`supabase/migrations/20260908155555_initial_schema.sql`](../supabase/migrations/20260908155555_initial_schema.sql).
Zawiera dziewięć tabel aplikacji, indeksy, klucze obce, polityki RLS, funkcje
RPC i obsługę kosza. Schemat odtworzono z kodu aplikacji i skryptów ręcznych,
a następnie wyeksportowano z lokalnego Postgresa. Nie jest to zrzut produkcji.

Migracja zakłada istnienie standardowych elementów Supabase: `auth.users`,
`auth.uid()`, `auth.role()` oraz ról `anon`, `authenticated`, `service_role`.
Nie tworzy kont użytkowników ani plików R2.

## Lokalne środowisko Supabase

Wymagane: Docker i Supabase CLI. Konfiguracja w `supabase/config.toml`
używa Postgresa 17 oraz adresu aplikacji `http://localhost:5173`.

```bash
supabase start
supabase db reset --local
supabase status
```

`db reset --local` usuwa dane lokalnego środowiska i odtwarza migracje.
Uzupełnij `.env.local` adresem API i publicznym kluczem lokalnego projektu,
a następnie uruchom `pnpm dev`.

## Nowy projekt hostowany

1. Utwórz pusty projekt Supabase i włącz logowanie e-mail/hasło.
2. Dodaj adres aplikacji do konfiguracji redirect URLs w Auth.
3. Połącz CLI z nowym projektem i zastosuj migracje:

   ```bash
   supabase link --project-ref <NOWY_PROJECT_REF>
   supabase db push
   ```

4. Sprawdź, czy schema `public` jest wystawiona przez Data API. Schemat
   `private` pozostaje poza listą wystawianych schematów.
5. Ustaw `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY` we frontendzie.
   Sekret administracyjny nie może trafić do zmiennych `VITE_*`.
6. Skonfiguruj Worker i R2 zgodnie z jego README, a następnie wykonaj test
   logowania, notatek, pytań i zdjęć.

## Istniejąca produkcja

Nie uruchamiaj migracji bazowej na bazie z istniejącymi tabelami.
Najpierw wykonaj backup i porównaj rzeczywisty schemat z migracją na osobnym
środowisku. Uzgodnij różnice oraz historię migracji przed użyciem `db push`.
Migracja bazowa nie zastępuje backupu danych.

Katalog `supabase/manual` pozostaje archiwum wcześniejszych zmian i zawiera
również nieaktualne warianty. Nie uruchamiaj jego plików po migracji bazowej.
Kolejne zmiany zapisuj jako nowe migracje tworzone przez
`supabase migration new <nazwa>`.

## Automatyczna weryfikacja

```bash
pnpm test:db
```

Komenda tworzy jednorazowy kontener Postgresa 17, odtwarza wszystkie migracje
od pustej bazy, wykonuje `supabase/tests/rls.sql`, a na końcu usuwa kontener.
Nie używa danych, portów ani adresu projektu produkcyjnego.

Testy sprawdzają:

- RLS na wszystkich dziewięciu tabelach i brak anonimowego dostępu;
- odczyt, modyfikację i usuwanie rekordów przez dwa różne konta;
- zakaz zmiany właściciela i podpinania tematu pod cudzy rozdział;
- ochronę operacji kosza przed użyciem identyfikatorów innego użytkownika;
- tworzenie pytań i sesji, odczyt galerii oraz przenoszenie, przywracanie
  i trwałe usuwanie pytania.

`auth-fixture.sql` emuluje w tym teście tylko kontrakt Auth potrzebny RLS.
Test działa na prawdziwym Postgresie, ale nie uruchamia Supabase Auth,
PostgREST ani R2. Pełny test logowania i zdjęć wykonuj dodatkowo na środowisku
integracyjnym. Pomocniczy audyt schematu jest w
`supabase/manual/audit-security.sql`.

Oficjalny opis procesu:
[Database migrations](https://supabase.com/docs/guides/local-development/database-migrations).
