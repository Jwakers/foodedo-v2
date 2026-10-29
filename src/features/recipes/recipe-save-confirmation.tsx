"use client";

import { useClerk } from "@clerk/react";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { createRecipeSaveConfirmation } from "@/lib/domain/recipe-save-confirmation";
import { openSavedRecipes } from "./use-web-recipe-browse";

const toastId = "recipe-save-confirmation";
const ConfirmationContext = createContext<ReturnType<
  typeof createRecipeSaveConfirmation
> | null>(null);

export function RecipeSaveConfirmationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const clerk = useClerk();
  const router = useRouter();
  const [confirmation] = useState(() =>
    createRecipeSaveConfirmation(
      () =>
        toast.success("Recipe saved", {
          id: toastId,
          description: "Find it in Recipes → ♥ Saved.",
          duration: 8_000,
          action: {
            label: "View saved",
            onClick: () => openSavedRecipes(router.push),
          },
          classNames: { actionButton: "min-h-11 min-w-11" },
        }),
      () => {
        toast.dismiss(toastId);
      },
    ),
  );

  useEffect(() => {
    confirmation.setIdentity(clerk.user?.id ?? null);
    const unsubscribe = clerk.addListener(({ user }) => {
      confirmation.setIdentity(user?.id ?? null);
    });
    return () => {
      unsubscribe();
      confirmation.setIdentity(null);
    };
  }, [clerk, confirmation]);

  return (
    <ConfirmationContext.Provider value={confirmation}>
      {children}
    </ConfirmationContext.Provider>
  );
}

export function useRecipeSaveConfirmation() {
  const confirmation = useContext(ConfirmationContext);
  if (!confirmation)
    throw new Error("RecipeSaveConfirmationProvider is required.");
  return confirmation;
}
