import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/features/auth";
import { AuthenticatedApp } from "@/router";

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
      <Toaster position="bottom-right" />
    </AuthProvider>
  );
}

export default App;
