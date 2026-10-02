// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import type { QuestionsRepository } from "../data/questions-repository";
import { QuestionsPage } from "./questions-page";

vi.mock("@/layout/app-header-actions", () => ({
  AppHeaderActions: ({ children }: { children: ReactNode }) => children,
}));

afterEach(cleanup);

it("lets the user select questions and open bulk assignment", async () => {
  const repository = {
    list: vi.fn().mockResolvedValue({
      questions: [
        {
          id: "question-1",
          chapterId: null,
          topicId: null,
          chapterTitle: null,
          topicTitle: null,
          content: "Pierwsze pytanie",
          explanation: null,
          options: [{ id: "option-1", content: "Odpowiedź", isCorrect: true }],
        },
      ],
      total: 1,
    }),
    getAvailability: vi.fn().mockResolvedValue({
      flashcardsCount: 1,
      testQuestionsCount: 0,
    }),
  } as unknown as QuestionsRepository;

  render(
    <QuestionsPage
      chapters={[]}
      repository={repository}
      loadTopics={vi.fn()}
      onOpenSession={vi.fn()}
      onOpenHistory={vi.fn()}
    />,
  );

  fireEvent.click(
    await screen.findByRole("checkbox", {
      name: "Zaznacz pytanie: Pierwsze pytanie",
    }),
  );
  expect(screen.getByText("Zaznaczono: 1")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Przypisz/ }));

  expect(
    screen.getByRole("heading", { name: "Przypisz zaznaczone pytania" }),
  ).toBeTruthy();
  expect(screen.getByText(/dla 1 pytania/)).toBeTruthy();
});

it("passes the flashcard answer visibility setting to the new session", async () => {
  const createSession = vi.fn().mockResolvedValue("session");
  const repository = {
    list: vi.fn().mockResolvedValue({ questions: [], total: 0 }),
    getAvailability: vi.fn().mockResolvedValue({
      flashcardsCount: 2,
      testQuestionsCount: 1,
    }),
    createSession,
  } as unknown as QuestionsRepository;
  const onOpenSession = vi.fn();

  render(
    <QuestionsPage
      chapters={[]}
      repository={repository}
      loadTopics={vi.fn()}
      onOpenSession={onOpenSession}
      onOpenHistory={vi.fn()}
    />,
  );

  const openFlashcards = screen.getByRole("button", {
    name: "Sprawdź się w fiszkach",
  });
  await waitFor(() =>
    expect(openFlashcards.hasAttribute("disabled")).toBe(false),
  );
  fireEvent.click(openFlashcards);

  expect(await screen.findByText("Dostępnych pytań: 2.")).toBeTruthy();
  const visibilitySwitch = screen.getByRole("switch", {
    name: "Ukryj odpowiedzi",
  });
  expect(visibilitySwitch.getAttribute("aria-checked")).toBe("false");
  fireEvent.click(visibilitySwitch);
  expect(visibilitySwitch.getAttribute("aria-checked")).toBe("true");

  fireEvent.click(screen.getByRole("button", { name: "Rozpocznij" }));

  await waitFor(() =>
    expect(createSession).toHaveBeenCalledWith({
      mode: "flashcards",
      scope: "all",
      chapterId: undefined,
      topicId: undefined,
      randomChapterCount: 3,
      questionCount: 20,
      hideFlashcardOptions: true,
    }),
  );
  expect(onOpenSession).toHaveBeenCalledWith("flashcards", "session");
});
