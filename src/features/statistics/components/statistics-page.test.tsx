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
  progress: {
    summary: {
      totalModules: 1,
      completedModules: 0,
      totalTopics: 2,
      completedTopics: 1,
      remainingTopics: 1,
      totalChapters: 1,
      completedChapters: 0,
      currentStreak: 2,
      longestStreak: 3,
    },
    daily: [{ date: "2026-09-08", completedTopics: 1 }],
    modules: [],
    chapters: [
      {
        id: "chapter",
        moduleId: "module",
        title: "Układ krążenia",
        topics: 2,
        completedTopics: 1,
      },
    ],
    topics: [
      {
        id: "topic",
        chapterId: "chapter",
        title: "Serce",
        completed: true,
        firstCompletedAt: "2026-09-08T10:00:00Z",
      },
    ],
    weeklyGoal: { topics: 5, completedTopics: 1, bestCompletedTopics: 4 },
  },
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
  areas: [
    {
      chapterId: "chapter",
      chapterTitle: "Układ krążenia",
      topicId: "topic",
      topicTitle: "Serce",
      answers: 10,
      accuracy: 80,
      lastStudiedAt: "2026-09-08T10:00:00Z",
    },
  ],
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
  expect(screen.getByText("Anatomia")).toBeTruthy();
  expect(screen.getByText(/8 wrz 2026/)).toBeTruthy();
  expect(screen.getByText("Postęp rozdziałów")).toBeTruthy();
  expect(screen.queryByText("Pierwszy krok")).toBeNull();
  expect(screen.queryByText("Odznaki postępu")).toBeNull();
  expect(
    screen.getByText("Najlepszy tydzień: 4 ukończonych tematów"),
  ).toBeTruthy();
  expect(screen.getByText("1 z 2 tematów ukończonych")).toBeTruthy();
  expect(screen.getAllByText("Układ krążenia").length).toBeGreaterThan(0);

  fireEvent.change(
    screen.getByLabelText("Tygodniowy cel ukończonych tematów"),
    {
      target: { value: "8" },
    },
  );
  fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

  await waitFor(() =>
    expect(repository.saveWeeklyGoal).toHaveBeenCalledWith(8),
  );
});
