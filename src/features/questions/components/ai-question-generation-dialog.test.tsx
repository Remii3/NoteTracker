// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { QuestionGenerationService } from "../data/question-generation-service";
import type { QuestionsRepository } from "../data/questions-repository";
import { AiQuestionGenerationDialog } from "./ai-question-generation-dialog";

afterEach(cleanup);

it("generates a selected chapter preview and approves its questions", async () => {
  const generatedQuestion = {
    id: "proposal-1",
    topicId: "topic-1",
    topicTitle: "Temat",
    chapterId: "chapter-1",
    chapterTitle: "Rozdział",
    content: "Która odpowiedź jest poprawna?",
    explanation: "Ponieważ wynika to z notatki.",
    options: [
      { content: "Poprawna", isCorrect: true },
      { content: "Błędna", isCorrect: false },
    ],
  };
  const service = {
    getConfig: vi.fn().mockResolvedValue({ maxTopics: 5 }),
    generate: vi.fn().mockResolvedValue({
      maxTopics: 5,
      topics: [
        {
          topicId: "topic-1",
          topicTitle: "Temat",
          chapterId: "chapter-1",
          chapterTitle: "Rozdział",
          cached: false,
          questions: [generatedQuestion],
        },
      ],
    }),
  } as unknown as QuestionGenerationService;
  const approveGeneratedQuestions = vi.fn().mockResolvedValue({
    created: 1,
    duplicatesSkipped: 0,
  });
  const repository = {
    approveGeneratedQuestions,
  } as unknown as QuestionsRepository;
  const onApproved = vi.fn().mockResolvedValue(undefined);

  render(
    <AiQuestionGenerationDialog
      moduleId="module-1"
      chapters={[
        {
          id: "chapter-1",
          slug: "rozdzial",
          title: "Rozdział",
          position: 1000,
          topicsCount: 1,
          completedTopicsCount: 0,
          firstIncompleteTopicId: "topic-1",
          firstIncompleteTopicSlug: "temat",
          topics: [],
          topicsStatus: "idle",
        },
      ]}
      service={service}
      repository={repository}
      loadTopics={vi.fn().mockResolvedValue([
        {
          id: "topic-1",
          slug: "temat",
          title: "Temat",
          content: { type: "doc" },
          completed: false,
          position: 1000,
        },
      ])}
      onClose={vi.fn()}
      onApproved={onApproved}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Wybierz cały" }));
  await screen.findByText("Wybrano 1 / 5 tematów");
  fireEvent.click(screen.getByRole("button", { name: "Generuj propozycje" }));

  expect(
    await screen.findByDisplayValue("Która odpowiedź jest poprawna?"),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Zatwierdź wszystkie (1)" }),
  );

  await waitFor(() =>
    expect(approveGeneratedQuestions).toHaveBeenCalledWith([
      {
        topicId: "topic-1",
        content: "Która odpowiedź jest poprawna?",
        explanation: "Ponieważ wynika to z notatki.",
        options: [
          { content: "Poprawna", isCorrect: true },
          { content: "Błędna", isCorrect: false },
        ],
      },
    ]),
  );
  expect(onApproved).toHaveBeenCalledOnce();
});
