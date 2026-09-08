// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAsyncResource } from "./use-async-resource";
afterEach(cleanup);
it("ignores old requests after navigation", async () => {
  let resolveOld!: (value: string) => void;
  const oldLoad = () =>
    new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
  const newLoad = vi.fn().mockResolvedValue("new module");
  const hook = renderHook(({ load }) => useAsyncResource(load), {
    initialProps: { load: oldLoad },
  });
  await act(async () => {});
  hook.rerender({ load: newLoad });
  await waitFor(() => expect(hook.result.current.value).toBe("new module"));
  await act(async () => resolveOld("old module"));
  expect(hook.result.current.value).toBe("new module");
});
it("exposes loading, error and retry states", async () => {
  const load = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue("module");
  const hook = renderHook(() => useAsyncResource(load));
  expect(hook.result.current.loading).toBe(true);
  await waitFor(() => expect(hook.result.current.failed).toBe(true));
  act(() => hook.result.current.retry());
  expect(hook.result.current.loading).toBe(true);
  await waitFor(() => expect(hook.result.current.value).toBe("module"));
  expect(hook.result.current.failed).toBe(false);
});
