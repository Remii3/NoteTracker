# Supabase w NoteTrackerze

Ten katalog opisuje schemat bazy, lokalną konfigurację Supabase i testy
izolacji danych. Źródłem prawdy jest **cały uporządkowany katalog
`migrations/`**, a nie pojedynczy dump SQL.

## Co znajduje się w katalogu

- `migrations/` — niezmienna historia zmian stosowana kolejno według znacznika
  czasu w nazwie pliku;
- `tests/auth-fixture.sql` — minimalna imitacja Supabase Auth używana wyłącznie
  w izolowanym teście PostgreSQL;
- `tests/rls.sql` — testy RLS, uprawnień i najważniejszych RPC dla dwóch
  użytkowników;
- `config.toml` — konfiguracja lokalnego stosu Supabase;
- `manual/` — archiwum skryptów sprzed uporządkowania migracji; tych plików nie
  należy uruchamiać na aktualnych środowiskach;
- `notetracker-schema.sql` — historyczny snapshot pomocniczy z 16 września
  2026; nie jest aktualnym schematem ani sposobem wdrażania bazy.

Aktualny schemat aplikacji ma 20 tabel w `public`. Oprócz podstawowej
hierarchii moduł–rozdział–temat zawiera pytania i sesje nauki, kosz, obrazy,
cele, odroczenia, stan FSRS, plany egzaminów oraz cache funkcji AI.

## Jak zmieniać bazę

1. Utwórz nową migrację:

   ```bash
   supabase migration new opis_zmiany
   ```

2. Nie edytuj migracji, która została już zastosowana na współdzielonym lub
   produkcyjnym środowisku. Poprawkę zapisz w następnej migracji.
3. W funkcjach RPC kwalifikuj obiekty nazwą schematu, używaj pustego
   `search_path` i jawnie ustawiaj uprawnienia (`revoke`/`grant`).
4. Dla każdej nowej tabeli w `public` włącz RLS, odbierz domyślne uprawnienia i
   dodaj test izolacji użytkowników.
5. Uruchom `pnpm test:db`. Test odtwarza wszystkie migracje od zera w
   jednorazowym kontenerze PostgreSQL 17.
6. Zastosuj migrację najpierw na osobnym projekcie stagingowym. Po smoke teście
   wykonaj backup produkcji i dopiero wtedy użyj `supabase db push` dla
   produkcji.
7. Po wdrożeniu wygeneruj typy z właściwego projektu i sprawdź diff:

   ```bash
   supabase gen types typescript --linked --schema public \
     > src/lib/supabase/database.types.ts
   ```

   Przekierowanie nadpisuje plik, więc wykonuj je tylko na czystym working tree
   i przed commitem sprawdź wygenerowaną zmianę.

## Zakres testów

`pnpm test:db` sprawdza bootstrap migracji na czystym PostgreSQL, obecność RLS,
brak anonimowego dostępu, izolację danych dwóch kont oraz krytyczne RPC. Nie
uruchamia usług Auth, PostgREST ani R2. Te integracje wymagają smoke testu na
lokalnym pełnym stosie Supabase lub na stagingu.

Szczegółowa konfiguracja i zasady wdrożenia są opisane w
[`docs/database-setup.md`](../docs/database-setup.md).
