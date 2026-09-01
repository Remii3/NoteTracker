import type { Module } from "../data/modules-repository";

export const MODULE_NAME_MAX_LENGTH = 120;

export function normalizeModuleName(name: string) {
  return name.trim().replace(/\s+/g, " ");
}

export function validateModuleName(
  name: string,
  modules: Pick<Module, "id" | "name">[],
  ignoredId?: string,
) {
  const normalized = normalizeModuleName(name);
  if (!normalized) return "Podaj nazwę modułu.";
  if (normalized.length > MODULE_NAME_MAX_LENGTH)
    return `Nazwa może mieć maksymalnie ${MODULE_NAME_MAX_LENGTH} znaków.`;
  if (
    modules.some(
      (module) =>
        module.id !== ignoredId &&
        normalizeModuleName(module.name).toLocaleLowerCase("pl") ===
          normalized.toLocaleLowerCase("pl"),
    )
  )
    return "Moduł o tej nazwie już istnieje.";
  return null;
}

export function moveModule(modules: Module[], id: string, direction: -1 | 1) {
  const index = modules.findIndex((module) => module.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= modules.length) return modules;
  const reordered = [...modules];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return reordered.map((module, position) => ({
    ...module,
    position: (position + 1) * 1000,
  }));
}
