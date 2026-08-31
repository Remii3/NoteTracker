import { useCallback, useEffect, useState } from "react";

export type RichTextModule = typeof import("../components/rich-text-editor");

let loadedModule: RichTextModule | null = null;
let modulePromise: Promise<RichTextModule> | null = null;

function loadRichTextModule() {
  if (loadedModule) return Promise.resolve(loadedModule);
  modulePromise ??= import("../components/rich-text-editor").then((module) => {
    loadedModule = module;
    return module;
  });
  return modulePromise;
}

export function useRichTextModule(enabled: boolean) {
  const [module, setModule] = useState<RichTextModule | null>(loadedModule);

  const preload = useCallback(() => {
    void loadRichTextModule().then(setModule);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadRichTextModule().then((loaded) => {
      if (active) setModule(loaded);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  return { richTextModule: module, preloadRichTextEditor: preload };
}
