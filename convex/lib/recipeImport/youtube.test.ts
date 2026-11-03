import { describe, expect, it } from "vitest";

import { extractHttpLinks, parseYouTubeVideoId } from "./youtube";

describe("parseYouTubeVideoId", () => {
  it("parses watch URLs", () => {
    expect(
      parseYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ).toBe("dQw4w9WgXcQ");
  });

  it("parses youtu.be short URLs", () => {
    expect(parseYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("parses shorts URLs", () => {
    expect(parseYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("returns null for non-YouTube URLs", () => {
    expect(parseYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBe(
      null,
    );
  });
});

describe("extractHttpLinks", () => {
  it("extracts and trims punctuation", () => {
    expect(
      extractHttpLinks(
        "Recipe: https://example.com/recipe). Another https://foo.bar/test.",
      ),
    ).toEqual(["https://example.com/recipe", "https://foo.bar/test"]);
  });
});
