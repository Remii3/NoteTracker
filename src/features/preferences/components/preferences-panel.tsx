import { useEffect, useMemo, useState } from "react";
import { BellRing, Laptop, Moon, Sun, Target } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { useTheme, type Theme } from "@/features/theme";
import { clearMemoryCacheByPrefix } from "@/lib/memory-cache";
import { supabase } from "@/lib/supabase/client";
import {
  DEFAULT_USER_PREFERENCES,
  PreferencesRepository,
  REVIEW_REMINDER_INTERVALS,
  type ReviewReminderInterval,
  type UserPreferences,
} from "../data/preferences-repository";

const INTERVAL_LABELS: Record<ReviewReminderInterval, string> = {
  1: "Codziennie",
  2: "Co 2 dni",
  3: "Co 3 dni",
  7: "Co tydzień",
  14: "Co 2 tygodnie",
  30: "Co 30 dni",
};

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Jasny", icon: Sun },
  { value: "dark", label: "Ciemny", icon: Moon },
  { value: "system", label: "Systemowy", icon: Laptop },
];

export function PreferencesPanel({ userId }: { userId: string }) {
  const repository = useMemo(
    () => new PreferencesRepository(supabase, userId),
    [userId],
  );
  const { theme, setTheme } = useTheme();
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [savedPreferences, setSavedPreferences] =
    useState<UserPreferences | null>(null);
  const [goalInput, setGoalInput] = useState("5");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void repository
      .get()
      .then((value) => {
        if (!active) return;
        setPreferences(value);
        setSavedPreferences(value);
        setGoalInput(String(value.weeklyTopics));
      })
      .catch(() => {
        if (!active) return;
        setPreferences(DEFAULT_USER_PREFERENCES);
        setSavedPreferences(DEFAULT_USER_PREFERENCES);
        toast.add({
          data: { type: "error" },
          description: "Nie udało się pobrać preferencji.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [repository]);

  async function save() {
    if (!preferences) return;
    const weeklyTopics = Number(goalInput);
    if (
      !Number.isInteger(weeklyTopics) ||
      weeklyTopics < 1 ||
      weeklyTopics > 1000
    ) {
      toast.add({
        data: { type: "error" },
        description: "Cel musi wynosić od 1 do 1000 tematów.",
      });
      return;
    }

    const reminderScheduleChanged =
      preferences.reviewRemindersEnabled &&
      (!savedPreferences?.reviewRemindersEnabled ||
        savedPreferences.reviewReminderIntervalDays !==
          preferences.reviewReminderIntervalDays);
    const next = {
      ...preferences,
      weeklyTopics,
      lastReviewReminderAt: reminderScheduleChanged
        ? new Date().toISOString()
        : preferences.lastReviewReminderAt,
    };

    setSaving(true);
    try {
      await repository.save(next);
      setPreferences(next);
      setSavedPreferences(next);
      setGoalInput(String(weeklyTopics));
      clearMemoryCacheByPrefix(`statistics:${userId}:`);
      toast.add({
        data: { type: "success" },
        description: "Preferencje zostały zapisane.",
      });
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się zapisać preferencji.",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !preferences) {
    return (
      <div className="space-y-4" aria-label="Ładowanie preferencji">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PreferenceSection
        icon={BellRing}
        title="Rutynowe przypomnienia sprawdzające"
        description="Aplikacja przypomni Ci o krótkiej powtórce, korzystając z pytań, które masz już w bazie."
      >
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            className="mt-0.5"
            checked={preferences.reviewRemindersEnabled}
            onCheckedChange={(checked) =>
              setPreferences((current) =>
                current
                  ? { ...current, reviewRemindersEnabled: Boolean(checked) }
                  : current,
              )
            }
          />
          <span>
            <span className="block text-sm font-medium">
              Włącz przypomnienia
            </span>
            <span className="block text-sm text-muted-foreground">
              Są pokazywane tylko podczas korzystania z NoteTrackera.
            </span>
          </span>
        </label>
        <div className="mt-5 max-w-xs">
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="review-cycle"
          >
            Cykl przypomnienia
          </label>
          <Select
            value={String(preferences.reviewReminderIntervalDays)}
            onValueChange={(value) => {
              const interval = Number(value) as ReviewReminderInterval;
              if (!REVIEW_REMINDER_INTERVALS.includes(interval)) return;
              setPreferences((current) =>
                current
                  ? { ...current, reviewReminderIntervalDays: interval }
                  : current,
              );
            }}
            disabled={!preferences.reviewRemindersEnabled}
          >
            <SelectTrigger id="review-cycle" className="w-full">
              <SelectValue>
                {INTERVAL_LABELS[preferences.reviewReminderIntervalDays]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {REVIEW_REMINDER_INTERVALS.map((interval) => (
                <SelectItem key={interval} value={String(interval)}>
                  {INTERVAL_LABELS[interval]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PreferenceSection>

      <PreferenceSection
        icon={Target}
        title="Cel tygodniowy"
        description="Ustal, ile tematów chcesz ukończyć w każdym tygodniu. Postęp nadal zobaczysz na stronie statystyk."
      >
        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox
            className="mt-0.5"
            checked={preferences.weeklyGoalEnabled}
            onCheckedChange={(checked) =>
              setPreferences((current) =>
                current
                  ? { ...current, weeklyGoalEnabled: Boolean(checked) }
                  : current,
              )
            }
          />
          <span className="text-sm font-medium">Włącz cel tygodniowy</span>
        </label>
        <div className="mt-5 max-w-xs">
          <label
            className="mb-2 block text-sm font-medium"
            htmlFor="weekly-topic-goal"
          >
            Liczba tematów na tydzień
          </label>
          <Input
            id="weekly-topic-goal"
            type="number"
            min={1}
            max={1000}
            value={goalInput}
            disabled={!preferences.weeklyGoalEnabled}
            onChange={(event) => setGoalInput(event.target.value)}
          />
        </div>
      </PreferenceSection>

      <PreferenceSection
        icon={Sun}
        title="Wygląd"
        description="Motyw jest zapisywany na tym urządzeniu i stosowany od razu."
      >
        <div
          className="grid grid-cols-3 gap-2"
          role="radiogroup"
          aria-label="Motyw aplikacji"
        >
          {THEMES.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              type="button"
              variant={theme === value ? "secondary" : "outline"}
              className={theme === value ? "shadow-sm" : undefined}
              role="radio"
              aria-checked={theme === value}
              onClick={() => setTheme(value)}
            >
              <Icon />
              <span className="hidden sm:inline">{label}</span>
            </Button>
          ))}
        </div>
      </PreferenceSection>

      <Button type="button" disabled={saving} onClick={() => void save()}>
        {saving ? "Zapisywanie…" : "Zapisz preferencje"}
      </Button>
    </div>
  );
}

function PreferenceSection({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof Sun;
  title: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm sm:p-6">
      <div className="mb-5 flex gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary">
          <Icon className="size-4" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
