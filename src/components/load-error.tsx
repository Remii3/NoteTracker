import { Button } from "@/components/ui/button";

export function LoadError({
  message,
  onRetry,
  onBack,
}: {
  message: string;
  onRetry?: () => void;
  onBack: () => void;
}) {
  return (
    <main className="grid min-h-0 flex-1 place-items-center p-8">
      <div className="space-y-4 text-center">
        <p role="alert">{message}</p>
        <div className="flex justify-center gap-3">
          {onRetry && <Button onClick={onRetry}>Spróbuj ponownie</Button>}
          <Button variant="outline" onClick={onBack}>
            Wróć
          </Button>
        </div>
      </div>
    </main>
  );
}
