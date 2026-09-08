import { useParams } from "react-router";

import { StudySession } from "@/features/questions/components/study-session";
import { useModuleContext } from "../components/module-context";

export function StudySessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const { questionsRepository, navigateQuestions } = useModuleContext();

  if (!questionsRepository || !sessionId) return null;

  return (
    <StudySession
      key={sessionId}
      sessionId={sessionId}
      repository={questionsRepository}
      onClose={navigateQuestions}
    />
  );
}
