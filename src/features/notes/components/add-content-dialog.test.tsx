// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { AddContentDialog } from "./add-content-dialog";
import { initialChapters } from "../data/mock-data";

afterEach(cleanup);

it("requires explicitly selecting the create option before creating a chapter", async () => {
  const onAddChapter = vi.fn().mockResolvedValue(true);
  render(
    <AddContentDialog
      open
      chapters={[]}
      onOpenChange={vi.fn()}
      onAddChapter={onAddChapter}
      onAddTopics={vi.fn()}
    />,
  );

  const chapterInput = screen.getByLabelText("Rozdział");
  fireEvent.click(chapterInput);
  fireEvent.change(chapterInput, {
    target: { value: "Neurologia" },
  });
  expect(
    screen.getByText(
      "Nie wybrano rozdziału. Wybierz wynik albo opcję „Utwórz”.",
    ),
  ).toBeTruthy();

  const submit = screen.getByRole("button", { name: "Dodaj zawartość" });
  expect((submit as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(submit);
  expect(
    screen.getByText(
      "Wybierz istniejący rozdział z listy albo kliknij Utwórz „Neurologia”.",
    ),
  ).toBeTruthy();
  expect((chapterInput as HTMLInputElement).value).toBe("Neurologia");
  expect(onAddChapter).not.toHaveBeenCalled();

  fireEvent.click(
    await screen.findByRole("option", { name: "Utwórz „Neurologia”" }),
  );
  expect(screen.getByText(/Zostanie utworzony nowy rozdział:/)).toBeTruthy();
  const create = screen.getByRole("button", { name: "Utwórz rozdział" });
  expect((create as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(create);

  await waitFor(() =>
    expect(onAddChapter).toHaveBeenCalledWith("Neurologia", []),
  );
});

it("keeps an unselected chapter name after the open list loses focus", async () => {
  render(
    <AddContentDialog
      open
      chapters={[]}
      onOpenChange={vi.fn()}
      onAddChapter={vi.fn()}
      onAddTopics={vi.fn()}
    />,
  );

  const chapterInput = screen.getByLabelText("Rozdział");
  fireEvent.change(chapterInput, { target: { value: "Neurologia" } });
  fireEvent.keyDown(chapterInput, { key: "ArrowDown" });
  expect(chapterInput.getAttribute("aria-expanded")).toBe("true");
  const topicsInput = screen.getByLabelText("Tematy", { selector: "textarea" });
  fireEvent.pointerDown(topicsInput);
  fireEvent.click(topicsInput);

  await waitFor(() =>
    expect(chapterInput.getAttribute("aria-expanded")).toBe("false"),
  );
  expect((chapterInput as HTMLInputElement).value).toBe("Neurologia");
});

it("adds topics when an existing chapter is selected", async () => {
  const chapter = initialChapters[0];
  const onAddChapter = vi.fn();
  const onAddTopics = vi.fn().mockResolvedValue(true);
  render(
    <AddContentDialog
      open
      chapters={[chapter]}
      onOpenChange={vi.fn()}
      onAddChapter={onAddChapter}
      onAddTopics={onAddTopics}
    />,
  );

  fireEvent.change(screen.getByLabelText("Rozdział"), {
    target: { value: chapter.title },
  });
  fireEvent.change(screen.getByLabelText("Tematy"), {
    target: { value: "Nowy temat\nDrugi temat" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Dodaj zawartość" }));

  await waitFor(() =>
    expect(onAddTopics).toHaveBeenCalledWith(chapter.id, [
      "Nowy temat",
      "Drugi temat",
    ]),
  );
  expect(onAddChapter).not.toHaveBeenCalled();
});
