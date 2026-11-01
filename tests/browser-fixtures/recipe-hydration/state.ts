import { useSyncExternalStore } from "react";
import type { CatalogueMeal } from "../../../src/lib/domain/recipes";

export const meal: CatalogueMeal = {
  id: "gnocchi",
  version: 1,
  slug: "sausage-tomato-and-spinach-gnocchi-bake",
  position: 0,
  title: "Sausage, Tomato and Spinach Gnocchi Bake",
  description: "A tomato gnocchi bake.",
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 30,
  proteinCategory: "pork",
  imageSrc: "/images/recipes/fish-tacos.webp",
  ingredients: [
    {
      id: "tomato",
      name: "tomatoes",
      quantity: "400",
      unit: "g",
      shoppingCategory: "fruit_and_veg",
    },
  ],
  steps: [{ id: "cook", text: "Bake until cooked through." }],
  notes: [{ id: "rest", text: "Let the bake stand before serving." }],
};
const listeners = new Set<() => void>();
let state = {
  isLoaded: false,
  isSignedIn: false,
  userId: null as string | null,
  isAuthenticated: false,
  isLoading: true,
  account: undefined as undefined | null | { authSubject: string },
  household: undefined as undefined | null | { _id: string },
  publicReady: false,
  personalReady: false,
  savedReady: true,
  saved: [] as string[],
  modalOpen: false,
  recovery: "fail" as "fail" | "succeed" | "pending" | "deleted",
};
export const counts = {
  personalQueries: [] as string[],
  mutations: [] as string[],
  signIns: 0,
  signOuts: 0,
};
export function getState() {
  return state;
}
export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function update(next: Partial<typeof state>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}
export function useFixture() {
  return useSyncExternalStore(subscribe, getState);
}
