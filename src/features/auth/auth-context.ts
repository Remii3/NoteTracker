import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type SignUpResult = { confirmationRequired: boolean };

export type AuthContextValue = {
  isLoading: boolean;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context)
    throw new Error("useAuth musi być użyty wewnątrz AuthProvider.");
  return context;
}
