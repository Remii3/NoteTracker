// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { QuestionsRepository } from "../data/questions-repository";
import type { StudySession as StudySessionModel } from "../model/types";
import { StudySession } from "./study-session";

afterEach(cleanup);

function createSession(hideFlashcardOptions: boolean): StudySessionModel {
  return {
    id: "session",
    mode: "flashcards",
    status: "in_progress",
    configuration: { hideFlashcardOptions },
    startedAt: new Date().toISOString(),
    completedAt: null,
    fsrsProfile: {
      desiredRetention: 0.9,
      parameters: null,
      parametersVersion: 1,
    },
    items: [
      {
        id: "item",
        questionId: "question",
        position: 1,
        question: "Stolica Polski to:",
        options: [
          { id: "warsaw", content: "Warszawa", isCorrect: true },
          { id: "krakow", content: "Kraków", isCorrect: false },
        ],
        explanation: null,
        selectedOptionId: null,
        result: null,
        activeDurationSeconds: 0,
        rating: null,
        fsrs: {
          dueAt: new Date().toISOString(),
          lastReviewedAt: null,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          learningSteps: 0,
          repetitions: 0,
          lapses: 0,
          state: "new",
          learningStatus: "new",
          version: 1,
        },
      },
    ],
  };
}

function createRepository(session: StudySessionModel): QuestionsRepository {
  return {
    getSession: vi.fn().mockResolvedValue(session),
  } as unknown as QuestionsRepository;
}

it("shows all variants on a multi-answer flashcard and marks the correct one", async () => {
  render(
    <StudySession
      sessionId="session"
      repository={createRepository(createSession(false))}
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("A. Warszawa")).toBeTruthy();
  expect(screen.getByText("B. Kraków")).toBeTruthy();

  fireEvent.click(
    screen.getByRole("button", { name: "Pokaż prawidłową odpowiedź" }),
  );

  expect(await screen.findByText("A. Warszawa ✓")).toBeTruthy();
  expect(
    screen.getByText("Prawidłowa odpowiedź została oznaczona powyżej."),
  ).toBeTruthy();
});

it("keeps variants hidden until reveal when the session option is enabled", async () => {
  render(
    <StudySession
      sessionId="session"
      repository={createRepository(createSession(true))}
      onClose={vi.fn()}
    />,
  );

  const reveal = await screen.findByRole("button", {
    name: "Pokaż prawidłową odpowiedź",
  });
  expect(screen.queryByText("A. Warszawa")).toBeNull();
  expect(screen.queryByText("B. Kraków")).toBeNull();

  fireEvent.click(reveal);

  expect(await screen.findByText("Warszawa")).toBeTruthy();
  expect(screen.queryByText("Kraków")).toBeNull();
});

it("preserves the exact flashcard self-rating in the session summary", async () => {
  const session = createSession(false);
  const repository = createRepository(session);
  repository.answerItem = vi.fn().mockResolvedValue(undefined);
  repository.completeSession = vi.fn().mockResolvedValue(undefined);

  render(
    <StudySession
      sessionId="session"
      repository={repository}
      onClose={vi.fn()}
    />,
  );

  fireEvent.click(
    await screen.findByRole("button", { name: "Pokaż prawidłową odpowiedź" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Trudne" }));

  await waitFor(() =>
    expect(repository.answerItem).toHaveBeenCalledWith("item", 2, undefined, 1),
  );
  fireEvent.click(await screen.findByRole("button", { name: "Zakończ sesję" }));

  expect(await screen.findByText("Oceniono 1 fiszkę")).toBeTruthy();
  expect(screen.getAllByText("Trudne").length).toBeGreaterThan(0);
});
