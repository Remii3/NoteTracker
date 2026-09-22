// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useNoteDrafts } from "./use-note-drafts";
import { useNotesStore } from "./use-notes-store";
import { useWorkspaceActions } from "./use-workspace-actions";
import { initialChapters } from "../data/mock-data";
import { memoryNotesRepository } from "../data/memory-notes-repository";

vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
beforeEach(() => {
  for (const name of ["localStorage", "sessionStorage"]) {
    const values = new Map<string, string>();
    vi.stubGlobal(name, {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    });
  }
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup() {
  let complete!: () => void;
  let fail!: (error: Error) => void;
  const persist = vi.fn(
    () =>
      new Promise<void>((resolve, reject) => {
        complete = resolve;
        fail = reject;
      }),
  );
  const repository = Object.create(memoryNotesRepository);
  repository.updateTopicContent = persist;
  const hook = renderHook(() => {
    const drafts = useNoteDrafts();
    const store = useNotesStore({ repository, initialChapters });
    const chapter = store.chapters[0];
    const topic = chapter.topics[0];
    const actions = useWorkspaceActions({
      chapters: store.chapters,
      chapterId: chapter.id,
      topicId: topic.id,
      topic,
      isSaving: store.isSaving,
      editorDirty: drafts.isTopicDirty(topic.id),
      commands: store,
      expandChapter: () => {},
      clearDraft: drafts.clearDraft,
      acknowledgeSave: drafts.acknowledgeSave,
      getDraftContent: drafts.getContent,
      navigateToChapter: () => {},
      navigateHome: () => {},
    });
    return { drafts, store, topic, actions };
  });
  return {
    ...hook,
    persist,
    complete: () => complete(),
    fail: () => fail(new Error("offline")),
  };
}
it("keeps newer edits dirty after an earlier save completes", async () => {
  const hook = setup();
  const first = { text: "first" };
  const latest = { text: "newer" };
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, first),
  );
  let saving!: Promise<boolean>;
  act(() => {
    saving = hook.result.current.actions.saveContent();
  });
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, latest),
  );
  await act(async () => {
    hook.complete();
    expect(await saving).toBe(false);
  });
  expect(hook.result.current.topic.content).toEqual(first);
  expect(
    hook.result.current.drafts.getContent(hook.result.current.topic),
  ).toEqual(latest);
  expect(hook.result.current.drafts.hasDirtyDrafts).toBe(true);
});
it("keeps undo-to-original edits when an older save is in flight", async () => {
  const hook = setup();
  const original = hook.result.current.topic.content;
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, {
      text: "first",
    }),
  );
  let saving!: Promise<boolean>;
  act(() => {
    saving = hook.result.current.actions.saveContent();
  });
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, original),
  );
  await act(async () => {
    hook.complete();
    await saving;
  });
  expect(
    hook.result.current.drafts.getContent(hook.result.current.topic),
  ).toEqual(original);
  expect(hook.result.current.drafts.hasDirtyDrafts).toBe(true);
});
it("clears a draft only after successful persistence", async () => {
  const hook = setup();
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, {
      text: "first",
    }),
  );
  let saving!: Promise<boolean>;
  act(() => {
    saving = hook.result.current.actions.saveContent();
  });
  expect(hook.result.current.drafts.hasDirtyDrafts).toBe(true);
  await act(async () => {
    hook.complete();
    expect(await saving).toBe(true);
  });
  expect(hook.result.current.drafts.hasDirtyDrafts).toBe(false);
});
it("preserves the latest draft and saved content on a failed save", async () => {
  const hook = setup();
  const original = hook.result.current.topic.content;
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, {
      text: "first",
    }),
  );
  let saving!: Promise<boolean>;
  act(() => {
    saving = hook.result.current.actions.saveContent();
  });
  act(() =>
    hook.result.current.drafts.updateDraft(hook.result.current.topic, {
      text: "newer",
    }),
  );
  await act(async () => {
    hook.fail();
    expect(await saving).toBe(false);
  });
  expect(hook.result.current.topic.content).toEqual(original);
  expect(
    hook.result.current.drafts.getContent(hook.result.current.topic),
  ).toEqual({ text: "newer" });
  expect(hook.result.current.drafts.hasDirtyDrafts).toBe(true);
});

it("restores a draft and its original baseline after remount", () => {
  window.sessionStorage.clear();
  const topic = initialChapters[0].topics[0];
  const content = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Recovered" }] },
    ],
  };
  const first = renderHook(() => useNoteDrafts("account:module"));
  act(() => first.result.current.updateDraft(topic, content));
  first.unmount();
  const second = renderHook(() => useNoteDrafts("account:module"));
  expect(second.result.current.getContent(topic)).toEqual(content);
  expect(second.result.current.getBaseContent(topic)).toEqual(topic.content);
  expect(second.result.current.isTopicDirty(topic.id)).toBe(true);
  act(() => second.result.current.clearAllDrafts());
  second.unmount();
  const third = renderHook(() => useNoteDrafts("account:module"));
  expect(third.result.current.hasDirtyDrafts).toBe(false);
});

it("isolates persisted drafts by account and browser tab", () => {
  window.sessionStorage.clear();
  const topic = initialChapters[0].topics[0];
  const first = renderHook(() => useNoteDrafts("account:module"));
  act(() => first.result.current.updateDraft(topic, { type: "doc" }));
  const otherAccount = renderHook(() => useNoteDrafts("other:module"));
  expect(otherAccount.result.current.hasDirtyDrafts).toBe(false);
  window.sessionStorage.clear();
  const otherTab = renderHook(() => useNoteDrafts("account:module"));
  expect(otherTab.result.current.hasDirtyDrafts).toBe(false);
});

it("debounces session draft writes while typing", () => {
  vi.useFakeTimers();
  const topic = initialChapters[0].topics[0];
  const setItem = vi.spyOn(window.sessionStorage, "setItem");
  const hook = renderHook(() => useNoteDrafts("account:module"));
  act(() => {
    hook.result.current.updateDraft(topic, { type: "doc", text: "a" });
    hook.result.current.updateDraft(topic, { type: "doc", text: "ab" });
  });
  expect(setItem).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(250));
  expect(setItem).toHaveBeenCalledTimes(1);
  hook.unmount();
  vi.useRealTimers();
});

it("clears a recovered draft when the server contains the same content", () => {
  const topic = initialChapters[0].topics[0];
  const first = renderHook(() => useNoteDrafts("account:module"));
  act(() => first.result.current.updateDraft(topic, { type: "doc" }));
  first.unmount();

  const second = renderHook(() => useNoteDrafts("account:module"));
  act(() =>
    second.result.current.reconcileDraft({
      ...topic,
      content: { type: "doc" },
    }),
  );
  expect(second.result.current.hasDirtyDrafts).toBe(false);
});

it("keeps the chapter identifier needed for background synchronization", () => {
  const topic = initialChapters[0].topics[0];
  const hook = renderHook(() => useNoteDrafts("account:module"));
  act(() =>
    hook.result.current.updateDraft(topic, { type: "doc" }, "chapter-id"),
  );

  expect(hook.result.current.getPendingDrafts()).toEqual([
    expect.objectContaining({
      topicId: topic.id,
      chapterId: "chapter-id",
      content: { type: "doc" },
      base: topic.content,
    }),
  ]);
});
