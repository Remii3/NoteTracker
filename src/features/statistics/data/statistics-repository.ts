import type {
  ProgressTopicCursor,
  ProgressTopicFilter,
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
    filter: ProgressTopicFilter;
    cursor: ProgressTopicCursor | null;
    pageSize?: number;
  }): Promise<ProgressTopicsPage>;
}
