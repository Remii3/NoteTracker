import { AuthProvider } from "@/features/auth";
import { ThemeProvider } from "@/features/theme";
import { AuthenticatedApp } from "@/router";
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
