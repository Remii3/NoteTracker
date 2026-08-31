import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AppErrorBoundary } from "./components/app-error-boundary.tsx";
import { initializeMonitoring } from "./lib/monitoring/sentry.ts";

const root = document.getElementById("root");
if (!root) throw new Error("Application root element is missing");

createRoot(root).render(
  <AppErrorBoundary>
    <StrictMode>
      <App />
    </StrictMode>
  </AppErrorBoundary>,
);

window.addEventListener(
  "load",
  () => {
    window.setTimeout(() => {
      void initializeMonitoring();
    }, 5000);
  },
  { once: true },
);
