import type {
  ProgressTopicCursor,
  ProgressTopicsPage,
  ProgressTopicSort,
  StatisticsMode,
  StatisticsRange,
  StudyStatistics,
} from "../model/types";

export interface StatisticsRepository {
  get(options: {
    moduleId: string | null;
    range: StatisticsRange;
    mode: StatisticsMode;
    timezone: string;
  }): Promise<StudyStatistics>;
  getTopicsPage(options: {
    moduleId: string;
    sort: ProgressTopicSort;
    cursor: ProgressTopicCursor | null;
    pageSize?: number;
  }): Promise<ProgressTopicsPage>;
  saveWeeklyGoal(topics: number): Promise<void>;
}
