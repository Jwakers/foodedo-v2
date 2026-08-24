# Interaction principles

Mobile is the primary environment. Desktop is a first-class layout, not the design source.

## Primary actions

One clear primary action per screen. Secondary actions sit in sheets, menus, or lower visual weight. Do not use equal-weight card grids that make the user pick a product area before they get help.

## Defaults and disclosure

Sensible defaults should make the common path zero-config. Progressive disclosure hides rarity. Forms should ask for as little as possible; Capture especially should prefer import over typing.

## Account boundaries

Do not lead with sign-in. Let a guest reach a useful Decide/Plan result, then ask them to **Keep this plan** or **Save this recipe**. Explain in one sentence that guest work is temporary on this device and an account makes it durable and synced.

Preserve the draft through sign-in. If claiming or merging fails, keep the local copy and provide retry. Never surprise an existing account by silently replacing its plan or preferences.

## Sheets, gestures, context

Use sheets and drawers for contextual actions (swap, servings, add to plan). Gestures (swipe to cook, swipe to defer) enhance; they must never be the only way to complete a job. Maintain user context: returning from a sheet should not reset the Decide flow.

Avoid stacking modals. If a second modal is tempting, the first screen is doing too much.

## Feedback and recovery

Optimistic UI is appropriate for checks, saves, and list ticks when the server can catch up. Prefer undo over confirmation dialogs. Confirm only for destructive, hard-to-reverse actions.

Loading and empty states are part of the product. Empty Capture should invite a share or paste. Empty Decide should not look like a settings page.

## Accessibility and body

Touch targets at least 44px. Honour safe areas (notch, home indicator, keyboard). Keyboard behaviour: don't cover the focused field; submit should be obvious. Support reduced motion. Semantic HTML and contrast are required, not polish.

## Layout

Do not optimise for fitting everything in the initial viewport. Scrolling is normal. Expand the canvas when it improves clarity (long cook steps, a shopping list). Responsive behaviour should reflow; it should not invent a different information architecture for desktop.

## What to avoid

Generic dashboard / card-grid home screens. Configuration-first onboarding. Equal navigation items with no default job. Desktop hover-only affordances on mobile-critical paths.
