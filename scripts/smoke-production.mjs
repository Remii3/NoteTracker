const APP_ORIGIN = process.env.SMOKE_APP_ORIGIN ?? "https://app.sylabio.com";
const QUESTION_GENERATOR_URL =
  process.env.SMOKE_QUESTION_GENERATOR_URL ??
  "https://notetracker-question-generator.remek778790.workers.dev";
const TOPIC_IMAGES_URL =
  process.env.SMOKE_TOPIC_IMAGES_URL ??
  "https://notetracker-topic-images.remek778790.workers.dev";

async function request(url, init) {
  return fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    ...init,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function checkPreflight(name, url, method) {
  const response = await request(url, {
    method: "OPTIONS",
    headers: {
      Origin: APP_ORIGIN,
      "Access-Control-Request-Method": method,
    },
  });
  assert(
    response.status === 204,
    `${name}: expected 204, got ${response.status}`,
  );
  assert(
    response.headers.get("access-control-allow-origin") === APP_ORIGIN,
    `${name}: invalid Access-Control-Allow-Origin`,
  );
}

async function discoverSupabaseConfig(html) {
  const publicUrl =
    process.env.SMOKE_SUPABASE_URL ??
    html.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0];
  const scriptPaths = [...html.matchAll(/(?:src|href)="([^"]+\.js)"/g)].map(
    ([, assetPath]) => new URL(assetPath, APP_ORIGIN).href,
  );
  const scripts = await Promise.all(
    scriptPaths.map(async (url) => {
      const response = await request(url);
      return response.ok ? response.text() : "";
    }),
  );
  const bundledCode = scripts.join("\n");
  return {
    publicUrl:
      publicUrl ??
      bundledCode.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)?.[0],
    publishableKey:
      process.env.SMOKE_SUPABASE_PUBLISHABLE_KEY ??
      bundledCode.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0],
  };
}

const appResponse = await request(APP_ORIGIN);
assert(appResponse.ok, `application: expected 2xx, got ${appResponse.status}`);
assert(
  appResponse.headers.get("content-type")?.includes("text/html"),
  "application: expected HTML response",
);
const html = await appResponse.text();

await checkPreflight(
  "question generator preflight",
  `${QUESTION_GENERATOR_URL}/config`,
  "GET",
);
await checkPreflight(
  "topic images preflight",
  `${TOPIC_IMAGES_URL}/images`,
  "GET",
);

for (const [name, url] of [
  ["question generator auth", `${QUESTION_GENERATOR_URL}/config`],
  ["topic images auth", `${TOPIC_IMAGES_URL}/images`],
]) {
  const response = await request(url, { headers: { Origin: APP_ORIGIN } });
  assert(
    response.status === 401,
    `${name}: expected 401, got ${response.status}`,
  );
  assert(
    response.headers.get("access-control-allow-origin") === APP_ORIGIN,
    `${name}: missing CORS header`,
  );
}

const supabase = await discoverSupabaseConfig(html);
assert(
  supabase.publicUrl,
  "supabase: URL was not found in the production bundle",
);
assert(
  supabase.publishableKey,
  "supabase: publishable key was not found in the production bundle",
);
const healthResponse = await request(`${supabase.publicUrl}/auth/v1/health`, {
  headers: { apikey: supabase.publishableKey },
});
assert(
  healthResponse.ok,
  `supabase auth health: expected 2xx, got ${healthResponse.status}`,
);

console.log("Production smoke tests passed.");
