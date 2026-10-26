import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDirectory = path.join(projectRoot, "assets/brand");
const iosAssets = path.join(projectRoot, "ios/App/App/Assets.xcassets");

const colours = {
  cadmium: "#DD352A",
  mist: "#F2F2EF",
  paper: "#FFFFFF",
};

const rasterSpecs = [
  {
    source: "app-icon.svg",
    destination:
      "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
    size: 1024,
  },
  {
    source: "app-icon.svg",
    destination: "public/web-app-manifest-192x192.png",
    size: 192,
  },
  {
    source: "app-icon.svg",
    destination: "public/web-app-manifest-512x512.png",
    size: 512,
  },
  {
    source: "maskable-icon.svg",
    destination: "public/web-app-manifest-maskable-512x512.png",
    size: 512,
  },
  {
    source: "app-icon.svg",
    destination: "public/apple-touch-icon.png",
    size: 180,
  },
  ...[
    "splash-2732x2732.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732-2.png",
  ].map((filename) => ({
    source: "launch-screen.svg",
    destination: `ios/App/App/Assets.xcassets/Splash.imageset/${filename}`,
    size: 2732,
  })),
  {
    source: "launch-screen.svg",
    destination: "ios/App/App/LaunchWordmark.png",
    size: 1024,
  },
];

const vectorCopies = [
  {
    source: "app-icon.svg",
    destination: "src/app/icon.svg",
  },
];

// ICO directories point to PNG frames, preserving the same artwork at each
// browser-tab size without introducing another image-generation dependency.
async function renderFavicon() {
  const sizes = [16, 32, 48];
  const frames = await Promise.all(
    sizes.map((size) => renderPng("app-icon.svg", size, { alpha: true })),
  );
  const directory = Buffer.alloc(6 + 16 * frames.length);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  frames.forEach((frame, index) => {
    const entry = 6 + 16 * index;
    directory[entry] = sizes[index];
    directory[entry + 1] = sizes[index];
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frame.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  return Buffer.concat([directory, ...frames]);
}

async function renderPng(sourceName, size, { alpha = false } = {}) {
  const svg = await readFile(path.join(sourceDirectory, sourceName));
  const image = sharp(svg, { density: 288 })
    .resize(size, size, { fit: "fill" })
    .flatten({ background: colours.paper });
  // Next.js's ICO decoder requires embedded PNG frames to use RGBA.
  return (alpha ? image.ensureAlpha() : image.removeAlpha())
    .toColourspace("srgb")
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

async function expectedOutputs() {
  const outputs = [];
  for (const spec of rasterSpecs) {
    outputs.push({
      ...spec,
      buffer: await renderPng(spec.source, spec.size),
    });
  }
  for (const spec of vectorCopies) {
    outputs.push({
      ...spec,
      buffer: await readFile(path.join(sourceDirectory, spec.source)),
    });
  }
  outputs.push({
    destination: "src/app/favicon.ico",
    buffer: await renderFavicon(),
  });
  return outputs;
}

async function generate() {
  for (const output of await expectedOutputs()) {
    const destination = path.join(projectRoot, output.destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, output.buffer);
  }
  console.log(
    `Generated ${rasterSpecs.length + vectorCopies.length + 1} Foodedo brand assets.`,
  );
}

async function assertPng(destination, size) {
  const absolutePath = path.join(projectRoot, destination);
  const metadata = await sharp(absolutePath).metadata();
  assert.equal(metadata.format, "png", `${destination} must be a PNG`);
  assert.equal(metadata.width, size, `${destination} has the wrong width`);
  assert.equal(metadata.height, size, `${destination} has the wrong height`);
  assert.equal(metadata.space, "srgb", `${destination} must use sRGB`);
  assert.equal(metadata.hasAlpha, false, `${destination} must be opaque`);
}

async function assertMaskableSafeArea() {
  const maskable = path.join(
    projectRoot,
    "public/web-app-manifest-maskable-512x512.png",
  );
  const { data, info } = await sharp(maskable)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const centre = info.width / 2;
  const safeRadius = info.width * 0.4;
  const background = [242, 242, 239];

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const offset = (y * info.width + x) * info.channels;
      const differsFromBackground = background.some(
        (channel, index) => Math.abs(data[offset + index] - channel) > 3,
      );
      if (!differsFromBackground) continue;

      const distance = Math.hypot(x + 0.5 - centre, y + 0.5 - centre);
      assert.ok(
        distance <= safeRadius,
        "Maskable icon artwork escapes its 80% safe circle",
      );
    }
  }
}

async function assertFavicon() {
  const icon = await readFile(path.join(projectRoot, "src/app/favicon.ico"));
  assert.equal(icon.readUInt16LE(0), 0);
  assert.equal(icon.readUInt16LE(2), 1);
  assert.equal(icon.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + 16 * index;
    assert.equal(icon.readUInt16LE(entry + 6), 32);
    const length = icon.readUInt32LE(entry + 8);
    const offset = icon.readUInt32LE(entry + 12);
    const frame = icon.subarray(offset, offset + length);
    const { info } = await sharp(frame)
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(info.width, size);
    assert.equal(info.height, size);
    assert.equal(info.channels, 4, "ICO PNG frames must use RGBA");
  }
}

async function check() {
  const failures = [];
  for (const output of await expectedOutputs()) {
    try {
      const actual = await readFile(path.join(projectRoot, output.destination));
      assert.deepEqual(actual, output.buffer);
    } catch {
      failures.push(output.destination);
    }
  }

  assert.deepEqual(
    failures,
    [],
    `Brand assets are missing or stale; run pnpm assets:generate:\n${failures.join("\n")}`,
  );

  for (const spec of rasterSpecs) {
    await assertPng(spec.destination, spec.size);
  }
  await assertMaskableSafeArea();
  await assertFavicon();

  const manifest = await readFile(
    path.join(projectRoot, "src/app/manifest.ts"),
    "utf8",
  );
  assert.match(manifest, /web-app-manifest-maskable-512x512\.png/);
  assert.match(manifest, /purpose:\s*"maskable"/);

  const iconContents = await readFile(
    path.join(iosAssets, "AppIcon.appiconset/Contents.json"),
    "utf8",
  );
  assert.match(iconContents, /AppIcon-512@2x\.png/);

  const launchStoryboard = await readFile(
    path.join(projectRoot, "ios/App/App/Base.lproj/LaunchScreen.storyboard"),
    "utf8",
  );
  assert.match(launchStoryboard, /image="LaunchWordmark\.png"/);

  console.log(
    `Checked ${rasterSpecs.length + vectorCopies.length + 1} Foodedo brand assets.`,
  );
}

const mode = process.argv[2];
if (mode === "--generate") {
  await generate();
} else if (mode === "--check") {
  await check();
} else {
  throw new Error("Use --generate or --check.");
}
