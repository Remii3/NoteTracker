import { QuestionsPage as Questions } from "@/features/questions/components/questions-page";
import { useModuleContext } from "../components/module-context";

export function QuestionsPage() {
  const {
    moduleId,
    orderedChapters,
    questionsRepository,
    questionGenerationService,
    loadChapterTopics,
    navigateStudySession,
    navigateQuestionHistory,
    moduleName,
  } = useModuleContext();

  if (!questionsRepository) return null;

  return (
    <Questions
      moduleId={moduleId}
      chapters={orderedChapters}
      moduleName={moduleName}
      repository={questionsRepository}
      loadTopics={loadChapterTopics}
      onOpenSession={navigateStudySession}
      onOpenHistory={navigateQuestionHistory}
      generationService={questionGenerationService}
    />
  );
}
