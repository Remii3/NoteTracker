# NoteTracker image Worker

Worker udostępnia prywatne zdjęcia z Cloudflare R2 wyłącznie użytkownikom
zweryfikowanym przez Supabase Auth.

Liczba zdjęć użytkownika nie jest limitowana. Worker ogranicza jedynie tempo
żądań (300 żądań uwierzytelnianych i 120 operacji zapisu na minutę), aby
utrudnić nadużycia i niekontrolowany wzrost kosztów.

## Konfiguracja

1. Uruchom w Supabase SQL Editor:

   `supabase/manual/topic-images-r2.sql`

2. Zaloguj Wrangler i utwórz prywatny bucket:

   ```bash
   cd workers/topic-images
   npx wrangler login
   npx wrangler r2 bucket create notetracker-images
   ```

   Nie włączaj publicznego adresu `r2.dev` ani publicznej domeny bucketu.

3. Dodaj zmienne Workera:

   ```bash
   npx wrangler secret put SUPABASE_URL
   npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
   npx wrangler secret put ALLOWED_ORIGINS
   ```

   `ALLOWED_ORIGINS` powinno mieć wartość:

   ```text
   http://localhost:5173,https://note-tracker-orcin.vercel.app
   ```

4. Wdróż Worker:

   ```bash
   npm run deploy
   ```

5. Dodaj otrzymany adres Workera do `.env.local` i do zmiennych projektu w
   Vercel:

   ```text
   VITE_R2_IMAGES_API_URL=https://notetracker-topic-images.<konto>.workers.dev
   ```

6. Uruchom ponownie aplikację lokalną i wykonaj ponowny deploy na Vercel.

Do lokalnego uruchomienia Workera skopiuj `.dev.vars.example` jako `.dev.vars`
i uzupełnij wartości. Nie dodawaj `.dev.vars` do repozytorium.
