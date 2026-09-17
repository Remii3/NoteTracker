import type { TodayDashboard, TodayTaskType } from "../model/types";

export interface TodayRepository {
  get(timezone: string): Promise<TodayDashboard>;
  deferTask(input: {
    taskType: TodayTaskType;
    taskId: string;
    until: string;
  }): Promise<void>;
  setExamDate(moduleId: string, examDate: string | null): Promise<void>;
  createQuickSession(moduleId: string, timezone: string): Promise<string>;
}
