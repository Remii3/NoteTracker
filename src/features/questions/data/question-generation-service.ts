import type {
  GeneratedQuestionProposal,
  GeneratedTopicQuestions,
} from "../model/types";

export interface QuestionGenerationService {
  getConfig(): Promise<{ maxTopics: number }>;
  generate(input: {
    moduleId: string;
    topicIds: string[];
    questionCount: number;
  }): Promise<{ topics: GeneratedTopicQuestions[]; maxTopics: number }>;
  reroll(input: {
    moduleId: string;
    topicId: string;
    replaceId: string;
    currentQuestions: GeneratedQuestionProposal[];
  }): Promise<GeneratedQuestionProposal>;
}
