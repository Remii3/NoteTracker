// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { QuestionsRepository } from "../data/questions-repository";
import { StudyHistoryPage } from "./study-history-page";

afterEach(cleanup);

it("calculates a completed test result from answered questions", async () => {
  const repository = {
    listSessions: vi.fn().mockResolvedValue({
      total: 1,
      sessions: [
        {
          id: "session",
          mode: "test",
          status: "completed",
          configuration: { scope: "all" },
          startedAt: "2026-10-21T10:00:00.000Z",
          completedAt: "2026-10-21T10:10:00.000Z",
          totalCount: 10,
          answeredCount: 5,
          successfulCount: 5,
          ratingCounts: { 1: 0, 2: 0, 3: 5, 4: 0 },
        },
      ],
    }),
  } as unknown as QuestionsRepository;

  render(<StudyHistoryPage repository={repository} onOpenSession={vi.fn()} />);

  expect(
    await screen.findByText("5/5 (100%) · odpowiedziano 5/10"),
  ).toBeTruthy();
  expect(screen.queryByText("5/10 (50%)")).toBeNull();
});
