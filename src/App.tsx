import { AuthProvider } from "@/features/auth";
import { AuthenticatedApp } from "@/router";
import { ThemeProvider } from "@/features/theme";
import { Toaster } from "@/components/ui/toast";

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthenticatedApp />
        <Toaster />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
