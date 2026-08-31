let sentry: Promise<typeof import("@sentry/react")> | null = null;
let monitoringEnabled = false;
const pendingErrors: Array<{
  error: unknown;
  context?: string;
  details?: Record<string, unknown>;
}> = [];

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

  for (const pending of pendingErrors.splice(0)) {
    sendException(Sentry, pending.error, pending.context, pending.details);
  }
}

function sendException(
  Sentry: typeof import("@sentry/react"),
  error: unknown,
  context?: string,
  details?: Record<string, unknown>,
) {
  Sentry.withScope((scope) => {
    if (context) scope.setTag("error.context", context);
    if (details) scope.setContext("error.details", details);
    Sentry.captureException(error);
  });
}

export function captureException(
  error: unknown,
  context?: string,
  details?: Record<string, unknown>,
) {
  if (!monitoringEnabled) {
    if (pendingErrors.length < 10)
      pendingErrors.push({ error, context, details });
    return;
  }

  void loadSentry().then((Sentry) => {
    sendException(Sentry, error, context, details);
  });
}
