# Product principles

Foodedo is a **decision-making engine for food**.

It exists to reduce thinking, organising, and repetitive decision-making around:

- What am I eating tonight?
- What should I cook this week?
- What food do I already have saved that suits me?
- What do I need to buy?
- What haven't I eaten for a while?
- What can I make quickly?
- How do I turn recipes I find elsewhere into something useful?

**Philosophy:** Foodedo should think so the user doesn't have to.

**Feature test:** Does this reduce thinking, effort, or friction required to decide what to eat and make it happen? If not, it probably does not belong.

These principles are durable. They outrank existing code, V1 habits, and feature enthusiasm.

## Reduce decisions

Intelligent defaults, suggestions, and actions beat configuration. Do not ask the user to design a system before they can eat. Prefer one good recommendation over five equal options.

## Reduce friction

Every tap, field, and choice must justify itself. Configurability is not the same as good UX. If a setting exists, it should be because the default is wrong for a real person, not because the product is unfinished.

## Make the next action obvious

Each screen has a primary purpose. Visual hierarchy should point at the next useful action. Do not ship equal-weight card dashboards that make the user decide what the product is for.

## Feel useful immediately

Do not require an elaborate personal database before value appears. Onboarding should be short. Empty states should move people toward Capture or Decide, not explain architecture.

### Earn the account

Let people experience the decision loop before asking them to identify themselves. Request sign-in at a clear value boundary—keeping a plan, saving personal food, retaining preferences/history, or syncing—and preserve the work they have just done. Guest access must remain honest about what is temporary.

Authentication protects persistence, identity, and paid entitlements. It must not be used to hide the standard Foodedo meal catalogue from guests.

## Mobile is the primary interaction environment

Design for thumb reach, sheets and drawers, swipe, haptics, safe areas, the software keyboard, camera, share-in, notifications, offline-resilient behaviour, large touch targets, and one-handed use. Desktop matters; mobile drives the interaction model.

## Progressive disclosure

Show what is needed now. Advanced controls, taxonomy, and household complexity wait until the user has a reason to need them.

## Earn trust

Recommendations should be understandable and reversible. Do not use AI for its own sake. If the engine cannot explain or undo a suggestion, it is not ready.

## Free should be genuinely useful

Do not ship a deliberately broken core. The complete standard meal catalogue and core decision loop remain genuinely useful without payment. Premium, when it exists later, may include explicitly premium meals or collections alongside automation, convenience, intelligence, power-user tools, advanced import, household, and removal of commercial content. It must not relabel or remove standard meals to manufacture a paywall.

## Monetisation is not an initial-build requirement

Do not prematurely build subscriptions, premium content delivery, or ads. They are not part of the foundation and must not shape the first vertical slices. When premium meals are introduced, require both authentication and a server-verified active subscription.
