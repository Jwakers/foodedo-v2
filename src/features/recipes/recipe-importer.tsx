"use client";

import { useClerk } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowLeft, ArrowRight, Check, CircleAlert, X } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button, ButtonLink } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useFoodedoAuth } from "@/features/auth/use-foodedo-auth";
import {
  buildRecipeRepairPatch,
  RecipeReviewDrawer,
  recipeReviewIssueLabel,
} from "@/features/recipes/recipe-review-drawer";
import {
  createRecipeImportIntent,
  type RecipeImportIntentV1,
} from "@/lib/domain/auth-intents";
import { formatMealDurationLabel } from "@/lib/domain/plan-display";
import { createRecipeImportIntentStore } from "@/lib/platform/auth-intent-store";
import { personalRecipeDetailPath } from "@/lib/routing/recipes";
import { cn } from "@/lib/utils/cn";
import { importJobAccess, importJobResumePath } from "./recipe-import-state";
import type { ImportFailureCode } from "../../../convex/lib/recipeImport/contracts";

type ImportMode = "url" | "text";

export function RecipeImporter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openSignIn } = useClerk();
  const { status, isClerkLoaded, isSignedIn, isAuthenticated } =
    useFoodedoAuth();
  const beginImport = useMutation(api.recipeImports.beginImport);
  const retryImport = useMutation(api.recipeImports.retryImport);
  const repairImport = useMutation(api.recipes.repairImport);
  const importId = searchParams.get("job") as Id<"recipeImports"> | null;
  const job = useQuery(
    api.recipeImports.getImport,
    isAuthenticated && importId ? { importId } : "skip",
  );
  const recipe = useQuery(
    api.recipes.getMine,
    isAuthenticated && job?.resultRecipeId
      ? { recipeId: job.resultRecipeId }
      : "skip",
  );
  const [mode, setMode] = useState<ImportMode>("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryPending = useRef(false);
  const [authDrawerOpen, setAuthDrawerOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [repairValues, setRepairValues] = useState<Record<string, string>>({});

  const activeSource: RecipeImportIntentV1["source"] =
    mode === "url" ? { type: "url", url } : { type: "text", text };

  async function submitImport() {
    if (submitting) return;
    const preparedSource = prepareClientSource(activeSource);
    if (preparedSource === null) {
      toast.error(
        mode === "url"
          ? "Paste a valid recipe link."
          : "Paste the ingredients and method.",
      );
      return;
    }
    const clientRequestId = crypto.randomUUID();
    const intent = createRecipeImportIntent({
      clientRequestId,
      source: preparedSource,
      now: Date.now(),
    });

    if (!isClerkLoaded) {
      try {
        await createRecipeImportIntentStore().write(intent);
        setAuthDrawerOpen(true);
      } catch (error) {
        console.error("Failed to store recipe import intent.", error);
        toast.error("Foodedo couldn’t hold onto that recipe.");
      }
      return;
    }
    if (!isSignedIn) {
      try {
        await createRecipeImportIntentStore().write(intent);
        setAuthDrawerOpen(true);
      } catch (error) {
        console.error("Failed to store recipe import intent.", error);
        toast.error("Foodedo couldn’t save your recipe before sign-in.");
      }
      return;
    }
    if (status !== "authenticated") {
      toast.error("Foodedo couldn’t connect your account yet.");
      return;
    }

    setSubmitting(true);
    try {
      const nextImportId = await beginImport({
        clientRequestId,
        source: preparedSource,
      });
      router.replace(`/recipes/import?job=${nextImportId}`);
    } catch (error) {
      console.error("Failed to begin recipe import.", error);
      toast.error("Foodedo couldn’t start that import. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function retry() {
    if (!importId || retryPending.current) return;
    retryPending.current = true;
    setRetrying(true);
    try {
      await retryImport({ importId });
    } catch (error) {
      console.error("Failed to retry recipe import.", error);
      toast.error("Foodedo couldn’t retry that import.");
    } finally {
      retryPending.current = false;
      setRetrying(false);
    }
  }

  async function saveRepair() {
    if (!recipe) return;
    const patch = buildRecipeRepairPatch(recipe.reviewIssues, repairValues);
    if (patch === null) {
      toast.error(
        "Add servings and at least one known time using whole numbers.",
      );
      return;
    }
    try {
      await repairImport({ recipeId: recipe._id, ...patch });
      setRepairOpen(false);
    } catch (error) {
      console.error("Failed to repair imported recipe.", error);
      toast.error("Foodedo couldn’t save those details.");
    }
  }

  if (importId && importJobAccess(status) !== "ready") {
    if (status === "loading") return <ImportProgress accountLoading />;
    const needsSignIn = importJobAccess(status) === "sign_in";
    return (
      <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center">
        <h1 className="font-display text-28 font-semibold text-ink">
          {needsSignIn
            ? "Sign in to resume your import"
            : "Reconnect to resume your import"}
        </h1>
        <p className="mt-2 text-15 leading-5.5 text-graphite">
          Your import link is preserved. Resume to check its progress or open
          the saved recipe.
        </p>
        <Button
          className="mt-6 w-full"
          onClick={() => {
            if (needsSignIn)
              openSignIn({ forceRedirectUrl: importJobResumePath(importId) });
            else window.location.reload();
          }}
        >
          {needsSignIn ? "Sign in to resume" : "Reconnect"}
        </Button>
      </main>
    );
  }
  if (
    importId &&
    (job === undefined || (recipe === undefined && job?.resultRecipeId))
  ) {
    return <ImportProgress />;
  }
  if (importId && job === null) {
    return (
      <ImportUnavailable
        onStartAgain={() => router.replace("/recipes/import")}
      />
    );
  }
  if (job?.status === "failed") {
    return (
      <ImportFailure
        sourceUrl={job.sourceUrl}
        failureCode={job.failureCode}
        failureDetails={job.failureDetails}
        retrying={retrying}
        onRetry={() => void retry()}
        onPasteText={() => {
          setMode("text");
          router.replace("/recipes/import");
        }}
      />
    );
  }
  if (
    recipe &&
    (job?.status === "succeeded" || job?.status === "needs_review")
  ) {
    const needsReview = recipe.reviewIssues.length > 0;
    return (
      <>
        <ImportSuccess
          recipe={recipe}
          needsReview={needsReview}
          onReview={() => setRepairOpen(true)}
          onImportAnother={() => router.replace("/recipes/import")}
        />
        <RecipeReviewDrawer
          open={repairOpen}
          issues={recipe.reviewIssues}
          values={repairValues}
          onValuesChange={setRepairValues}
          onOpenChange={setRepairOpen}
          onSave={() => void saveRepair()}
        />
      </>
    );
  }
  if (importId) return <ImportProgress />;

  return (
    <>
      <main className="mx-auto w-full max-w-175 px-page-inline pt-4 pb-10">
        <h1 className="font-display text-34 font-semibold tracking-heading text-ink">
          {mode === "url" ? "Import a recipe" : "Paste recipe text"}
        </h1>
        <p className="mt-1.5 text-15 leading-6 text-graphite">
          {mode === "url"
            ? "Paste a recipe link and we’ll organise the rest."
            : "Paste the ingredients and method. Foodedo will suggest a title and description, and work out the details it can. You can edit them afterwards."}
        </p>

        {mode === "url" ? (
          <div className="mt-7">
            <div className="flex items-center justify-between rounded-surface bg-mist px-4 py-3.5">
              <div>
                <p className="text-10 font-bold tracking-overline text-graphite uppercase">
                  From the web
                </p>
                <p className="mt-0.5 text-14 text-ink">Recipe link</p>
              </div>
              <ArrowRight aria-hidden="true" className="size-5 text-cadmium" />
              <div>
                <p className="text-10 font-bold tracking-overline text-leaf uppercase">
                  In Foodedo
                </p>
                <p className="mt-0.5 text-14 text-ink">In your recipes</p>
              </div>
            </div>
            <label
              className="mt-7 block text-13 font-semibold text-ink"
              htmlFor="recipe-url"
            >
              Paste recipe link
            </label>
            <textarea
              id="recipe-url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              rows={2}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.example.com/recipe"
              className="mt-2 min-h-20 w-full resize-none rounded-surface border border-transparent bg-mist px-4 py-4 text-16 leading-5.5 text-ink outline-none placeholder:text-graphite focus:border-ink"
            />
          </div>
        ) : (
          <textarea
            aria-label="Recipe text"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              "Lemon herb chicken\nServes 4\n\nIngredients\n4 chicken thighs\n1 lemon\n\nMethod\n1. Season the chicken…"
            }
            className="mt-5 min-h-80 w-full resize-y rounded-surface border border-border bg-mist px-4 py-4 text-16 leading-6 text-ink outline-none placeholder:text-graphite focus:border-ink"
          />
        )}

        <Button
          className="mt-4 h-13 w-full"
          disabled={submitting}
          onClick={() => void submitImport()}
        >
          {submitting
            ? "Starting import…"
            : mode === "url"
              ? "Import recipe"
              : "Import this recipe"}
          <ArrowRight aria-hidden="true" className="size-4.5" />
        </Button>
        <Button
          variant="inline"
          size="block"
          className="mt-4"
          onClick={() =>
            setMode((current) => (current === "url" ? "text" : "url"))
          }
        >
          {mode === "url" ? "Paste recipe text instead" : "Back to link import"}
          {mode === "url" ? (
            <ArrowRight aria-hidden="true" className="size-4" />
          ) : (
            <ArrowLeft aria-hidden="true" className="size-4" />
          )}
        </Button>
        {mode === "url" ? (
          <p className="mt-7 text-13 leading-5 text-graphite">
            Once it’s in Foodedo, you can keep it, plan it and cook it. Shopping
            follows your plan.
          </p>
        ) : null}
      </main>

      <Drawer open={authDrawerOpen} onOpenChange={setAuthDrawerOpen}>
        <DrawerContent>
          <DrawerHeader>
            <div>
              <DrawerTitle>Keep recipes you find</DrawerTitle>
              <DrawerDescription className="mt-1.5 max-w-75 text-15 leading-5.5">
                Sign in to import recipes into your Foodedo collection. Your
                link or text will be waiting when you return.
              </DrawerDescription>
            </div>
            <Button
              variant="ghost"
              size="headerIcon"
              aria-label="Close sign-in prompt"
              onClick={() => setAuthDrawerOpen(false)}
            >
              <X aria-hidden="true" className="size-5" />
            </Button>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-3 pt-2">
            <Benefit>Save imported recipes permanently</Benefit>
            <Benefit>Plan and cook them later</Benefit>
          </DrawerBody>
          <DrawerFooter>
            <Button
              className="w-full"
              onClick={() => {
                setAuthDrawerOpen(false);
                openSignIn({});
              }}
            >
              Sign in to import
            </Button>
            <Button
              variant="inline"
              size="block"
              className="mt-2"
              onClick={() => setAuthDrawerOpen(false)}
            >
              Not now
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function ImportProgress({
  accountLoading = false,
}: {
  accountLoading?: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-175 flex-col items-center px-page-inline pt-16 text-center">
      <h1 className="max-w-85 font-display text-28 font-semibold tracking-title text-ink">
        {accountLoading
          ? "Connecting your account"
          : "Bringing your recipe into Foodedo"}
      </h1>
      <p className="mt-3 max-w-85 text-15 leading-5.5 text-graphite">
        {accountLoading
          ? "Checking your sign-in so we can resume your import."
          : "We’re reading and checking the ingredients and method. This can take up to two minutes. You can leave this page and return to this import link."}
      </p>
      <div className="mt-7 w-full animate-pulse rounded-surface bg-mist p-4 motion-reduce:animate-none">
        <div className="h-40 rounded-surface bg-border" />
        <div className="mt-3 h-5 w-3/5 rounded-sm bg-border" />
        <div className="mt-3 h-3.5 w-2/5 rounded-sm bg-border" />
        <div className="mt-3 h-3.5 w-4/5 rounded-sm bg-border" />
      </div>
    </main>
  );
}

function ImportFailure({
  sourceUrl,
  failureCode,
  failureDetails,
  onRetry,
  onPasteText,
  retrying,
}: {
  sourceUrl?: string;
  failureCode?: ImportFailureCode;
  failureDetails?: string[];
  retrying: boolean;
  onRetry: () => void;
  onPasteText: () => void;
}) {
  const message = importFailureMessage(failureCode, failureDetails);
  return (
    <main className="mx-auto w-full max-w-175 px-page-inline pt-4">
      <h1 className="font-display text-32 font-semibold tracking-heading text-ink">
        {message.title}
      </h1>
      <p className="mt-2 text-15 leading-5.5 text-graphite">
        {message.description}
      </p>
      {sourceUrl ? (
        <div className="mt-6 rounded-surface border border-ink bg-mist px-3.5 py-4 text-14 leading-5 text-ink break-words">
          {sourceUrl}
        </div>
      ) : null}
      <Button className="mt-6 w-full" onClick={onRetry} disabled={retrying}>
        {retrying ? "Retrying…" : "Try again"}
      </Button>
      <Button variant="secondary" className="mt-3 w-full" onClick={onPasteText}>
        Paste recipe text
      </Button>
    </main>
  );
}

function ImportUnavailable({ onStartAgain }: { onStartAgain: () => void }) {
  return (
    <main className="mx-auto w-full max-w-175 px-page-inline py-16 text-center">
      <h1 className="font-display text-28 font-semibold text-ink">
        Import unavailable
      </h1>
      <p className="mt-2 text-14 text-graphite">
        This import has expired or could not be found.
      </p>
      <Button className="mt-5" onClick={onStartAgain}>
        Import another recipe
      </Button>
    </main>
  );
}

function ImportSuccess({
  recipe,
  needsReview,
  onReview,
  onImportAnother,
}: {
  recipe: NonNullable<FunctionReturnType<typeof api.recipes.getMine>>;
  needsReview: boolean;
  onReview: () => void;
  onImportAnother: () => void;
}) {
  const duration =
    formatMealDurationLabel(recipe.prepMinutes, recipe.cookMinutes) ??
    "Time unknown";
  return (
    <main className="mx-auto w-full max-w-175 px-page-inline pt-4 pb-10">
      {needsReview ? (
        <p className="flex items-center gap-2 text-12 font-bold tracking-label text-cadmium uppercase">
          <CircleAlert aria-hidden="true" className="size-4" />
          Needs a quick check
        </p>
      ) : null}
      <h1 className="mt-2 font-display text-32 font-semibold tracking-heading text-ink">
        Recipe imported
      </h1>
      {recipe.source.type === "import" && recipe.source.method === "text" ? (
        <p className="mt-1.5 text-15 leading-5.5 text-graphite">
          We suggested any missing title and description. Check the details and
          amend anything below; unknown servings or times can be added later.
        </p>
      ) : null}
      {needsReview ? (
        <p className="mt-1.5 text-15 leading-5.5 text-graphite">
          We found the ingredients and method, but a few details need your help.
        </p>
      ) : null}
      <div className="mt-6 overflow-hidden rounded-surface bg-mist">
        <div className="relative h-44 bg-border">
          {recipe.imageSrc ? (
            <Image
              src={recipe.imageSrc}
              alt=""
              fill
              sizes="(max-width: 700px) 100vw, 700px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-13 text-graphite">
              No photo yet
            </div>
          )}
        </div>
        <div className="px-4 py-4">
          <p
            className={cn(
              "text-10 font-bold tracking-overline uppercase",
              needsReview ? "text-cadmium" : "text-leaf",
            )}
          >
            {needsReview ? "Imported recipe" : "Recipe imported"}
          </p>
          <h2 className="mt-2 font-display text-24 font-semibold tracking-title text-ink">
            {recipe.title}
          </h2>
          <p className="mt-2 text-14 text-graphite">
            {duration} ·{" "}
            {recipe.servings === undefined
              ? "Servings unknown"
              : `Serves ${recipe.servings}`}
          </p>
          {!needsReview ? (
            <p className="mt-2 text-14 text-graphite">
              {recipe.ingredients.length} ingredients · {recipe.steps.length}{" "}
              steps
            </p>
          ) : (
            <p className="mt-3 rounded-sm bg-paper px-3 py-2 text-13 text-ink">
              Check:{" "}
              {recipe.reviewIssues.map(recipeReviewIssueLabel).join(", ")}
            </p>
          )}
          {recipe.source.type === "import" && recipe.source.sourceName ? (
            <p className="mt-3 border-t border-border pt-3 text-13 text-graphite">
              From {recipe.source.sourceName}
            </p>
          ) : null}
        </div>
      </div>
      {needsReview ? (
        <Button className="mt-6 w-full" onClick={onReview}>
          Review recipe <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      ) : (
        <ButtonLink
          className="mt-6 w-full"
          href={personalRecipeDetailPath(recipe._id)}
        >
          View recipe <ArrowRight aria-hidden="true" className="size-4" />
        </ButtonLink>
      )}
      <ButtonLink
        variant="secondary"
        className="mt-3 w-full"
        href={`/recipes/edit?recipeId=${encodeURIComponent(recipe._id)}`}
      >
        Edit recipe details
      </ButtonLink>
      <Button
        variant="inline"
        size="block"
        className="mt-3"
        onClick={onImportAnother}
      >
        Import another
      </Button>
    </main>
  );
}

function Benefit({ children }: { children: string }) {
  return (
    <p className="flex items-center gap-3 text-14 text-ink">
      <span className="flex size-7 items-center justify-center rounded-full bg-leaf-soft text-leaf">
        <Check aria-hidden="true" className="size-4" />
      </span>
      {children}
    </p>
  );
}

function prepareClientSource(source: RecipeImportIntentV1["source"]) {
  try {
    return createRecipeImportIntent({
      clientRequestId: "validation",
      source,
      now: Date.now(),
    }).source;
  } catch {
    return null;
  }
}

export function importFailureMessage(
  failureCode: string | undefined,
  failureDetails: string[] = [],
) {
  if (failureCode === "source_blocked") {
    return {
      title: "This website blocked the import",
      description:
        "We could not read the recipe page from this website. Paste the recipe text and we’ll organise it instead.",
    };
  }
  if (failureCode === "source_unreachable") {
    return {
      title: "We couldn’t reach that recipe page",
      description:
        "The website may be temporarily unavailable. Try again, or paste the recipe text if the page opens for you.",
    };
  }
  if (failureCode === "unsupported_content") {
    return {
      title: "That link isn’t a readable recipe page",
      description:
        "We can import public web pages and pasted recipe text. Try pasting the ingredients and method instead.",
    };
  }
  if (failureCode === "no_recipe") {
    return {
      title: "We couldn’t find a complete recipe",
      description:
        "The page did not contain enough ingredients and method information to save safely. You can paste the recipe text instead.",
    };
  }
  if (failureCode === "ai_unavailable") {
    return {
      title: "We found the page, but couldn’t finish organising it",
      description:
        "The recipe service is temporarily unavailable. Try again, or paste the recipe text if you need it now.",
    };
  }
  if (failureCode === "incomplete_recipe") {
    const missing = [
      ...(failureDetails.includes("ingredients")
        ? ["ingredient information"]
        : []),
      ...(failureDetails.includes("method") ? ["cooking instructions"] : []),
    ];
    return {
      title: "This recipe is incomplete",
      description: missing.length
        ? `We couldn’t find enough ${missing.join(" and ")}. Include that part of the recipe and try again. A title, photo, servings and labelled times are not required.`
        : "We couldn’t confirm enough ingredient information or cooking instructions. Include both and try again. A title, photo, servings and labelled times are not required.",
    };
  }
  if (failureCode === "unsafe_result") {
    return {
      title: "We couldn’t preserve this recipe safely",
      description:
        "Some important quantities or instructions could not be matched back to the source. Paste the recipe text so nothing important is lost.",
    };
  }
  if (failureCode === "invalid_result") {
    return {
      title: "This recipe needs a little more help",
      description:
        "We found recipe content but couldn’t organise it confidently. Paste the recipe text so nothing important is lost.",
    };
  }
  if (failureCode === "invalid_url" || failureCode === "unsafe_url") {
    return {
      title: "We couldn’t use that link",
      description:
        "Check that it is a public recipe page, or paste the recipe text instead.",
    };
  }
  if (failureCode === "fetch_failed") {
    return {
      title: "We couldn’t open that recipe page",
      description:
        "The website may be blocking automated access or temporarily unavailable. Try again, or paste the recipe text.",
    };
  }
  if (failureCode === "timed_out") {
    return {
      title: "That import took too long",
      description:
        "Nothing was saved. Try again, or paste the recipe text for a quicker import.",
    };
  }
  return {
    title: "We couldn’t finish that import",
    description:
      "Nothing was saved. Try again, or paste the recipe text instead.",
  };
}
