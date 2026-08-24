import { Toaster } from "@/components/ui/sonner";
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

function AppLoading() {
  return (
    <div className="grid min-h-svh place-items-center text-sm text-muted-foreground">
      Ładowanie aplikacji…
    </div>
  );
}

const router = createBrowserRouter([
  { path: "/", lazy: loadNoteWorkspace, HydrateFallback: AppLoading },
  { path: "/chapters", lazy: loadNoteWorkspace, HydrateFallback: AppLoading },
  { path: "/flashcards", lazy: loadNoteWorkspace, HydrateFallback: AppLoading },
  {
    path: "/flashcards/sessions/:sessionId",
    lazy: loadNoteWorkspace,
    HydrateFallback: AppLoading,
  },
  {
    path: "/chapters/:chapterSlug",
    lazy: loadNoteWorkspace,
    HydrateFallback: AppLoading,
  },
  {
    path: "/chapters/:chapterSlug/:topicSlug",
    lazy: loadNoteWorkspace,
    HydrateFallback: AppLoading,
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

function AuthenticatedApp() {
  const { isLoading, isPasswordRecovery, user } = useAuth();

  if (isLoading) return <AppLoading />;
  if (isPasswordRecovery) return <PasswordRecoveryPage />;
  if (!user) return <AuthPage />;

  return <RouterProvider router={router} />;
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
