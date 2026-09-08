// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StudySession } from "./study-session";
import type { QuestionsRepository } from "../data/questions-repository";
import type { StudySession as Session } from "../model/types";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
afterEach(cleanup);
function session(answered = false): Session {
  return {
    id: "session",
    mode: "test",
    status: "in_progress",
    configuration: {},
    startedAt: "2026-09-08",
    completedAt: null,
    items: [
      {
        id: "item",
        position: 1,
        question: "Pytanie?",
        explanation: null,
        options: [
          { id: "yes", content: "Tak", isCorrect: true },
          { id: "no", content: "Nie", isCorrect: false },
        ],
        result: answered ? "correct" : null,
        selectedOptionId: answered ? "yes" : null,
        activeDurationSeconds: 0,
      },
    ],
  };
}
function repository(data = session()) {
  return {
    getSession: vi.fn().mockResolvedValue(data),
    answerItem: vi.fn().mockResolvedValue(undefined),
    completeSession: vi.fn().mockResolvedValue(undefined),
  } as unknown as QuestionsRepository;
}
it("retries a failed session request and allows returning", async () => {
  const repo = repository();
  vi.mocked(repo.getSession).mockRejectedValueOnce(new Error("offline"));
  const back = vi.fn();
  render(<StudySession sessionId="session" repository={repo} onClose={back} />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(await screen.findByText("Pytanie?")).toBeTruthy();
  expect(repo.getSession).toHaveBeenCalledTimes(2);
});
it("resumes fully answered sessions at completion without rewriting answers", async () => {
  const repo = repository(session(true));
  vi.mocked(repo.completeSession).mockRejectedValueOnce(new Error("offline"));
  render(
    <StudySession sessionId="session" repository={repo} onClose={() => {}} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Zakończ sesję" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Zakończ sesję",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Zakończ sesję" }));
  expect(await screen.findByText("Sesja ukończona")).toBeTruthy();
  expect(repo.answerItem).not.toHaveBeenCalled();
  expect(repo.completeSession).toHaveBeenCalledTimes(2);
});
it("retains the final answer when session completion fails", async () => {
  const repo = repository();
  vi.mocked(repo.completeSession).mockRejectedValueOnce(new Error("offline"));
  render(
    <StudySession sessionId="session" repository={repo} onClose={() => {}} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: "A. Tak" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Następne pytanie",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Następne pytanie" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Zakończ sesję",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Zakończ sesję" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("button", {
          name: "Zakończ sesję",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false),
  );
  expect(repo.answerItem).toHaveBeenCalledExactlyOnceWith(
    "item",
    "correct",
    "yes",
    expect.any(Number),
  );
  expect(screen.queryByText("Pytanie?")).toBeNull();
});
it("handles empty sessions without crashing", async () => {
  render(
    <StudySession
      sessionId="session"
      repository={repository({ ...session(), items: [] })}
      onClose={() => {}}
    />,
  );
  expect(await screen.findByRole("alert")).toBeTruthy();
});
