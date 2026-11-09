import { expect, test } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";

function fakeAccessToken() {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({
    aud: "authenticated",
    email: "student@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: "authenticated",
    sub: userId,
  })}.test-signature`;
}

test("redirects a protected route to login and exposes account flows", async ({
  page,
}) => {
  await page.goto("/modules");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Zaloguj się" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("ty@example.com")).toBeVisible();

  await page.getByRole("button", { name: "Zarejestruj się" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(
    page.getByRole("heading", { name: "Utwórz konto" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("opens an authenticated workspace and creates a module", async ({
  page,
}) => {
  const accessToken = fakeAccessToken();
  const user = {
    id: userId,
    aud: "authenticated",
    role: "authenticated",
    email: "student@example.com",
    user_metadata: { full_name: "Student" },
    app_metadata: {},
    created_at: new Date().toISOString(),
  };
  await page.addInitScript(
    ({ session }) => {
      window.localStorage.setItem(
        "sb-example-auth-token",
        JSON.stringify(session),
      );
    },
    {
      session: {
        access_token: accessToken,
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: "e2e-refresh-token",
        user,
      },
    },
  );
  await page.route("https://example.supabase.co/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/rest/v1/rpc/get_module_summaries") {
      await route.fulfill({ json: [] });
      return;
    }
    if (url.pathname === "/rest/v1/modules" && request.method() === "POST") {
      await route.fulfill({
        status: 201,
        json: {
          id: "22222222-2222-4222-8222-222222222222",
          name: "Anatomia",
          slug: "anatomia",
          position: 1000,
        },
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ json: user });
      return;
    }
    await route.abort();
  });

  await page.goto("/modules");
  await expect(page).toHaveURL(/\/modules$/);
  await expect(page.getByRole("heading", { name: "Moduły" })).toBeVisible();

  await page.getByRole("button", { name: "Nowy moduł" }).click();
  await page.getByPlaceholder("Nazwa nowego modułu").fill("Anatomia");
  await page.getByRole("button", { name: "Utwórz" }).click();

  await expect(page.getByText("Anatomia", { exact: true })).toBeVisible();
});
