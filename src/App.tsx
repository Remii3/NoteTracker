import { Toaster } from "@/components/ui/sonner";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router";

async function loadNoteWorkspace() {
  const module = await import("@/features/notes");
  return { Component: module.NoteWorkspace };
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
  {
    path: "/chapters/:chapterId",
    lazy: loadNoteWorkspace,
    HydrateFallback: AppLoading,
  },
  {
    path: "/chapters/:chapterId/:topicId",
    lazy: loadNoteWorkspace,
    HydrateFallback: AppLoading,
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

function App() {
  return (
    <>
      <RouterProvider router={router} />
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
