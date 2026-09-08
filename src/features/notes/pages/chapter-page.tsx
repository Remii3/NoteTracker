import { ChapterWorkspace } from "../components/chapter-workspace";
import { useModuleContext } from "../components/module-context";

export function ChapterPage() {
  const { chapterWorkspaceProps } = useModuleContext();

  return <ChapterWorkspace {...chapterWorkspaceProps} />;
}
