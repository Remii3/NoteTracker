import type { StudyMode } from "@/features/questions/model/types";

export type StatisticsRange = 0 | 7 | 30 | 90;
export type StatisticsMode = "all" | StudyMode;
export type ProgressTopicSort = "chapter" | "completed" | "incomplete";
export type ProgressTopicFilter = "all" | "completed" | "incomplete";

export type ProgressTopic = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  title: string;
  completed: boolean;
  firstCompletedAt: string | null;
};

export type ProgressTopicCursor = {
  sortRank: number;
  chapterPosition: number;
  topicPosition: number;
  topicId: string;
};

export type ProgressTopicsPage = {
  items: ProgressTopic[];
  nextCursor: ProgressTopicCursor | null;
};

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

export type ProgressStatistics = {
  summary: {
    totalModules: number;
    completedModules: number;
    totalTopics: number;
    completedTopics: number;
    remainingTopics: number;
    totalChapters: number;
    completedChapters: number;
    currentStreak: number;
    longestStreak: number;
  };
  daily: Array<{
    date: string;
    completedTopics: number;
  }>;
  modules: Array<{
    id: string;
    name: string;
    chapters: number;
    completedChapters: number;
    topics: number;
    completedTopics: number;
  }>;
  chapters: Array<{
    id: string;
    moduleId: string;
    title: string;
    topics: number;
    completedTopics: number;
  }>;
  weeklyGoal: {
    topics: number;
    completedTopics: number;
    bestCompletedTopics: number;
  };
};

export type StudyStatistics = {
  progress: ProgressStatistics;
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
