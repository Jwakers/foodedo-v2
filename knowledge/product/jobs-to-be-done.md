# Jobs to be done

V2 builds around **Capture → Decide → Plan → Shop → Cook → Remember**. Discover is a later-stage job that emerges from Remember plus context. Do not start with households, CMS, ads, subscriptions, or social.

Each job below is a user situation, not a screen name.

## Activation: try before account

**Situation:** “I want to know whether Foodedo is useful before I sign up.”

**Success:** The visitor reaches a credible Decide result, can shape a roughly seven-day draft plan, and understands what an account would preserve.

**Do:** Use the same standard Foodedo meal catalogue available to account holders, ask only lightweight context, and invite the user to **Keep this plan** after value appears. The early catalogue may be small because the product is early, never because the visitor is a guest.

**Don't:** Put an auth wall before the first useful decision. Do not pretend temporary device data is safely saved or turn activation into a generic Discover feed.

## Decide

**Job:** “I need to decide what we're eating.”

**Context:** Planning the coming week or facing an immediate meal decision, with limited energy, food, and time. The user should not have to browse a library.

**Success:** A credible suggestion (or a very short shortlist) they can accept, swap, or cook-now, based on saved food, preferences, and light context.

**Do:** Build a useful week quickly, surface neglected saved food, and make individual meals easy to accept or swap. “Tonight” may be one entry point, not the scope of the product.

**Don't:** Present an empty dashboard of equal cards or make the user configure a planning system before Foodedo produces a useful plan.

## Plan

**Job:** “I need food sorted for roughly the next week without spending ages planning it.”

**Context:** Around seven days by default, without treating an exact calendar week as a rigid object or requiring elaborate generator configuration.

**Success:** The coming week is decided with little fiddling. Individual meals can change without starting over.

**Do:** Defaults and suggestions; lock/swap individual meals.

**Don't:** Make generation metadata, leftover engines, or household aggregation blocking. Don't copy V1's generator forest.

## Capture

**Job:** “I found something I want to cook. Save it without making me manually reproduce it.”

**Context:** A link, share sheet, photo, or paste. Motivation is highest in the moment of finding.

**Success:** The dish is in Foodedo with enough structure to Decide, Shop, and Cook later — with almost no form filling.

**Do:** Import first, confirm second. Manual entry is a fallback.

**Don't:** A 20-field recipe form as the happy path. Don't block save on perfect taxonomy.

## Shop

**Job:** “I've decided what we're eating. Tell me what I need.”

**Context:** After Decide/Plan, at the shop or writing a list.

**Success:** A usable list derived from decided meals, checkable, mergeable, editable.

**Don't:** Invent a leftover/scaling metadata maze before a simple derived list works. Don't make chalkboard a first-class concept unless it clearly serves this job.

## Cook

**Job:** “I'm making this now. Give me what matters without clutter.”

**Context:** Hands messy, phone on the counter, one recipe in play.

**Success:** Ingredients and steps for this cooking session, with servings and timers if they reduce friction.

**Don't:** A separate data product. Cook is a view of a saved recipe, not another entity type.

## Remember

**Job:** “I've cooked and saved loads of things before. Help me actually use them.”

**Context:** The graveyard of favourites. People save and never cook.

**Success:** Last-cooked, save/use signals, and neglect are available so Decide can surface forgotten food.

**Don't:** Force users to maintain tags instead of inferring from use. Don't replicate V1 generator flags as the memory model.

## Discover (later)

**Job:** “I don't know what I want, but Foodedo knows enough about me to make useful suggestions.”

This should emerge from Remember plus preferences and context — not from a premature content feed or CMS. Documented, not in the first vertical slices.

Guest activation is not Discover. Standard catalogue meals enable the decision loop; they are not an auth-gated teaser or a reason to turn activation into a browsing product.

## Explicitly out of early V2

Households, invites, public recipe slugs, ads, subscriptions, premium meal delivery, social, and a publishing CMS. Future premium meals require an authenticated subscriber, but that entitlement is not foundation scope and must not restrict the standard catalogue.
