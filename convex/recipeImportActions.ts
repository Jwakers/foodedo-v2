"use node";

import { v } from "convex/values";

import { internalAction } from "./_generated/server";
import {
  copySourceImageHandler,
  processImportHandler,
} from "./lib/recipeImport/pipeline";

export const processImport = internalAction({
  args: { importId: v.id("recipeImports"), attempt: v.number() },
  returns: v.null(),
  handler: processImportHandler,
});

export const copySourceImage = internalAction({
  args: {
    recipeId: v.id("recipes"),
    imageUrls: v.array(v.string()),
    expectedContentFingerprint: v.string(),
  },
  returns: v.null(),
  handler: copySourceImageHandler,
});
