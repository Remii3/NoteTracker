import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { captureException } from "@/lib/monitoring/sentry";

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureException(error, "react-error-boundary", {
      componentStack: info.componentStack,
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="grid min-h-svh place-items-center p-6">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-xl font-semibold">Coś poszło nie tak</h1>
          <p className="text-sm text-muted-foreground">
            Błąd został zapisany. Odśwież aplikację i spróbuj ponownie.
          </p>
          <Button onClick={() => window.location.reload()}>
            Odśwież aplikację
          </Button>
        </div>
      </main>
    );
  }
}
