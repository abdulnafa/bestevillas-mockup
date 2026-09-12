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
- [x] Desktop navigation drawer must remain closed by default and must never cover page content unless the user explicitly opens the mobile menu.
- [x] Content and location imagery must use controlled, consistent display dimensions rather than excessively tall image panels.
- [x] The published preview must load promptly; non-critical imagery should not block the first screen and image payloads should be optimized for their rendered size.
- [x] Villa gallery, property facts, and availability controls must remain in separate, readable layout regions with no overlap or clipped controls at any supported viewport.
- [x] Replace the temporary text/monogram branding with the client-supplied Best E Villas logo, preserving the original mark and using a professional high-contrast treatment appropriate to the header.
- [x] Keep the site header professionally sticky across all pages, with correct responsive desktop/mobile behaviour and no content obstruction.
- [x] Provide smooth in-page scrolling and subtle, lightweight entrance/interaction motion across all pages; respect reduced-motion preferences and avoid distracting effects.

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
- [ ] Website/CMS, hosting, domain, and repository authorization; the GA4 Measurement ID, consent decision, Google Analytics, and Search Console access will be provided for production activation. Do not store credentials in project files.
- [ ] Exact ASAP launch deadline, if the client has a hard date.
- [ ] Final client approval for policies, occupancy details, and production copy; the Policies page remains noindex until approved.
- [ ] Repository owner must change GitHub **Settings → Pages → Build and deployment → Source** to **GitHub Actions**, then publish this hotfix and verify the generated live marker/pretty villa route before the client is told the issue is fixed.

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

- [x] Client-reported preview regressions corrected locally: the desktop navigation drawer stays closed, headers no longer clip, internal-page images use controlled 4:3 frames, responsive/lazy image delivery is in place, and future CMS uploads are automatically optimized during the staged build — 2026-09-11.
- [x] Client-reported villa-page overlap corrected locally: square and landscape gallery images are contained within bounded grid tracks, facts and availability controls stay separate, both generated and legacy/source villa layouts pass collision-focused desktop/mobile QA, and a follow-up deployment safeguard prevents the branch Pages job from remaining the last publisher — 2026-09-12.
- [x] Client-supplied logo integrated across generated and source-fallback headers/footers; sticky responsive headers, header-aware smooth scrolling, subtle progressive entrance motion, mobile-menu refinements, and reduced-motion support completed and rendered across all routes — 2026-09-12.

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
| 2026-09-11 | Regression report | After publication, the client reported excessively tall images on multiple pages, a navigation panel visibly open on the right, clipped page content, and slow loading; screenshots show the Locations page affected on desktop. | Corrected and independently re-verified locally; push and GitHub Pages deployment are required before asking the client to refresh |
| 2026-09-12 | Regression report | Client screenshot of `villa.html?villa=prospect-three` shows the availability card and villa facts covering the gallery, with the availability action clipped on desktop. | Corrected and visually verified locally; repository push, Pages Source change, generated deployment, and live verification are still required before sending a completion update |
| 2026-09-12 | Design enhancement | Client supplied the white Best E Villas logo and requested professional logo placement, a polished responsive sticky header, smooth page scrolling, and light animations throughout the site. | Completed and verified locally; ready to publish, then share after the GitHub Pages deployment is confirmed |

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
- The staged build uses pinned Sharp image processing to auto-orient and optimize published imagery, generate 480px and 960px responsive candidates, strip unnecessary metadata where re-encoding is needed, enforce byte budgets, and leave original CMS/source files untouched. The current 20 referenced source images generate 40 responsive derivatives only inside the deployable build; unpublished drafts are excluded from optimization so they cannot block a public deployment on size grounds.
- The four villa pages have crawlable pre-rendered URLs under `villas/`. Known legacy `villa.html?villa=...` links redirect to the matching new route and the legacy page remains noindex.
- `.github/workflows/deploy-pages.yml` installs pinned dependencies, builds for the GitHub Pages preview path, runs both CMS and UI regression gates before artifact upload, and deploys with job-scoped permissions. No push or deployment was performed in this task.
- Public inspection on 2026-09-12 confirmed that GitHub Pages was serving the tracked root/source `villa.html` rather than generated `dist/villa.html`: the live pretty villa route returned 404, and both the custom artifact workflow and GitHub's automatic `pages build and deployment` workflow succeeded for commit `de7c577`. The branch-source deployment overwrote the generated artifact. The custom workflow now safely follows a successful automatic Pages run and checks out its exact SHA so the generated artifact publishes last, but the repository owner must still select **GitHub Actions** as the sole Pages source.
- The Prospect Three overlap was caused by CSS Grid intrinsic sizing: its square 1440×1440 lead photo could force gallery children beyond the gallery's declared desktop height. The gallery now uses a bounded row, zero minimum child sizes, explicitly contained media, and content-driven mobile resets.
- Collision-focused rendered QA now checks gallery/main/thumbnail/summary/facts/booking/button rectangles, button hit targets and label clipping, every gallery selection, all four villas at desktop size, Prospect Three around the 1180px/980px/740px breakpoints down to 390px, and the legacy source fallback separately.
- All ten routes now include unique production canonicals, social-sharing metadata, and route-appropriate JSON-LD. `robots.txt` and `sitemap.xml` use the verified non-www canonical origin.
- `analytics.js` makes no analytics request without a valid GA4 Measurement ID. Production still needs the real ID and consent activation.
- All local HTML images reserve intrinsic space with verified width/height values to reduce layout shift.
- The supplied white JPEG logo was converted deterministically to `assets/images/brand/best-e-villas-logo-white.png` (1015×245 transparent PNG, 21,777 bytes), retaining all high-confidence artwork pixels. A generative background-removal result was rejected because it altered the brand artwork; it is not used by the site.
- Header/footer branding uses the exact transparent white logo on the approved dark-teal surface. The header remains the same height while scrolling, gains only a restrained shadow state, and uses a passive requestAnimationFrame-throttled scroll update.
- Entrance motion is progressively enhanced with opacity/transform only, so content stays visible without JavaScript. Native smooth scrolling uses one header-aware offset, while `prefers-reduced-motion` disables both smooth and entrance motion.
- Commit `f24b0b8` contains the 2026-09-12 overlap/deployment hotfix. The subsequent logo/header/motion work in the current working tree has not been committed, pushed, or deployed by the assistant.

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
- [x] 2026-09-11: Reproduced the live Locations regression and traced it to mismatched generated navigation markup/internal CSS plus undefined split-media sizing; live image payloads were also confirmed as the main loading bottleneck rather than server response time.
- [x] 2026-09-11: Corrected the internal navigation and 4:3 media contracts, added deferred responsive carousel/gallery behavior without blank-frame swaps, compressed the current base photography, and added automatic staged responsive-image generation for future published CMS uploads.
- [x] 2026-09-11: Final GitHub Pages-path build passed CMS/safety 5074/5074 and enhanced image/UI regression 1537/1537. Source audits passed static 475/475, SEO 198/198, and production-readiness 309/309 with zero advisories. Rendered Chrome passed 39/39 across all 14 routes, desktop/intermediate/mobile breakpoints, internal nav state, image ratios, carousel/gallery loading, legacy routing, and console health.
- [x] 2026-09-11: Visual evidence confirms Locations navigation is closed, St. Silas/Providence images render in normal 4:3 frames, and carousel/villa gallery frames remain populated after interaction. Independent base-path QA also found 58/58 images responsive, below-fold location images deferred until scroll, and no missing resources, HTTP failures, overflow, or console errors.
- [x] 2026-09-11: A production-mode root build generated all 14 routes and 40 responsive derivatives successfully. A source-integrity check rebuilt all 30 source images with zero hash changes; no generated 480px/960px variants remain in the source tree.
- [x] 2026-09-11: Current task inventory is 22 tracked items — 0 in progress, 2 pending, 5 blocked/client-waiting, and 15 completed; 7 remain open. The regression fix is complete locally but is not live until the project owner commits and pushes it and GitHub Pages finishes deploying.
- [x] 2026-09-12: Live HTTP and public Actions inspection proved the deployment mismatch: legacy `/villa.html?villa=prospect-three` returned the 13,030-byte tracked source page, generated `/villas/prospect-three.html` returned 404, and two Pages workflows had deployed the same `de7c577` commit.
- [x] 2026-09-12: Rendered collision QA passed 66/66 checks. It verified all four generated villa pages, every thumbnail state, Prospect Three at 1920, 1536, 1440, 1366, 1181/1180, 981/980, 741/740, and 390px widths, all four legacy-query redirects, and the currently served source fallback at nine desktop/mobile sizes. Visual evidence shows at least 24px separation between the gallery and availability card with no clipping or overlap.
- [x] 2026-09-12: Final GitHub Pages-path build generated 14 routes and passed CMS/safety 5078/5078, UI/image regression 1542/1542, static 475/475, SEO 198/198, and production-readiness 309/309 with zero advisories.
- [x] 2026-09-12: Temporary local servers, isolated Chrome processes, browser profiles, and logs created for this regression test were stopped and removed; reusable JSON and screenshot evidence remains under `testing/evidence/`.
- [x] 2026-09-12: Current task inventory is 24 tracked items — 0 in progress, 2 pending, 6 blocked/client-waiting, and 16 completed; 8 remain open. The code fix is complete locally, while repository publication/source selection and final live verification remain waiting on the project owner.
- [x] 2026-09-12: Exact logo extraction passed fidelity validation: 1015×245 RGBA PNG, 21,777 bytes, all 64,654 high-confidence foreground pixels retained, 0.029637/255 composite mean absolute error, and no high-confidence crop loss. The dark-teal proof was visually inspected.
- [x] 2026-09-12: Final GitHub Pages-path build generated 14 routes. CMS/safety passed 5224/5224, UI/image regression 1669/1669, source static audit 532/532, SEO 198/198, and production-readiness 309/309 with zero advisories.
- [x] 2026-09-12: Existing generated-site browser QA passed 56/56. New header/motion browser QA passed 27/27 across all 14 routes plus 981/980, 861/860, 740, and 390px responsive boundaries, confirming logo loading/containment, sticky position and stable height, mobile drawer containment/Escape close, anchor clearance, subtle reveal completion, reduced-motion fallback, no overflow, and no relevant console errors.
- [x] 2026-09-12: QA screenshots/JSON are retained under `testing/evidence/`; temporary local server and isolated Chrome processes were stopped, temporary browser profiles were removed, and ports 4173/9223 were confirmed closed.
- [x] 2026-09-12: Current task inventory is 24 tracked items — 0 in progress, 2 pending, 5 blocked/client-waiting, and 17 completed; 7 remain open. This enhancement is complete locally but is not live until the project owner commits/pushes it and confirms the GitHub Pages deployment.
