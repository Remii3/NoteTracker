// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SpotlightGuide } from "./spotlight-guide";

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function rect(top: number): DOMRect {
  return {
    top,
    right: 220,
    bottom: top + 40,
    left: 100,
    width: 120,
    height: 40,
    x: 100,
    y: top,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("keeps the highlight aligned with its target while scrolling", () => {
  let targetRect = rect(80);
  const { container } = render(
    <>
      <button
        data-onboarding="target"
        ref={(element) => {
          if (!element) return;
          element.scrollIntoView = vi.fn();
          element.getBoundingClientRect = () => targetRect;
        }}
      >
        Cel
      </button>
      <SpotlightGuide
        target='[data-onboarding="target"]'
        title="Przewodnik"
        description="Opis"
        step={1}
        steps={2}
        onSkip={vi.fn()}
      />
    </>,
  );

  const highlight = container.querySelector<HTMLElement>(".ring-4");
  expect(highlight?.style.top).toBe("73px");

  targetRect = rect(180);
  act(() => window.dispatchEvent(new Event("scroll")));

  expect(highlight?.style.top).toBe("173px");
});
