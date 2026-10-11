export const siteConfig = {
  name: "Sylabio",
  siteUrl: "https://sylabio.com",
  appUrl: "https://app.sylabio.com",
  contactEmail: "test@gmail.com",
} as const;

export const appLinks = {
  signIn: `${siteConfig.appUrl}/login`,
  signUp: `${siteConfig.appUrl}/register`,
} as const;
