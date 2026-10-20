// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { dismissOnboarding, isOnboardingDismissed } from "./onboarding-storage";

const values = new Map<string, string>();
Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  },
});

describe("onboarding storage", () => {
  beforeEach(() => values.clear());

  it("keeps dismissal scoped to the current user", () => {
    dismissOnboarding("user-a");

    expect(isOnboardingDismissed("user-a")).toBe(true);
    expect(isOnboardingDismissed("user-b")).toBe(false);
  });
});
