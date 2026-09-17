export type TodayTaskType = "question" | "topic";
export type QuestionLearningStatus =
  "new" | "learning" | "mastered" | "overdue";

export type TodayQuestion = {
  id: string;
  content: string;
  moduleId: string;
  moduleName: string;
  moduleSlug: string;
  chapterTitle: string | null;
  topicTitle: string | null;
  dueOn: string;
  learningStatus: QuestionLearningStatus;
};

export type TodayTopic = {
  id: string;
  title: string;
  topicSlug: string;
  chapterTitle: string;
  chapterSlug: string;
  moduleId: string;
  moduleName: string;
  moduleSlug: string;
};

export type TodayDashboard = {
  date: string;
  dueQuestionCount: number;
  dueQuestions: TodayQuestion[];
  recommendedTopics: TodayTopic[];
  nearestExam: {
    moduleId: string;
    moduleName: string;
    moduleSlug: string;
    examDate: string;
    topicsCount: number;
    completedTopicsCount: number;
  } | null;
  weeklyGoal: {
    target: number;
    enabled: boolean;
    completed: number;
  };
  recentSummary: {
    sessionId: string;
    completedAt: string;
    answers: number;
    successful: number;
    durationSeconds: number;
  } | null;
  sessionTarget: {
    moduleId: string;
    moduleName: string;
    moduleSlug: string;
  } | null;
  modules: Array<{ id: string; name: string; examDate: string | null }>;
};
