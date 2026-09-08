import { AppLoading } from "@/components/app-loading";
import { AuthPage, PasswordRecoveryPage, useAuth } from "@/features/auth";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";
import type { ModuleRouteHandle } from "@/features/notes/types/workspace-types";

const moduleRoute = {
  chapters: {
    moduleView: "chapters",
    activeView: "chapters",
    showHeader: true,
  },
  chapter: { moduleView: "chapter", activeView: "notes", showHeader: true },
  gallery: { moduleView: "gallery", activeView: "gallery", showHeader: true },
  statistics: {
    moduleView: "statistics",
    activeView: "statistics",
    showHeader: false,
  },
  questions: {
    moduleView: "questions",
    activeView: "questions",
    showHeader: true,
  },
  questionHistory: {
    moduleView: "question-history",
    activeView: "questions",
    showHeader: true,
  },
  studySession: {
    moduleView: "study-session",
    activeView: "questions",
    showHeader: true,
  },
} satisfies Record<string, ModuleRouteHandle>;

async function loadModulePage() {
  const module = await import("@/features/notes");
  return { Component: module.ModulePage };
}
async function loadChaptersPage() {
  const module = await import("@/features/notes/pages/chapters-page");
  return { Component: module.ChaptersPage };
}
async function loadChapterPage() {
  const module = await import("@/features/notes/pages/chapter-page");
  return { Component: module.ChapterPage };
}
async function loadGalleryPage() {
  const module = await import("@/features/notes/pages/gallery-page");
  return { Component: module.GalleryPage };
}
async function loadModuleStatisticsPage() {
  const module = await import("@/features/notes/pages/module-statistics-page");
  return { Component: module.ModuleStatisticsPage };
}
async function loadQuestionsPage() {
  const module = await import("@/features/notes/pages/questions-page");
  return { Component: module.QuestionsPage };
}
async function loadQuestionHistoryPage() {
  const module = await import("@/features/notes/pages/question-history-page");
  return { Component: module.QuestionHistoryPage };
}
async function loadStudySessionPage() {
  const module = await import("@/features/notes/pages/study-session-page");
  return { Component: module.StudySessionPage };
}
async function loadModulesPage() {
  const module = await import("@/features/modules/pages/modules-page");
  return { Component: module.ModulesPage };
}
async function loadStatisticsPage() {
  const module = await import("@/features/statistics/pages/statistics-page");
  return { Component: module.StatisticsPage };
}
async function loadTrash() {
  const module = await import("@/features/trash/trash-page");
  return { Component: module.TrashPage };
}

function getRouter() {
  return createBrowserRouter([
    { path: "/", element: <Navigate to="/modules" replace /> },
    {
      path: "/modules",
      lazy: loadModulesPage,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId",
      lazy: loadModulePage,
      HydrateFallback: AppLoading,
      children: [
        { index: true, lazy: loadChaptersPage, handle: moduleRoute.chapters },
        {
          path: "chapters",
          element: <Navigate to=".." relative="route" replace />,
        },
        {
          path: "chapters/:chapterSlug",
          lazy: loadChapterPage,
          handle: moduleRoute.chapter,
        },
        {
          path: "chapters/:chapterSlug/:topicSlug",
          lazy: loadChapterPage,
          handle: moduleRoute.chapter,
        },
        {
          path: "gallery",
          lazy: loadGalleryPage,
          handle: moduleRoute.gallery,
        },
        {
          path: "statistics",
          lazy: loadModuleStatisticsPage,
          handle: moduleRoute.statistics,
        },
        {
          path: "questions",
          lazy: loadQuestionsPage,
          handle: moduleRoute.questions,
        },
        {
          path: "questions/history",
          lazy: loadQuestionHistoryPage,
          handle: moduleRoute.questionHistory,
        },
        {
          path: "study/:studyMode/:sessionId",
          lazy: loadStudySessionPage,
          handle: moduleRoute.studySession,
        },
        {
          path: "*",
          element: <Navigate to=".." relative="route" replace />,
        },
      ],
    },
    {
      path: "/statistics",
      lazy: loadStatisticsPage,
      HydrateFallback: AppLoading,
    },
    { path: "/trash", lazy: loadTrash, HydrateFallback: AppLoading },
    { path: "*", element: <Navigate to="/modules" replace /> },
  ]);
}

export function AuthenticatedApp() {
  const { isLoading, isPasswordRecovery, user } = useAuth();

  if (isLoading) return <AppLoading />;
  if (isPasswordRecovery) return <PasswordRecoveryPage />;
  if (!user) return <AuthPage />;

  return <RouterProvider router={getRouter()} />;
}
