# Foodedo launch assets

These are the deliberately simple soft-launch brand assets shared by the web
app and the Capacitor iOS target.

## Source of truth

- Display face: Fraunces Bold (700), matching the in-app Foodedo wordmark.
- Accent: cadmium `#DD352A`.
- Icon background: mist `#F2F2EF`.
- Launch-screen background: paper `#FFFFFF`.
- The app icon uses a single optically centred `F`; the launch screen uses the
  full `Foodedo` wordmark.

The SVG files in this directory are the editable masters and contain outlined
letterforms, so raster output does not depend on fonts installed on the
developer's Mac. The generator rasterises every committed output with Sharp.

Run `pnpm assets:generate` after changing the source specification or replacing
the temporary artwork. Run `pnpm assets:check` to verify that all committed
outputs are current, opaque sRGB images with the required dimensions.

## Safe areas

- Do not add rounded corners to the app icon; iOS applies its own mask.
- Keep the maskable web mark inside the central 80% safe circle.
- Keep the launch wordmark centred inside the square master. The existing iOS
  storyboard uses aspect-fill, so the generous whitespace protects the mark in
  iPhone and iPad portrait and landscape orientations.

Custom dark/tinted icons, alternate icons, app-preview video, PWA startup
images, Android assets, and promotional artwork are intentionally deferred.
