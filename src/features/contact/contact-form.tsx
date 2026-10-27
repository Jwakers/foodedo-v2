"use client";

import { Button } from "@/components/ui/button";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type SyntheticEvent,
} from "react";

type FieldErrors = { name?: string; email?: string; message?: string };
const fieldClass =
  "mt-2 min-h-12 w-full rounded-compact border border-control-muted bg-paper px-4 py-3 text-16 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cadmium";

export type ContactDraft = { name?: string; email?: string; message: string };
export type ContactFormProps = {
  formId?: string;
  userId?: string;
  prefillName?: string;
  prefillEmail?: string;
  draft: ContactDraft;
  setDraft: Dispatch<SetStateAction<ContactDraft>>;
};

export function ContactForm({
  formId,
  userId = "",
  prefillName = "",
  prefillEmail = "",
  draft,
  setDraft,
}: ContactFormProps) {
  const [status, setStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    if (status === "success" || status === "error")
      feedbackRef.current?.focus();
  }, [status]);

  if (!formId)
    return (
      <p role="status">
        The contact form is temporarily unavailable. Please try again later.
      </p>
    );

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const errors: FieldErrors = {};
    const name = String(data.get("name") || "").trim();
    if (!name) errors.name = "Please enter your name.";
    if (!String(data.get("message") || "").trim()) {
      errors.message = "Please enter a message.";
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setStatus("idle");
      form
        .querySelector<HTMLElement>(
          errors.name ? "[name=name]" : "[name=message]",
        )
        ?.focus();
      return;
    }
    data.set("name", name);
    submitting.current = true;
    setStatus("sending");
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: data,
        headers: { Accept: "application/json" },
        credentials: "omit",
        signal: controller.signal,
      });
      if (response.ok) {
        form.reset();
        setDraft({ message: "" });
        setStatus("success");
      } else {
        const payload: unknown = await response.json().catch(() => null);
        const errors: FieldErrors = {};
        if (
          payload &&
          typeof payload === "object" &&
          "errors" in payload &&
          Array.isArray(payload.errors)
        ) {
          for (const error of payload.errors) {
            if (
              error &&
              (error.field === "name" ||
                error.field === "email" ||
                error.field === "message") &&
              typeof error.message === "string"
            )
              errors[error.field as keyof FieldErrors] = error.message;
          }
        }
        setFieldErrors(errors);
        setStatus("error");
      }
    } catch {
      setStatus("error");
    } finally {
      clearTimeout(timeout);
      submitting.current = false;
      controllerRef.current = null;
    }
  }

  return (
    <div>
      {status === "success" ? (
        <div
          ref={feedbackRef}
          role="status"
          tabIndex={-1}
          className="rounded-surface bg-mist p-6 focus-visible:outline-cadmium"
        >
          <h2 className="font-display text-26 font-semibold">Message sent</h2>
          <p className="mt-3 text-16 text-graphite">
            Thanks for getting in touch. We’ll reply to the email address you
            provided.
          </p>
          <Button
            variant="inline"
            className="mt-4 min-h-11"
            onClick={() => {
              setStatus("idle");
              requestAnimationFrame(() =>
                formRef.current
                  ?.querySelector<HTMLInputElement>("input[name=name]")
                  ?.focus(),
              );
            }}
          >
            Send another message
          </Button>
        </div>
      ) : null}
      <form
        hidden={status === "success"}
        ref={formRef}
        action={`https://formspree.io/f/${formId}`}
        method="POST"
        onSubmit={submit}
        aria-busy={status === "sending"}
      >
        {status === "error" ? (
          <div
            ref={feedbackRef}
            role="alert"
            tabIndex={-1}
            className="mb-6 rounded-surface bg-mist p-4 text-16"
          >
            We couldn’t confirm your message was sent. Please check the form and
            try again.
          </div>
        ) : null}
        <fieldset
          disabled={status === "sending"}
          className="flex min-w-0 flex-col gap-6"
        >
          <legend className="sr-only">Contact Foodedo</legend>
          <input type="hidden" name="userId" value={userId} />
          <div>
            <label
              className="block text-14 font-semibold"
              htmlFor="contact-name"
            >
              Name
            </label>
            <input
              id="contact-name"
              name="name"
              type="text"
              required
              autoComplete="name"
              value={draft.name ?? prefillName}
              onChange={(event) => {
                const name = event.currentTarget.value;
                setDraft((current) => ({ ...current, name }));
              }}
              maxLength={120}
              className={fieldClass}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={
                fieldErrors.name ? "contact-name-error" : undefined
              }
            />
            {fieldErrors.name ? (
              <span
                id="contact-name-error"
                role="alert"
                className="mt-2 block text-14 text-cadmium"
              >
                {fieldErrors.name}
              </span>
            ) : null}
          </div>
          <div>
            <label
              className="block text-14 font-semibold"
              htmlFor="contact-email"
            >
              Email
            </label>
            <input
              id="contact-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={draft.email ?? prefillEmail}
              onChange={(event) => {
                const email = event.currentTarget.value;
                setDraft((current) => ({ ...current, email }));
              }}
              maxLength={254}
              className={fieldClass}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={
                fieldErrors.email ? "contact-email-error" : undefined
              }
            />
            {fieldErrors.email ? (
              <span
                id="contact-email-error"
                className="mt-2 block text-14 text-cadmium"
              >
                {fieldErrors.email}
              </span>
            ) : null}
          </div>
          <div>
            <label
              className="block text-14 font-semibold"
              htmlFor="contact-message"
            >
              Message
            </label>
            <textarea
              id="contact-message"
              name="message"
              required
              rows={6}
              value={draft.message}
              onChange={(event) => {
                const message = event.currentTarget.value;
                setDraft((current) => ({ ...current, message }));
              }}
              maxLength={10000}
              className={`${fieldClass} resize-y`}
              aria-invalid={!!fieldErrors.message}
              aria-describedby={
                fieldErrors.message ? "contact-message-error" : undefined
              }
            />
            {fieldErrors.message ? (
              <span
                id="contact-message-error"
                role="alert"
                className="mt-2 block text-14 text-cadmium"
              >
                {fieldErrors.message}
              </span>
            ) : null}
          </div>
          <div hidden aria-hidden="true">
            <label htmlFor="contact-website">Leave this blank</label>
            <input
              id="contact-website"
              name="_gotcha"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
          <p className="text-14 leading-6 text-graphite">
            Your name, email and message are sent through Formspree so we can
            respond. If you’re signed in, your account ID is included to help us
            find your account. Please leave out passwords and payment details.
          </p>
          <Button type="submit" className="w-full sm:w-fit">
            {status === "sending" ? "Sending…" : "Send message"}
          </Button>
        </fieldset>
      </form>
    </div>
  );
}
