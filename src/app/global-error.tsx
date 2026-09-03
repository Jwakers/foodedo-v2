"use client";

import { useEffect, type CSSProperties } from "react";
import { foodedoColors } from "@/lib/design-system/tokens";

const bodyStyle = {
  minHeight: "100vh",
  margin: 0,
  background: foodedoColors.paper,
  color: foodedoColors.ink,
  fontFamily: '"DM Sans", ui-sans-serif, system-ui, sans-serif',
} satisfies CSSProperties;

const mainStyle = {
  boxSizing: "border-box",
  display: "flex",
  minHeight: "100vh",
  maxWidth: "56rem",
  margin: "0 auto",
  padding: "4rem 1.5rem",
  flexDirection: "column",
  justifyContent: "center",
} satisfies CSSProperties;

const buttonStyle = {
  alignSelf: "flex-start",
  minHeight: "3rem",
  marginTop: "2rem",
  padding: "0.75rem 1.5rem",
  border: 0,
  borderRadius: "14px",
  background: foodedoColors.cadmium,
  color: foodedoColors.paper,
  font: "inherit",
  fontSize: "0.875rem",
  fontWeight: 700,
  cursor: "pointer",
} satisfies CSSProperties;

const eyebrowStyle = {
  color: foodedoColors.cadmium,
  fontWeight: 700,
} satisfies CSSProperties;

const headingStyle = {
  margin: "0.75rem 0 0",
  fontFamily: "Fraunces, Georgia, serif",
  fontSize: "2.5rem",
} satisfies CSSProperties;

const descriptionStyle = {
  maxWidth: "36rem",
  margin: "1.25rem 0 0",
  color: foodedoColors.graphite,
  lineHeight: 1.75,
} satisfies CSSProperties;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en-GB">
      <body style={bodyStyle}>
        <main style={mainStyle} aria-labelledby="global-error-heading">
          <p style={eyebrowStyle}>Something went wrong</p>
          <h1 id="global-error-heading" style={headingStyle}>
            Foodedo couldn&apos;t start.
          </h1>
          <p style={descriptionStyle}>
            Try loading the app again. If the problem continues, close and
            reopen Foodedo.
          </p>
          <button type="button" style={buttonStyle} onClick={retry}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
