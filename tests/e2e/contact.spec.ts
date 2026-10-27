import { expect, test } from "@playwright/test";

const formEndpoint = `https://formspree.io/f/${process.env.FORMSPREE_FORM_ID || "mljjjkkz"}`;

// All submissions are intercepted: these tests must never send real messages.
test.beforeEach(async ({ page }) => {
  await page.route("https://formspree.io/**", (route) => route.abort());
});

async function fillContact(page: import("@playwright/test").Page) {
  await page.goto("/support/contact");
  await page.getByLabel("Name", { exact: true }).fill("  Sam Taylor  ");
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page
    .getByLabel("Message", { exact: true })
    .fill("A mocked test message.");
}

test("contact has a standard form fallback without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.route("https://formspree.io/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:3100/support/contact");
  await expect(page.locator("form")).toHaveAttribute("action", formEndpoint);
  await expect(page.locator("form")).toHaveAttribute("method", "POST");
  await expect(page.getByLabel("Name", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();
  await expect(page.locator('input[name="userId"]')).toHaveValue("");
  await context.close();
});

test("validates required fields and whitespace before sending", async ({
  page,
}) => {
  let requests = 0;
  await page.route("https://formspree.io/**", async (route) => {
    requests++;
    await route.abort();
  });
  await page.goto("/support/contact");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect(requests).toBe(0);
  await page.getByLabel("Name", { exact: true }).fill("Sam Taylor");
  await page.getByLabel("Email", { exact: true }).fill("invalid");
  await page.getByLabel("Message", { exact: true }).fill("Some text");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  expect(requests).toBe(0);
  await page.getByLabel("Email", { exact: true }).fill("test@example.com");
  await page.getByLabel("Message", { exact: true }).fill("   ");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Please enter a message.",
  );
  expect(requests).toBe(0);
  await page.getByLabel("Name", { exact: true }).fill("   ");
  await page.getByLabel("Message", { exact: true }).fill("Some text");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator("#contact-name-error")).toHaveText(
    "Please enter your name.",
  );
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  expect(requests).toBe(0);
});

test("sends only the intended fields and confirms success without duplicate submissions", async ({
  page,
}) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(formEndpoint, async (route) => {
    requests++;
    const request = route.request();
    expect(request.method()).toBe("POST");
    expect(request.headers().accept).toBe("application/json");
    const body = request.postData()!;
    expect(body).toContain('name="name"');
    expect(body).toContain("Sam Taylor");
    expect(body).not.toContain("  Sam Taylor  ");
    expect(body).toContain('name="email"');
    expect(body).toContain('name="message"');
    expect(body).toContain('name="_gotcha"');
    expect(body).toMatch(/name="userId"\r\n\r\n\r\n/);
    expect(body.match(/Content-Disposition:/g)).toHaveLength(5);
    expect(body).not.toMatch(/accountId|recipeId|diagnostic/);
    await pending;
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await fillContact(page);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sending…" })).toBeDisabled();
  await page
    .locator("form")
    .evaluate((form: HTMLFormElement) =>
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      ),
    );
  await expect.poll(() => requests).toBe(1);
  release();
  await expect(
    page.getByRole("heading", { name: "Message sent" }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toBeFocused();
  await page.getByRole("button", { name: "Send another message" }).click();
  await expect(page.getByLabel("Email", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Name", { exact: true })).toBeEmpty();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
});

for (const outcome of [
  "validation",
  "name-validation",
  "server",
  "network",
] as const) {
  test(`${outcome} failure retains the message and allows a retry`, async ({
    page,
  }) => {
    await page.route("https://formspree.io/**", async (route) => {
      if (outcome === "network") await route.abort("failed");
      else
        await route.fulfill({
          status:
            outcome === "validation" || outcome === "name-validation"
              ? 422
              : 503,
          json:
            outcome === "validation" || outcome === "name-validation"
              ? {
                  errors: [
                    {
                      field: outcome === "name-validation" ? "name" : "email",
                      message:
                        outcome === "name-validation"
                          ? "Please provide your name."
                          : "Please use a valid reply address.",
                    },
                  ],
                }
              : { error: "Unavailable" },
        });
    });
    await fillContact(page);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.getByRole("alert").first()).toContainText(
      "We couldn’t confirm",
    );
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      "  Sam Taylor  ",
    );
    await expect(page.getByLabel(/^Email/)).toHaveValue("test@example.com");
    await expect(page.getByLabel(/^Message/)).toHaveValue(
      "A mocked test message.",
    );
    if (outcome === "validation")
      await expect(page.locator("#contact-email-error")).toHaveText(
        "Please use a valid reply address.",
      );
    if (outcome === "name-validation")
      await expect(page.locator("#contact-name-error")).toHaveText(
        "Please provide your name.",
      );
    if (outcome === "server") {
      await page.getByLabel("Name", { exact: true }).fill("   ");
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(
        "Please enter your name.",
      );
      await page.getByLabel("Name", { exact: true }).fill("Sam Taylor");
    }
    await page.route("https://formspree.io/**", (route) =>
      route.fulfill({ status: 200, json: { ok: true } }),
    );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Message sent" }),
    ).toBeVisible();
  });
}

test("guest Help and public support expose contact, with accessible mobile fields", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/?try=1");
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("link", { name: "Contact us" })
    .click();
  await expect(page).toHaveURL(/\/support\/contact$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Contact us",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("Name", { exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email", { exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Message", { exact: true })).toBeFocused();
  await page.goto("/support");
  await page
    .getByRole("navigation", { name: "Related reading" })
    .getByRole("link", { name: "Contact us" })
    .click();
  await expect(page).toHaveURL(/\/support\/contact$/);
});

test("optional identity stays blank and does not block sending when Clerk is unavailable", async ({
  page,
}) => {
  await page.route(/clerk/, (route) => route.abort());
  await page.route(formEndpoint, (route) =>
    route.fulfill({ status: 200, json: { ok: true } }),
  );
  await fillContact(page);
  await expect(page.locator('input[name="userId"]')).toHaveValue("");
  await expect(page.locator('input[name="userId"]')).not.toHaveAttribute(
    "required",
  );
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Message sent" }),
  ).toBeVisible();
});

test("forwarded signed-in app identity is hidden, submitted and removed from the address bar", async ({
  page,
}) => {
  await page.route(/clerk/, (route) => route.abort());
  let payload = "";
  await page.route(formEndpoint, (route) => {
    payload = route.request().postData()!;
    return route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.goto("/support/contact#supportUserId=user_app_example");
  const field = page.locator('input[name="userId"]');
  await expect(field).toHaveValue("user_app_example");
  await expect(field).toHaveAttribute("type", "hidden");
  await expect(page).toHaveURL(/\/support\/contact$/);
  await page.getByLabel("Name", { exact: true }).fill("Sam Taylor");
  await page.getByLabel("Email", { exact: true }).fill("different@example.com");
  await page
    .getByLabel("Message", { exact: true })
    .fill("A mocked account question.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Message sent" }),
  ).toBeVisible();
  expect(payload).toContain("user_app_example");
  expect(payload).toContain("different@example.com");
  await page.getByRole("button", { name: "Send another message" }).click();
  await expect(field).toHaveValue("user_app_example");
});
