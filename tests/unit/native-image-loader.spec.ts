import { expect, test } from "@playwright/test";
import { getImageProps } from "next/image";
import nativeImageLoader from "../../src/lib/platform/capacitor/image-loader";

const source = "https://example.convex.cloud/api/storage/recipe-image";

test("native recipe cards request responsive hosted variants instead of originals", () => {
  const { props } = getImageProps({
    src: source,
    alt: "",
    fill: true,
    sizes: "(max-width: 640px) 50vw, 200px",
    loader: nativeImageLoader,
  });
  expect(props.srcSet).toBeTruthy();
  const candidates = props.srcSet!.split(", ");
  expect(candidates.length).toBeGreaterThan(1);
  for (const candidate of candidates) {
    const [src, descriptor] = candidate.split(" ");
    const url = new URL(src);
    expect(url.protocol).toBe("https:");
    expect(url.pathname).toBe("/_next/image");
    expect(url.searchParams.get("url")).toBe(source);
    expect(`${url.searchParams.get("w")}w`).toBe(descriptor);
    expect(url.searchParams.get("q")).toBe("75");
  }
  expect(props.src).not.toBe(source);
  // Stable URLs let both the device and CDN reuse an existing response.
  expect(nativeImageLoader({ src: source, width: 640 })).toBe(
    nativeImageLoader({ src: source, width: 640, quality: 75 }),
  );
});

test("native bundled photography stays local and needs no network optimizer", () => {
  const { props } = getImageProps({
    src: "/images/welcome/pasta-primavera.webp",
    alt: "",
    fill: true,
    unoptimized: true,
    loader: nativeImageLoader,
  });
  expect(props.src).toBe("/images/welcome/pasta-primavera.webp");
  expect(props.srcSet).toBeUndefined();
});

test("opaque storage URL query strings survive optimizer encoding", () => {
  const src = `${source}?token=a%2Bb&version=2`;
  const url = new URL(nativeImageLoader({ src, width: 256 }));
  expect(url.searchParams.get("url")).toBe(src);
  expect(url.searchParams.get("w")).toBe("256");
});
