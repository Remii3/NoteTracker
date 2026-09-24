// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import { createQuestionFormValue } from "../model/question-form";
import { QuestionFormFields } from "./question-form-fields";

afterEach(cleanup);

function FormHarness() {
  const [value, setValue] = useState(() => createQuestionFormValue());
  return <QuestionFormFields value={value} onChange={setValue} />;
}

it("uses one form for flashcards and test questions", () => {
  render(<FormHarness />);

  expect(screen.queryByText("Typ materiału")).toBeNull();
  expect(
    screen.getByText("Materiał będzie dostępny tylko jako fiszka."),
  ).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Odpowiedź 1"), {
    target: { value: "Warszawa" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Dodaj odpowiedź" }));

  expect(screen.getByLabelText("Odpowiedź 2")).toBeTruthy();
  expect(
    screen.getByText("Materiał będzie dostępny jako fiszka i pytanie testowe."),
  ).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Odpowiedź 2"), {
    target: { value: "Kraków" },
  });
  fireEvent.click(
    screen.getByRole("radio", { name: "Odpowiedź 2 jest poprawna" }),
  );
  expect(
    (
      screen.getByRole("radio", {
        name: "Odpowiedź 2 jest poprawna",
      }) as HTMLInputElement
    ).checked,
  ).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Usuń odpowiedź 1" }));
  expect(screen.queryByLabelText("Odpowiedź 2")).toBeNull();
  expect(screen.getByDisplayValue("Kraków")).toBeTruthy();
  expect(
    screen.getByText("Materiał będzie dostępny tylko jako fiszka."),
  ).toBeTruthy();
});
