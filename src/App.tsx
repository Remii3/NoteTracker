import { Toaster } from "@/components/ui/sonner";
import { AppLoading } from "@/components/app-loading";
import {
  AuthPage,
  AuthProvider,
  PasswordRecoveryPage,
  useAuth,
} from "@/features/auth";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";

async function loadNoteWorkspace() {
  const module = await import("@/features/notes");
  return { Component: module.SupabaseNoteWorkspace };
}
async function loadTrash() {
  const module = await import("@/features/trash/trash-page");
  return { Component: module.TrashPage };
}

let router: ReturnType<typeof createBrowserRouter> | undefined;

function getRouter() {
  router ??= createBrowserRouter([
    { path: "/", element: <Navigate to="/modules" replace /> },
    { path: "/modules", lazy: loadNoteWorkspace, HydrateFallback: AppLoading },
    { path: "/trash", lazy: loadTrash, HydrateFallback: AppLoading },
    {
      path: "/modules/:moduleId",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/chapters",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/gallery",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/questions",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/questions/history",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/study/:studyMode/:sessionId",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/chapters/:chapterSlug",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    {
      path: "/modules/:moduleId/chapters/:chapterSlug/:topicSlug",
      lazy: loadNoteWorkspace,
      HydrateFallback: AppLoading,
    },
    { path: "*", element: <Navigate to="/modules" replace /> },
  ]);
  return router;
}

function AuthenticatedApp() {
  const { isLoading, isPasswordRecovery, user } = useAuth();

  if (isLoading) return <AppLoading />;
  if (isPasswordRecovery) return <PasswordRecoveryPage />;
  if (!user) return <AuthPage />;

  return <RouterProvider router={getRouter()} />;
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
      <Toaster position="bottom-right" />
    </AuthProvider>
  );
}

export default App;
