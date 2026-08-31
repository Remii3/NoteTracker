# Monitoring produkcji

## Sentry — frontend

1. Utwórz w Sentry projekt typu React.
2. W Vercel dodaj dla środowiska Production:

   ```text
   VITE_SENTRY_DSN=<DSN projektu>
   SENTRY_AUTH_TOKEN=<token do uploadu source map>
   SENTRY_ORG=<slug organizacji>
   SENTRY_PROJECT=<slug projektu>
   ```

3. Opcjonalnie ustaw `VITE_SENTRY_RELEASE` na identyfikator wdrożenia, np. SHA
   commita. `SENTRY_AUTH_TOKEN` jest sekretem builda i nie może mieć prefiksu
   `VITE_`.
4. Wykonaj nowy deploy Vercel. Plugin usunie source mapy z katalogu `dist` po
   wysłaniu ich do Sentry.
5. Zweryfikuj integrację przez kontrolowany błąd na środowisku testowym i usuń
   go po pojawieniu się zdarzenia w Sentry.

Bez `VITE_SENTRY_DSN` aplikacja działa normalnie, a paczka Sentry nie jest
ładowana w przeglądarce.

Zalecane alerty:

- nowy błąd o poziomie `error`;
- regresja wcześniej rozwiązanej sprawy;
- wzrost liczby zdarzeń ponad 10 w 5 minut;
- brak zdarzeń kontrolnych po wdrożeniu zmian monitoringu.

## Cloudflare Worker

Logi i trace'y są włączone w `workers/topic-images/wrangler.jsonc`. Logi mają
sampling 100%, a trace'y 5%. Konfiguracja zaczyna działać po deployu Workera.

Podgląd w dashboardzie: `Workers & Pages > notetracker-topic-images >
Observability`.

Podgląd błędów na żywo:

```bash
cd workers/topic-images
npx wrangler tail notetracker-topic-images --status error --format pretty
```

Po każdym deployu sprawdź co najmniej: odpowiedzi 5xx, 429, błędy Supabase oraz
błędy operacji R2. Nie umieszczaj tokenów, pełnych nagłówków ani treści notatek
w logach.
