// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StatisticsPage } from "./statistics-page";
import type { StatisticsRepository } from "../data/statistics-repository";
import type { StudyStatistics } from "../model/types";

afterEach(cleanup);

const statistics: StudyStatistics = {
  summary: {
    completedSessions: 4,
    answers: 40,
    successful: 32,
    accuracy: 80,
    previousAccuracy: 70,
    durationSeconds: 3600,
    activeDays: 3,
    currentStreak: 2,
    longestStreak: 5,
  },
  daily: [
    {
      date: "2026-09-08",
      sessions: 1,
      answers: 10,
      successful: 8,
      durationSeconds: 900,
    },
  ],
  sessionTrend: [],
  areas: [],
  modules: [],
  recentSessions: [
    {
      id: "session",
      moduleId: "module",
      moduleName: "Anatomia",
      mode: "test",
      status: "completed",
      startedAt: "2026-09-08T10:00:00Z",
      completedAt: "2026-09-08T10:15:00Z",
      answers: 10,
      accuracy: 80,
      durationSeconds: 900,
    },
  ],
  records: {
    bestAccuracy: 90,
    mostAnswersInDay: 20,
    mostActiveDate: "2026-09-08",
  },
  weeklyGoal: { minutes: 150, completedSeconds: 3600 },
};

it("loads the complete summary and saves a weekly goal", async () => {
  const repository: StatisticsRepository = {
    get: vi.fn().mockResolvedValue(statistics),
    saveWeeklyGoal: vi.fn().mockResolvedValue(undefined),
  };
  render(
    <StatisticsPage
      repository={repository}
      moduleId="module"
      moduleName="Anatomia"
      onBack={vi.fn()}
    />,
  );

  expect((await screen.findAllByText("80%")).length).toBeGreaterThan(0);
  expect(screen.getByText("+10 pp vs wcześniej")).toBeTruthy();
  expect(screen.getByText("Anatomia")).toBeTruthy();
  expect(screen.getByText(/8 wrz 2026/)).toBeTruthy();

  fireEvent.change(screen.getByLabelText("Cel tygodniowy w minutach"), {
    target: { value: "210" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

  await waitFor(() =>
    expect(repository.saveWeeklyGoal).toHaveBeenCalledWith(210),
  );
});
