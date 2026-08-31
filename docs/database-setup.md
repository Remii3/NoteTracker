# Konfiguracja Supabase

## Nowy projekt

1. Utwórz projekt Supabase i włącz logowanie e-mail/hasło.
2. Dodaj adres lokalny i produkcyjny do konfiguracji redirect URLs w Auth.
3. Pobierz Project URL i publishable key z ustawień API, a następnie ustaw je
   jako `VITE_SUPABASE_URL` i `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Sprawdź, czy schema `public` jest wystawiona przez Data API.

Nigdy nie używaj klucza `service_role` w zmiennej `VITE_*` ani w Workerze.

## Stan schematu w repozytorium

Repozytorium nie zawiera jeszcze kompletnej migracji bazowej tworzącej tabele
`chapters` i `topics`. Katalog `supabase/manual` zawiera przyrostowe skrypty
uruchamiane wcześniej ręcznie na istniejącym projekcie. Z tego powodu nie da
się obecnie odtworzyć pustej bazy wyłącznie z plików repozytorium.

Przed uruchomieniem skryptu na produkcji:

1. wykonaj backup zgodnie z
   [`backup-and-restore.md`](backup-and-restore.md);
2. przeczytaj cały skrypt i sprawdź jego zależności;
3. uruchom go najpierw na osobnym projekcie testowym;
4. po zmianie uruchom `supabase/manual/audit-security.sql` i sprawdź Security
   Advisor w Supabase Dashboard.

## Skrypty ręczne

Skrypty odzwierciedlają historię rozwoju, a nie pełną listę migracji do
wykonania od góry do dołu.

| Skrypt                             | Rola                                         | Zależności / uwagi                                                        |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| `remove-title-length-limits.sql`   | usuwa limity długości tytułów                | istniejące `chapters`, `topics`                                           |
| `scale-and-reorder.sql`            | indeksy, dashboard i zmianę kolejności       | istniejące `chapters`, `topics`; rozszerzenie `pg_trgm`                   |
| `lazy-chapter-topics.sql`          | RPC do leniwego pobierania i nawigacji       | istniejące `chapters`, `topics`                                           |
| `bulk-delete-notes.sql`            | zbiorcze usuwanie rozdziałów i tematów       | istniejące `chapters`, `topics`                                           |
| `topic-images-r2.sql`              | metadane zdjęć, RLS i zmianę kolejności      | istniejące `topics`; wymagany przez Workera                               |
| `reorder-topic-images.sql`         | aktualizuje samo RPC kolejności zdjęć        | uruchamiaj tylko jako poprawkę po `topic-images-r2.sql`                   |
| `question-bank-mvp2.sql`           | bank pytań i sesje nauki                     | istniejące `chapters`, `topics`; zastępuje stare RPC fiszek               |
| `question-bank-mvp2-follow-up.sql` | poprawione RPC dostępności i sesji           | po `question-bank-mvp2.sql`                                               |
| `flashcards-mvp2.sql`              | starszy, osobny model fiszek                 | historyczny; nie uruchamiaj razem z aktualnym bankiem pytań bez przeglądu |
| `fix-advisor-warnings.sql`         | indeks FK i ograniczenie funkcji triggera    | uruchamiaj po utworzeniu zależnych obiektów                               |
| `audit-security.sql`               | tylko odczyt: RLS, granty, funkcje i indeksy | uruchamiaj po każdej zmianie schematu                                     |

Aktualny frontend korzysta z modelu utworzonego przez
`question-bank-mvp2.sql` i jego follow-up, nie ze starszych tabel
`flashcards_*`.

## Weryfikacja

Po skonfigurowaniu bazy zaloguj się dwoma kontami testowymi i sprawdź, czy:

- każde konto widzi wyłącznie własne rozdziały, tematy, pytania i zdjęcia;
- dodawanie, edycja, zmiana kolejności i usuwanie działa;
- konto nie może odczytać rekordu drugiego użytkownika po ręcznej zmianie UUID
  w żądaniu;
- zapytania audytowe nie pokazują tabel aplikacyjnych bez RLS ani funkcji z
  nieoczekiwanymi grantami.

Po każdej zatwierdzonej zmianie schematu zaktualizuj
`src/lib/supabase/database.types.ts` z projektu Supabase i sprawdź `npm run
build`.
