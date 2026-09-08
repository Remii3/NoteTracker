import { ChaptersOverview } from "../components/chapters-overview";
import { useModuleContext } from "../components/module-context";

export function ChaptersPage() {
  const { chapters, learningSummary, moduleName, openChapter } =
    useModuleContext();

  return (
    <ChaptersOverview
      chapters={chapters}
      moduleName={moduleName}
      summary={learningSummary}
      onOpenChapter={openChapter}
    />
  );
}
