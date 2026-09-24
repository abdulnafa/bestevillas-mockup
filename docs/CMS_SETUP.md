# Best E Villas CMS setup

## Selected CMS

The project uses [Pages CMS](https://pagescms.org/), an open-source, Git-backed editing dashboard for static websites hosted on GitHub. It is a practical fit for the current HTML/CSS/JavaScript site because it does not require a database, server-side code, API credentials in this repository, or a hosting change.

The root `.pages.yml` file configures the dashboard. Editable source content is stored under `content/`, and uploaded images are stored under `assets/images/`.

## Activate the hosted dashboard

1. Commit and push `.pages.yml`, `content/`, and this documentation to the repository's default branch.
2. As the repository owner, open [app.pagescms.org](https://app.pagescms.org/), sign in with GitHub, and install the Pages CMS GitHub App for this repository only.
3. Open `abdulnafa/bestevillas-mockup`, select the `main` branch, and confirm that **Site settings**, **Villas**, **Site pages**, and **Barbados guide posts** appear.
4. Give the content editor access either through the repository's normal GitHub permissions or the CMS collaborator feature. Do not share GitHub passwords, personal access tokens, or other credentials.
5. Make one harmless text edit on a draft or test branch first, save it, and confirm that Pages CMS creates a Git commit.

Pages CMS reads configuration per repository and branch. If `.pages.yml` is changed, push it before testing the updated dashboard.

## Editing safeguards

- The four existing accommodation records and ten fixed site-page records cannot be created, renamed, or deleted in the dashboard. This protects route keys used by the current site.
- Guide posts can be created and deleted. Their filenames are generated from the date and slug.
- Villa booking URLs must use secure `direct-book.com` addresses.
- Occupancy is optional and should remain empty until confirmed by the client.
- Search titles, descriptions, canonical paths, image descriptions, and publication status are managed alongside each item.
- Uploaded image names are normalized and committed to `assets/images/`. Optimize high-resolution originals before uploading so the Git repository and pages remain fast.

## Content paths

| Content | Repository path | CMS behavior |
| --- | --- | --- |
| Global settings | `content/site.yml` | One protected YAML file |
| Villas | `content/villas/*.md` | Four protected Markdown records with YAML frontmatter |
| Fixed pages | `content/pages/*.md` | Ten protected Markdown records with YAML frontmatter |
| Guide/blog | `content/guide/*.md` | Editors may create and delete Markdown posts |
| Images | `assets/images/` | Editors may select or upload approved web images |

## Build and publishing contract

Pages CMS edits and commits the structured files under `content/`; it does not deploy the website itself. The project renderer converts those records and shared front-end assets into one self-contained `dist/` directory. Hosting must publish `dist/` only—not the repository root or the editable source files.

Install the locked dependencies before running either build:

```powershell
npm ci
```

Build the current GitHub Pages preview with its repository subpath:

```powershell
npm run build -- --mode preview --base-path /bestevillas-mockup
```

Preview mode keeps search-engine protection active. Build the approved live site for the root of `https://bestevillas.com` with:

```powershell
npm run build -- --mode production --base-path /
```

Production mode must be used only after content approval and launch checks. Individual records remain excluded from indexing whenever their CMS setting requests it.

The renderer prepends the selected base path when converting stored root-relative values such as `/assets/images/...`. This makes the same CMS records work under `/bestevillas-mockup/` for the preview and `/` on the canonical domain.

For local review, build with `--base-path /`, change into `dist`, run `node ../server.mjs`, and open `http://127.0.0.1:4173`. The GitHub workflow supplies the repository subpath itself.

Every build validates the CMS schema, route and canonical uniqueness, booking destinations, safe navigation URLs, numeric villa fields, and referenced image files before replacing an existing generated directory. Run `npm run test:cms` after a build to verify preview and production indexing, content rendering, draft exclusion, escaping, pretty villa routes, and booking-link integrity.

## GitHub Pages deployment

The workflow at `.github/workflows/deploy-pages.yml` installs dependencies, creates a preview-mode `dist/`, uploads that folder as the Pages artifact, and deploys it with GitHub's official Pages actions. It runs after a push to `main` and can also be started manually.

The repository owner selected **GitHub Actions** as the Pages source, and the generated preview was successfully deployed and verified on 2026-09-17. For a new repository or a replacement preview environment, use the same activation sequence:

1. Open the GitHub repository's **Settings**.
2. Select **Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Run **Deploy preview to GitHub Pages**, or push an approved commit to `main`.
5. Confirm that the deployment environment reports the preview URL and check the generated pages.

The workflow requests only repository read access, Pages deployment access, and GitHub's short-lived identity token. It contains no passwords, personal access tokens, CMS credentials, or client secrets.

Repository authorization remains an owner boundary. Pages deployment is active for `abdulnafa/bestevillas-mockup`; the owner must still authorize the Pages CMS GitHub App for the required repository. A client-owned production repository, live-domain configuration, protected environment approval, or collaborator access must be authorized separately by the client or its repository administrator. Do not request or share account passwords or personal access tokens.

Use `docs/PROJECT_SCOPE_AND_DELIVERY.md` for the approved production boundary and delivery sequence. Use `docs/PRODUCTION_LAUNCH_HANDOVER.md` for the client gates, stakeholder sign-off, production cutover, rollback, and post-launch verification.

No secret, token, password, or private credential is required or stored by this configuration.

## Official references

- [Pages CMS quick start](https://pagescms.org/docs/quick-start/)
- [Configuration overview](https://pagescms.org/docs/configuration/)
- [Content models](https://pagescms.org/docs/configuration/content/)
- [Media configuration](https://pagescms.org/docs/configuration/media/)
