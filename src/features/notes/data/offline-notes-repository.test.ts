// @vitest-environment jsdom

import { expect, it, vi } from "vitest";

import type { OfflineModuleService } from "../offline/offline-module-service";
import type { OfflineModuleSnapshot } from "../offline/offline-types";
import { memoryNotesRepository } from "./memory-notes-repository";
import { OfflineNotesRepository } from "./offline-notes-repository";

const snapshot: OfflineModuleSnapshot = {
  key: "user:module",
  userId: "user",
  module: {
    id: "module",
    slug: "module",
    name: "Module",
    isPinned: false,
    position: 1000,
    chaptersCount: 1,
    completedChaptersCount: 0,
    topicsCount: 1,
    completedTopicsCount: 0,
  },
  chapters: [
    {
      id: "chapter",
      moduleId: "module",
      slug: "chapter",
      title: "Chapter",
      position: 1000,
      updatedAt: "2026-09-21T12:00:00Z",
    },
  ],
  topics: [
    {
      id: "topic",
      chapterId: "chapter",
      slug: "topic",
      title: "Topic",
      content: { type: "doc", content: [{ type: "paragraph" }] },
      completed: false,
      position: 1000,
      updatedAt: "2026-09-21T12:00:00Z",
    },
  ],
  syncedAt: "2026-09-21T12:00:00Z",
  includesImages: false,
};

it("falls back to a persisted module when the network request fails", async () => {
  const online = Object.create(memoryNotesRepository);
  online.listChapters = vi.fn().mockRejectedValue(new Error("offline"));
  online.listChapterTopics = vi.fn().mockRejectedValue(new Error("offline"));
  const offline = {
    get: vi.fn().mockResolvedValue(snapshot),
  } as unknown as OfflineModuleService;
  const repository = new OfflineNotesRepository(online, "module", offline);

  const chapters = await repository.listChapters();
  const topics = await repository.listChapterTopics("chapter");

  expect(chapters[0]).toMatchObject({
    id: "chapter",
    topicsCount: 1,
    topicsStatus: "idle",
  });
  expect(topics[0]).toMatchObject({
    id: "topic",
    contentLoaded: true,
  });
});

it("updates the offline copy after a queued note is accepted", async () => {
  const online = Object.create(memoryNotesRepository);
  online.updateTopicContent = vi.fn().mockResolvedValue(undefined);
  const updateTopicContent = vi.fn().mockResolvedValue(undefined);
  const offline = { updateTopicContent } as unknown as OfflineModuleService;
  const repository = new OfflineNotesRepository(online, "module", offline);
  const content = { type: "doc", text: "offline edit" };

  await repository.updateTopicContent("chapter", "topic", content, {
    type: "doc",
  });

  expect(updateTopicContent).toHaveBeenCalledWith("module", "topic", content);
});

it("fetches conflict content only from the server and refreshes the cache", async () => {
  const content = { type: "doc", text: "server version" };
  const online = Object.create(memoryNotesRepository);
  online.getFreshTopicContent = vi.fn().mockResolvedValue(content);
  const updateTopicContent = vi.fn().mockResolvedValue(undefined);
  const offline = { updateTopicContent } as unknown as OfflineModuleService;
  const repository = new OfflineNotesRepository(online, "module", offline);

  await expect(
    repository.getFreshTopicContent("chapter", "topic"),
  ).resolves.toEqual(content);
  expect(online.getFreshTopicContent).toHaveBeenCalledWith("chapter", "topic");
  expect(updateTopicContent).toHaveBeenCalledWith("module", "topic", content);
});
