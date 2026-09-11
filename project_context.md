# Project Context

> This is the project's working source of truth. Update it after every meaningful requirement, decision, client message, implementation change, test result, or status change. Never store credentials or secrets.

## Overview

| Item | Details |
| --- | --- |
| Project | Best E Villas website revamp |
| Client | Best E Villas |
| Goal | Replace the current site with a premium, booking-focused villa website that is easy to navigate, links guests to the existing external booking platform, and supports SEO, AEO, and GEO discovery. |
| Current tech stack | Static HTML, CSS, and vanilla JavaScript with a Node-based build-time renderer; self-hosted DM Sans; Pages CMS Git-backed content administration; pinned YAML parser; generated `dist/` output; GitHub Pages deployment workflow; analytics-ready GA4 loader. |
| Repository / environment | GitHub: https://github.com/abdulnafa/bestevillas-mockup — live mock-up: https://abdulnafa.github.io/bestevillas-mockup/ |

## Requirements

### Confirmed

- [x] Use the approved booking-first homepage mock-up as the starting design direction.
- [x] Guests will leave the website and use the existing external booking platform to complete bookings; no on-site checkout is required.
- [x] No on-site payment gateway is required.
- [x] Use property details, policies, and initial imagery from the existing website until replacements are supplied.
- [x] Build Home, Villas, individual Villa Pages, Locations, About, Reviews, Barbados Guide/Blog, FAQs, Policies, and Contact pages.
- [x] Provide an admin dashboard so the client can update villas, photos, page content, and blog posts.
- [x] Target the USA, Canada, and UK for SEO content and search visibility.
- [x] Implement technical SEO, AEO, and GEO foundations, including structured data, search-friendly content structure, responsive design, and performance work.
- [x] No booking-enquiry email or WhatsApp notifications are required because booking occurs on the external platform.
- [x] Delivery is requested as soon as possible; no fixed launch date has been agreed.
- [x] Design must be clean and image-led, with a cohesive font system and colours close to the existing Best E Villas brand.
- [x] Use a large first-screen image/gallery treatment inspired by the aspect the client liked on Marriott, with a visible but unobtrusive Check Availability action near the bottom of the hero.
- [x] Avoid intrusive pop-ups, ads, floating reservation phone prompts, excessive overlays, borderless overlapping image treatments, and clutter that hides property imagery.
- [x] Navigation must remain simple and intuitive.
- [x] Use one cohesive type system rather than unrelated typefaces.
- [x] Feature authentic guest and lifestyle imagery where suitable.
- [x] New photography has been shared at https://romaininthetropics.pixieset.com/bestevillas/ and should replace/selectively supplement current images once downloadable files are available.
- [x] Retain the existing external booking platform for the booking hand-off; stable Direct-book base URLs are now mapped per villa.
- [x] Do not publish unconfirmed guest capacities or static prices; use verified bedroom/bathroom/amenity facts and send guests to the booking partner for live details.
- [x] Use Pages CMS as the Git-backed editing dashboard for villas, fixed pages, site settings, media, and Barbados Guide posts.
- [x] Use `https://bestevillas.com` as the consistent production canonical origin; keep the GitHub Pages preview excluded from indexing until launch.
- [x] Keep analytics inactive until the client supplies the real GA4 Measurement ID and the consent flow is activated.
- [x] Treat `content/` as the editable CMS source and generate deployable static HTML from it; preserve preview noindex and enable production indexing only for approved records.
- [x] Keep the Policies page excluded from production indexing until the client approves the final policy copy.

### Assumptions awaiting confirmation

- [ ] The answer “Yes / No” to the channel question is interpreted as: villas are listed on Airbnb, Booking.com, and/or Vrbo, but calendar synchronization is not required.
- [ ] The exact launch date and review turnaround are still to be agreed.

## Work status

### In progress

- None.

### Pending / next

- [ ] Confirm final commercial scope, price, payment milestones, revision allowance, and delivery schedule before full production work.
- [ ] Complete stakeholder review, revisions, launch checks, and deployment to the live domain.

### Blocked / waiting on client

- [ ] Downloadable high-resolution versions of the Pixieset images, including a download PIN if required.
- [ ] Final new logo and any replacement brand assets.
- [ ] Website/CMS, hosting, domain, and repository authorization; the GA4 Measurement ID, consent decision, Google Analytics, and Search Console access will be provided for production activation. Do not store credentials in project files.
- [ ] Exact ASAP launch deadline, if the client has a hard date.
- [ ] Final client approval for policies, occupancy details, and production copy; the Policies page remains noindex until approved.

### Completed

- [x] Initial responsive, booking-first homepage mock-up built and locally validated — 2026-09-05.
- [x] Mock-up committed to Git and published through GitHub Pages — 2026-09-05.
- [x] Client approved the initial mock-up and authorized proceeding with development pages — recorded 2026-09-08.
- [x] Client discovery answers and detailed design-reference feedback consolidated into the project requirements — 2026-09-10.
- [x] Project memory files checked and initialized with current durable context — 2026-09-10.
- [x] Approved mock-up and latest feedback converted into a cohesive multi-page front-end page system — 2026-09-10.
- [x] Pixieset gallery reviewed: 38 property photos assessed, nine strongest images shortlisted and preview renditions integrated; production originals remain client-waiting — 2026-09-10.
- [x] Homepage refined with authentic image carousel, cohesive DM Sans styling, unobtrusive desktop availability bar, and first-viewport mobile availability CTA — 2026-09-10.
- [x] Villas listing, reusable four-villa detail template, Locations, About, Reviews, Barbados Guide, FAQs, Policies, and Contact pages built — 2026-09-10.
- [x] Stable base booking destinations verified for Prospect, Providence, and St. Silas; old hard-coded 2024 date parameters excluded — 2026-09-10.
- [x] Every villa availability CTA connected to its verified external Direct-book destination — 2026-09-10.
- [x] Pages CMS selected and configured with site settings, four protected villa records, nine protected fixed-page records, media management, and create/manage guide-post content; activation and handover documented — 2026-09-11.
- [x] Production-ready SEO/AEO/GEO, canonical/social metadata, structured data, analytics-ready hooks, accessibility refinements, intrinsic image sizing, crawler files, and responsive QA implemented across all routes — 2026-09-11.
- [x] Technical CMS-to-static migration completed: editable content now renders into deployable pages, including four pre-rendered villa routes and future Guide posts; safe validation, legacy URL compatibility, and the GitHub Pages build/deployment workflow are in place — 2026-09-11.

## Client communication log

| Date | Type | Summary | Status |
| --- | --- | --- | --- |
| 2026-09-05 | Decision | Initial homepage mock-up shared at the GitHub Pages preview URL. | Approved |
| 2026-09-08 | Requirements | Client confirmed external booking, no payments, full sitemap, admin editing, USA/Canada/UK targeting, and ASAP delivery. | Answered |
| 2026-09-10 | Design feedback | Client prefers Hilton-like typography/colour restraint and Marriott-style image-first presentation/availability CTA; rejects clutter, pop-ups, floating phone prompts, overlapping imagery, mixed typefaces, and difficult navigation. | Recorded |
| 2026-09-10 | Asset update | Client shared a Pixieset gallery containing new photos and asked for a development update. | Gallery audited; preview renditions integrated; originals still required for production |
| 2026-09-10 | Implementation | Image-first homepage, villa discovery, reusable villa template, and all seven secondary pages completed in the local preview. | Ready to publish for client review |
| 2026-09-11 | Implementation | CMS/admin configuration and production-ready SEO/AEO/GEO foundation completed with static and rendered QA. | Completed locally; repository push and production activation remain pending |
| 2026-09-11 | Implementation | CMS content was connected to the deployable static build, all current pages and four individual villa routes were generated, and the delivery workflow was verified. | Completed locally; updated review build still needs to be pushed/published |
| 2026-09-11 | Client update | A concise progress message was prepared covering the completed pages, villa booking hand-offs, content-management setup, responsive checks, and remaining client inputs. | Ready for the project owner to send; no external message was sent by the assistant |
| 2026-09-11 | Publishing handoff | The project owner requested manual Git push commands and a post-publication client update. | Commands and message prepared; push/deployment not executed by the assistant |

## Key technical notes

- The editable source covers Home, Villas, four villa records, Locations, About, Reviews, Guide, FAQs, Policies, and Contact. The renderer currently produces 14 HTML routes: nine fixed pages, four pre-rendered villa pages, and one noindex legacy villa compatibility route; each published Guide post will receive its own route.
- Shared implementation files are `styles.css`, `internal-pages.css`, `script.js`, `analytics.js`, and `server.mjs`; CMS records are under `content/`, the build is in `scripts/build.mjs`, design references are under `design/`, photos/fonts under `assets/`, and reusable QA/evidence is under `testing/`.
- The mock-up intentionally contains `noindex, nofollow`; this must be removed only for the production launch.
- Villa search/filter controls are front-end discovery aids. Every booking CTA links to the existing external platform; the website itself does not process bookings or payments.
- Existing mock-up imagery is public Best E Villas material used for this client concept; replace it with approved high-resolution assets where supplied.
- An initial generic headless request to Pixieset encountered Cloudflare, but a subsequent public-gallery metadata audit verified all 38 images and downloadable 1600px preview renditions. The collection download flow requests an email and showed no PIN field; production originals still need to be downloaded and self-hosted.
- The new Pixieset set contains property interiors/exteriors only and no people or lifestyle photos. A verified existing Best E Villas poolside guest image is used in the preview to reflect the client's preference for guest imagery.
- Exact booking bases: Prospect 2/3 use `https://direct-book.com/properties/bestevillasprospctdirect`; Providence uses `https://direct-book.com/properties/bestevillaprovidencedirect`; St. Silas uses `https://direct-book.com/properties/bestevillasstsilasstjames`.
- Maximum guest capacity, bed configurations, taxes/fees, arrival times, and several house rules are not confirmed publicly. The preview avoids guest-capacity and static-price claims.
- DM Sans is self-hosted under the Open Font License to remove an external render dependency.
- Do not reproduce proprietary hotel branding or typefaces; interpret the approved qualities through the Best E Villas brand and appropriately licensed assets.
- Pages CMS is configured through `.pages.yml`; editable records are under `content/`, with activation/handover steps in `docs/CMS_SETUP.md`. The repository owner must authorize the Pages CMS GitHub App after these files are pushed.
- `scripts/build.mjs` validates the CMS records before safely generating `dist/`. It supports preview and production modes, base-path deployment, draft exclusion, safe Markdown/URL handling, asset validation, page/villa/Guide rendering, canonical/schema/sitemap generation, and preservation of the last valid build if a rebuild fails.
- The four villa pages have crawlable pre-rendered URLs under `villas/`. Known legacy `villa.html?villa=...` links redirect to the matching new route and the legacy page remains noindex.
- `.github/workflows/deploy-pages.yml` installs pinned dependencies, runs the CMS audit before upload, builds for the GitHub Pages preview path, and deploys with job-scoped permissions. No push or deployment was performed in this task.
- All ten routes now include unique production canonicals, social-sharing metadata, and route-appropriate JSON-LD. `robots.txt` and `sitemap.xml` use the verified non-www canonical origin.
- `analytics.js` makes no analytics request without a valid GA4 Measurement ID. Production still needs the real ID and consent activation.
- All local HTML images reserve intrinsic space with verified width/height values to reduce layout shift.
- The 2026-09-11 implementation is local and has not been committed, pushed, or deployed in this task.

## Latest validation

- [x] 2026-09-10: Verified the project file list while excluding generated/dependency folders; the static mock-up and nine local image assets are present.
- [x] 2026-09-10: Verified Git branch `main`, remote `origin`, and latest mock-up commit `4bd9e1b`; the three project-memory Markdown files are currently untracked.
- [x] 2026-09-10: Pixieset URL responded with a Cloudflare challenge to automated access, so individual new images have not yet been visually validated or downloaded.
- [x] 2026-09-10: Validated that both memory files are populated, all required task-state sections exist, the latest Hilton/Marriott/Pixieset feedback is recorded, and template placeholders are removed; all checks passed.
- [x] 2026-09-10: Initial checkpoint count before this implementation pass: 20 tracked work items total — 2 in progress, 8 pending, 5 blocked/client-waiting, and 5 completed; 15 remained open.
- [x] 2026-09-10: Audited the current website's canonical villa facts, contact information, five named reviews, policy summary, and stable booking destinations; all core source pages and booking bases returned HTTP 200.
- [x] 2026-09-10: Audited 38 Pixieset photos, visually reviewed the strongest candidates, verified nine public JPEG previews, and integrated selected local copies. The gallery contains no new people/lifestyle images.
- [x] 2026-09-10: Static audit passed 445/445 checks across ten HTML routes, including local references, unique IDs, image alternatives, safe new-tab links, metadata, preview noindex, and stale-booking/template-copy checks.
- [x] 2026-09-10: Rendered Chrome QA passed 41/41 checks across desktop and 390px mobile: all routes HTTP 200, no missing images or horizontal overflow, carousel click/keyboard controls, location filtering, dynamic villa selection, gallery, mobile menu, visible mobile availability CTA, FAQ disclosure, and zero relevant console errors.
- [x] 2026-09-10: Accepted concepts and final browser captures were inspected together; the 12-point fidelity ledger records exact above-fold copy and intentional authentic-image/content-integrity deviations.
- [x] 2026-09-10: Updated task count: 20 tracked work items total — 0 in progress, 5 pending, 4 blocked/client-waiting, and 11 completed; 9 remain open.
- [x] 2026-09-11: Rechecked the status inventory: 20 tracked work items total — 0 in progress, 5 pending, 4 blocked/client-waiting, and 11 completed; 9 remain open. No task status changed at this checkpoint.
- [x] 2026-09-11: Pages CMS configuration and content contracts validated: one settings record, four villa records, nine fixed-page records, media fields, guide-post operations, verified booking URLs, unique slugs, and no stored secrets passed.
- [x] 2026-09-11: JavaScript syntax passed; general static audit passed 475/475, SEO audit passed 198/198, and production-readiness audit passed 309/309 with zero advisories.
- [x] 2026-09-11: Rendered Chrome QA passed 47/47 at 1440×1000 desktop and 390×844 mobile across all ten routes and all four villa variants, including metadata/schema switching, analytics-idle behavior, booking links, interactions, images, overflow, and console health.
- [x] 2026-09-11: Temporary QA server, isolated Chrome processes, and temporary browser profile were removed; ports 4173 and 9223 were verified closed.
- [x] 2026-09-11: Updated task count after completing two development tasks: 20 tracked work items total — 0 in progress, 3 pending, 4 blocked/client-waiting, and 13 completed; 7 remain open.
- [x] 2026-09-11: All nine fixed-page CMS records were expanded into 26 structured sections using only verified existing copy and local assets; YAML structure, required text, image alternatives, and referenced files passed validation.
- [x] 2026-09-11: CMS rendering and safety audit passed 3874/3874 checks, including source-to-output traceability, four pretty villa routes, Guide generation/draft exclusion, safe escaping and URLs, asset existence, duplicate rejection, base-path behavior, booking links, preview/production indexing, foreign-output protection, and last-good-build preservation.
- [x] 2026-09-11: Generated-site Chrome QA passed 35/35 desktop/mobile checks across 14 routes, including homepage carousel, villa filters, all villa metadata/schema/gallery/booking hand-offs, legacy redirect, fixed pages, responsive navigation, analytics-idle behavior, layout, images, and console health. Final evidence screenshots were visually inspected.
- [x] 2026-09-11: Production-mode build generated 14 routes at the root base path; homepage assets resolve from `/`, the homepage is `index, follow`, and unapproved Policies remains `noindex, nofollow`. Existing source audits also remain green: static 475/475, SEO 198/198, and production-readiness 309/309.
- [x] 2026-09-11: Updated task count after separating client approval from the completed technical migration: 21 tracked work items total — 0 in progress, 2 pending, 5 blocked/client-waiting, and 14 completed; 7 remain open.
- [x] 2026-09-11: Final QA evidence was retained under `testing/`; the isolated server/browser processes were stopped, ports 4173/9223 were confirmed closed, and the three assistant-created `.codex-qa-*` folders plus all build staging/backup folders were confirmed removed.
- [x] 2026-09-11: Before preparing push instructions, verified branch `main` tracks `origin/main`, remote is `https://github.com/abdulnafa/bestevillas-mockup.git`, no project file outside ignored dependency/generated folders exceeds 10 MB, and no common private-key, GitHub-token, Google-key, or OpenAI-key signatures were found. No commit, push, or deployment was performed.
