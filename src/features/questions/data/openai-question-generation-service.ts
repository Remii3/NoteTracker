import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { QuestionGenerationService } from "./question-generation-service";
import type {
  GeneratedQuestionProposal,
  GeneratedTopicQuestions,
} from "../model/types";

type WorkerQuestion = Omit<
  GeneratedQuestionProposal,
  "topicId" | "topicTitle" | "chapterId" | "chapterTitle"
>;
type WorkerTopic = {
  id: string;
  title: string;
  chapterId: string;
  chapterTitle: string;
  cached: boolean;
  questions: WorkerQuestion[];
};

export class OpenAiQuestionGenerationService implements QuestionGenerationService {
  private readonly client: SupabaseClient<Database>;
  private readonly apiUrl: string;

  constructor(client: SupabaseClient<Database>, apiUrl: string) {
    this.client = client;
    this.apiUrl = apiUrl;
  }

  private async request(
    path: string,
    body: unknown,
    method: "GET" | "POST" = "POST",
  ) {
    const { data, error } = await this.client.auth.getSession();
    if (error || !data.session) {
      throw new Error("Sesja wygasła. Zaloguj się ponownie.", {
        cause: error,
      });
    }
    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      let message = "Nie udało się wygenerować pytań.";
      try {
        const value = (await response.json()) as { error?: unknown };
        if (typeof value.error === "string" && value.error)
          message = value.error;
      } catch {
        // The fallback remains useful when an upstream proxy returns non-JSON.
      }
      throw new Error(message);
    }
    return response.json() as Promise<unknown>;
  }

  async getConfig() {
    const value = await this.request("/config", null, "GET");
    if (
      typeof value !== "object" ||
      value === null ||
      !("maxTopics" in value) ||
      typeof value.maxTopics !== "number"
    ) {
      throw new Error("Generator zwrócił nieprawidłową konfigurację.");
    }
    return { maxTopics: value.maxTopics };
  }

  async generate(input: {
    moduleId: string;
    topicIds: string[];
    questionCount: number;
  }) {
    const value = await this.request("/generate", input);
    if (!isGenerationResponse(value)) {
      throw new Error("Generator zwrócił nieprawidłowe dane.");
    }
    return {
      maxTopics: value.maxTopics,
      topics: value.topics.map(mapTopic),
    };
  }

  async reroll(input: {
    moduleId: string;
    topicId: string;
    replaceId: string;
    currentQuestions: GeneratedQuestionProposal[];
  }) {
    const currentQuestions = input.currentQuestions.map(
      ({ id, content, explanation, options }) => ({
        id,
        content,
        explanation,
        options,
      }),
    );
    const value = await this.request("/reroll", { ...input, currentQuestions });
    if (
      typeof value !== "object" ||
      value === null ||
      !("question" in value) ||
      !isWorkerQuestion(value.question)
    ) {
      throw new Error("Generator zwrócił nieprawidłowe pytanie.");
    }
    const current = input.currentQuestions.find(
      (question) => question.id === input.replaceId,
    );
    if (!current) throw new Error("Nie znaleziono pytania do ponowienia.");
    return { ...value.question, ...pickLocation(current) };
  }
}

function pickLocation(question: GeneratedQuestionProposal) {
  return {
    topicId: question.topicId,
    topicTitle: question.topicTitle,
    chapterId: question.chapterId,
    chapterTitle: question.chapterTitle,
  };
}

function mapTopic(topic: WorkerTopic): GeneratedTopicQuestions {
  return {
    topicId: topic.id,
    topicTitle: topic.title,
    chapterId: topic.chapterId,
    chapterTitle: topic.chapterTitle,
    cached: topic.cached,
    questions: topic.questions.map((question) => ({
      ...question,
      topicId: topic.id,
      topicTitle: topic.title,
      chapterId: topic.chapterId,
      chapterTitle: topic.chapterTitle,
    })),
  };
}

function isGenerationResponse(
  value: unknown,
): value is { topics: WorkerTopic[]; maxTopics: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "maxTopics" in value &&
    typeof value.maxTopics === "number" &&
    "topics" in value &&
    Array.isArray(value.topics) &&
    value.topics.every(isWorkerTopic)
  );
}

function isWorkerTopic(value: unknown): value is WorkerTopic {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "title" in value &&
    typeof value.title === "string" &&
    "chapterId" in value &&
    typeof value.chapterId === "string" &&
    "chapterTitle" in value &&
    typeof value.chapterTitle === "string" &&
    "cached" in value &&
    typeof value.cached === "boolean" &&
    "questions" in value &&
    Array.isArray(value.questions) &&
    value.questions.every(isWorkerQuestion)
  );
}

function isWorkerQuestion(value: unknown): value is WorkerQuestion {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "content" in value &&
    typeof value.content === "string" &&
    "explanation" in value &&
    typeof value.explanation === "string" &&
    "options" in value &&
    Array.isArray(value.options) &&
    value.options.length >= 1 &&
    value.options.every(
      (option) =>
        typeof option === "object" &&
        option !== null &&
        "content" in option &&
        typeof option.content === "string" &&
        "isCorrect" in option &&
        typeof option.isCorrect === "boolean",
    )
  );
}
