import type {
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
  saveWeeklyGoal(minutes: number): Promise<void>;
}
