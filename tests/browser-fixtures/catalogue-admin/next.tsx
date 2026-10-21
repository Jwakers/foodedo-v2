import type { ComponentProps } from "react";
// Next components are replaced only in this isolated browser fixture.
export default function Image(
  props: ComponentProps<"img"> & { unoptimized?: boolean },
) {
  const image = { ...props };
  delete image.unoptimized;
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...image} alt={image.alt ?? ""} />;
}
