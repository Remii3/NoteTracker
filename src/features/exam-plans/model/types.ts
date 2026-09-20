export type ExamPlanStatus = "active" | "completed" | "archived";

export type ReviewDueDateCount = {
  date: string;
  count: number;
};

export type ExamPlan = {
  id: string;
  moduleId: string;
  name: string;
  examDate: string;
  targetRetention: number;
  studyWeekdays: number[];
  dailyTimeLimitMinutes: number | null;
  dailyQuestionLimit: number | null;
  bufferPercent: number;
  includeUnassignedQuestions: boolean;
  status: ExamPlanStatus;
  needsRebuild: boolean;
  planVersion: number;
  lastRebuiltOn: string | null;
};

export type ExamPlanTopic = {
  id: string;
  chapterId: string;
  chapterTitle: string;
  title: string;
  completed: boolean;
  workloadPoints: number;
  workloadSource: "automatic" | "manual";
  questionCount: number;
  dueReviewCount: number;
  reviewDueDateCounts?: ReviewDueDateCount[];
  /** @deprecated Kept temporarily for previously serialized plan inputs. */
  reviewDueDates?: string[];
};

export type ExamPlanAssignment = {
  topicId: string;
  scheduledFor: string;
  position: number;
  workloadPoints: number;
  isLocked: boolean;
  completedAt: string | null;
};

export type ExamPlanDay = {
  date: string;
  assignments: ExamPlanAssignment[];
  workloadPoints: number;
  reviewTarget: number;
  reviewForecastLow: number;
  reviewForecastHigh: number;
  isBufferDay: boolean;
  isOverloaded: boolean;
  estimatedMinutesLow?: number;
  estimatedMinutesHigh?: number;
};

export type ExamPlanDetails = {
  plan: ExamPlan;
  topics: ExamPlanTopic[];
  scopeTopicIds: string[];
  days: ExamPlanDay[];
  unassignedQuestionCount: number;
  unassignedDueReviewCount: number;
  unassignedReviewDueDateCounts: ReviewDueDateCount[];
  reviewSecondsPerQuestion: number;
  paceSampleSize: number;
};

export type SaveExamPlanInput = Omit<
  ExamPlan,
  "id" | "needsRebuild" | "planVersion" | "lastRebuiltOn" | "status"
> & {
  id?: string;
  expectedPlanVersion?: number;
  rebuiltOn?: string;
  topicSettings: Array<
    Pick<ExamPlanTopic, "id" | "workloadPoints" | "workloadSource">
  >;
  days: ExamPlanDay[];
};

export type ExamCalendar = {
  plans: Array<ExamPlan & { moduleName: string; moduleSlug: string }>;
  days: Array<{
    date: string;
    topicIds: string[];
    reviewForecastLow: number;
    reviewForecastHigh: number;
    isOverloaded: boolean;
    planIds: string[];
  }>;
};
