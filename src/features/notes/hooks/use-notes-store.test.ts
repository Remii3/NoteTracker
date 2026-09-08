// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useNotesStore } from "./use-notes-store";
import { memoryNotesRepository } from "../data/memory-notes-repository";
import { initialChapters } from "../data/mock-data";
import { clearMemoryCacheByPrefix, readMemoryCache } from "@/lib/memory-cache";
afterEach(() => {
  cleanup();
  clearMemoryCacheByPrefix("notes:test:");
});

it("retains a committed deletion when refreshing summaries fails", async () => {
  const repository = Object.create(memoryNotesRepository);
  repository.deleteChapter = vi.fn().mockResolvedValue(undefined);
  repository.listChapters = vi.fn().mockRejectedValue(new Error("offline"));
  const { result } = renderHook(() =>
    useNotesStore({ repository, initialChapters }),
  );
  let saved;
  await act(async () => {
    saved = await result.current.removeItem({
      kind: "chapter",
      id: initialChapters[0].id,
      title: initialChapters[0].title,
    });
  });
  expect(saved).toBe(true);
  expect(
    result.current.chapters.some((c) => c.id === initialChapters[0].id),
  ).toBe(false);
  expect(result.current.error).toContain("Zmiana została zapisana");
});

it("distinguishes failed initial loading from an empty workspace and retries", async () => {
  const repository = Object.create(memoryNotesRepository);
  repository.listChapters = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(initialChapters);
  repository.getLearningSummary = vi.fn().mockResolvedValue(null);
  const { result } = renderHook(() =>
    useNotesStore({ repository, initialChapters: [] }),
  );
  await act(async () => {
    await result.current.load();
  });
  expect(result.current.loadFailed).toBe(true);
  await act(async () => {
    await result.current.load();
  });
  expect(result.current.loadFailed).toBe(false);
  expect(result.current.chapters).toHaveLength(initialChapters.length);
});

it("deduplicates content requests and allows an explicit retry after failure", async () => {
  const repository = Object.create(memoryNotesRepository);
  const content = { type: "doc", content: [] };
  repository.getTopicContent = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue(content);
  const chapters = structuredClone(initialChapters);
  const chapter = chapters[0];
  const topic = chapter.topics[0];
  topic.contentLoaded = false;
  const { result } = renderHook(() =>
    useNotesStore({ repository, initialChapters: chapters }),
  );
  await act(async () => {
    await Promise.all([
      result.current.loadTopicContent(chapter.id, topic.id),
      result.current.loadTopicContent(chapter.id, topic.id),
    ]);
  });
  expect(repository.getTopicContent).toHaveBeenCalledTimes(1);
  expect(result.current.contentErrors[topic.id]).toBe("offline");
  await act(async () => {
    await result.current.loadTopicContent(chapter.id, topic.id);
  });
  expect(result.current.contentErrors[topic.id]).toBeUndefined();
  expect(result.current.chapters[0].topics[0].contentLoaded).toBe(true);
});

it("restores a workspace from cache and revalidates without a loading state", async () => {
  const cacheKey = "notes:test:module";
  const first = renderHook(() =>
    useNotesStore({
      repository: memoryNotesRepository,
      initialChapters,
      cacheKey,
    }),
  );
  await act(async () => {
    await first.result.current.load();
  });
  await waitFor(() => expect(readMemoryCache(cacheKey)).not.toBeUndefined());
  first.unmount();

  const second = renderHook(() =>
    useNotesStore({
      repository: memoryNotesRepository,
      initialChapters: [],
      loadOnMount: true,
      cacheKey,
    }),
  );
  expect(second.result.current.isLoading).toBe(false);
  expect(second.result.current.chapters).toHaveLength(initialChapters.length);
  expect(second.result.current.chapters[0].topicsStatus).toBe("loaded");
});
