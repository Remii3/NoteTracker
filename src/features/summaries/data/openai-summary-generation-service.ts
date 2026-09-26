import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import type { SummaryGenerationService } from "./summary-generation-service";
import type {
  GeneratedSummary,
  GeneratedSummaryResult,
  SaveSummaryInput,
  SavedSummaryNote,
  SummarySourceTopic,
} from "../model/types";

export class OpenAiSummaryGenerationService implements SummaryGenerationService {
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
      let message = "Nie udało się wygenerować streszczenia.";
      try {
        const value = (await response.json()) as { error?: unknown };
        if (typeof value.error === "string" && value.error)
          message = value.error;
      } catch {
        // An upstream proxy may return a non-JSON error page.
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

  async generate(
    input: Parameters<SummaryGenerationService["generate"]>[0],
  ): Promise<GeneratedSummaryResult> {
    const value = await this.request("/summaries/generate", input);
    if (!isGeneratedSummaryResult(value)) {
      throw new Error("Generator zwrócił nieprawidłowe streszczenie.");
    }
    return value;
  }

  async save(input: SaveSummaryInput): Promise<SavedSummaryNote> {
    const value = await this.request("/summaries/save", input);
    if (
      typeof value !== "object" ||
      value === null ||
      !("chapterId" in value) ||
      typeof value.chapterId !== "string" ||
      !("topicId" in value) ||
      typeof value.topicId !== "string"
    ) {
      throw new Error("Serwer zwrócił nieprawidłowy zapis streszczenia.");
    }
    return { chapterId: value.chapterId, topicId: value.topicId };
  }
}

function isStringArray(value: unknown) {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isGeneratedSummary(value: unknown): value is GeneratedSummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "suggestedTitle" in value &&
    typeof value.suggestedTitle === "string" &&
    "introduction" in value &&
    typeof value.introduction === "string" &&
    "sections" in value &&
    Array.isArray(value.sections) &&
    value.sections.every(
      (section) =>
        typeof section === "object" &&
        section !== null &&
        "title" in section &&
        typeof section.title === "string" &&
        "summary" in section &&
        typeof section.summary === "string" &&
        "keyPoints" in section &&
        isStringArray(section.keyPoints),
    ) &&
    "connections" in value &&
    isStringArray(value.connections) &&
    "thingsToRemember" in value &&
    isStringArray(value.thingsToRemember)
  );
}

function isSourceTopic(value: unknown): value is SummarySourceTopic {
  return (
    typeof value === "object" &&
    value !== null &&
    "chapterTitle" in value &&
    typeof value.chapterTitle === "string" &&
    "topicTitle" in value &&
    typeof value.topicTitle === "string"
  );
}

function isGeneratedSummaryResult(
  value: unknown,
): value is GeneratedSummaryResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "summary" in value &&
    isGeneratedSummary(value.summary) &&
    "sourceTopics" in value &&
    Array.isArray(value.sourceTopics) &&
    value.sourceTopics.every(isSourceTopic) &&
    "cached" in value &&
    typeof value.cached === "boolean" &&
    "maxTopics" in value &&
    typeof value.maxTopics === "number"
  );
}
