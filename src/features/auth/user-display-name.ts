import type { User } from "@supabase/supabase-js";

export function getUserDisplayName(user: User) {
  const fullName = user.user_metadata.full_name;
  if (typeof fullName === "string" && fullName.trim()) return fullName.trim();

  const emailName = user.email?.split("@")[0].trim();
  if (!emailName) return "Użytkownik";
  return emailName.charAt(0).toLocaleUpperCase("pl") + emailName.slice(1);
}
