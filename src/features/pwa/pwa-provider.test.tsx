// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { InstallAppButton, PwaProvider } from "./pwa-provider";

beforeEach(() => {
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false }),
  });
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window.navigator, "serviceWorker");
  vi.restoreAllMocks();
});

it("shows the offline state and clears it when connectivity returns", () => {
  render(
    <PwaProvider>
      <div>aplikacja</div>
    </PwaProvider>,
  );

  act(() => window.dispatchEvent(new Event("offline")));
  expect(screen.getByText(/Brak połączenia/)).toBeTruthy();

  act(() => window.dispatchEvent(new Event("online")));
  expect(screen.queryByText(/Brak połączenia/)).toBeNull();
});

it("offers an explicit update instead of reloading automatically", async () => {
  const postMessage = vi.fn();
  const worker = Object.assign(new EventTarget(), {
    postMessage,
    state: "installing",
  }) as unknown as ServiceWorker;
  const registration = Object.assign(new EventTarget(), {
    installing: worker,
    waiting: null as ServiceWorker | null,
  }) as unknown as ServiceWorkerRegistration;
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: {} as ServiceWorker,
    register: vi.fn().mockResolvedValue(registration),
  }) as unknown as ServiceWorkerContainer;
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: serviceWorker,
  });
  render(
    <PwaProvider>
      <div>aplikacja</div>
    </PwaProvider>,
  );

  await waitFor(() => expect(serviceWorker.register).toHaveBeenCalled());
  Object.assign(registration, { waiting: worker });
  Object.assign(worker, { state: "installed" });
  act(() => worker.dispatchEvent(new Event("statechange")));

  expect(await screen.findByText("Dostępna jest nowa wersja")).toBeTruthy();
  expect(postMessage).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
  expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
});

it("uses the browser install prompt from account settings", async () => {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const installEvent = Object.assign(new Event("beforeinstallprompt"), {
    prompt,
    userChoice: Promise.resolve({ outcome: "accepted" as const }),
  });
  render(
    <PwaProvider>
      <InstallAppButton />
    </PwaProvider>,
  );

  act(() => window.dispatchEvent(installEvent));
  fireEvent.click(
    await screen.findByRole("button", { name: "Zainstaluj aplikację" }),
  );
  expect(prompt).toHaveBeenCalledOnce();
});
