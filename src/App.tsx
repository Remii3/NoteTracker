import { AuthProvider } from "@/features/auth";
import { AuthenticatedApp } from "@/router";
import { ThemeProvider } from "@/features/theme";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PwaProvider } from "@/features/pwa";

function App() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <PwaProvider>
          <AuthProvider>
            <AuthenticatedApp />
            <Toaster />
          </AuthProvider>
        </PwaProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

export default App;
