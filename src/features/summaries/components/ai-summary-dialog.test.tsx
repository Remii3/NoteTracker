// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { SummaryGenerationService } from "../data/summary-generation-service";
import { AiSummaryDialog } from "./ai-summary-dialog";

afterEach(cleanup);

it("generates a summary for a selected chapter and saves it as a note", async () => {
  const service = {
    getConfig: vi.fn().mockResolvedValue({ maxTopics: 5 }),
    generate: vi.fn().mockResolvedValue({
      maxTopics: 5,
      cached: false,
      sourceTopics: [{ chapterTitle: "Rozdział", topicTitle: "Temat" }],
      summary: {
        suggestedTitle: "Streszczenie biologii",
        introduction: "Wprowadzenie do materiału.",
        sections: [
          {
            title: "Najważniejsze pojęcia",
            summary: "Opis najważniejszych pojęć.",
            keyPoints: ["Pierwszy punkt"],
          },
        ],
        connections: ["Pojęcia są ze sobą powiązane."],
        thingsToRemember: ["Zapamiętaj definicję."],
      },
    }),
    save: vi.fn().mockResolvedValue({
      chapterId: "chapter-summary",
      topicId: "topic-summary",
    }),
  } as unknown as SummaryGenerationService;
  const onSaved = vi.fn().mockResolvedValue(undefined);

  render(
    <AiSummaryDialog
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
      onSaved={onSaved}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Wybierz cały" }));
  await screen.findByText("Wybrano 1 / 5 tematów");
  fireEvent.click(screen.getByRole("button", { name: "Generuj streszczenie" }));

  const titleInput = await screen.findByDisplayValue("Streszczenie biologii");
  fireEvent.change(titleInput, {
    target: { value: "Moje streszczenie" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz jako notatkę" }));

  await waitFor(() =>
    expect(service.save).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleId: "module-1",
        title: "Moje streszczenie",
        content: expect.objectContaining({ type: "doc" }),
      }),
    ),
  );
  expect(onSaved).toHaveBeenCalledWith({
    chapterId: "chapter-summary",
    topicId: "topic-summary",
  });
});
