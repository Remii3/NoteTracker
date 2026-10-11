// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AuthPage } from "./auth-page";

vi.mock("./auth-context", () => ({
  useAuth: () => ({
    requestPasswordReset: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
  }),
}));

vi.mock("./turnstile-widget", () => ({ TurnstileWidget: () => null }));
vi.mock("@/features/theme", () => ({ ThemeToggle: () => null }));

afterEach(cleanup);

it("renders registration directly for the public register route", () => {
  render(<AuthPage initialMode="sign-up" />);

  expect(screen.getByRole("heading", { name: "Utwórz konto" })).toBeTruthy();
  expect(screen.getByLabelText("Imię")).toBeTruthy();
  expect(screen.getByLabelText("Powtórz hasło")).toBeTruthy();
});

it("renders password reset directly for the public reset route", () => {
  render(<AuthPage initialMode="reset" />);

  expect(screen.getByRole("heading", { name: "Zresetuj hasło" })).toBeTruthy();
  expect(screen.queryByLabelText("Hasło")).toBeNull();
});

it("reports mode changes so the URL can stay in sync", () => {
  const onModeChange = vi.fn();
  render(<AuthPage initialMode="sign-in" onModeChange={onModeChange} />);

  fireEvent.click(screen.getByRole("button", { name: "Zarejestruj się" }));

  expect(onModeChange).toHaveBeenCalledWith("sign-up");
});
