import { AuthPage, PasswordRecoveryPage, useAuth } from "@/features/auth";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";

import { AppLoading } from "@/components/app-loading";

const router = createBrowserRouter([
  {
    path: "/",
    lazy: () =>
      import("@/features/modules/pages/modules-page").then(
        ({ ModulesPage }) => ({ Component: ModulesPage }),
      ),
    HydrateFallback: AppLoading,
  },
  {
    path: "/:moduleSlug",
    lazy: () =>
      import("@/features/notes").then(({ ModulePage }) => ({
        Component: ModulePage,
      })),
    HydrateFallback: AppLoading,
    children: [
      {
        index: true,
        lazy: () =>
          import("@/features/notes/pages/chapters-page").then(
            ({ ChaptersPage }) => ({ Component: ChaptersPage }),
          ),
      },
      {
        path: "chapters/:chapterSlug/:topicSlug?",
        lazy: () =>
          import("@/features/notes/pages/chapter-page").then(
            ({ ChapterPage }) => ({ Component: ChapterPage }),
          ),
        handle: { activeView: "notes" },
      },
      {
        path: "gallery",
        lazy: () =>
          import("@/features/notes/pages/gallery-page").then(
            ({ GalleryPage }) => ({ Component: GalleryPage }),
          ),
        handle: { activeView: "gallery" },
      },
      {
        path: "statistics",
        lazy: () =>
          import("@/features/notes/pages/module-statistics-page").then(
            ({ ModuleStatisticsPage }) => ({
              Component: ModuleStatisticsPage,
            }),
          ),
        handle: {
          activeView: "statistics",
          showHeader: false,
        },
      },
      {
        path: "questions",
        lazy: () =>
          import("@/features/notes/pages/questions-page").then(
            ({ QuestionsPage }) => ({ Component: QuestionsPage }),
          ),
        handle: { activeView: "questions" },
      },
      {
        path: "questions/history",
        lazy: () =>
          import("@/features/notes/pages/question-history-page").then(
            ({ QuestionHistoryPage }) => ({
              Component: QuestionHistoryPage,
            }),
          ),
        handle: {
          moduleView: "question-history",
          activeView: "questions",
        },
      },
      {
        path: "study/:studyMode/:sessionId",
        lazy: () =>
          import("@/features/notes/pages/study-session-page").then(
            ({ StudySessionPage }) => ({ Component: StudySessionPage }),
          ),
        handle: { activeView: "questions" },
      },
    ],
  },
  {
    path: "/statistics",
    lazy: () =>
      import("@/features/statistics/pages/statistics-page").then(
        ({ StatisticsPage }) => ({ Component: StatisticsPage }),
      ),
    HydrateFallback: AppLoading,
  },
  {
    path: "/trash",
    lazy: () =>
      import("@/features/trash/trash-page").then(({ TrashPage }) => ({
        Component: TrashPage,
      })),
    HydrateFallback: AppLoading,
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

export function AuthenticatedApp() {
  const { isLoading, isPasswordRecovery, user } = useAuth();
  if (isLoading) return <AppLoading />;
  if (!user) return <AuthPage />;
  if (isPasswordRecovery) return <PasswordRecoveryPage />;

  return <RouterProvider router={router} />;
}
