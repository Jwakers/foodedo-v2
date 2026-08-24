# Jobs to be done

V2 builds around **Capture → Decide → Plan → Shop → Cook → Remember**. Discover is a later-stage job that emerges from Remember plus context. Do not start with households, CMS, ads, subscriptions, or social.

Each job below is a user situation, not a screen name.

## Activation: try before account

**Situation:** “I want to know whether Foodedo is useful before I sign up.”

**Success:** The visitor reaches a credible Decide result, can shape a short draft plan, and understands what an account would preserve.

**Do:** Use the same standard Foodedo meal catalogue available to account holders, ask only lightweight context, and invite the user to **Keep this plan** after value appears. The early catalogue may be small because the product is early, never because the visitor is a guest.

**Don't:** Put an auth wall before the first useful decision. Do not pretend temporary device data is safely saved or turn activation into a generic Discover feed.

## Decide

**Job:** “I need to decide what we're eating.”

**Context:** End of the day, limited energy, fridge and time are constraints. The user should not browse a library.

**Success:** A credible suggestion (or a very short shortlist) they can accept, swap, or cook-now, based on saved food, preferences, and light context.

**Do:** Surface neglected saved food, quick options, and “eat this tonight.” Make accept the primary action.

**Don't:** Present an empty dashboard of equal cards. Don't require a generated week before tonight is solved.

## Plan

**Job:** “I need food sorted for the next few days without spending ages planning it.”

**Context:** Short horizon (a few days), not an elaborate weekly generator as a prerequisite.

**Success:** The next few eats are decided with little fiddling. The plan can change without starting over.

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
