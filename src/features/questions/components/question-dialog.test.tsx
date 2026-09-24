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
import { QuestionDialog } from "./question-dialog";

vi.mock("@/components/ui/toast", () => ({
  toast: { add: vi.fn() },
}));

afterEach(cleanup);

function renderDialog(repository: QuestionsRepository) {
  render(
    <QuestionDialog
      chapters={[]}
      repository={repository}
      loadTopics={vi.fn().mockResolvedValue([])}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );

  fireEvent.change(screen.getByLabelText("Pytanie"), {
    target: { value: "Stolica Polski?" },
  });
  fireEvent.change(screen.getByLabelText("Odpowiedź 1"), {
    target: { value: "Warszawa" },
  });
}

it("blocks an exact duplicate before saving", async () => {
  const save = vi.fn();
  const repository = {
    getDuplicateStatus: vi
      .fn()
      .mockResolvedValue({ kind: "exact", questionId: "existing" }),
    save,
  } as unknown as QuestionsRepository;
  renderDialog(repository);

  fireEvent.click(screen.getByRole("button", { name: "Zapisz pytanie" }));

  expect(
    await screen.findByText(/Identyczne pytanie już istnieje/),
  ).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(
    screen
      .getByRole("button", { name: "Zapisz pytanie" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("requires confirmation for the same content with different answers", async () => {
  const save = vi.fn().mockResolvedValue("saved");
  const repository = {
    getDuplicateStatus: vi
      .fn()
      .mockResolvedValue({ kind: "same_content", questionId: "existing" }),
    save,
  } as unknown as QuestionsRepository;
  renderDialog(repository);

  fireEvent.click(screen.getByRole("button", { name: "Zapisz pytanie" }));
  const confirm = await screen.findByRole("button", {
    name: "Zapisz mimo to",
  });
  expect(save).not.toHaveBeenCalled();

  fireEvent.click(confirm);
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
});
