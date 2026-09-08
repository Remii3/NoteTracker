// @vitest-environment jsdom
import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GalleryPage } from "./gallery-page";
import type { TopicImagesService } from "../data/topic-images-service";
vi.mock("./image-preview-dialog", () => ({ ImagePreviewDialog: () => null }));
vi.mock("@/components/ui/dropdown-menu", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  );
  return {
    DropdownMenu: Wrapper,
    DropdownMenuContent: Wrapper,
    DropdownMenuGroup: Wrapper,
    DropdownMenuLabel: Wrapper,
    DropdownMenuTrigger: Wrapper,
    DropdownMenuRadioGroup: ({
      children,
      value,
      onValueChange,
    }: {
      children: ReactNode;
      value: string;
      onValueChange: (value: string) => void;
    }) => (
      <select
        aria-label="Sort"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
      >
        {children}
      </select>
    ),
    DropdownMenuRadioItem: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: string;
    }) => <option value={value}>{children}</option>,
  };
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("uses the new sort when the existing observer loads another page", async () => {
  let intersect!: () => void;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
        intersect = () => callback([{ isIntersecting: true }]);
      }
      observe() {}
      disconnect() {}
    },
  );
  const listGallerySections = vi
    .fn()
    .mockResolvedValue({ sections: [], hasMore: true });
  const service = { listGallerySections } as unknown as TopicImagesService;
  render(
    <GalleryPage
      moduleId="m"
      sortMode="manual"
      service={service}
      onOpenTopic={() => {}}
    />,
  );
  await waitFor(() => expect(listGallerySections).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "az" } });
  await waitFor(() => expect(listGallerySections).toHaveBeenCalledTimes(2));
  await act(async () => intersect());
  expect(listGallerySections.mock.calls.at(-1)?.[1]).toBe("az");
  expect(listGallerySections).toHaveBeenCalledTimes(3);
});
