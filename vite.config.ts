import { defineConfig } from "vite";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const uploadSentrySourceMaps = Boolean(
    env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG && env.SENTRY_PROJECT,
  );

  return {
    server: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "prompt",
        injectRegister: false,
        manifest: {
          name: "NoteTracker",
          short_name: "NoteTracker",
          description: "Notatki, powtórki i plany nauki w jednym miejscu.",
          lang: "pl",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "any",
          background_color: "#ffffff",
          theme_color: "#7e14ff",
          categories: ["education", "productivity"],
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/pwa-maskable-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          navigateFallback: "/index.html",
          globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,wasm}"],
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        },
      }),
      ...(uploadSentrySourceMaps
        ? [
            sentryVitePlugin({
              authToken: env.SENTRY_AUTH_TOKEN,
              org: env.SENTRY_ORG,
              project: env.SENTRY_PROJECT,
              sourcemaps: { filesToDeleteAfterUpload: "./dist/**/*.map" },
            }),
          ]
        : []),
    ],
    build: {
      sourcemap: uploadSentrySourceMaps ? "hidden" : false,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: "supabase",
                test: /node_modules[\\/]@supabase[\\/]/,
                priority: 20,
              },
              {
                name: "react-router",
                test: /node_modules[\\/]react-router[\\/]/,
                priority: 20,
              },
              {
                name: "forms",
                test: /node_modules[\\/](?:react-hook-form|zod|@hookform[\\/]resolvers)[\\/]/,
                priority: 20,
              },
            ],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
});
