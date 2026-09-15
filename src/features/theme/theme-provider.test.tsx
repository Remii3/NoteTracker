// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useTheme } from "./theme-context";
import { ThemeProvider } from "./theme-provider";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  window.localStorage.clear();
  document.documentElement.classList.remove("dark");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.removeProperty("color-scheme");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("uses the system theme until the user chooses a preference", () => {
  mockSystemTheme(true);

  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(screen.getByTestId("theme").textContent).toBe("system:dark");
  expect(document.documentElement.classList.contains("dark")).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Jasny" }));
  expect(screen.getByTestId("theme").textContent).toBe("light:light");
  expect(document.documentElement.classList.contains("dark")).toBe(false);
  expect(window.localStorage.getItem("notetracker-theme")).toBe("light");
});

it("restores a saved dark theme and can return to the system setting", () => {
  window.localStorage.setItem("notetracker-theme", "dark");
  mockSystemTheme(false);

  render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );

  expect(document.documentElement.classList.contains("dark")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Systemowy" }));
  expect(screen.getByTestId("theme").textContent).toBe("system:light");
  expect(window.localStorage.getItem("notetracker-theme")).toBeNull();
});

function ThemeProbe() {
  const { resolvedTheme, setTheme, theme } = useTheme();
  return (
    <>
      <output data-testid="theme">
        {theme}:{resolvedTheme}
      </output>
      <button type="button" onClick={() => setTheme("light")}>
        Jasny
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        Systemowy
      </button>
    </>
  );
}

function mockSystemTheme(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-color-scheme: dark)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}
