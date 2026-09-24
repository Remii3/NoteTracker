import { ChaptersOverview } from "../components/chapters-overview";
import { useModuleContext } from "../components/module-context";
import { useState } from "react";
import { ModuleImportDialog } from "@/features/modules/import/module-import-dialog";
import { toast } from "@/components/ui/toast";

export function ChaptersPage() {
  const [importOpen, setImportOpen] = useState(false);
  const { chapters, learningSummary, moduleName, openChapter, importDocx } =
    useModuleContext();

  return (
    <>
      <ChaptersOverview
        chapters={chapters}
        moduleName={moduleName}
        summary={learningSummary}
        onOpenChapter={openChapter}
        onImport={() => setImportOpen(true)}
      />
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
