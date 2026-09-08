import { useCallback, useEffect, useState } from "react";

// Tag results with their loader and attempt so an old request cannot replace
// the current screen, including when navigation races with a retry.
export function useAsyncResource<T>(
  load: () => Promise<T>,
  options: { initialValue?: T } = {},
) {
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
  const hasInitialValue = options.initialValue !== undefined;
  return {
    value: current && !current.failed ? current.value : options.initialValue,
    failed: (current?.failed ?? false) && !hasInitialValue,
    loading: !current && !hasInitialValue,
    refreshing: !current && hasInitialValue,
    retry,
  };
}
