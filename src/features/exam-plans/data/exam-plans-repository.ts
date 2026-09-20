import type {
  ExamPlan,
  ExamPlanDetails,
  ExamCalendar,
  ExamPlanTopic,
  ReviewDueDateCount,
  SaveExamPlanInput,
} from "../model/types";

export type ExamPlanningMaterial = {
  topics: ExamPlanTopic[];
  unassignedQuestionCount: number;
  unassignedDueReviewCount: number;
  unassignedReviewDueDateCounts: ReviewDueDateCount[];
  reviewSecondsPerQuestion: number;
  paceSampleSize: number;
};

export type ExamPlanningChapter = {
  id: string;
  title: string;
  position: number;
  topicCount: number;
  unfinishedTopicCount: number;
};

export type ExamPlanningScope = Omit<ExamPlanningMaterial, "topics"> & {
  chapterCount: number;
  topicCount: number;
  unfinishedTopicCount: number;
};

export type ExamPlanningChapterCursor = {
  position: number;
  id: string;
};

export type ExamPlanningChapterPage = {
  chapters: ExamPlanningChapter[];
  totalCount: number;
  hasMore: boolean;
  nextCursor: ExamPlanningChapterCursor | null;
};

export interface ExamPlansRepository {
  list(moduleId?: string): Promise<ExamPlan[]>;
  getCalendar(fromDate: string): Promise<ExamCalendar>;
  get(planId: string): Promise<ExamPlanDetails>;
  getPlanningScope(moduleId: string): Promise<ExamPlanningScope>;
  getPlanningChapters(
    moduleId: string,
    options?: {
      query?: string;
      cursor?: ExamPlanningChapterCursor;
      limit?: number;
    },
  ): Promise<ExamPlanningChapterPage>;
  getPlanningTopics(
    moduleId: string,
    chapterIds?: string[],
    searchQuery?: string,
  ): Promise<ExamPlanTopic[]>;
  getPlanningMaterial(moduleId: string): Promise<ExamPlanningMaterial>;
  save(input: SaveExamPlanInput): Promise<string>;
  rebuild(
    planId: string,
    creditedTopicIds?: Iterable<string>,
    today?: string,
  ): Promise<ExamPlanDetails>;
  rebuildAdaptivePlans(today?: string, force?: boolean): Promise<void>;
  moveAssignment(
    planId: string,
    topicId: string,
    targetDate: string,
  ): Promise<ExamPlanDetails>;
  delete(planId: string): Promise<void>;
}
