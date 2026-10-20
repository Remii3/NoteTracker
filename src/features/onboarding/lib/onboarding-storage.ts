const ONBOARDING_VERSION = 1;

function storageKey(userId: string) {
  return `sylabio:onboarding:${ONBOARDING_VERSION}:${userId}`;
}

export function isOnboardingDismissed(userId: string) {
  try {
    return window.localStorage.getItem(storageKey(userId)) === "dismissed";
  } catch {
    return false;
  }
}

export function dismissOnboarding(userId: string) {
  try {
    window.localStorage.setItem(storageKey(userId), "dismissed");
  } catch {
    // Brak localStorage nie powinien blokować korzystania z aplikacji.
  }
}
