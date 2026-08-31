# Backup and restore

Backup bazy Supabase i plików R2 musi być wykonywany osobno. Backup bazy
zawiera metadane `topic_images`, ale nie zawiera obiektów z bucketa R2.

## Harmonogram

- baza danych: codzienny backup Supabase lub codzienny logiczny eksport dla
  planu Free;
- R2: codzienna kopia przyrostowa do prywatnego bucketa na innym koncie lub do
  innego dostawcy;
- test odtworzenia: raz na kwartał oraz przed ryzykowną migracją;
- retencja: minimum 7 kopii dziennych i 4 kopie tygodniowe.

Sekretów, dumpów i konfiguracji `rclone` nie wolno commitować do repozytorium.

## Backup Supabase

Na planach z automatycznymi backupami sprawdź w Supabase Dashboard:
`Database > Backups`, czy ostatnia kopia zakończyła się poprawnie.

Dla planu Free lub dodatkowej kopii poza Supabase połącz CLI z projektem:

```bash
npx supabase login
npx supabase link --project-ref <PROJECT_REF>
npx supabase db dump --linked --file backup/schema.sql
npx supabase db dump --linked --data-only --use-copy --file backup/data.sql
npx supabase db dump --linked --role-only --file backup/roles.sql
```

Po eksporcie zaszyfruj katalog i przenieś go poza komputer oraz poza konto
Supabase. Nie przechowuj hasła szyfrującego razem z backupem.

## Backup R2

Utwórz token R2 tylko z prawami odczytu dla `notetracker-images` i skonfiguruj
remote źródłowy oraz osobny remote docelowy w `rclone`. Kopiowanie nie powinno
usuwać danych z backupu:

```bash
rclone copy r2-source:notetracker-images r2-backup:notetracker-images \
  --fast-list --checkers 16 --transfers 8
rclone check r2-source:notetracker-images r2-backup:notetracker-images \
  --one-way
```

Nie używaj `rclone sync` bez wersjonowania po stronie celu, ponieważ usunięcie
obiektu w źródle zostałoby powielone w kopii.

## Odtwarzanie

1. Zablokuj zapisy do aplikacji i zanotuj czas rozpoczęcia awarii.
2. Odtwarzaj najpierw do oddzielnego projektu Supabase, nigdy od razu na
   produkcję.
3. Odtwórz role, schemat, a następnie dane zgodnie z instrukcją Supabase CLI.
4. Skopiuj obiekty R2 z backupu do nowego prywatnego bucketa poleceniem
   `rclone copy`.
5. Sprawdź zgodność `topic_images.storage_key` z kluczami w R2 oraz wykonaj test
   logowania, odczytu, dodawania i usuwania zdjęcia.
6. Dopiero po weryfikacji przełącz zmienne aplikacji i Workera na odtworzone
   zasoby.

Przy odtwarzaniu backupu zarządzanego przez Supabase projekt może być czasowo
niedostępny. Ustal okno serwisowe i poinformuj użytkowników przed operacją.
