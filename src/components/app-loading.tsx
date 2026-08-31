type Props = {
  label?: string;
};

export function AppLoading({ label = "Ładowanie aplikacji…" }: Props) {
  return (
    <main
      aria-busy="true"
      aria-label={label}
      className="grid min-h-svh place-items-center bg-background"
    >
      <div className="h-16 text-center">
        <div
          aria-hidden="true"
          className="mx-auto size-8 animate-spin rounded-full border-2 border-muted border-t-primary"
        />
        <p className="mt-3 text-[14px] leading-5 text-muted-foreground [font-family:Arial,sans-serif]">
          {label}
        </p>
      </div>
    </main>
  );
}
