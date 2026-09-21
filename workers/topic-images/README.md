# NoteTracker image Worker

Worker udostępnia prywatne zdjęcia z Cloudflare R2 wyłącznie użytkownikom
zweryfikowanym przez Supabase Auth.

Endpoint `DELETE /account` trwale usuwa użytkownika Supabase Auth, dane objęte
kaskadą i zwraca `202` po potwierdzeniu usunięcia konta. Przed operacją Worker
ponownie weryfikuje obecne hasło i jednorazowy token CAPTCHA w Supabase Auth.
Obiekty R2 są usuwane w tle. Prywatny znacznik w R2 pozwala godzinowemu cronowi
dokończyć czyszczenie zdjęć po przerwanym żądaniu.

Liczba zdjęć użytkownika nie jest limitowana. Worker ogranicza jedynie tempo
żądań (300 żądań uwierzytelnianych i 120 operacji zapisu na minutę), aby
utrudnić nadużycia i niekontrolowany wzrost kosztów.

## Konfiguracja

Wymagane są Node.js 22+ i pnpm 12. Zależności całego workspace'u instaluj
z katalogu głównego przez `pnpm install --frozen-lockfile`.

1. Uruchom w Supabase SQL Editor:

   `supabase/manual/topic-images-r2.sql`

2. Zaloguj Wrangler i utwórz prywatny bucket:

   ```bash
   cd workers/topic-images
   pnpm exec wrangler login
   pnpm exec wrangler r2 bucket create notetracker-images
   ```

   Nie włączaj publicznego adresu `r2.dev` ani publicznej domeny bucketu.

3. Dodaj zmienne Workera:

   ```bash
   pnpm exec wrangler secret put SUPABASE_URL
   pnpm exec wrangler secret put SUPABASE_PUBLISHABLE_KEY
   pnpm exec wrangler secret put SUPABASE_SECRET_KEY
   pnpm exec wrangler secret put ALLOWED_ORIGINS
   ```

   `ALLOWED_ORIGINS` powinno mieć wartość:

   ```text
   http://localhost:5173,http://127.0.0.1:5173,https://note-tracker-orcin.vercel.app
   ```

4. Wdróż Worker:

   ```bash
   pnpm deploy
   ```

5. Dodaj otrzymany adres Workera do `.env.local` i do zmiennych projektu w
   Vercel:

   ```text
   VITE_R2_IMAGES_API_URL=https://notetracker-topic-images.<konto>.workers.dev
   ```

6. Uruchom ponownie aplikację lokalną i wykonaj ponowny deploy na Vercel.

Do lokalnego uruchomienia Workera skopiuj `.dev.vars.example` jako `.dev.vars`
i uzupełnij wartości. Nie dodawaj `.dev.vars` do repozytorium.

```bash
cp .dev.vars.example .dev.vars
pnpm dev
```

Worker korzysta z `@cloudflare/workers-types`. Nie uruchamiaj `wrangler types`
i nie commituj generowanego `worker-configuration.d.ts`.

`SUPABASE_SECRET_KEY` to backendowy secret key projektu. Nie wolno dodawać go
do zmiennych Vite ani udostępniać w przeglądarce. Worker używa go wyłącznie do
godzinnego czyszczenia kosza po upływie 24 godzin.

Kosz i trwałe usuwanie wymagają migracji `supabase/manual/trash.sql`.

Paginowane sortowanie galerii korzysta z funkcji z migracji
`supabase/manual/gallery-sorting.sql`.

Pełna checklista wdrożenia i rollback znajdują się w
[`docs/deployment.md`](../../docs/deployment.md).
