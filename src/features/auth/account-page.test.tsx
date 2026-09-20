// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { AccountSettings } from "./account-page";

const auth = vi.hoisted(() => ({
  deleteAccount: vi.fn(),
  signOut: vi.fn(),
  updateName: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock("./auth-context", () => ({
  useAuth: () => ({
    ...auth,
    user: {
      id: "10000000-0000-4000-8000-000000000000",
      email: "user@example.com",
      user_metadata: { full_name: "Jan" },
    },
  }),
}));

vi.mock("./turnstile-widget", () => ({
  TurnstileWidget: ({
    onTokenChange,
  }: {
    onTokenChange: (token: string) => void;
  }) => (
    <button type="button" onClick={() => onTokenChange("captcha-token")}>
      Potwierdź CAPTCHA
    </button>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("requires explicit confirmation and permanently deletes the account", async () => {
  auth.deleteAccount.mockResolvedValue(undefined);
  auth.signOut.mockResolvedValue(undefined);
  const router = createMemoryRouter(
    [{ path: "/", element: <AccountSettings /> }],
    { initialEntries: ["/"] },
  );
  render(<RouterProvider router={router} />);

  fireEvent.click(screen.getByRole("button", { name: "Usuń konto" }));
  fireEvent.change(
    screen.getByLabelText("Obecne hasło", {
      selector: "#delete-account-password",
    }),
    { target: { value: "secret-password" } },
  );
  const confirmation = screen.getByLabelText("Potwierdzenie");
  const submit = screen.getByRole("button", { name: "Usuń konto na zawsze" });
  expect((submit as HTMLButtonElement).disabled).toBe(true);

  fireEvent.change(confirmation, { target: { value: "USUŃ" } });
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź CAPTCHA" }));
  expect((submit as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(submit);

  await waitFor(() =>
    expect(auth.deleteAccount).toHaveBeenCalledWith(
      "secret-password",
      "captcha-token",
    ),
  );
  expect(auth.signOut).toHaveBeenCalledOnce();
  expect(auth.deleteAccount.mock.invocationCallOrder[0]).toBeLessThan(
    auth.signOut.mock.invocationCallOrder[0],
  );
});
