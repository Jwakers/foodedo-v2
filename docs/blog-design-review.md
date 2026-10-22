# Blog MVP — design review

Status: approved in chat on 21 October 2026; production implementation follows this design.

[Open the six designs in Paper](https://app.paper.design/file/01M0FD2K4HNTJZ5MET5T0CNYP7/p-3-0).

## Review surfaces

- **11A / Blog / Desktop** and **11B / Blog / Mobile web**: introduction, all six existing featured guides, CMS article treatment, closing invitation and footer.
- **11C / Article / Desktop** and **11D / Article / Mobile web**: readable article layout, optional inline image/caption treatment and the closing invitation.
- **11E / Welcome / Mobile web · Blog link** and **11F / Welcome / Desktop web · Blog link**: secondary Blog link below the existing welcome actions. These are web references; no link is proposed for iOS.

## Design contract

- Reuse the approved Foodedo palette and fonts: white paper, ink, graphite, mist, cadmium actions, Fraunces headings and DM Sans body text.
- Editorial pages have a compact wordmark/header, a Try Foodedo action and their own footer; no product dock, account controls or household context.
- Index uses two guide columns at desktop width and a single list on mobile. Preserve guide titles and descriptions. Articles follow the guides and all published articles remain reachable.
- Article text has a 720px desktop reading width, 20px mobile gutters, 18px body text with 29px leading, and optional images and captions.
- Primary action: **Try Foodedo**. Supporting copy: **No account needed to try it. Create one when you want to keep your plan.** Enter the existing guest experience directly and preserve existing account/plan state.
- The welcome screen keeps its existing product hierarchy. Add only a quiet, underlined Blog link with a touch target of at least 44px.
- Header is in normal document flow. No sticky overlays or reading interruptions are proposed.

## Content fidelity

The article example uses the existing fifteen-minute planning guide, with obsolete Discover references corrected. The introductory paragraph and food image/caption demonstrate rich content rendering; they are design examples, not instructions to add an image to that guide.

The From the blog article, excerpt and Published date label are illustrative CMS content. Photos reuse existing V2 welcome assets. Preserve real Sanity titles, excerpts, dates and assets during implementation; omit dates or images when absent. Do not fabricate an author or publication date.

The live Sanity API was unavailable during the design pass. During implementation, read-only access confirmed 27 published CMS articles alongside the six local guides. The migration inventory is recorded in `docs/blog-url-inventory.json`.

## Next stage

The approved chat plan requires **design approval → implementation → migration checks → launch**. The designs are approved. Implementation covers the route-group/provider separation, read-only Sanity integration, preserved guides and URLs, guest entry, SEO metadata/sitemaps, iOS route exclusion, focused tests and both production builds. See `docs/blog.md` for implementation and launch details.

This design pass changes no production routes, CMS content or personal data. Screens were reviewed in Paper at mobile and desktop widths for spacing, typography, contrast, alignment and clipping. Runtime checks and production builds belong to the implementation stage.
