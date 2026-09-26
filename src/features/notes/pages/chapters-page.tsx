import { ChaptersOverview } from "../components/chapters-overview";
import { useModuleContext } from "../components/module-context";
import { useState } from "react";
import { ModuleImportDialog } from "@/features/modules/import/module-import-dialog";
import { toast } from "@/components/ui/toast";
import { AiSummaryDialog } from "@/features/summaries/components/ai-summary-dialog";

export function ChaptersPage() {
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
  } = useModuleContext();

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
      />
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
