import { useEffect, useState } from "react";

import { Turnstile } from "@marsidev/react-turnstile";

const turnstileSiteKey = (
  import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
)?.trim();
type Props = {
  action: string;
  onTokenChange: (token: string | null) => void;
  resetKey: number;
};

export function TurnstileWidget({ action, onTokenChange, resetKey }: Props) {
  const [failedResetKey, setFailedResetKey] = useState<number | null>(null);

  useEffect(() => {
    onTokenChange(null);
  }, [action, onTokenChange, resetKey]);

  if (!turnstileSiteKey) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Ochrona antybotowa nie jest skonfigurowana.
      </p>
    );
  }

  const handleFailure = () => {
    onTokenChange(null);
    setFailedResetKey(resetKey);
  };
  return (
    <div className="space-y-2">
      <Turnstile
        key={`${action}-${resetKey}`}
        siteKey={turnstileSiteKey}
        options={{ action, theme: "auto" }}
        onSuccess={onTokenChange}
        onExpire={() => onTokenChange(null)}
        onError={handleFailure}
        onTimeout={handleFailure}
        onUnsupported={handleFailure}
      />
      {failedResetKey === resetKey && (
        <p role="alert" className="text-sm text-destructive">
          Nie udało się uruchomić ochrony antybotowej. Odśwież stronę i spróbuj
          ponownie.
        </p>
      )}
    </div>
  );
}
