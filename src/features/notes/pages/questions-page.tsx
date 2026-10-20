import { QuestionsPage as Questions } from "@/features/questions/components/questions-page";
import { useModuleContext } from "../components/module-context";
import { useSearchParams } from "react-router";
import { useUser } from "@/features/auth";
import { dismissOnboarding } from "@/features/onboarding/lib/onboarding-storage";

export function QuestionsPage() {
  const user = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const onboarding = searchParams.get("onboarding") === "questions";
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
      onboarding={onboarding}
      onFinishOnboarding={() => {
        dismissOnboarding(user.id);
        const next = new URLSearchParams(searchParams);
        next.delete("onboarding");
        setSearchParams(next, { replace: true });
      }}
    />
  );
}
