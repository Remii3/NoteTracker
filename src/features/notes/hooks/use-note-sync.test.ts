// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import {
  NoteContentConflictError,
  type NotesRepository,
} from "../data/notes-repository";
import { initialChapters } from "../data/mock-data";
import type { NoteContent } from "../types/model";
import { useNoteSync } from "./use-note-sync";

it("exposes a stale offline edit as a resolvable conflict", async () => {
  const localContent: NoteContent = { type: "doc", text: "local" };
  const serverContent: NoteContent = { type: "doc", text: "server" };
  const saveContent = vi.fn(
    async (
      _chapterId: string,
      _topicId: string,
      _content: NoteContent,
      _expected: NoteContent,
      onError?: (error: unknown) => void,
    ) => {
      onError?.(new NoteContentConflictError());
      return false;
    },
  );
  const repository = {
    getFreshTopicContent: vi.fn().mockResolvedValue(serverContent),
  } as unknown as NotesRepository;
  const acknowledgeSave = vi.fn();
  const clearDraft = vi.fn();
  const replaceTopicContent = vi.fn();
  const topic = initialChapters[0].topics[0];
  const chapter = initialChapters[0];
  const hook = renderHook(() =>
    useNoteSync({
      scope: "user:module",
      repository,
      chapters: initialChapters,
      draftsReady: true,
      isOnline: false,
      getPendingDrafts: () => [
        {
          chapterId: chapter.id,
          topicId: topic.id,
          content: localContent,
          base: topic.content,
        },
      ],
      acknowledgeSave,
      clearDraft,
      clearStoreError: vi.fn(),
      replaceTopicContent,
      saveContent,
    }),
  );

  await act(async () => hook.result.current.retry());

  await waitFor(() => expect(hook.result.current.conflicts).toHaveLength(1));
  expect(hook.result.current.conflicts[0]).toMatchObject({
    chapterId: chapter.id,
    topicId: topic.id,
    localContent,
    serverContent,
  });

  act(() =>
    hook.result.current.useServerVersion(hook.result.current.conflicts[0]),
  );
  expect(replaceTopicContent).toHaveBeenCalledWith(
    chapter.id,
    topic.id,
    serverContent,
  );
  expect(clearDraft).toHaveBeenCalledWith(topic.id);
  expect(hook.result.current.conflicts).toHaveLength(0);
});

it("keeps the local version using the freshly fetched server version", async () => {
  const localContent: NoteContent = { type: "doc", text: "local" };
  const serverContent: NoteContent = { type: "doc", text: "server" };
  let attempt = 0;
  const saveContent = vi.fn(
    async (
      _chapterId: string,
      _topicId: string,
      _content: NoteContent,
      _expected: NoteContent,
      onError?: (error: unknown) => void,
    ) => {
      attempt += 1;
      if (attempt === 1) {
        onError?.(new NoteContentConflictError());
        return false;
      }
      return true;
    },
  );
  const repository = {
    getFreshTopicContent: vi.fn().mockResolvedValue(serverContent),
  } as unknown as NotesRepository;
  const acknowledgeSave = vi.fn().mockReturnValue(true);
  const chapter = initialChapters[0];
  const topic = chapter.topics[0];
  const getPendingDrafts = () => [
    {
      chapterId: chapter.id,
      topicId: topic.id,
      content: localContent,
      base: topic.content,
    },
  ];
  const hook = renderHook(() =>
    useNoteSync({
      repository,
      chapters: initialChapters,
      draftsReady: true,
      isOnline: false,
      getPendingDrafts,
      acknowledgeSave,
      clearDraft: vi.fn(),
      clearStoreError: vi.fn(),
      replaceTopicContent: vi.fn(),
      saveContent,
    }),
  );

  await act(async () => hook.result.current.retry());
  await waitFor(() => expect(hook.result.current.conflicts).toHaveLength(1));
  await act(async () =>
    hook.result.current.keepLocalVersion(hook.result.current.conflicts[0]),
  );

  expect(saveContent).toHaveBeenLastCalledWith(
    chapter.id,
    topic.id,
    localContent,
    serverContent,
    expect.any(Function),
  );
  expect(acknowledgeSave).toHaveBeenCalledWith(topic.id, localContent);
  expect(hook.result.current.conflicts).toHaveLength(0);
});
