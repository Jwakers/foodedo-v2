"use client";

import { useRef, useState } from "react";
import { useClerk } from "@clerk/react";
import {
  ArrowLeft,
  Check,
  Plus,
  Search,
  ShieldAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
} from "@/components/ui/drawer";
import {
  ALLERGIES,
  ALLERGY_DISCLAIMER,
  ALLERGY_REMINDER,
  allergyNames,
  searchAllergies,
} from "@/lib/domain/allergies";
import { useAllergies } from "./allergy-context";

const pendingEdits = new Map<
  string,
  { ids: string[]; share: boolean; revision: number | string }
>();

export function AllergyEntry({
  onManage,
  savedLabel = false,
}: {
  onManage?: () => void;
  savedLabel?: boolean;
}) {
  const allergies = useAllergies();
  const [open, setOpen] = useState(false);
  const ids = allergies.effectiveIds;
  return (
    <>
      <div className="mt-3 flex items-center gap-3 rounded-surface bg-mist px-3.5 py-3">
        <ShieldAlert aria-hidden="true" className="size-5 shrink-0 text-leaf" />
        <div className="min-w-0 flex-1">
          <p className="text-15 font-semibold text-ink">
            {savedLabel
              ? "Saved allergies"
              : ids.length
                ? "Allergies saved"
                : "Allergies"}
          </p>
          <p className="text-14 text-graphite">
            {!allergies.ready
              ? "Loading allergies…"
              : ids.length
                ? allergyNames(ids).join(", ")
                : "Tell us what you’re allergic to"}
          </p>
        </div>
        <Button
          variant="inline"
          className="min-h-11 shrink-0 text-leaf"
          disabled={!allergies.ready}
          onClick={() => (onManage ? onManage() : setOpen(true))}
        >
          {ids.length ? "Manage" : "Add"}
        </Button>
      </div>
      {ids.length > 0 ? (
        <p className="mt-2 text-12 leading-4.5 text-graphite">
          {ALLERGY_REMINDER}
        </p>
      ) : null}
      {!onManage ? (
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            {open ? (
              <AllergyManagement
                key={`${allergies.profileKey}:${allergies.ready}`}
                onBack={() => setOpen(false)}
                onClose={() => setOpen(false)}
              />
            ) : null}
          </DrawerContent>
        </Drawer>
      ) : null}
    </>
  );
}

/** Same contextual panel in setup and the adjustment drawer. Never applies weekly scope. */
export function AllergyManagement({
  onBack,
  onClose,
}: {
  onBack: () => void;
  onClose: () => void;
}) {
  const profile = useAllergies();
  const { openSignIn } = useClerk();
  const importGuest =
    profile.signedIn &&
    profile.ownIds.length === 0 &&
    profile.guestIds.length > 0;
  const pending = pendingEdits.get(profile.profileKey);
  const [ids, setIds] = useState<string[]>(() =>
    pending?.revision === profile.revision
      ? pending.ids
      : [...(importGuest ? profile.guestIds : profile.ownIds)],
  );
  const [share, setShare] = useState(() =>
    pending?.revision === profile.revision
      ? pending.share
      : profile.shareWithHousehold,
  );
  const [revision] = useState(profile.revision);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const guard = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const results = searchAllergies(query);
  const dirty =
    JSON.stringify([...ids].sort()) !==
      JSON.stringify([...profile.ownIds].sort()) ||
    share !== profile.shareWithHousehold;
  async function save() {
    if (guard.current || !dirty) return;
    guard.current = true;
    setBusy(true);
    setError(null);
    try {
      await profile.save(ids, share, revision);
      pendingEdits.delete(profile.profileKey);
      onBack();
    } catch {
      setError(
        "Your allergies couldn’t be saved. Your changes are still here. Try again. If your saved allergies changed elsewhere, close and reopen Allergies first.",
      );
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function toggle(id: string) {
    const next = ids.includes(id)
      ? ids.filter((value) => value !== id)
      : [...ids, id];
    setIds(next);
    pendingEdits.set(profile.profileKey, { ids: next, share, revision });
    setError(null);
  }
  function changeShare(value: boolean) {
    setShare(value);
    pendingEdits.set(profile.profileKey, { ids, share: value, revision });
  }
  const choices = query.trim()
    ? results
    : ALLERGIES.filter((item) => ["milk", "eggs", "peanuts"].includes(item.id));
  return (
    <>
      <DrawerHeader className="items-center">
        <Button
          variant="quiet"
          size="headerIcon"
          aria-label="Back to plan settings"
          onClick={onBack}
          disabled={busy}
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <DrawerTitle>Allergies</DrawerTitle>
          <DrawerDescription>
            Add the ingredients you’re allergic to.
          </DrawerDescription>
        </div>
        <Button
          variant="quiet"
          size="headerIcon"
          aria-label="Close allergies"
          onClick={onClose}
          disabled={busy}
        >
          <X aria-hidden="true" className="size-5" />
        </Button>
      </DrawerHeader>
      <DrawerBody className="flex flex-col gap-4">
        <p className="text-15 leading-5.5 text-graphite">
          We’ll use these when suggesting meals. Existing meals stay in your
          plan.
        </p>
        {importGuest ? (
          <p className="rounded-surface bg-mist p-3 text-14 text-graphite">
            These are from your guest plan. Save them to remember them on your
            account.
          </p>
        ) : null}
        <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
          <div>
            <label
              htmlFor="allergy-search"
              className="mb-2 block text-14 font-semibold text-ink"
            >
              Search for an allergy
            </label>
            <div className="flex min-h-12 items-center rounded-surface border border-border bg-paper pl-3 focus-within:border-leaf">
              <Search
                aria-hidden="true"
                className="mr-2 size-5 shrink-0 text-graphite"
              />
              <input
                id="allergy-search"
                ref={input}
                value={query}
                maxLength={80}
                autoComplete="off"
                enterKeyHint="search"
                placeholder="e.g. dairy, peanuts or garlic"
                className="min-w-0 flex-1 bg-transparent py-3 text-16 text-ink outline-none"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <Button
                  variant="quiet"
                  size="headerIcon"
                  aria-label="Clear allergy search"
                  onClick={() => {
                    setQuery("");
                    input.current?.focus();
                  }}
                >
                  <X aria-hidden="true" className="size-4" />
                </Button>
              ) : (
                <span className="w-3" />
              )}
            </div>
          </div>
          {ids.length ? (
            <div>
              <p className="mb-2 text-14 font-semibold">Your allergies</p>
              <div className="flex flex-wrap gap-2">
                {ALLERGIES.filter((item) => ids.includes(item.id)).map(
                  (item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-label={`Remove ${item.name}`}
                      onClick={() => toggle(item.id)}
                      className="flex min-h-11 items-center gap-2 rounded-full bg-leaf-soft px-3 text-14 font-semibold text-leaf"
                    >
                      {item.name}
                      <X aria-hidden="true" className="size-4" />
                    </button>
                  ),
                )}
              </div>
            </div>
          ) : null}
          {!query.trim() ? (
            <p className="text-14 font-semibold text-ink">Common allergies</p>
          ) : query.trim().toLowerCase() === "nuts" ? (
            <p className="text-14 leading-5 text-graphite">
              Peanuts and tree nuts are different allergies. You can add either
              or both.
            </p>
          ) : null}
          {choices.length ? (
            <ul className="divide-y divide-border">
              {choices.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggle(item.id)}
                    aria-pressed={ids.includes(item.id)}
                    className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left"
                  >
                    <span>
                      <span className="block text-15 font-semibold text-ink">
                        {item.name}
                      </span>
                      {item.id === "milk" ? (
                        <span className="text-13 text-graphite">
                          Includes butter, cheese, cream and whey
                        </span>
                      ) : null}
                    </span>
                    {ids.includes(item.id) ? (
                      <Check aria-hidden="true" className="size-5 text-leaf" />
                    ) : (
                      <Plus aria-hidden="true" className="size-5 text-leaf" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-surface bg-mist p-4">
              <p className="text-15 font-semibold">No match found</p>
              <p className="mt-1 text-14 text-graphite">
                Try another ingredient name or spelling. Search for an
                ingredient, rather than a product or dish.
              </p>
              <p className="mt-3 text-14 text-graphite">
                <strong className="text-ink">Not added.</strong> We couldn’t
                recognise this allergy, so it won’t be used to check recipes.
              </p>
              <Button
                variant="inline"
                className="mt-2 min-h-11 text-leaf"
                onClick={() => {
                  input.current?.focus();
                  input.current?.select();
                }}
              >
                Edit search
              </Button>
            </div>
          )}
          {profile.signedIn &&
          !importGuest &&
          profile.guestIds.some((id) => !ids.includes(id)) ? (
            <div className="rounded-surface bg-mist p-3.5">
              <p className="text-14 text-graphite">
                From this device:{" "}
                {allergyNames(
                  profile.guestIds.filter((id) => !ids.includes(id)),
                ).join(", ")}
                .
              </p>
              <Button
                variant="inline"
                className="min-h-11 text-leaf"
                onClick={() => {
                  const next = [...new Set([...ids, ...profile.guestIds])];
                  setIds(next);
                  pendingEdits.set(profile.profileKey, {
                    ids: next,
                    share,
                    revision,
                  });
                }}
              >
                Add to my saved allergies
              </Button>
            </div>
          ) : null}
          {profile.signedIn && profile.hasHousehold ? (
            <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-surface bg-mist p-3.5">
              <span>
                <span className="block text-15 font-semibold">
                  Share with household
                </span>
                <span className="text-13 text-graphite">
                  Use these allergies for household plans too.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                className="size-6 shrink-0 accent-leaf"
                checked={share}
                onChange={(event) => changeShare(event.target.checked)}
              />
            </label>
          ) : null}
        </fieldset>
        <div className="flex items-start gap-2.5 rounded-surface bg-mist p-3.5 text-13 leading-5 text-graphite">
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          <p>{ALLERGY_DISCLAIMER}</p>
        </div>
        {profile.effectiveIds.some((id) => !profile.ownIds.includes(id)) ? (
          <p className="text-13 text-graphite">
            Household allergies also apply:{" "}
            {allergyNames(
              profile.effectiveIds.filter((id) => !profile.ownIds.includes(id)),
            ).join(", ")}
            .
          </p>
        ) : null}
        {!profile.signedIn ? (
          <p className="text-13 leading-5 text-graphite">
            Kept on this device.{" "}
            <button
              type="button"
              className="min-h-11 font-semibold text-leaf underline"
              disabled={busy || dirty}
              onClick={() => openSignIn({})}
            >
              Sign in to remember them
            </button>
            {dirty
              ? " — use your allergies for this plan first."
              : " — then save them to your account."}
          </p>
        ) : null}
      </DrawerBody>
      <DrawerFooter>
        {error ? (
          <p role="alert" className="mb-3 text-14 text-cadmium">
            {error}
          </p>
        ) : null}
        <Button
          className="w-full"
          disabled={busy || !dirty || !profile.ready}
          onClick={() => void save()}
        >
          {busy
            ? "Saving…"
            : profile.signedIn
              ? "Save allergies"
              : "Use allergies for this plan"}
        </Button>
        <p className="mt-2 text-center text-12 text-graphite">
          {ALLERGY_REMINDER}
        </p>
      </DrawerFooter>
    </>
  );
}
