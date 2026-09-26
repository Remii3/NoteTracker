import type {
  GeneratedSummaryResult,
  SaveSummaryInput,
  SavedSummaryNote,
  SummaryLength,
} from "../model/types";

export interface SummaryGenerationService {
  getConfig(): Promise<{ maxTopics: number }>;
  generate(input: {
    moduleId: string;
    topicIds: string[];
    length: SummaryLength;
    regenerate?: boolean;
  }): Promise<GeneratedSummaryResult>;
  save(input: SaveSummaryInput): Promise<SavedSummaryNote>;
}
