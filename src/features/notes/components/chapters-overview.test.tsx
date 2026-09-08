// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { initialChapters } from "../data/mock-data";
import { ChaptersOverview } from "./chapters-overview";

afterEach(cleanup);

it("shows compact module progress and continues with the next topic", () => {
  const onOpenChapter = vi.fn();
  render(
    <ChaptersOverview
      chapters={initialChapters}
      moduleName="Programowanie"
      summary={{
        completedChapters: 0,
        completedTopics: 2,
        nextTopic: { chapterId: "chapter-python", id: "topic-async" },
        totalChapters: 2,
        totalTopics: 5,
      }}
      onOpenChapter={onOpenChapter}
    />,
  );

  expect(screen.getByText("Postęp modułu „Programowanie”")).toBeTruthy();
  expect(screen.getByText("2 z 5 tematów ukończonych")).toBeTruthy();
  expect(screen.getByText("40%")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /Kontynuuj naukę/ }));
  expect(onOpenChapter).toHaveBeenCalledWith("chapter-python", "topic-async");
});

it("does not treat an empty module as completed", () => {
  render(<ChaptersOverview chapters={[]} onOpenChapter={vi.fn()} />);

  expect(
    screen.getByText("Dodaj pierwszy temat, aby rozpocząć naukę."),
  ).toBeTruthy();
  expect(screen.getByText("0%")).toBeTruthy();
  expect(screen.queryByText("Moduł ukończony")).toBeNull();
});
