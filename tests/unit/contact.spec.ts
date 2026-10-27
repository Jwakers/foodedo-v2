import { expect, test } from "@playwright/test";
import { contactLink } from "../../src/lib/routing/contact";

test("web contact stays on this site and iOS opens only the hosted contact page", () => {
  expect(contactLink(false)).toEqual({ href: "/support/contact" });
  expect(contactLink(true, "https://www.foodedo.com")).toEqual({
    href: "https://www.foodedo.com/support/contact",
    target: "_blank",
    rel: "noopener noreferrer",
  });
  expect(contactLink(true, "https://preview.foodedo.com").href).toBe(
    "https://preview.foodedo.com/support/contact",
  );
});

test("signed-in native contact carries only an identity hint in the fragment", () => {
  const link = new URL(
    contactLink(true, "https://www.foodedo.com", "user_example").href,
  );
  expect(link.search).toBe("");
  expect(new URLSearchParams(link.hash.slice(1)).get("supportUserId")).toBe(
    "user_example",
  );
  expect(contactLink(true, "https://www.foodedo.com", null).href).toBe(
    "https://www.foodedo.com/support/contact",
  );
});
