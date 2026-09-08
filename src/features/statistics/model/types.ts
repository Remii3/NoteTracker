import type { StudyMode } from "@/features/questions/model/types";

export type StatisticsRange = 0 | 7 | 30 | 90;
export type StatisticsMode = "all" | StudyMode;

export type StatisticsSummary = {
  completedSessions: number;
  answers: number;
  successful: number;
  accuracy: number;
  previousAccuracy: number | null;
  durationSeconds: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
};

export type DailyStatistics = {
  date: string;
  sessions: number;
  answers: number;
  successful: number;
  durationSeconds: number;
};

export type AreaStatistics = {
  chapterId: string;
  chapterTitle: string;
  topicId: string | null;
  topicTitle: string | null;
  answers: number;
  accuracy: number;
  lastStudiedAt: string | null;
};

export type ModuleStatistics = {
  id: string;
  name: string;
  answers: number;
  accuracy: number;
  lastStudiedAt: string | null;
};

export type SessionTrend = {
  id: string;
  date: string;
  mode: StudyMode;
  answers: number;
  accuracy: number;
};

export type RecentSessionStatistics = {
  id: string;
  moduleId: string;
  moduleName: string;
  mode: StudyMode;
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt: string | null;
  answers: number;
  accuracy: number;
  durationSeconds: number;
};

export type StudyStatistics = {
  summary: StatisticsSummary;
  daily: DailyStatistics[];
  sessionTrend: SessionTrend[];
  areas: AreaStatistics[];
  modules: ModuleStatistics[];
  recentSessions: RecentSessionStatistics[];
  records: {
    bestAccuracy: number;
    mostAnswersInDay: number;
    mostActiveDate: string | null;
  };
  weeklyGoal: { minutes: number; completedSeconds: number };
};

export function areaStatus(answers: number, accuracy: number) {
  if (answers < 5) return "Za mało danych";
  if (accuracy < 60) return "Do powtórki";
  if (accuracy < 80) return "W trakcie";
  return "Mocny";
}
