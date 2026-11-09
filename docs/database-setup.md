# Konfiguracja Supabase

## Pełny schemat

Źródłem schematu dla nowych i istniejących środowisk jest cały katalog
[`supabase/migrations`](../supabase/migrations), wykonywany rosnąco według
znacznika czasu w nazwie pliku. Pierwszy plik jest migracją bazową, a kolejne
zawierają wszystkie późniejsze zmiany. Sam plik bazowy nie przedstawia dziś
pełnego schematu.

Migracje tworzą obecnie 20 tabel aplikacji, indeksy, klucze obce, polityki RLS,
funkcje RPC i obsługę kosza. Historyczny `supabase/notetracker-schema.sql` nie
jest aktualizowany automatycznie i nie służy do wdrożeń.

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
   supabase migration list
   supabase db push --dry-run
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
również nieaktualne warianty. Nie uruchamiaj jego plików na środowisku
zbudowanym z `supabase/migrations`.
Kolejne zmiany zapisuj jako nowe migracje tworzone przez
`supabase migration new <nazwa>`.

Nie edytuj migracji zastosowanej już na stagingu lub produkcji. Nawet mała
poprawka istniejącej funkcji powinna dostać nową migrację, aby historia lokalna
i zdalna pozostały zgodne.

## Automatyczna weryfikacja

```bash
pnpm test:db
```

Komenda tworzy jednorazowy kontener Postgresa 17, odtwarza wszystkie migracje
od pustej bazy, wykonuje `supabase/tests/rls.sql`, a na końcu usuwa kontener.
Nie używa danych, portów ani adresu projektu produkcyjnego.

Testy sprawdzają:

- RLS na wszystkich 20 tabelach i brak anonimowego dostępu;
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

## Staging przed produkcją

Najbezpieczniejszy przepływ używa osobnego projektu Supabase jako stagingu.
Ma on własny URL, klucze, użytkowników i dane testowe. Migrację wdrażaj kolejno:

1. lokalny test `pnpm test:db`;
2. `supabase link`, `supabase migration list`, `supabase db push --dry-run` i
   `supabase db push` do projektu stagingowego;
3. smoke test przez aplikację wskazującą staging;
4. backup produkcji;
5. `supabase link` do produkcji, ponowne `migration list` oraz `db push
--dry-run` i dopiero `supabase db push`.

Nie współdziel sekretów ani danych użytkowników pomiędzy stagingiem i
produkcją. Zwykły test PostgreSQL chroni przed błędnym SQL i regresją RLS, ale
staging dodatkowo wykrywa problemy z Auth, PostgREST i konfiguracją projektu.

Oficjalny opis procesu:
[Database migrations](https://supabase.com/docs/guides/local-development/database-migrations).
