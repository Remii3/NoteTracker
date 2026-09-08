import { StudyHistoryPage } from "@/features/questions/components/study-history-page";
import { useModuleContext } from "../components/module-context";

export function QuestionHistoryPage() {
  const { questionsRepository, navigateQuestions, navigateStudySession } =
    useModuleContext();

  if (!questionsRepository) return null;

  return (
    <StudyHistoryPage
      repository={questionsRepository}
      onBack={navigateQuestions}
      onOpenSession={navigateStudySession}
    />
  );
}
