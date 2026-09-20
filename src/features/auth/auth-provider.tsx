import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

const passwordRecoveryPath = "/update-password";
const passwordRecoveryStorageKey = "notetracker-password-recovery";

function hasPendingPasswordRecovery() {
  if (window.location.pathname !== passwordRecoveryPath) return false;

  const hashParameters = new URLSearchParams(window.location.hash.slice(1));
  const queryParameters = new URLSearchParams(window.location.search);

  return (
    window.sessionStorage.getItem(passwordRecoveryStorageKey) === "true" ||
    hashParameters.get("type") === "recovery" ||
    queryParameters.get("type") === "recovery"
  );
}

function setPendingPasswordRecovery(isPending: boolean) {
  if (isPending) {
    window.sessionStorage.setItem(passwordRecoveryStorageKey, "true");
  } else {
    window.sessionStorage.removeItem(passwordRecoveryStorageKey);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(
    hasPendingPasswordRecovery,
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);

      if (event === "PASSWORD_RECOVERY") {
        setPendingPasswordRecovery(true);
        setIsPasswordRecovery(true);
      } else if (
        event === "SIGNED_IN" &&
        window.location.pathname !== passwordRecoveryPath
      ) {
        setPendingPasswordRecovery(false);
        setIsPasswordRecovery(false);
      } else if (event === "SIGNED_OUT" || !session) {
        setPendingPasswordRecovery(false);
        setIsPasswordRecovery(false);
      }

      setIsLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, captchaToken: string) => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: { captchaToken },
      });
      if (error) throw error;
      setPendingPasswordRecovery(false);
      setIsPasswordRecovery(false);
    },
    [],
  );

  const signUp = useCallback(
    async (
      name: string,
      email: string,
      password: string,
      captchaToken: string,
    ) => {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: window.location.origin,
          captchaToken,
        },
      });
      if (error) throw error;
      return { confirmationRequired: !data.session };
    },
    [],
  );

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(
    async (email: string, captchaToken: string) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: new URL(passwordRecoveryPath, window.location.origin).href,
        captchaToken,
      });
      if (error) throw error;
    },
    [],
  );

  const updateName = useCallback(async (name: string) => {
    const { error } = await supabase.auth.updateUser({
      data: { full_name: name.trim() },
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const { error } = await supabase.auth.updateUser({
        current_password: currentPassword,
        password: newPassword,
      });

      if (error) throw error;
    },
    [],
  );

  const deleteAccount = useCallback(
    async (currentPassword: string, captchaToken: string) => {
      const imagesApiUrl = import.meta.env.VITE_R2_IMAGES_API_URL as
        string | undefined;
      if (!imagesApiUrl) {
        throw new Error("Usuwanie konta nie jest skonfigurowane.");
      }

      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session) {
        throw new Error("Sesja wygasła. Zaloguj się ponownie.", {
          cause: sessionError,
        });
      }

      const response = await fetch(
        `${imagesApiUrl.replace(/\/$/, "")}/account`,
        {
          method: "DELETE",
          body: JSON.stringify({ currentPassword, captchaToken }),
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
        },
      );
      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Sesja wygasła. Zaloguj się ponownie."
            : response.status === 403
              ? "Obecne hasło lub weryfikacja antybotowa są nieprawidłowe."
              : "Nie udało się usunąć konta. Spróbuj ponownie.",
        );
      }
    },
    [],
  );

  const completePasswordRecovery = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;

    setPendingPasswordRecovery(false);
    window.history.replaceState(null, "", "/");
    setIsPasswordRecovery(false);
  }, []);

  const cancelPasswordRecovery = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
    } finally {
      setPendingPasswordRecovery(false);
      window.history.replaceState(null, "", "/");
      setIsPasswordRecovery(false);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      cancelPasswordRecovery,
      completePasswordRecovery,
      deleteAccount,
      isLoading,
      isPasswordRecovery,
      requestPasswordReset,
      signIn,
      signOut,
      signUp,
      updateName,
      updatePassword,
      user,
    }),
    [
      cancelPasswordRecovery,
      completePasswordRecovery,
      deleteAccount,
      isLoading,
      isPasswordRecovery,
      requestPasswordReset,
      signIn,
      signOut,
      signUp,
      updateName,
      updatePassword,
      user,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
