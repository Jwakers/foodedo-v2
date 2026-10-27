// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { ContactForm } from "@/features/contact/contact-form";
import { ContactFormWithAccount } from "@/features/contact/contact-form-with-account";

const account = vi.hoisted(() => ({
  isSignedIn: undefined as boolean | undefined,
  user: null as null | {
    id: string;
    fullName: string | null;
    firstName: string | null;
    lastName: string | null;
    primaryEmailAddress: { emailAddress: string } | null;
  },
}));
vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
  useUser: () => account,
}));

beforeEach(() => {
  account.isSignedIn = undefined;
  account.user = null;
});

function value(html: string, name: string) {
  return html.match(
    new RegExp(`<input[^>]*name="${name}"[^>]*value="([^"]*)"`),
  )?.[1];
}

function renderAccount() {
  return renderToStaticMarkup(<ContactFormWithAccount formId="contacttest" />);
}

test("signed-in account fills name, primary email and optional user ID", () => {
  account.isSignedIn = true;
  account.user = {
    id: "user_example",
    fullName: "Alex Example",
    firstName: "Alex",
    lastName: "Example",
    primaryEmailAddress: { emailAddress: "alex@example.com" },
  };
  const html = renderAccount();
  expect(value(html, "name")).toBe("Alex Example");
  expect(value(html, "email")).toBe("alex@example.com");
  expect(value(html, "userId")).toBe("user_example");
  expect(html).not.toContain("readOnly");
});

test.each([undefined, false])(
  "loading or guest account (%s) leaves fields blank",
  (isSignedIn) => {
    account.isSignedIn = isSignedIn;
    const html = renderAccount();
    for (const field of ["name", "email", "userId"])
      expect(value(html, field)).toBe("");
  },
);

test("available name parts work when full name or email is missing", () => {
  account.isSignedIn = true;
  account.user = {
    id: "user_example",
    fullName: null,
    firstName: "Alex",
    lastName: null,
    primaryEmailAddress: null,
  };
  const html = renderAccount();
  expect(value(html, "name")).toBe("Alex");
  expect(value(html, "email")).toBe("");
});

test("a cleared draft after send does not restore account prefill", () => {
  const html = renderToStaticMarkup(
    <ContactForm
      formId="contacttest"
      prefillName="Alex Example"
      prefillEmail="alex@example.com"
      draft={{ name: "", email: "", message: "" }}
      setDraft={() => {}}
    />,
  );
  expect(value(html, "name")).toBe("");
  expect(value(html, "email")).toBe("");
});

test.each(["A different name", ""])(
  "edited fields (%j) win over late account details",
  (name) => {
    const html = renderToStaticMarkup(
      <ContactForm
        formId="contacttest"
        prefillName="Alex Example"
        prefillEmail="alex@example.com"
        draft={{
          name,
          email: "reply@example.com",
          message: "My existing draft",
        }}
        setDraft={() => {}}
      />,
    );
    expect(value(html, "name")).toBe(name);
    expect(value(html, "email")).toBe("reply@example.com");
    expect(html).toContain("My existing draft</textarea>");
  },
);
