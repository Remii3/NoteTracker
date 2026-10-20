import {
  ArrowRight,
  FileUp,
  FlaskConical,
  LoaderCircle,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useNavigate } from "react-router";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getUserDisplayName, useUser } from "@/features/auth";
import { dismissOnboarding } from "../lib/onboarding-storage";
import { SupabaseModulesRepository } from "@/features/modules/data/supabase-modules-repository";
import { supabase } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";

const sampleChapters = [
  {
    slug: "pierwsze-kroki",
    title: "Pierwsze kroki",
    position: 1000,
    topics: [
      {
        slug: "aktywne-przypominanie",
        title: "Aktywne przypominanie",
        position: 1000,
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Aktywne przypominanie polega na samodzielnym odtwarzaniu informacji z pamięci. Pytania i fiszki są skuteczniejsze niż samo ponowne czytanie notatek.",
                },
              ],
            },
          ],
        },
      },
    ],
  },
];

const sampleQuestions = [
  {
    chapterTitle: "Pierwsze kroki",
    chapterSlug: "pierwsze-kroki",
    topicTitle: "Aktywne przypominanie",
    topicSlug: "aktywne-przypominanie",
    content: "Na czym polega aktywne przypominanie?",
    explanation: "Próba odtworzenia wiedzy wzmacnia ślad pamięciowy.",
    options: [
      {
        content: "Na samodzielnym odtwarzaniu informacji z pamięci",
        isCorrect: true,
      },
      {
        content: "Na wielokrotnym czytaniu tego samego tekstu",
        isCorrect: false,
      },
    ],
  },
  {
    chapterTitle: "Pierwsze kroki",
    chapterSlug: "pierwsze-kroki",
    topicTitle: "Aktywne przypominanie",
    topicSlug: "aktywne-przypominanie",
    content: "Dlaczego warto rozkładać powtórki w czasie?",
    explanation:
      "Powtórka wykonana po przerwie wymaga wysiłku i lepiej utrwala wiedzę.",
    options: [
      { content: "Pomaga utrzymać wiedzę na dłużej", isCorrect: true },
      { content: "Pozwala całkowicie uniknąć zapominania", isCorrect: false },
    ],
  },
  {
    chapterTitle: "Pierwsze kroki",
    chapterSlug: "pierwsze-kroki",
    topicTitle: "Aktywne przypominanie",
    topicSlug: "aktywne-przypominanie",
    content: "Co zrobić, gdy nie pamiętasz odpowiedzi?",
    explanation:
      "Szczera ocena pozwala algorytmowi zaplanować wcześniejszą powtórkę.",
    options: [
      {
        content: "Oznaczyć odpowiedź zgodnie z rzeczywistością",
        isCorrect: true,
      },
      { content: "Zawsze wybrać najwyższą ocenę", isCorrect: false },
    ],
  },
];

const choices = [
  {
    id: "import",
    icon: FileUp,
    title: "Zaimportuj materiały",
    description: "Dodaj dokument Word, talię Anki albo zestaw z Quizlet.",
    recommended: true,
  },
  {
    id: "create",
    icon: PenLine,
    title: "Utwórz moduł ręcznie",
    description: "Zacznij od własnej nazwy, rozdziałów i tematów.",
    recommended: false,
  },
  {
    id: "sample",
    icon: FlaskConical,
    title: "Wypróbuj przykład",
    description: "Otwórz gotowy mini-moduł i od razu zobacz sesję nauki.",
    recommended: false,
  },
] as const;

export function WelcomePage() {
  const user = useUser();
  const navigate = useNavigate();
  const [creatingSample, setCreatingSample] = useState(false);
  const modulesRepository = useMemo(
    () => new SupabaseModulesRepository(supabase, user.id),
    [user.id],
  );
  const name = getUserDisplayName(user)?.split(/\s+/)[0];

  function skip() {
    dismissOnboarding(user.id);
    navigate("/", { replace: true });
  }

  async function createSample() {
    if (creatingSample) return;
    setCreatingSample(true);
    try {
      const modules = await modulesRepository.list();
      const position =
        Math.max(0, ...modules.map((module) => module.position)) + 1000;
      const module = await modulesRepository.importLearningModule(
        "Jak uczyć się z Sylabio",
        position,
        sampleChapters,
        sampleQuestions,
      );
      navigate(`/${module.slug}/questions?onboarding=questions`, {
        state: { moduleId: module.id },
      });
    } catch {
      toast.add({
        data: { type: "error" },
        description: "Nie udało się przygotować przykładowego modułu.",
      });
      setCreatingSample(false);
    }
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-muted/25 px-5 py-10 sm:px-8 lg:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <Sparkles className="size-6" />
          </span>
          <p className="mt-5 text-sm font-semibold text-primary">
            Witaj{name ? `, ${name}` : ""}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Przygotujmy Twoją pierwszą sesję nauki
          </h1>
          <p className="mt-3 text-muted-foreground">
            Wybierz sposób rozpoczęcia. Przewodnik pokaże Ci kolejne kroki, a
            możesz go pominąć w dowolnej chwili.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {choices.map(
            ({ id, icon: Icon, title, description, recommended }) => (
              <button
                key={id}
                type="button"
                className="group relative rounded-2xl border bg-background p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transform-none"
                disabled={creatingSample}
                onClick={() =>
                  id === "sample"
                    ? void createSample()
                    : navigate(`/modules?onboarding=${id}`)
                }
              >
                {recommended && (
                  <span className="absolute top-4 right-4 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                    Polecane
                  </span>
                )}
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  {id === "sample" && creatingSample ? (
                    <LoaderCircle className="size-5 animate-spin" />
                  ) : (
                    <Icon className="size-5" />
                  )}
                </span>
                <h2 className="mt-5 text-lg font-semibold">{title}</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {description}
                </p>
                <span className="mt-6 flex items-center gap-1 text-sm font-semibold text-primary">
                  Rozpocznij{" "}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
                </span>
              </button>
            ),
          )}
        </div>

        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={skip}>
            Pomiń i przejdź do aplikacji
          </Button>
        </div>
      </div>
    </main>
  );
}
