import { ChaptersOverview } from "../components/chapters-overview";
import { useModuleContext } from "../components/module-context";
import { useState } from "react";
import { ModuleImportDialog } from "@/features/modules/import/module-import-dialog";
import { toast } from "@/components/ui/toast";
import { AiSummaryDialog } from "@/features/summaries/components/ai-summary-dialog";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { SpotlightGuide } from "@/features/onboarding/components/spotlight-guide";
import { dismissOnboarding } from "@/features/onboarding/lib/onboarding-storage";
import { useUser } from "@/features/auth";
import { Button } from "@/components/ui/button";
import { ArrowRight, X } from "lucide-react";

export function ChaptersPage() {
  const user = useUser();
  const navigate = useNavigate();
  const { moduleSlug = "" } = useParams<{ moduleSlug: string }>();
  const [searchParams] = useSearchParams();
  const isOnboarding = searchParams.get("onboarding") === "content";
  const [guideOpen, setGuideOpen] = useState(isOnboarding);
  const [importOpen, setImportOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const {
    chapters,
    learningSummary,
    loadChapterTopics,
    moduleId,
    moduleName,
    openChapter,
    importDocx,
    refreshNotes,
    summaryGenerationService,
    chapterWorkspaceProps,
  } = useModuleContext();

  function finishOnboarding() {
    dismissOnboarding(user.id);
    setGuideOpen(false);
    navigate(`/${moduleSlug}`, { replace: true, state: { moduleId } });
  }

  return (
    <>
      <ChaptersOverview
        chapters={chapters}
        moduleName={moduleName}
        summary={learningSummary}
        onOpenChapter={openChapter}
        onImport={() => setImportOpen(true)}
        onSummarize={
          summaryGenerationService ? () => setSummaryOpen(true) : undefined
        }
        onAddContent={chapterWorkspaceProps.onAddContent}
      />
      {guideOpen && isOnboarding && chapters.length === 0 && (
        <SpotlightGuide
          target='[data-onboarding="add-content"]'
          title="Dodaj pierwszy materiał"
          description="Utwórz rozdział i wpisz tematy, których chcesz się nauczyć. Możesz dodać kilka tematów naraz."
          step={2}
          steps={4}
          onSkip={finishOnboarding}
        />
      )}
      {isOnboarding && chapters.length > 0 && (
        <aside className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-background p-5 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wide text-primary uppercase">
                Krok 3 z 4
              </p>
              <h2 className="mt-1 font-semibold">Materiał jest gotowy</h2>
            </div>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Zakończ przewodnik"
              onClick={finishOnboarding}
            >
              <X />
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Teraz dodaj pytania ręcznie albo wygeneruj je na podstawie notatek.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() =>
              navigate(`/${moduleSlug}/questions?onboarding=questions`, {
                state: { moduleId },
              })
            }
          >
            Przejdź do pytań <ArrowRight />
          </Button>
        </aside>
      )}
      {summaryOpen && summaryGenerationService && (
        <AiSummaryDialog
          moduleId={moduleId}
          chapters={chapters}
          service={summaryGenerationService}
          loadTopics={loadChapterTopics}
          onClose={() => setSummaryOpen(false)}
          onSaved={async (note) => {
            await refreshNotes();
            await openChapter(note.chapterId, note.topicId);
          }}
        />
      )}
      {importOpen && (
        <ModuleImportDialog
          existingModuleNames={[]}
          allowedSources={["docx"]}
          destination="current-module"
          targetModuleName={moduleName ?? "Bieżący moduł"}
          onClose={() => setImportOpen(false)}
          onImport={async (draft) => {
            if (draft.kind !== "content") {
              throw new Error("Ten widok obsługuje wyłącznie dokumenty Word.");
            }
            const imported = await importDocx(draft);
            setImportOpen(false);
            toast.add({
              data: { type: "success" },
              description: `Zaimportowano rozdziały: ${imported}.`,
            });
          }}
        />
      )}
    </>
  );
}
