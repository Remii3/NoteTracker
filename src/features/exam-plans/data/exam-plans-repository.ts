import type {
  ExamPlan,
  ExamPlanDetails,
  ExamCalendar,
  ExamPlanTopic,
  SaveExamPlanInput,
} from "../model/types";

export type ExamPlanningMaterial = {
  topics: ExamPlanTopic[];
  unassignedQuestionCount: number;
  unassignedDueReviewCount: number;
  unassignedReviewDueDates: string[];
  reviewSecondsPerQuestion: number;
  paceSampleSize: number;
};

export interface ExamPlansRepository {
  list(moduleId?: string): Promise<ExamPlan[]>;
  getCalendar(fromDate: string): Promise<ExamCalendar>;
  get(planId: string): Promise<ExamPlanDetails>;
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
