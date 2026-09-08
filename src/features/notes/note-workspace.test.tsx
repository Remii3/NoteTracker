// @vitest-environment jsdom
import type { ComponentProps, ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { NoteWorkspace } from "./note-workspace";
import { initialChapters } from "./data/mock-data";
import type { WorkspaceSidebar } from "./components/workspace-sidebar";
import type { WorkspaceHeader } from "./components/workspace-header";
import type { TopicPage } from "./components/topic-page";

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarInset: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("./components/workspace-sidebar", () => ({
  WorkspaceSidebar: ({
    onSignOut,
  }: ComponentProps<typeof WorkspaceSidebar>) => (
    <button onClick={onSignOut}>Wyloguj</button>
  ),
}));
vi.mock("./components/workspace-header", () => ({
  WorkspaceHeader: ({
    onChangeEditingMode,
  }: ComponentProps<typeof WorkspaceHeader>) => (
    <button onClick={() => onChangeEditingMode(true)}>Edytuj</button>
  ),
}));
vi.mock("./components/topic-page", () => ({
  TopicPage: ({
    onContentChange,
    editorDirty,
  }: ComponentProps<typeof TopicPage>) => (
    <>
      <button onClick={() => onContentChange({ text: "draft" })}>
        Zmień notatkę
      </button>
      <span>{editorDirty ? "Brudny szkic" : "Czysty szkic"}</span>
    </>
  ),
}));
vi.mock("./hooks/use-rich-text-module", () => ({
  useRichTextModule: () => ({
    richTextModule: null,
    preloadRichTextEditor: () => {},
  }),
}));
afterEach(cleanup);
function setup() {
  const signOut = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/modules/:moduleId/*",
        element: (
          <NoteWorkspace
            initialChapters={initialChapters}
            onSignOut={signOut}
          />
        ),
      },
    ],
    {
      initialEntries: ["/modules/module/chapters/python/podstawy"],
    },
  );
  render(<RouterProvider router={router} />);
  return { signOut, router };
}
it("allows signing out when notes are saved", async () => {
  const { signOut } = setup();
  fireEvent.click(await screen.findByText("Wyloguj"));
  expect(signOut).toHaveBeenCalledOnce();
});
it("requires explicit discard before signing out with unsaved notes", async () => {
  const { signOut } = setup();
  fireEvent.click(await screen.findByText("Edytuj"));
  fireEvent.click(screen.getByText("Zmień notatkę"));
  fireEvent.click(screen.getByText("Wyloguj"));
  expect(await screen.findByText("Masz niezapisane zmiany")).toBeTruthy();
  expect(signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Zostań" }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.getByText("Brudny szkic")).toBeTruthy();
  expect(signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Wyloguj"));
  fireEvent.click(
    await screen.findByRole("button", { name: "Odrzuć i wyloguj" }),
  );
  expect(signOut).toHaveBeenCalledOnce();
});
it("blocks navigation to a different chapter with the same topic slug", async () => {
  const { router } = setup();
  fireEvent.click(await screen.findByText("Edytuj"));
  fireEvent.click(screen.getByText("Zmień notatkę"));
  await act(async () => {
    void router.navigate("/modules/module/chapters/sql/podstawy");
  });
  expect(await screen.findByText("Masz niezapisane zmiany")).toBeTruthy();
  expect(router.state.location.pathname).toBe(
    "/modules/module/chapters/python/podstawy",
  );
});
