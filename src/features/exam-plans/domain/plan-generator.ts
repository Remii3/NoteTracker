import type {
  ExamPlanAssignment,
  ExamPlanDay,
  ExamPlanTopic,
  ReviewDueDateCount,
} from "../model/types";

export type GenerateExamPlanInput = {
  today: string;
  examDate: string;
  studyWeekdays: number[];
  bufferPercent: number;
  targetRetention: number;
  dailyQuestionLimit: number | null;
  dailyTimeLimitMinutes?: number | null;
  reviewSecondsPerQuestion?: number;
  topics: ExamPlanTopic[];
  unassignedQuestionCount?: number;
  unassignedDueReviewCount?: number;
  unassignedReviewDueDateCounts?: ReviewDueDateCount[];
  lockedAssignments?: ExamPlanAssignment[];
  creditedTopicIds?: Iterable<string>;
};

export type GeneratedExamPlan = {
  days: ExamPlanDay[];
  daysUntilExam: number;
  bufferDays: number;
  topicsPerDay: number;
  reviewForecastLow: number;
  reviewForecastHigh: number;
  feasible: boolean;
  warnings: string[];
  creditedTopicCount: number;
};

const DAY_MS = 86_400_000;

function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function listStudyDates(today: string, examDate: string, weekdays: number[]) {
  const dates: string[] = [];
  const allowed = new Set(weekdays);
  const start = parseDate(today);
  const end = parseDate(examDate);
  for (let current = start; current < end; current = addDays(current, 1)) {
    if (allowed.has(current.getUTCDay())) dates.push(formatDate(current));
  }
  return dates;
}

function distributeReviews(
  days: ExamPlanDay[],
  topics: ExamPlanTopic[],
  targetRetention: number,
  dailyQuestionLimit: number | null,
  unassignedQuestionCount: number,
  unassignedDueReviewCount: number,
  dailyTimeLimitMinutes: number | null,
  reviewSecondsPerQuestion: number,
  unassignedReviewDueDateCounts: ReviewDueDateCount[],
) {
  if (!days.length) return;
  const dueNow =
    unassignedDueReviewCount +
    topics.reduce((sum, topic) => sum + topic.dueReviewCount, 0);
  const questionCount =
    unassignedQuestionCount +
    topics.reduce((sum, topic) => sum + topic.questionCount, 0);
  const expectedPasses = 1.25 + targetRetention;
  const knownDueDateCounts = [
    ...unassignedReviewDueDateCounts,
    ...topics.flatMap((topic) =>
      topic.reviewDueDateCounts?.length
        ? topic.reviewDueDateCounts
        : (topic.reviewDueDates ?? []).map((date) => ({ date, count: 1 })),
    ),
  ];
  const knownDueByDay = new Map<string, number>();
  for (const due of knownDueDateCounts) {
    const targetDay = days.find((day) => day.date >= due.date);
    if (targetDay)
      knownDueByDay.set(
        targetDay.date,
        (knownDueByDay.get(targetDay.date) ?? 0) + due.count,
      );
  }
  const knownDueCount = [...knownDueByDay.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const lowTotal = Math.max(
    dueNow,
    knownDueCount,
    Math.floor(questionCount * expectedPasses * 0.8),
  );
  const highTotal = Math.max(
    lowTotal,
    knownDueCount,
    Math.ceil(questionCount * expectedPasses * 1.2),
  );
  const remainingLow = Math.max(0, lowTotal - knownDueCount);
  const remainingHigh = Math.max(0, highTotal - knownDueCount);
  const bufferDays = days.filter((day) => day.isBufferDay);
  const learningDays = days.filter((day) => !day.isBufferDay);
  const lowBufferTotal = bufferDays.length
    ? Math.min(remainingLow, Math.ceil(questionCount * 0.8))
    : 0;
  const highBufferTotal = bufferDays.length
    ? Math.min(remainingHigh, Math.ceil(questionCount * 1.2))
    : 0;

  function share(total: number, collection: ExamPlanDay[], day: ExamPlanDay) {
    if (!collection.length) return 0;
    const index = collection.indexOf(day);
    return (
      Math.floor(total / collection.length) +
      (index >= 0 && index < total % collection.length ? 1 : 0)
    );
  }

  days.forEach((day) => {
    const collection = day.isBufferDay ? bufferDays : learningDays;
    const plannedLow = day.isBufferDay
      ? lowBufferTotal
      : remainingLow - lowBufferTotal;
    const plannedHigh = day.isBufferDay
      ? highBufferTotal
      : remainingHigh - highBufferTotal;
    const knownDue = knownDueByDay.get(day.date) ?? 0;
    day.reviewForecastLow = knownDue + share(plannedLow, collection, day);
    day.reviewForecastHigh = Math.max(
      day.reviewForecastLow,
      knownDue + share(plannedHigh, collection, day),
    );
    day.reviewTarget = Math.round(
      (day.reviewForecastLow + day.reviewForecastHigh) / 2,
    );
    if (dailyQuestionLimit !== null) {
      day.reviewTarget = Math.min(day.reviewTarget, dailyQuestionLimit);
      day.isOverloaded ||= day.reviewForecastLow > dailyQuestionLimit;
    }
    const reviewMinutesLow =
      (day.reviewForecastLow * reviewSecondsPerQuestion * 0.8) / 60;
    const reviewMinutesHigh =
      (day.reviewForecastHigh * reviewSecondsPerQuestion * 1.2) / 60;
    day.estimatedMinutesLow = Math.ceil(
      day.workloadPoints * 5 + reviewMinutesLow,
    );
    day.estimatedMinutesHigh = Math.ceil(
      day.workloadPoints * 12 + reviewMinutesHigh,
    );
    if (dailyTimeLimitMinutes !== null)
      day.isOverloaded ||= day.estimatedMinutesLow > dailyTimeLimitMinutes;
  });
}

export function generateExamPlan(
  input: GenerateExamPlanInput,
): GeneratedExamPlan {
  const today = parseDate(input.today);
  const exam = parseDate(input.examDate);
  const daysUntilExam = Math.ceil((exam.getTime() - today.getTime()) / DAY_MS);
  const studyDates = listStudyDates(
    input.today,
    input.examDate,
    input.studyWeekdays,
  );
  const warnings: string[] = [];

  if (daysUntilExam <= 0)
    warnings.push("Termin egzaminu musi być w przyszłości.");
  if (!studyDates.length)
    warnings.push("Przed egzaminem nie ma żadnego wybranego dnia nauki.");

  const requestedBuffer =
    input.bufferPercent === 0
      ? 0
      : Math.max(1, Math.ceil((studyDates.length * input.bufferPercent) / 100));
  const bufferDays = Math.min(studyDates.length, requestedBuffer);
  const learningDates = studyDates.slice(0, studyDates.length - bufferDays);
  const bufferDates = new Set(
    bufferDays > 0 ? studyDates.slice(-bufferDays) : [],
  );
  const days: ExamPlanDay[] = studyDates.map((date) => ({
    date,
    assignments: [],
    workloadPoints: 0,
    reviewTarget: 0,
    reviewForecastLow: 0,
    reviewForecastHigh: 0,
    isBufferDay: bufferDates.has(date),
    isOverloaded: false,
  }));
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const incompleteTopics = input.topics.filter((topic) => !topic.completed);
  const availableTopicIds = new Set(incompleteTopics.map((topic) => topic.id));
  const lockedTopicIds = new Set<string>();
  const creditedTopicIds = new Set(input.creditedTopicIds ?? []);

  for (const assignment of input.lockedAssignments ?? []) {
    const day = dayByDate.get(assignment.scheduledFor);
    if (!day || day.isBufferDay || !availableTopicIds.has(assignment.topicId))
      continue;
    day.assignments.push({ ...assignment });
    day.workloadPoints += assignment.workloadPoints;
    lockedTopicIds.add(assignment.topicId);
  }

  const pending = incompleteTopics.filter(
    (topic) => !lockedTopicIds.has(topic.id) && !creditedTopicIds.has(topic.id),
  );
  const creditedTopicCount = incompleteTopics.filter(
    (topic) => creditedTopicIds.has(topic.id) && !lockedTopicIds.has(topic.id),
  ).length;
  if (pending.length && !learningDates.length) {
    warnings.push("Brakuje dni na nowy materiał przed okresem powtórek.");
  } else if (pending.length) {
    const lockedPoints = days.reduce((sum, day) => sum + day.workloadPoints, 0);
    const pendingPoints = pending.reduce(
      (sum, topic) => sum + topic.workloadPoints,
      0,
    );
    const targetPoints = Math.max(
      1,
      Math.ceil((lockedPoints + pendingPoints) / learningDates.length),
    );
    let dayIndex = 0;
    for (const topic of pending) {
      let day = dayByDate.get(learningDates[dayIndex])!;
      if (
        dayIndex < learningDates.length - 1 &&
        day.workloadPoints > 0 &&
        day.workloadPoints + topic.workloadPoints > targetPoints
      ) {
        day = dayByDate.get(learningDates[++dayIndex])!;
      }
      day.assignments.push({
        topicId: topic.id,
        scheduledFor: day.date,
        position: day.assignments.length + 1,
        workloadPoints: topic.workloadPoints,
        isLocked: false,
        completedAt: null,
      });
      day.workloadPoints += topic.workloadPoints;
    }
  }

  for (const day of days) {
    day.assignments.sort((first, second) => first.position - second.position);
    day.assignments.forEach((assignment, index) => {
      assignment.position = index + 1;
    });
  }

  distributeReviews(
    days,
    input.topics,
    input.targetRetention,
    input.dailyQuestionLimit,
    input.unassignedQuestionCount ?? 0,
    input.unassignedDueReviewCount ?? 0,
    input.dailyTimeLimitMinutes ?? null,
    input.reviewSecondsPerQuestion ?? 45,
    input.unassignedReviewDueDateCounts ?? [],
  );

  const scheduledTopicCount = days.reduce(
    (sum, day) => sum + day.assignments.length,
    0,
  );
  const overloaded = days.some((day) => day.isOverloaded);
  if (overloaded)
    warnings.push(
      input.dailyTimeLimitMinutes !== null &&
        input.dailyTimeLimitMinutes !== undefined
        ? "Dzienny limit czasu jest niższy niż ostrożna prognoza obciążenia."
        : "Limit pytań jest niższy niż prognozowane minimum powtórek.",
    );
  const reviewForecastLow = days.length
    ? Math.round(
        days.reduce((sum, day) => sum + day.reviewForecastLow, 0) / days.length,
      )
    : 0;
  const reviewForecastHigh = days.length
    ? Math.round(
        days.reduce((sum, day) => sum + day.reviewForecastHigh, 0) /
          days.length,
      )
    : 0;

  return {
    days,
    daysUntilExam,
    bufferDays,
    topicsPerDay: learningDates.length
      ? Math.ceil(scheduledTopicCount / learningDates.length)
      : 0,
    reviewForecastLow,
    reviewForecastHigh,
    feasible:
      warnings.length === 0 &&
      scheduledTopicCount + creditedTopicCount === incompleteTopics.length,
    warnings,
    creditedTopicCount,
  };
}
