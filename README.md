# Best E Villas — CMS-generated website preview

A responsive, image-first front-end preview for the Best E Villas website revamp. The design follows the approved direction: clear navigation, one cohesive type system, authentic Barbados property imagery, a visible availability journey, and no intrusive pop-ups or floating reservation prompts.

## Included pages

- `index.html` — refined booking-focused homepage
- `villas.html` — filterable four-villa collection
- `villas/prospect-three.html` — one of four pre-rendered villa pages
- `locations.html`
- `about.html`
- `reviews.html`
- `guide.html`
- `faq.html`
- `policies.html`
- `contact.html`

The other villa routes are `prospect-two`, `providence`, and `st-silas` under `villas/`. Legacy `villa.html?villa=...` URLs redirect known property keys to their pre-rendered routes.

## Implemented experience

- Responsive desktop, tablet, and mobile layouts
- Keyboard-accessible image carousel and mobile navigation
- Homepage availability bar and villa location/bedroom filters
- Property-specific galleries, verified facts, and stable Direct-book links
- Five existing guest-review summaries without invented ratings or sources
- Clear external-booking and no-on-site-payment messaging
- DM Sans self-hosted under its Open Font License
- Route-specific canonical, Open Graph, Twitter, and schema.org metadata
- Production `robots.txt` and `sitemap.xml`, with preview `noindex` protection retained until launch
- Analytics-ready GA4 loader that stays inactive until the real Measurement ID is configured
- Pages CMS configuration and structured content models for site settings, villas, fixed pages, and guide posts
- Semantic headings, descriptive image alternatives, and intrinsic image dimensions to reduce layout shift

## Build and preview locally

Install the locked development dependencies once:

```powershell
npm ci
```

Generate a local preview at the server root. Preview pages retain search-engine protection:

```powershell
npm run build -- --mode preview --base-path /
```

The build contract is always the same: the renderer recreates `dist/` as the complete deployable site. GitHub Pages uploads only this folder; source files and CMS records are never served directly.

Serve the generated site locally:

```powershell
Set-Location dist
node ../server.mjs
```

Then visit `http://127.0.0.1:4173`.

The deployment workflow uses `/bestevillas-mockup` automatically for the GitHub Pages repository subpath.

For the final custom domain, generate the production build at the domain root:

```powershell
npm run build -- --mode production --base-path /
```

Production mode enables indexing only where the content record allows it. Review the generated metadata, policies, analytics/consent settings, and domain configuration before publishing that build.

## Validation

Run the static audit while the project is offline:

```powershell
node testing/static-audit.mjs
node testing/seo-audit.mjs
node testing/production-readiness-audit.mjs
npm run test:cms
```

The rendered browser suite also requires headless Chrome running with a DevTools endpoint on port `9223`, plus `node server.mjs` on port `4173`:

```powershell
node testing/browser-smoke.mjs
node testing/cms-browser-smoke.mjs
npm run test:browser:header
```

Reusable reports and screenshots are saved under `testing/evidence/`.

## Share with the client

The current GitHub Pages URL is:

https://abdulnafa.github.io/bestevillas-mockup/

The repository includes `.github/workflows/deploy-pages.yml`. Once the repository owner selects **GitHub Actions** under **Settings → Pages → Build and deployment → Source**, every push to `main` builds the preview and deploys the generated `dist/` artifact. The workflow can also be started manually from the Actions tab.

No deployment secret is stored in this project. GitHub supplies a short-lived Pages identity to the official deployment action. Only an authorized repository owner or maintainer can enable Pages, approve the workflow environment when required, authorize Pages CMS, or grant access to a client-owned production repository. The current preview workflow does not publish to the client's live domain.

## Production notes

- The preview intentionally uses `noindex, nofollow`; remove it only when the replacement site is ready for the live domain.
- Guests compare properties on this website and complete reservations on the existing external booking platform. This site does not process payments.
- Pixieset preview renditions are used in the current design. Download and self-host the approved full-resolution originals before production launch.
- Pages CMS is configured in `.pages.yml`; repository authorization, rendering, and deployment are described in `docs/CMS_SETUP.md`.
- Final logo files, policies, occupancy details, the GA4 Measurement ID/consent activation, Search Console, and hosting/domain access still require client confirmation or access.
- Current prices were intentionally omitted because the external booking platform is the source of live rates.
