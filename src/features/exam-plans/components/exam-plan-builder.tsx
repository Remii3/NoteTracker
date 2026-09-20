import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  ChevronsUp,
  ListChecks,
  LoaderCircle,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { pl } from "date-fns/locale";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { useUser } from "@/features/auth";
import { useModuleContext } from "@/features/notes/components/module-context";
import { supabase } from "@/lib/supabase/client";
import type {
  ExamPlanningChapter,
  ExamPlanningChapterCursor,
  ExamPlanningScope,
} from "../data/exam-plans-repository";
import { SupabaseExamPlansRepository } from "../data/supabase-exam-plans-repository";
import { buildOverloadSuggestions } from "../domain/overload-suggestions";
import { generateExamPlan } from "../domain/plan-generator";
import type { ExamPlanDetails, ExamPlanTopic } from "../model/types";

const WEEKDAYS = [
  { value: 1, short: "Pn" },
  { value: 2, short: "Wt" },
  { value: 3, short: "Śr" },
  { value: 4, short: "Cz" },
  { value: 5, short: "Pt" },
  { value: 6, short: "So" },
  { value: 0, short: "Nd" },
] as const;

const CHAPTER_PAGE_SIZE = 50;

type BuilderStep = "scope" | "plan";
type ScopeFilter = "all" | "selected" | "unselected" | "completed";
type PlanHealth = "empty" | "comfortable" | "tight" | "overloaded";
type BuilderDraft = {
  name: string;
  examDate: string;
  targetRetention: number;
  weekdays: number[];
  bufferPercent: number;
  limitMode: "questions" | "minutes";
  limit: number;
  includeUnassigned: boolean;
  selectedChapterIds: string[];
  selectedTopicIds: string[];
  excludedTopicIds: string[];
  workloads: Record<string, number>;
  chapters: ExamPlanningChapter[];
  topics: ExamPlanTopic[];
};

function localDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return dateKey(date);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function formatDate(value: string, withYear = false) {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
  }).format(dateFromKey(value));
}

function groupTopics(topics: ExamPlanTopic[]) {
  const grouped: Record<string, ExamPlanTopic[]> = {};
  for (const topic of topics) {
    (grouped[topic.chapterId] ??= []).push(topic);
  }
  return grouped;
}

function uniqueTopics(topics: ExamPlanTopic[]) {
  return [...new Map(topics.map((topic) => [topic.id, topic])).values()];
}

function readBuilderDraft(key: string): BuilderDraft | null {
  try {
    const value = window.sessionStorage.getItem(key);
    return value ? (JSON.parse(value) as BuilderDraft) : null;
  } catch {
    return null;
  }
}

function countStudyDays(
  fromDate: string,
  examDate: string,
  weekdays: number[],
) {
  const allowed = new Set(weekdays);
  let count = 0;
  for (
    let date = dateFromKey(fromDate);
    date < dateFromKey(examDate);
    date.setDate(date.getDate() + 1)
  ) {
    if (allowed.has(date.getDay())) count += 1;
  }
  return count;
}

export function ExamPlanBuilder({
  onCancel,
  onSaved,
  initialDetails,
}: {
  onCancel: () => void;
  onSaved: (id: string) => void;
  initialDetails?: ExamPlanDetails;
}) {
  const { moduleId, moduleName } = useModuleContext();
  const user = useUser();
  const repository = useMemo(
    () => new SupabaseExamPlansRepository(supabase, user.id),
    [user.id],
  );
  const defaultName = `Egzamin — ${moduleName ?? "moduł"}`;
  const defaultExamDate = localDate(28);
  const draftKey = `exam-plan-builder:${user.id}:${moduleId}`;
  const draft = useMemo(
    () => (initialDetails ? null : readBuilderDraft(draftKey)),
    [draftKey, initialDetails],
  );
  const initialScopeIds = useMemo(
    () => new Set(initialDetails?.scopeTopicIds ?? []),
    [initialDetails],
  );
  const initialTopics = useMemo(
    () =>
      (initialDetails?.topics ?? []).filter((topic) =>
        initialScopeIds.has(topic.id),
      ),
    [initialDetails, initialScopeIds],
  );

  const [step, setStep] = useState<BuilderStep>(
    initialDetails ? "plan" : "scope",
  );
  const [name, setName] = useState(
    initialDetails?.plan.name ?? draft?.name ?? defaultName,
  );
  const [examDate, setExamDate] = useState(
    initialDetails?.plan.examDate ?? draft?.examDate ?? defaultExamDate,
  );
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [targetRetention, setTargetRetention] = useState(
    initialDetails
      ? Math.round(initialDetails.plan.targetRetention * 100)
      : (draft?.targetRetention ?? 90),
  );
  const [weekdays, setWeekdays] = useState<number[]>(
    initialDetails?.plan.studyWeekdays ?? draft?.weekdays ?? [1, 2, 3, 4, 5],
  );
  const [bufferPercent, setBufferPercent] = useState(
    initialDetails?.plan.bufferPercent ?? draft?.bufferPercent ?? 10,
  );
  const [limitMode, setLimitMode] = useState<"questions" | "minutes">(
    initialDetails
      ? initialDetails.plan.dailyTimeLimitMinutes !== null
        ? "minutes"
        : "questions"
      : (draft?.limitMode ?? "questions"),
  );
  const [limit, setLimit] = useState(
    initialDetails?.plan.dailyTimeLimitMinutes ??
      initialDetails?.plan.dailyQuestionLimit ??
      draft?.limit ??
      32,
  );
  const [includeUnassigned, setIncludeUnassigned] = useState(
    initialDetails?.plan.includeUnassignedQuestions ??
      draft?.includeUnassigned ??
      false,
  );
  const [scope, setScope] = useState<ExamPlanningScope>();
  const [scopeLoading, setScopeLoading] = useState(true);
  const [scopeError, setScopeError] = useState(false);
  const [scopeReloadKey, setScopeReloadKey] = useState(0);
  const [chapters, setChapters] = useState<ExamPlanningChapter[]>([]);
  const [knownChapters, setKnownChapters] = useState<ExamPlanningChapter[]>(
    draft?.chapters ?? [],
  );
  const [chapterTotal, setChapterTotal] = useState(0);
  const [chapterCursor, setChapterCursor] =
    useState<ExamPlanningChapterCursor | null>(null);
  const [hasMoreChapters, setHasMoreChapters] = useState(false);
  const [chaptersLoading, setChaptersLoading] = useState(true);
  const [loadingMoreChapters, setLoadingMoreChapters] = useState(false);
  const [chaptersError, setChaptersError] = useState(false);
  const [loadedTopics, setLoadedTopics] = useState<
    Record<string, ExamPlanTopic[]>
  >(() =>
    groupTopics(uniqueTopics([...initialTopics, ...(draft?.topics ?? [])])),
  );
  const [loadingChapterIds, setLoadingChapterIds] = useState<Set<string>>(
    new Set(),
  );
  const [openChapterIds, setOpenChapterIds] = useState<string[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(
    new Set(draft?.selectedChapterIds ?? []),
  );
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(
    () =>
      new Set(initialDetails?.scopeTopicIds ?? draft?.selectedTopicIds ?? []),
  );
  const [excludedTopicIds, setExcludedTopicIds] = useState<Set<string>>(
    new Set(draft?.excludedTopicIds ?? []),
  );
  const [workloads, setWorkloads] = useState<Record<string, number>>(() =>
    initialDetails
      ? Object.fromEntries(
          initialDetails.topics.map((topic) => [
            topic.id,
            topic.workloadPoints,
          ]),
        )
      : (draft?.workloads ?? {}),
  );
  const [preparedTopics, setPreparedTopics] =
    useState<ExamPlanTopic[]>(initialTopics);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ExamPlanTopic[]>([]);
  const [knownSearchTopics, setKnownSearchTopics] = useState<ExamPlanTopic[]>(
    [],
  );
  const [searching, setSearching] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [topicLimits, setTopicLimits] = useState<Record<string, number>>({});
  const [preparing, setPreparing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [selectedMaterialsOpen, setSelectedMaterialsOpen] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const chapterRequestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    repository
      .getPlanningScope(moduleId)
      .then((result) => {
        if (!active) return;
        setScope(result);
        setScopeError(false);
      })
      .catch(() => {
        if (!active) return;
        setScopeError(true);
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać zakresu modułu.",
        });
      })
      .finally(() => active && setScopeLoading(false));
    return () => {
      active = false;
    };
  }, [moduleId, repository, scopeReloadKey]);

  useEffect(() => {
    const normalized = query.trim();
    const nextQuery = normalized.length >= 2 ? normalized : "";
    const timeout = window.setTimeout(
      () => {
        if (nextQuery === debouncedQuery) return;
        setChaptersLoading(true);
        setChaptersError(false);
        setSearching(Boolean(nextQuery));
        setChapters([]);
        setSearchResults([]);
        setOpenChapterIds([]);
        chapterRequestVersion.current += 1;
        setDebouncedQuery(nextQuery);
      },
      normalized.length >= 2 ? 300 : 0,
    );
    return () => window.clearTimeout(timeout);
  }, [debouncedQuery, query]);

  useEffect(() => {
    let active = true;
    chapterRequestVersion.current += 1;
    repository
      .getPlanningChapters(moduleId, {
        query: debouncedQuery || undefined,
        limit: CHAPTER_PAGE_SIZE,
      })
      .then(async (page) => {
        if (!active) return;
        setChapters(page.chapters);
        setKnownChapters((current) => [
          ...new Map(
            [...current, ...page.chapters].map((chapter) => [
              chapter.id,
              chapter,
            ]),
          ).values(),
        ]);
        setChapterTotal(page.totalCount);
        setChapterCursor(page.nextCursor);
        setHasMoreChapters(page.hasMore);
        if (debouncedQuery && page.chapters.length) {
          const topics = await repository.getPlanningTopics(
            moduleId,
            page.chapters.map((chapter) => chapter.id),
            debouncedQuery,
          );
          if (!active) return;
          setSearchResults(topics);
          setKnownSearchTopics((current) =>
            uniqueTopics([...current, ...topics]),
          );
        }
      })
      .catch(() => {
        if (!active) return;
        setChaptersError(true);
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać rozdziałów.",
        });
      })
      .finally(() => {
        if (!active) return;
        setChaptersLoading(false);
        setSearching(false);
      });
    return () => {
      active = false;
    };
  }, [debouncedQuery, moduleId, repository, scopeReloadKey]);

  const allKnownTopics = useMemo(
    () =>
      uniqueTopics([
        ...Object.values(loadedTopics).flat(),
        ...knownSearchTopics,
      ]),
    [knownSearchTopics, loadedTopics],
  );
  const topicById = useMemo(
    () => new Map(allKnownTopics.map((topic) => [topic.id, topic])),
    [allKnownTopics],
  );
  const searchResultsByChapter = useMemo(
    () => groupTopics(searchResults),
    [searchResults],
  );

  function isTopicSelected(topic: Pick<ExamPlanTopic, "id" | "chapterId">) {
    return selectedChapterIds.has(topic.chapterId)
      ? !excludedTopicIds.has(topic.id)
      : selectedTopicIds.has(topic.id);
  }

  function selectedCountForChapter(chapter: ExamPlanningChapter) {
    if (selectedChapterIds.has(chapter.id)) {
      const excludedCount = [...excludedTopicIds].filter(
        (id) => topicById.get(id)?.chapterId === chapter.id,
      ).length;
      return Math.max(0, chapter.topicCount - excludedCount);
    }
    return [...selectedTopicIds].filter(
      (id) => topicById.get(id)?.chapterId === chapter.id,
    ).length;
  }

  const selectedTopicCount = useMemo(
    () => {
      const selectedByChapter = [...selectedChapterIds].reduce(
        (sum, chapterId) => {
          const chapter = knownChapters.find((item) => item.id === chapterId);
          if (!chapter) return sum;
          return sum + selectedCountForChapter(chapter);
        },
        0,
      );
      return selectedTopicIds.size + selectedByChapter;
    },
    // The selection sets are immutable snapshots replaced after every change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      excludedTopicIds,
      knownChapters,
      selectedChapterIds,
      selectedTopicIds,
      topicById,
    ],
  );
  const selectedChapterCount = useMemo(
    () =>
      new Set([
        ...selectedChapterIds,
        ...[...selectedTopicIds].flatMap((id) => {
          const chapterId = topicById.get(id)?.chapterId;
          return chapterId ? [chapterId] : [];
        }),
      ]).size,
    [selectedChapterIds, selectedTopicIds, topicById],
  );

  const visibleChapters = useMemo(() => {
    return chapters.filter((chapter) => {
      const selectedCount = selectedCountForChapter(chapter);
      const matchesFilter =
        scopeFilter === "all" ||
        (scopeFilter === "selected" && selectedCount > 0) ||
        (scopeFilter === "unselected" && selectedCount < chapter.topicCount) ||
        (scopeFilter === "completed" &&
          chapter.unfinishedTopicCount < chapter.topicCount);
      return matchesFilter;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    excludedTopicIds,
    chapters,
    scopeFilter,
    selectedChapterIds,
    selectedTopicIds,
    topicById,
  ]);

  async function loadMoreChapters() {
    if (!chapterCursor || loadingMoreChapters) return;
    const requestVersion = chapterRequestVersion.current;
    const requestQuery = debouncedQuery;
    setLoadingMoreChapters(true);
    try {
      const page = await repository.getPlanningChapters(moduleId, {
        query: debouncedQuery || undefined,
        cursor: chapterCursor,
        limit: CHAPTER_PAGE_SIZE,
      });
      if (
        requestVersion !== chapterRequestVersion.current ||
        requestQuery !== debouncedQuery
      )
        return;
      setChapters((current) => [
        ...new Map(
          [...current, ...page.chapters].map((chapter) => [
            chapter.id,
            chapter,
          ]),
        ).values(),
      ]);
      setKnownChapters((current) => [
        ...new Map(
          [...current, ...page.chapters].map((chapter) => [
            chapter.id,
            chapter,
          ]),
        ).values(),
      ]);
      setChapterCursor(page.nextCursor);
      setHasMoreChapters(page.hasMore);
      if (debouncedQuery && page.chapters.length) {
        const topics = await repository.getPlanningTopics(
          moduleId,
          page.chapters.map((chapter) => chapter.id),
          debouncedQuery,
        );
        setSearchResults((current) => uniqueTopics([...current, ...topics]));
        setKnownSearchTopics((current) =>
          uniqueTopics([...current, ...topics]),
        );
      }
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się pobrać kolejnych rozdziałów.",
      });
    } finally {
      setLoadingMoreChapters(false);
    }
  }

  async function ensureChaptersLoaded(chapterIds: string[]) {
    const missingIds = chapterIds.filter(
      (id) => loadedTopics[id] === undefined && !loadingChapterIds.has(id),
    );
    if (!missingIds.length) return [];
    setLoadingChapterIds((current) => new Set([...current, ...missingIds]));
    try {
      const topics = await repository.getPlanningTopics(moduleId, missingIds);
      const grouped = groupTopics(topics);
      setLoadedTopics((current) => ({
        ...current,
        ...Object.fromEntries(
          missingIds.map((id) => [id, grouped[id] ?? []] as const),
        ),
      }));
      setWorkloads((current) => ({
        ...Object.fromEntries(
          topics.map((topic) => [topic.id, topic.workloadPoints]),
        ),
        ...current,
      }));
      return topics;
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się pobrać tematów rozdziału.",
      });
      throw new Error("Nie udało się pobrać tematów rozdziału.");
    } finally {
      setLoadingChapterIds((current) => {
        const next = new Set(current);
        missingIds.forEach((id) => next.delete(id));
        return next;
      });
    }
  }

  function toggleChapter(chapterId: string, checked: boolean) {
    const knownIds = allKnownTopics
      .filter((topic) => topic.chapterId === chapterId)
      .map((topic) => topic.id);
    setSelectedChapterIds((current) => {
      const next = new Set(current);
      if (checked) next.add(chapterId);
      else next.delete(chapterId);
      return next;
    });
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      knownIds.forEach((id) => next.delete(id));
      return next;
    });
    setExcludedTopicIds((current) => {
      const next = new Set(current);
      knownIds.forEach((id) => next.delete(id));
      return next;
    });
  }

  function toggleTopic(topic: ExamPlanTopic, checked: boolean) {
    if (selectedChapterIds.has(topic.chapterId)) {
      setExcludedTopicIds((current) => {
        const next = new Set(current);
        if (checked) next.delete(topic.id);
        else next.add(topic.id);
        return next;
      });
      return;
    }
    setSelectedTopicIds((current) => {
      const next = new Set(current);
      if (checked) next.add(topic.id);
      else next.delete(topic.id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedChapterIds(new Set());
    setSelectedTopicIds(new Set());
    setExcludedTopicIds(new Set());
  }

  async function preparePlan() {
    if (nameError || examDateError || selectedTopicCount === 0) {
      toast.add({
        data: { type: "error" },
        description:
          "Uzupełnij nazwę, termin i wybierz co najmniej jeden temat.",
      });
      return;
    }
    setPreparing(true);
    try {
      const fetched = await ensureChaptersLoaded([...selectedChapterIds]);
      const topics = uniqueTopics([
        ...Object.values(loadedTopics).flat(),
        ...knownSearchTopics,
        ...fetched,
      ]).filter(isTopicSelected);
      if (!topics.length) throw new Error("Nie wybrano żadnego tematu.");
      setPreparedTopics(topics);
      setStep("plan");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Nie wybrano żadnego tematu."
      ) {
        toast.add({ data: { type: "error" }, description: error.message });
      }
    } finally {
      setPreparing(false);
    }
  }

  const selectedTopics = useMemo(
    () =>
      preparedTopics.map((topic) => ({
        ...topic,
        workloadPoints: workloads[topic.id] ?? topic.workloadPoints,
        workloadSource:
          workloads[topic.id] === topic.workloadPoints
            ? topic.workloadSource
            : ("manual" as const),
      })),
    [preparedTopics, workloads],
  );
  const generated = useMemo(
    () =>
      generateExamPlan({
        today: localDate(),
        examDate,
        studyWeekdays: weekdays,
        bufferPercent,
        targetRetention: targetRetention / 100,
        dailyQuestionLimit: limitMode === "questions" ? limit : null,
        dailyTimeLimitMinutes: limitMode === "minutes" ? limit : null,
        reviewSecondsPerQuestion: scope?.reviewSecondsPerQuestion,
        topics: selectedTopics,
        unassignedQuestionCount: includeUnassigned
          ? scope?.unassignedQuestionCount
          : 0,
        unassignedDueReviewCount: includeUnassigned
          ? scope?.unassignedDueReviewCount
          : 0,
        unassignedReviewDueDateCounts: includeUnassigned
          ? scope?.unassignedReviewDueDateCounts
          : [],
        lockedAssignments: initialDetails?.days
          .flatMap((day) => day.assignments)
          .filter(
            (assignment) =>
              assignment.isLocked && assignment.scheduledFor >= localDate(),
          ),
      }),
    [
      bufferPercent,
      examDate,
      includeUnassigned,
      initialDetails,
      limit,
      limitMode,
      scope,
      selectedTopics,
      targetRetention,
      weekdays,
    ],
  );
  const overloadSuggestions = useMemo(
    () =>
      buildOverloadSuggestions(
        {
          studyWeekdays: weekdays,
          dailyQuestionLimit: limitMode === "questions" ? limit : null,
          dailyTimeLimitMinutes: limitMode === "minutes" ? limit : null,
        },
        generated.days,
        selectedTopics.length,
      ),
    [generated.days, limit, limitMode, selectedTopics.length, weekdays],
  );

  const nameError = name.trim() ? null : "Podaj nazwę egzaminu.";
  const examDateError =
    examDate > localDate() ? null : "Termin musi być późniejszy niż dzisiaj.";
  const limitError =
    Number.isFinite(limit) &&
    limit >= (limitMode === "minutes" ? 5 : 1) &&
    limit <= (limitMode === "minutes" ? 1440 : 1000)
      ? null
      : limitMode === "minutes"
        ? "Podaj od 5 do 1440 minut."
        : "Podaj od 1 do 1000 pytań.";
  const advancedError =
    targetRetention >= 70 &&
    targetRetention <= 99 &&
    bufferPercent >= 0 &&
    bufferPercent <= 30
      ? null
      : "Sprawdź retencję i bufor planu.";
  const canPrepare =
    !nameError &&
    !examDateError &&
    selectedTopicCount > 0 &&
    !preparing &&
    loadingChapterIds.size === 0 &&
    !scopeLoading &&
    !scopeError &&
    !chaptersError &&
    Boolean(scope);
  const availableStudyDays = useMemo(
    () => countStudyDays(localDate(), examDate, weekdays),
    [examDate, weekdays],
  );
  const learningDays = Math.max(
    0,
    availableStudyDays -
      (bufferPercent
        ? Math.max(1, Math.ceil((availableStudyDays * bufferPercent) / 100))
        : 0),
  );
  const previewTopicsPerDay = learningDays
    ? Math.ceil(selectedTopicCount / learningDays)
    : selectedTopicCount;
  const planHealth: PlanHealth =
    selectedTopicCount === 0
      ? "empty"
      : learningDays === 0 || previewTopicsPerDay > 6
        ? "overloaded"
        : previewTopicsPerDay > 3
          ? "tight"
          : "comfortable";

  function applyOverloadSuggestion(id: string) {
    if (id === "add-day") {
      const weekday = [1, 2, 3, 4, 5, 6, 0].find(
        (value) => !weekdays.includes(value),
      );
      if (weekday !== undefined)
        setWeekdays((current) => [...current, weekday]);
      return;
    }
    if (id === "raise-limit") {
      const overloadedDays = generated.days.filter((day) => day.isOverloaded);
      const required = Math.max(
        limit,
        ...overloadedDays.map((day) =>
          limitMode === "minutes"
            ? (day.estimatedMinutesLow ?? limit)
            : day.reviewForecastLow,
        ),
      );
      setLimit(required);
      return;
    }
    setStep("scope");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removePreparedTopic(topic: ExamPlanTopic) {
    setPreparedTopics((current) =>
      current.filter((item) => item.id !== topic.id),
    );
    if (selectedChapterIds.has(topic.chapterId)) {
      setExcludedTopicIds((current) => new Set([...current, topic.id]));
    } else {
      setSelectedTopicIds((current) => {
        const next = new Set(current);
        next.delete(topic.id);
        return next;
      });
    }
  }

  const initialSelectedIds = useMemo(
    () => [...(initialDetails?.scopeTopicIds ?? [])].sort(),
    [initialDetails],
  );
  const currentSelectedIds = useMemo(
    () => [...selectedTopicIds].sort(),
    [selectedTopicIds],
  );
  const isDirty = initialDetails
    ? name !== initialDetails.plan.name ||
      examDate !== initialDetails.plan.examDate ||
      targetRetention !==
        Math.round(initialDetails.plan.targetRetention * 100) ||
      [...weekdays].sort().join(",") !==
        [...initialDetails.plan.studyWeekdays].sort().join(",") ||
      bufferPercent !== initialDetails.plan.bufferPercent ||
      limitMode !==
        (initialDetails.plan.dailyTimeLimitMinutes !== null
          ? "minutes"
          : "questions") ||
      limit !==
        (initialDetails.plan.dailyTimeLimitMinutes ??
          initialDetails.plan.dailyQuestionLimit ??
          32) ||
      includeUnassigned !== initialDetails.plan.includeUnassignedQuestions ||
      initialTopics.some(
        (topic) =>
          (workloads[topic.id] ?? topic.workloadPoints) !==
          topic.workloadPoints,
      ) ||
      selectedChapterIds.size > 0 ||
      excludedTopicIds.size > 0 ||
      currentSelectedIds.join(",") !== initialSelectedIds.join(",")
    : name !== defaultName ||
      examDate !== defaultExamDate ||
      targetRetention !== 90 ||
      [...weekdays].sort().join(",") !== "1,2,3,4,5" ||
      bufferPercent !== 10 ||
      limitMode !== "questions" ||
      limit !== 32 ||
      includeUnassigned ||
      selectedTopicCount > 0;

  useEffect(() => {
    if (!isDirty || saving) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty, saving]);

  useEffect(() => {
    if (initialDetails) return;
    if (!isDirty) {
      window.sessionStorage.removeItem(draftKey);
      return;
    }
    const relevantTopicIds = new Set([
      ...selectedTopicIds,
      ...excludedTopicIds,
      ...allKnownTopics
        .filter((topic) => selectedChapterIds.has(topic.chapterId))
        .map((topic) => topic.id),
    ]);
    const relevantTopics = allKnownTopics.filter((topic) =>
      relevantTopicIds.has(topic.id),
    );
    const relevantChapterIds = new Set([
      ...selectedChapterIds,
      ...relevantTopics.map((topic) => topic.chapterId),
    ]);
    const draftValue: BuilderDraft = {
      name,
      examDate,
      targetRetention,
      weekdays,
      bufferPercent,
      limitMode,
      limit,
      includeUnassigned,
      selectedChapterIds: [...selectedChapterIds],
      selectedTopicIds: [...selectedTopicIds],
      excludedTopicIds: [...excludedTopicIds],
      workloads: Object.fromEntries(
        Object.entries(workloads).filter(([id]) => relevantTopicIds.has(id)),
      ),
      chapters: knownChapters.filter((chapter) =>
        relevantChapterIds.has(chapter.id),
      ),
      topics: relevantTopics,
    };
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify(draftValue));
    } catch {
      // A draft is a convenience; a storage quota must not block the builder.
    }
  }, [
    allKnownTopics,
    bufferPercent,
    draftKey,
    examDate,
    excludedTopicIds,
    includeUnassigned,
    initialDetails,
    isDirty,
    knownChapters,
    limit,
    limitMode,
    name,
    selectedChapterIds,
    selectedTopicIds,
    targetRetention,
    weekdays,
    workloads,
  ]);

  function requestCancel() {
    if (isDirty) setCancelDialogOpen(true);
    else onCancel();
  }

  function discardAndCancel() {
    window.sessionStorage.removeItem(draftKey);
    onCancel();
  }

  async function save() {
    if (
      !name.trim() ||
      !selectedTopics.length ||
      !generated.days.length ||
      !scope ||
      scopeLoading ||
      scopeError
    ) {
      toast.add({
        data: { type: "error" },
        description:
          "Plan wymaga poprawnego zakresu, nazwy, terminu i co najmniej jednego tematu.",
      });
      return;
    }
    setSaving(true);
    try {
      const historicalDays = (initialDetails?.days ?? [])
        .filter((day) => day.date < localDate())
        .map((day) => ({
          ...day,
          assignments: day.assignments.filter(
            (assignment) =>
              assignment.completedAt !== null ||
              initialDetails?.topics.find(
                (topic) => topic.id === assignment.topicId,
              )?.completed,
          ),
        }))
        .map((day) => ({
          ...day,
          workloadPoints: day.assignments.reduce(
            (sum, assignment) => sum + assignment.workloadPoints,
            0,
          ),
        }));
      const id = await repository.save({
        id: initialDetails?.plan.id,
        expectedPlanVersion: initialDetails?.plan.planVersion,
        rebuiltOn: localDate(),
        moduleId,
        name: name.trim(),
        examDate,
        targetRetention: targetRetention / 100,
        studyWeekdays: weekdays,
        dailyTimeLimitMinutes: limitMode === "minutes" ? limit : null,
        dailyQuestionLimit: limitMode === "questions" ? limit : null,
        bufferPercent,
        includeUnassignedQuestions: includeUnassigned,
        topicSettings: selectedTopics,
        days: [...historicalDays, ...generated.days],
      });
      try {
        await repository.rebuildAdaptivePlans(undefined, true);
      } catch {
        toast.add({
          data: { type: "warning" },
          description:
            "Plan zapisano, ale nie udało się odświeżyć pozostałych planów.",
        });
      }
      toast.add({
        data: { type: "success" },
        description: "Plan egzaminu został zapisany.",
      });
      window.sessionStorage.removeItem(draftKey);
      onSaved(id);
    } catch (error) {
      toast.add({
        data: { type: "error" },
        description:
          error instanceof Error
            ? error.message
            : "Nie udało się zapisać planu egzaminu.",
      });
    } finally {
      setSaving(false);
    }
  }

  const datePicker = (
    <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
          />
        }
      >
        <CalendarDays /> {formatDate(examDate, true)}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={pl}
          selected={dateFromKey(examDate)}
          disabled={{ before: dateFromKey(localDate(1)) }}
          startMonth={dateFromKey(localDate(1))}
          onSelect={(date) => {
            if (!date) return;
            setExamDate(dateKey(date));
            setDatePickerOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={requestCancel}>
              <ArrowLeft />
            </Button>
            <div>
              <h1 className="text-2xl font-semibold">
                {initialDetails ? "Edytuj plan egzaminu" : "Nowy plan egzaminu"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {step === "scope"
                  ? "Najpierw wybierz termin i materiał."
                  : "Dostosuj tempo i sprawdź prognozę."}
              </p>
            </div>
          </div>
          <ol
            className="flex items-center gap-2 text-xs"
            aria-label="Etapy kreatora"
          >
            <li
              className={`rounded-full px-3 py-1.5 ${
                step === "scope"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              1. Termin i zakres
            </li>
            <li
              className={`rounded-full px-3 py-1.5 ${
                step === "plan"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              2. Tempo i plan
            </li>
          </ol>
        </div>

        {step === "scope" ? (
          <div className="mx-auto max-w-4xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Termin egzaminu</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="exam-name">Nazwa egzaminu</Label>
                  <Input
                    id="exam-name"
                    value={name}
                    aria-invalid={Boolean(nameError)}
                    onChange={(event) => setName(event.target.value)}
                  />
                  {nameError ? (
                    <p className="text-xs text-destructive">{nameError}</p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label>Data egzaminu</Label>
                  {datePicker}
                  {examDateError ? (
                    <p className="text-xs text-destructive">{examDateError}</p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Zakres materiału</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Domyślnie nic nie jest zaznaczone. Wybierz cały rozdział albo
                  rozwiń go i wskaż pojedyncze tematy.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {scopeLoading || chaptersLoading ? (
                  <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" /> Ładowanie
                    rozdziałów…
                  </div>
                ) : scopeError || chaptersError ? (
                  <div className="rounded-lg border p-4">
                    <p className="font-medium">
                      Nie udało się pobrać rozdziałów.
                    </p>
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => {
                        setScopeLoading(true);
                        setChaptersLoading(true);
                        setChaptersError(false);
                        setScopeReloadKey((value) => value + 1);
                      }}
                    >
                      Spróbuj ponownie
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Szukaj rozdziału lub tematu…"
                          className="pl-9"
                        />
                        {searching && query.trim().length >= 2 ? (
                          <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                      <select
                        aria-label="Filtr zakresu"
                        value={scopeFilter}
                        onChange={(event) =>
                          setScopeFilter(event.target.value as ScopeFilter)
                        }
                        className="h-9 rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="all">Wszystkie rozdziały</option>
                        <option value="selected">Zaznaczone (wczytane)</option>
                        <option value="unselected">
                          Niezaznaczone (wczytane)
                        </option>
                        <option value="completed">
                          Z ukończonymi tematami (wczytane)
                        </option>
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {debouncedQuery
                          ? `Znaleziono ${chapterTotal} ${chapterTotal === 1 ? "rozdział" : "rozdziałów"}`
                          : `Pokazano ${chapters.length} z ${chapterTotal || scope?.chapterCount || 0} rozdziałów`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!visibleChapters.length}
                          onClick={() => {
                            const chapterIds = new Set(
                              visibleChapters.map((chapter) => chapter.id),
                            );
                            const visibleTopicIds = allKnownTopics
                              .filter((topic) =>
                                chapterIds.has(topic.chapterId),
                              )
                              .map((topic) => topic.id);
                            setSelectedChapterIds(
                              (current) => new Set([...current, ...chapterIds]),
                            );
                            setSelectedTopicIds((current) => {
                              const next = new Set(current);
                              visibleTopicIds.forEach((id) => next.delete(id));
                              return next;
                            });
                            setExcludedTopicIds((current) => {
                              const next = new Set(current);
                              visibleTopicIds.forEach((id) => next.delete(id));
                              return next;
                            });
                          }}
                        >
                          <ListChecks /> Zaznacz widoczne rozdziały
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!openChapterIds.length}
                          onClick={() => setOpenChapterIds([])}
                        >
                          <ChevronsUp /> Zwiń wszystkie
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={clearSelection}
                        >
                          Wyczyść zakres
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-[55vh] overflow-y-auto rounded-lg border px-3">
                      {visibleChapters.length ? (
                        <Accordion
                          multiple
                          value={openChapterIds}
                          onValueChange={(value) => {
                            setOpenChapterIds(value as string[]);
                            const opened = (value as string[]).filter(
                              (id) => !openChapterIds.includes(id),
                            );
                            if (opened.length && !debouncedQuery)
                              void ensureChaptersLoaded(opened).catch(() => {});
                          }}
                        >
                          {visibleChapters.map((chapter) => {
                            const selectedCount =
                              selectedCountForChapter(chapter);
                            const chapterChecked =
                              chapter.topicCount > 0 &&
                              selectedCount === chapter.topicCount;
                            const indeterminate =
                              selectedCount > 0 &&
                              selectedCount < chapter.topicCount;
                            const normalizedQuery = debouncedQuery
                              .trim()
                              .toLocaleLowerCase("pl");
                            const sourceTopics =
                              normalizedQuery.length >= 2
                                ? searchResultsByChapter[chapter.id]
                                : loadedTopics[chapter.id];
                            const filteredTopics = (sourceTopics ?? []).filter(
                              (topic) =>
                                (scopeFilter !== "selected" ||
                                  isTopicSelected(topic)) &&
                                (scopeFilter !== "unselected" ||
                                  !isTopicSelected(topic)) &&
                                (scopeFilter !== "completed" ||
                                  topic.completed),
                            );
                            const visibleLimit = topicLimits[chapter.id] ?? 100;
                            return (
                              <AccordionItem
                                key={chapter.id}
                                value={chapter.id}
                              >
                                <div className="flex items-center gap-3">
                                  <Checkbox
                                    checked={chapterChecked}
                                    indeterminate={indeterminate}
                                    disabled={chapter.topicCount === 0}
                                    aria-label={`Wybierz rozdział ${chapter.title}`}
                                    onCheckedChange={(checked) =>
                                      toggleChapter(chapter.id, checked)
                                    }
                                  />
                                  <AccordionTrigger className="min-w-0 py-3 no-underline hover:no-underline">
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate">
                                        {chapter.title}
                                      </span>
                                      <span className="block text-xs font-normal text-muted-foreground">
                                        {selectedCount}/{chapter.topicCount}{" "}
                                        wybranych
                                        {chapter.unfinishedTopicCount !==
                                        chapter.topicCount
                                          ? ` · ${chapter.unfinishedTopicCount} nieukończonych`
                                          : ""}
                                      </span>
                                    </span>
                                  </AccordionTrigger>
                                </div>
                                <AccordionContent className="pl-7">
                                  {loadingChapterIds.has(chapter.id) &&
                                  !sourceTopics ? (
                                    <p className="flex items-center gap-2 py-3 text-muted-foreground">
                                      <LoaderCircle className="size-4 animate-spin" />
                                      Ładowanie tematów…
                                    </p>
                                  ) : filteredTopics.length ? (
                                    <div className="space-y-2">
                                      {filteredTopics
                                        .slice(0, visibleLimit)
                                        .map((topic) => (
                                          <label
                                            key={topic.id}
                                            className="flex items-center gap-3 rounded-lg border p-3"
                                          >
                                            <Checkbox
                                              checked={isTopicSelected(topic)}
                                              onCheckedChange={(checked) =>
                                                toggleTopic(topic, checked)
                                              }
                                            />
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate font-medium">
                                                {topic.title}
                                              </span>
                                              <span className="block text-xs text-muted-foreground">
                                                {topic.questionCount} pytań
                                                {topic.completed
                                                  ? " · ukończony"
                                                  : ""}
                                              </span>
                                            </span>
                                            <select
                                              aria-label={`Ciężar tematu ${topic.title}`}
                                              disabled={!isTopicSelected(topic)}
                                              className="h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50"
                                              value={
                                                workloads[topic.id] ??
                                                topic.workloadPoints
                                              }
                                              onChange={(event) =>
                                                setWorkloads((current) => ({
                                                  ...current,
                                                  [topic.id]: Number(
                                                    event.target.value,
                                                  ),
                                                }))
                                              }
                                            >
                                              <option value={1}>
                                                krótki · 1
                                              </option>
                                              <option value={2}>
                                                średni · 2
                                              </option>
                                              <option value={4}>
                                                długi · 4
                                              </option>
                                              <option value={6}>
                                                bardzo długi · 6
                                              </option>
                                            </select>
                                          </label>
                                        ))}
                                      {filteredTopics.length > visibleLimit ? (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="w-full"
                                          onClick={() =>
                                            setTopicLimits((current) => ({
                                              ...current,
                                              [chapter.id]: visibleLimit + 100,
                                            }))
                                          }
                                        >
                                          Pokaż kolejne 100
                                        </Button>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <p className="py-3 text-muted-foreground">
                                      Brak tematów pasujących do filtra.
                                    </p>
                                  )}
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      ) : (
                        <p className="py-8 text-center text-sm text-muted-foreground">
                          Brak rozdziałów pasujących do wyszukiwania i filtrów.
                        </p>
                      )}
                      {hasMoreChapters ? (
                        <div className="border-t p-3 text-center">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={loadingMoreChapters}
                            onClick={() => void loadMoreChapters()}
                          >
                            {loadingMoreChapters ? (
                              <LoaderCircle className="animate-spin" />
                            ) : null}
                            Pokaż kolejne {CHAPTER_PAGE_SIZE}
                          </Button>
                        </div>
                      ) : null}
                    </div>

                    {scope?.unassignedQuestionCount ? (
                      <label className="flex items-center gap-3 rounded-lg border p-3">
                        <Checkbox
                          checked={includeUnassigned}
                          onCheckedChange={setIncludeUnassigned}
                        />
                        <span className="text-sm">
                          Uwzględnij pytania bez przypisanego tematu (
                          {scope.unassignedQuestionCount})
                        </span>
                      </label>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-card p-4 shadow-lg ring-1 ring-foreground/10">
              <div>
                <p className="font-medium">
                  Wybrano {selectedTopicCount} tematów
                </p>
                <p className="text-xs text-muted-foreground">
                  z {selectedChapterCount} rozdziałów · {learningDays} dni na
                  nowy materiał
                </p>
                {selectedTopicCount > 0 ? (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      planHealth === "comfortable"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : planHealth === "tight"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-destructive"
                    }`}
                  >
                    Wstępnie: {previewTopicsPerDay} tem./dzień ·{" "}
                    {planHealth === "comfortable"
                      ? "komfortowy zakres"
                      : planHealth === "tight"
                        ? "napięty zakres"
                        : "bardzo duże obciążenie"}
                  </p>
                ) : null}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={requestCancel}>
                  Anuluj
                </Button>
                <Button
                  disabled={!canPrepare}
                  onClick={() => void preparePlan()}
                >
                  {preparing ? <LoaderCircle className="animate-spin" /> : null}
                  Generuj plan
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,0.8fr)]">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Tempo nauki</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Dni nauki</Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((day) => (
                        <Button
                          key={day.value}
                          type="button"
                          size="sm"
                          variant={
                            weekdays.includes(day.value) ? "default" : "outline"
                          }
                          onClick={() =>
                            setWeekdays((current) =>
                              current.includes(day.value)
                                ? current.length === 1
                                  ? current
                                  : current.filter(
                                      (value) => value !== day.value,
                                    )
                                : [...current, day.value],
                            )
                          }
                        >
                          {day.short}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="limit-mode">Dzienny limit</Label>
                    <select
                      id="limit-mode"
                      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                      value={limitMode}
                      onChange={(event) =>
                        setLimitMode(
                          event.target.value as "questions" | "minutes",
                        )
                      }
                    >
                      <option value="questions">pytań</option>
                      <option value="minutes">minut</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="limit">Wartość limitu</Label>
                    <Input
                      id="limit"
                      type="number"
                      min={limitMode === "minutes" ? 5 : 1}
                      max={limitMode === "minutes" ? 1440 : 1000}
                      aria-invalid={Boolean(limitError)}
                      value={limit}
                      onChange={(event) => setLimit(Number(event.target.value))}
                    />
                    {limitError ? (
                      <p className="text-xs text-destructive">{limitError}</p>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Collapsible>
                <Card>
                  <CollapsibleTrigger
                    render={
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-6 py-5 text-left"
                      />
                    }
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <SlidersHorizontal className="size-4" /> Ustawienia
                      zaawansowane
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Retencja {targetRetention}% · bufor {bufferPercent}%
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="grid gap-4 border-t pt-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="retention">
                          Oczekiwane opanowanie (%)
                        </Label>
                        <Input
                          id="retention"
                          type="number"
                          min={70}
                          max={99}
                          aria-invalid={
                            targetRetention < 70 || targetRetention > 99
                          }
                          value={targetRetention}
                          onChange={(event) =>
                            setTargetRetention(Number(event.target.value))
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="buffer">
                          Bufor przed egzaminem (%)
                        </Label>
                        <Input
                          id="buffer"
                          type="number"
                          min={0}
                          max={30}
                          aria-invalid={bufferPercent < 0 || bufferPercent > 30}
                          value={bufferPercent}
                          onChange={(event) =>
                            setBufferPercent(Number(event.target.value))
                          }
                        />
                      </div>
                    </CardContent>
                    {advancedError ? (
                      <p className="border-t px-6 py-3 text-xs text-destructive">
                        {advancedError}
                      </p>
                    ) : null}
                  </CollapsibleContent>
                </Card>
              </Collapsible>

              <Card>
                <CardHeader>
                  <CardTitle>Podsumowanie zakresu</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Termin</p>
                    <p className="mt-1 font-medium">
                      {formatDate(examDate, true)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Tematy</p>
                    <p className="mt-1 text-xl font-semibold">
                      {selectedTopics.length}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Rozdziały</p>
                    <p className="mt-1 text-xl font-semibold">
                      {
                        new Set(selectedTopics.map((topic) => topic.chapterId))
                          .size
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Collapsible
                open={selectedMaterialsOpen}
                onOpenChange={setSelectedMaterialsOpen}
              >
                <Card>
                  <CollapsibleTrigger
                    render={
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-auto w-full justify-between rounded-xl px-6 py-5"
                      />
                    }
                  >
                    Wybrane materiały
                    <span className="text-xs text-muted-foreground">
                      {selectedTopics.length} tematów
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="max-h-72 space-y-2 overflow-y-auto border-t pt-4">
                      {selectedTopics.map((topic) => (
                        <div
                          key={topic.id}
                          className="flex items-center justify-between gap-3 rounded-md border p-3"
                        >
                          <span className="min-w-0 text-sm">
                            <span className="block truncate font-medium">
                              {topic.title}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {topic.chapterTitle}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => removePreparedTopic(topic)}
                          >
                            Usuń
                          </Button>
                        </div>
                      ))}
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            </div>

            <Card className="lg:sticky lg:top-4">
              <CardHeader>
                <CardTitle>Prognoza planu</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Do egzaminu</p>
                    <p className="mt-1 text-xl font-semibold">
                      {Math.max(0, generated.daysUntilExam)} dni
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs text-muted-foreground">Dziennie</p>
                    <p className="mt-1 text-xl font-semibold">
                      {generated.topicsPerDay} tem.
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Około {generated.reviewForecastLow}–
                  {generated.reviewForecastHigh} powtórek w dzień nauki.
                  Ostatnie {generated.bufferDays}{" "}
                  {generated.bufferDays === 1 ? "dzień jest" : "dni są"}{" "}
                  buforem.
                </p>
                <p className="text-xs text-muted-foreground">
                  Tempo powtórek: około {scope?.reviewSecondsPerQuestion ?? 45}{" "}
                  s na pytanie
                  {scope?.paceSampleSize
                    ? ` na podstawie ${scope.paceSampleSize} odpowiedzi.`
                    : " — wartość początkowa do czasu zebrania historii."}
                </p>

                {generated.warnings.map((warning) => (
                  <div
                    key={warning}
                    className="flex gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    {warning}
                  </div>
                ))}
                {overloadSuggestions.length ? (
                  <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                    <h2 className="text-sm font-semibold">Jak odciążyć plan</h2>
                    <ul className="mt-2 space-y-2">
                      {overloadSuggestions.map((suggestion) => (
                        <li
                          key={suggestion.id}
                          className="flex items-start justify-between gap-3 text-xs"
                        >
                          <span>
                            <span className="block font-medium">
                              {suggestion.title}
                            </span>
                            <span className="block text-muted-foreground">
                              {suggestion.description}
                            </span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() =>
                              applyOverloadSuggestion(suggestion.id)
                            }
                          >
                            Zastosuj
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <Collapsible open={scheduleOpen} onOpenChange={setScheduleOpen}>
                  <CollapsibleTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                      />
                    }
                  >
                    {scheduleOpen
                      ? "Ukryj harmonogram"
                      : "Zobacz cały harmonogram"}
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-3 overflow-x-auto rounded-lg border p-2">
                      <Calendar
                        locale={pl}
                        defaultMonth={dateFromKey(
                          generated.days[0]?.date ?? examDate,
                        )}
                        modifiers={{
                          study: generated.days
                            .filter((day) => !day.isBufferDay)
                            .map((day) => dateFromKey(day.date)),
                          buffer: generated.days
                            .filter((day) => day.isBufferDay)
                            .map((day) => dateFromKey(day.date)),
                          overloaded: generated.days
                            .filter((day) => day.isOverloaded)
                            .map((day) => dateFromKey(day.date)),
                        }}
                        modifiersClassNames={{
                          study: "bg-primary/15 font-medium",
                          buffer: "bg-amber-500/15 font-medium",
                          overloaded:
                            "ring-2 ring-inset ring-destructive text-destructive",
                        }}
                      />
                      <div className="flex flex-wrap gap-3 px-2 pb-2 text-xs text-muted-foreground">
                        <span>● nauka</span>
                        <span className="text-amber-600">● bufor</span>
                        <span className="text-destructive">○ przeciążenie</span>
                      </div>
                    </div>
                    <div className="mt-3 max-h-[42vh] space-y-2 overflow-y-auto pr-1">
                      {generated.days.map((day) => (
                        <div
                          key={day.date}
                          className="rounded-md border p-3 text-sm"
                        >
                          <div className="flex justify-between gap-2 font-medium">
                            <span>{formatDate(day.date)}</span>
                            <span className="text-muted-foreground">
                              {day.isBufferDay
                                ? "bufor"
                                : `${day.assignments.length} tem.`}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Cel: {day.reviewTarget} powtórek · około{" "}
                            {day.estimatedMinutesLow}–{day.estimatedMinutesHigh}{" "}
                            min
                          </p>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>

                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setStep("scope");
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    Wróć do zakresu
                  </Button>
                  <Button
                    disabled={
                      saving ||
                      scopeLoading ||
                      scopeError ||
                      !scope ||
                      !generated.days.length ||
                      Boolean(limitError) ||
                      Boolean(advancedError)
                    }
                    onClick={() => void save()}
                  >
                    {saving ? <LoaderCircle className="animate-spin" /> : null}
                    {saving
                      ? "Zapisywanie…"
                      : initialDetails
                        ? "Zapisz zmiany"
                        : "Zapisz plan"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odrzucić niezapisane zmiany?</AlertDialogTitle>
            <AlertDialogDescription>
              Wybrany zakres i ustawienia planu nie zostały jeszcze zapisane.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zostań</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discardAndCancel}>
              Odrzuć zmiany
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
