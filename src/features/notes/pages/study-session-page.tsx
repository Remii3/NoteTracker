import { useNavigate, useParams, useSearchParams } from "react-router";

import { StudySession } from "@/features/questions/components/study-session";
import { useModuleContext } from "../components/module-context";

export function StudySessionPage() {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { questionsRepository, navigateQuestions } = useModuleContext();

  if (!questionsRepository || !sessionId) return null;

  return (
    <StudySession
      key={sessionId}
      sessionId={sessionId}
      repository={questionsRepository}
      timeLimitMinutes={searchParams.get("from") === "today" ? 10 : undefined}
      onCloseLabel={
        searchParams.get("from") === "today"
          ? "Wróć do planu na dziś"
          : undefined
      }
      onClose={
        searchParams.get("from") === "today"
          ? () => navigate("/")
          : navigateQuestions
      }
    />
  );
}
