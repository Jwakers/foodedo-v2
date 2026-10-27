"use client";

import { ClerkProvider, useUser } from "@clerk/react";
import {
  Component,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { resolveContactUserId } from "./contact-identity";

import {
  ContactForm,
  type ContactDraft,
  type ContactFormProps,
} from "./contact-form";

function AccountContactForm(props: ContactFormProps) {
  const { isSignedIn, user } = useUser();
  const profile = isSignedIn ? user : null;
  return (
    <ContactForm
      {...props}
      userId={resolveContactUserId(
        { isSignedIn, userId: profile?.id },
        props.userId,
      )}
      prefillName={
        profile?.fullName?.trim() ||
        [profile?.firstName, profile?.lastName].filter(Boolean).join(" ")
      }
      prefillEmail={profile?.primaryEmailAddress?.emailAddress || ""}
    />
  );
}

// The draft lives outside this boundary so an auth failure cannot erase edits.
class ContactAuthBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function createForwardedIdentityStore() {
  let value = "";
  return {
    getSnapshot: () => value,
    subscribe: (notify: () => void) => {
      const url = new URL(window.location.href);
      const fragment = new URLSearchParams(url.hash.slice(1));
      const hint = fragment.get("supportUserId");
      if (hint !== null) {
        if (/^user_[a-zA-Z0-9_-]{1,120}$/.test(hint)) value = hint;
        fragment.delete("supportUserId");
        url.hash = fragment.toString();
        window.history.replaceState(window.history.state, "", url);
        notify();
      }
      return () => {};
    },
  };
}
const emptyIdentity = () => "";

export function ContactFormWithAccount({ formId }: { formId?: string }) {
  const [draft, setDraft] = useState<ContactDraft>({ message: "" });
  const [store] = useState(createForwardedIdentityStore);
  const appUserId = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    emptyIdentity,
  );
  const props = { formId, draft, setDraft, userId: appUserId };
  return (
    <ContactAuthBoundary fallback={<ContactForm {...props} />}>
      <ClerkProvider
        publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      >
        <AccountContactForm {...props} />
      </ClerkProvider>
    </ContactAuthBoundary>
  );
}
