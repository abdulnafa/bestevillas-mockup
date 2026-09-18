# Best E Villas production launch handover

Status date: 2026-09-18

## Current review baseline

- Public review URL: https://abdulnafa.github.io/bestevillas-mockup/
- Deployment source: the `main` branch through GitHub Actions; confirm the current SHA in the latest successful Pages workflow before sign-off.
- Generated preview: 14 routes, four pre-rendered villa pages, legacy redirects, responsive assets, and preview `noindex` protection.
- Retained live QA baseline: 59/59 full-site browser checks and 27/27 sticky-header/motion checks passed from 1920px through 390px on 2026-09-18.
- The GitHub Pages preview is for review only. It is not the live `bestevillas.com` production deployment.

## Go-live gates

| # | Required from client | Why it blocks launch | Status |
| --- | --- | --- | --- |
| 1 | Final stakeholder sign-off and authorized production domain, hosting, CMS, analytics, consent, and search access | Required to publish, administer, measure, and verify the production site | Required before launch |
| 2 | Confirmed go-live date and review window | Required to schedule review, DNS/cutover, and post-launch monitoring | Required before launch |
| 3 | Approved accommodation facts, website copy, and policy copy | Prevents unverified claims and premature indexing | Required before launch |
| 4 | Approved production photography for every property | Required to replace temporary imagery with final assets | Required before launch |
| 5 | Authorized reservation-data export plus agreed record scope and accommodation mapping | Required to deduplicate, map, and safely review data before a one-time import | Required before migration |
| 6 | Approved recurring seasonal date boundaries and any holiday or peak exceptions | Required to configure seasonal rates correctly | Required before rate setup |

## Stakeholder review checklist

The reviewer should confirm in one consolidated response:

- Property names, grouping, locations, room types, copy, amenities, occupancy, beds, photos, and photo order.
- Check-in/check-out, age and pet rules, cancellation wording, taxes/fees treatment, and seasonal dates.
- Every external Check Availability destination.
- Header/navigation, page order, calls to action, and mobile presentation.
- Final Policies copy and whether it may be indexed.
- Production domain, analytics/consent, and CMS editor access.
- Approval to import reviewed reservation records and, separately, approval for any reservation-platform publication action.
- Written approval for live-domain cutover.

## Pre-launch execution

1. Preserve a copy of the current live site/configuration and record the rollback target.
2. Reconcile approved production content and assets in `content/` and `assets/images/`.
3. Export reservation data only through an authorized secure session. Review record scope, accommodation mapping, duplicates, dates, guest counts, and totals before any import.
4. Complete only the approved reservation-platform settings and verify each saved value after reload. Do not publish, connect services, or import data without the relevant approval.
5. Configure production analytics and consent without storing private credentials in the repository.
6. Install locked dependencies and create the root production build:

   ```powershell
   npm ci
   npm run build:production
   ```

7. Run the offline release gates:

   ```powershell
   npm run test:cms
   npm run test:ui
   node testing/static-audit.mjs
   node testing/seo-audit.mjs
   node testing/production-readiness-audit.mjs
   ```

8. Serve the generated `dist/` artifact and run rendered desktop/mobile checks, including all gallery states and legacy redirects.
9. Obtain final stakeholder sign-off on the exact production artifact.
10. Deploy only `dist/` to the approved live host, connect the domain, and retain the previous production artifact/configuration for rollback.

## Post-launch verification

- Confirm HTTPS and the preferred non-www canonical domain.
- Check every sitemap route, villa route, legacy redirect, navigation link, image, and external booking link.
- Verify desktop/mobile layout, menu state, sticky-header clearance, galleries, reduced-motion behavior, and absence of horizontal overflow.
- Confirm production pages use approved indexing directives; keep unapproved Policies content excluded.
- Verify structured data, canonical/social metadata, sitemap, robots, GA4 consent behavior, and Search Console ownership.
- Perform a Pages CMS test edit through the approved workflow and confirm the resulting deployment.
- Record the deployed version, test results, sign-off, and rollback reference in project memory.

## Rollback rule

If a critical route, booking hand-off, production-domain configuration, or content-integrity check fails after launch, restore the last verified production artifact/configuration first. Diagnose and re-test the new build separately before another cutover.

## Handover completion

The production handover is complete only after all gate groups are cleared, the final artifact is approved, the live-domain checks pass, and CMS/analytics/search access has been verified. Until then, the GitHub Pages preview remains the authoritative review build.
