import { ChapterWorkspace } from "../components/chapter-workspace";
import { useModuleContext } from "../components/module-context";

export function ChapterPage() {
  const { chapterWorkspaceProps, moduleName } = useModuleContext();
  return (
    <ChapterWorkspace {...chapterWorkspaceProps} moduleName={moduleName} />
  );
}
