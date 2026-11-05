import "server-only";

import sharp from "sharp";
import { getPublicRecipe } from "@/features/public-recipes/catalogue.server";

/** A compact JPEG keeps large catalogue originals out of messaging previews. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  // Keep the source lookup on the same lifetime so it cannot shorten image ISR.
  const recipe = await getPublicRecipe((await params).slug, 2_592_000);
  if (!recipe?.imageSrc) return new Response(null, { status: 404 });

  const source = await fetch(recipe.imageSrc, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!source.ok) throw new Error("Could not load recipe preview image.");
  const image = await sharp(Buffer.from(await source.arrayBuffer()))
    .rotate()
    .resize(1200, 630, { fit: "cover" })
    .jpeg({ quality: 70, mozjpeg: true })
    .toBuffer();

  return new Response(new Uint8Array(image), {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=2592000",
    },
  });
}
