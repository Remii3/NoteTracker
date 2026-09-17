import type { ExamPlan, ExamPlanDay } from "../model/types";

export type OverloadSuggestion = {
  id: "add-day" | "raise-limit" | "reduce-scope";
  title: string;
  description: string;
};

const WEEKDAY_NAMES = [
  "niedzielę",
  "poniedziałek",
  "wtorek",
  "środę",
  "czwartek",
  "piątek",
  "sobotę",
];

export function buildOverloadSuggestions(
  plan: Pick<
    ExamPlan,
    "studyWeekdays" | "dailyQuestionLimit" | "dailyTimeLimitMinutes"
  >,
  days: ExamPlanDay[],
  scopeTopicCount: number,
): OverloadSuggestion[] {
  const overloaded = days.filter((day) => day.isOverloaded);
  if (!overloaded.length) return [];

  const suggestions: OverloadSuggestion[] = [];
  const unusedWeekday = [1, 2, 3, 4, 5, 6, 0].find(
    (weekday) => !plan.studyWeekdays.includes(weekday),
  );
  if (unusedWeekday !== undefined) {
    suggestions.push({
      id: "add-day",
      title: `Dodaj ${WEEKDAY_NAMES[unusedWeekday]} do dni nauki`,
      description:
        "Plan zyska dodatkowe miejsce bez zwiększania obciążenia pozostałych dni.",
    });
  }

  if (plan.dailyQuestionLimit !== null) {
    const required = Math.max(
      ...overloaded.map((day) => day.reviewForecastLow),
    );
    suggestions.push({
      id: "raise-limit",
      title: `Podnieś limit do co najmniej ${required} pytań`,
      description: `Obecny limit ${plan.dailyQuestionLimit} nie mieści nawet dolnej granicy prognozy.`,
    });
  } else if (plan.dailyTimeLimitMinutes !== null) {
    const required = Math.max(
      ...overloaded.map((day) => day.estimatedMinutesLow ?? 0),
    );
    suggestions.push({
      id: "raise-limit",
      title: `Podnieś limit do około ${required} minut`,
      description: `Obecny limit ${plan.dailyTimeLimitMinutes} min jest niższy od ostrożnej prognozy.`,
    });
  }

  const overloadedRatio = overloaded.length / Math.max(1, days.length);
  const suggestedReduction = Math.max(
    1,
    Math.ceil(scopeTopicCount * overloadedRatio * 0.5),
  );
  suggestions.push({
    id: "reduce-scope",
    title: `Zmniejsz zakres o około ${suggestedReduction} ${suggestedReduction === 1 ? "temat" : "tematy"}`,
    description:
      "Jeżeli terminu lub limitu nie można zmienić, usuń najmniej istotne tematy z zakresu egzaminu.",
  });

  return suggestions;
}
