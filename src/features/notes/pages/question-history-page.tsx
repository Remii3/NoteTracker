import { StudyHistoryPage } from "@/features/questions/components/study-history-page";
import { useModuleContext } from "../components/module-context";

export function QuestionHistoryPage() {
  const { questionsRepository, navigateStudySession, moduleName } =
    useModuleContext();

  if (!questionsRepository) return null;

  return (
    <StudyHistoryPage
      moduleName={moduleName}
      repository={questionsRepository}
      onOpenSession={navigateStudySession}
    />
  );
}
