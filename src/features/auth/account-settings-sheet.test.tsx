// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";

import { AccountSettingsSheet } from "./account-settings-sheet";

vi.mock("./auth-context", () => ({
  useAuth: () => ({
    deleteAccount: vi.fn(),
    signOut: vi.fn(),
    updateName: vi.fn(),
    updatePassword: vi.fn(),
    user: {
      id: "10000000-0000-4000-8000-000000000000",
      email: "user@example.com",
      user_metadata: { full_name: "Jan" },
    },
  }),
}));

afterEach(cleanup);

function CurrentPath() {
  return <span data-testid="current-path">{useLocation().pathname}</span>;
}

it("closes without changing the current route", () => {
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter initialEntries={["/biology/chapters/cells"]}>
      <CurrentPath />
      <AccountSettingsSheet open onOpenChange={onOpenChange} />
    </MemoryRouter>,
  );

  expect(screen.getByRole("dialog", { name: "Panel ustawień" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zamknij" }));

  expect(onOpenChange.mock.calls[0]?.[0]).toBe(false);
  expect(screen.getByTestId("current-path").textContent).toBe(
    "/biology/chapters/cells",
  );
});
