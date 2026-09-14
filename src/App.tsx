import { AuthProvider } from "@/features/auth";
import { AuthenticatedApp } from "@/router";
import { Toaster } from "@/components/ui/toast";

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
      <Toaster />
    </AuthProvider>
  );
}

export default App;
