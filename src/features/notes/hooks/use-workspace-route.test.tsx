// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { useWorkspaceRoute } from "./use-workspace-route";
import { useNotesStore } from "./use-notes-store";
import { initialChapters } from "../data/mock-data";
import { memoryNotesRepository } from "../data/memory-notes-repository";
afterEach(cleanup);
it("keeps a deep link unchanged when the initial chapter load failed", () => {
  function Workspace() {
    useWorkspaceRoute({
      chapters: [],
      isTopicDirty: () => false,
      loadFailed: true,
      resolveChapterTopics: vi.fn(),
    });
    return <span data-testid="path">{window.location.pathname}</span>;
  }
  const path = "/modules/m/chapters/chapter/topic";
  const router = createMemoryRouter(
    [{ path: "/modules/:moduleId/*", element: <Workspace /> }],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  expect(router.state.location.pathname).toBe(path);
});

it("stops after a failed chapter request until the user retries", async () => {
  const chapter = {
    ...initialChapters[0],
    topics: [],
    topicsStatus: "idle" as const,
  };
  const repository = Object.create(memoryNotesRepository);
  repository.listChapterTopics = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValue([]);
  function Workspace() {
    const store = useNotesStore({ repository, initialChapters: [chapter] });
    const route = useWorkspaceRoute({
      chapters: store.chapters,
      isTopicDirty: () => false,
      resolveChapterTopics: store.loadChapterTopics,
    });
    return (
      <>
        <span>{route.chapter?.topicsStatus}</span>
        <button onClick={() => void store.loadChapterTopics(chapter.id)}>
          Retry
        </button>
      </>
    );
  }
  const router = createMemoryRouter(
    [{ path: "/modules/:moduleId/*", element: <Workspace /> }],
    { initialEntries: [`/modules/m/chapters/${chapter.slug}`] },
  );
  render(<RouterProvider router={router} />);
  await screen.findByText("error");
  expect(repository.listChapterTopics).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText("Retry"));
  await waitFor(() => expect(screen.getByText("loaded")).toBeTruthy());
  expect(repository.listChapterTopics).toHaveBeenCalledTimes(2);
});
