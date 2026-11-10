"use client";

import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

export function ImportedRecipeActions({ recipeId }: { recipeId: string }) {
  const router = useRouter();
  const remove = useMutation(api.recipes.removeMineFromLibrary);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const pending = useRef(false);

  async function deleteRecipe() {
    if (pending.current) return;
    pending.current = true;
    setDeleting(true);
    try {
      await remove({ recipeId: recipeId as Id<"recipes"> });
      setOpen(false);
      toast.success("Recipe deleted from your recipes.");
      router.replace("/recipes");
    } catch {
      toast.error("Foodedo couldn’t delete this recipe. Please try again.");
    } finally {
      pending.current = false;
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => router.push(`/recipes/edit?recipeId=${recipeId}`)}
      >
        Edit recipe
      </Button>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Delete recipe
      </Button>
      <Drawer
        open={open}
        onOpenChange={(value) => {
          if (!pending.current) setOpen(value);
        }}
        dismissible={!deleting}
      >
        <DrawerContent>
          <DrawerHeader>
            <div>
              <DrawerTitle>Delete this recipe?</DrawerTitle>
              <DrawerDescription className="mt-1.5 text-15">
                This removes it from your recipes so you can import another.
                Saved weeks and shopping lists keep their copies. You can import
                the recipe again later using another import attempt.
              </DrawerDescription>
            </div>
          </DrawerHeader>
          <DrawerFooter>
            <Button
              className="w-full"
              disabled={deleting}
              onClick={() => void deleteRecipe()}
            >
              {deleting ? "Deleting…" : "Delete recipe"}
            </Button>
            <Button
              variant="inline"
              size="block"
              className="mt-2"
              disabled={deleting}
              onClick={() => setOpen(false)}
            >
              Keep recipe
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
