import "server-only";

import { cache } from "react";
import { z } from "zod";
import { blogArticleSchema, blogSummarySchema } from "./content";
import { getLocalGuide } from "./guides";
import {
  publishedPostFilter,
  querySanity,
  summaryProjection,
} from "./sanity-query";

export const getPublishedPosts = cache(async () => {
  const response = await querySanity(
    `*[${publishedPostFilter}] | order(publishedAt desc, _id asc){${summaryProjection}}`,
  );
  return z.object({ result: z.array(blogSummarySchema) }).parse(response)
    .result;
});

export const getBlogArticle = cache(async (slug: string) => {
  const guide = getLocalGuide(slug);
  if (guide) return guide;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  const response = await querySanity(
    `*[${publishedPostFilter} && slug.current == $slug][0]{${summaryProjection}, body}`,
    { slug },
  );
  // Only a successful, valid CMS response can establish that an article is absent.
  return z.object({ result: blogArticleSchema.nullable() }).parse(response)
    .result;
});
