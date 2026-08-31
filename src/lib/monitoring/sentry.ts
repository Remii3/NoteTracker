let sentry: Promise<typeof import("@sentry/react")> | null = null;
let monitoringEnabled = false;

function loadSentry() {
  sentry ??= import("@sentry/react");
  return sentry;
}

export async function initializeMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn) return;

  const Sentry = await loadSentry();
  Sentry.init({
    dsn,
    enabled: true,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE?.trim() || undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: import.meta.env.PROD ? 0.05 : 0,
  });
  monitoringEnabled = true;
}

export function captureException(
  error: unknown,
  context?: string,
  details?: Record<string, unknown>,
) {
  if (!monitoringEnabled) return;

  void loadSentry().then((Sentry) => {
    Sentry.withScope((scope) => {
      if (context) scope.setTag("error.context", context);
      if (details) scope.setContext("error.details", details);
      Sentry.captureException(error);
    });
  });
}
