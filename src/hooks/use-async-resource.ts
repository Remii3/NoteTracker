import { useCallback, useEffect, useState } from "react";

// Tag results with their loader and attempt so an old request cannot replace
// the current screen, including when navigation races with a retry.
export function useAsyncResource<T>(load: () => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    load: typeof load;
    attempt: number;
    value?: T;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (!cancelled) setResult({ load, attempt, value, failed: false });
        },
        () => {
          if (!cancelled) setResult({ load, attempt, failed: true });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [load, attempt]);
  const current =
    result?.load === load && result.attempt === attempt ? result : null;
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return {
    value: current?.value,
    failed: current?.failed ?? false,
    loading: !current,
    retry,
  };
}
