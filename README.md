# SBARC — Project Progress & Earned Value

A static website for the SBARC weekly earned-value report. No build step and no server code:
just these files.

## Publish on GitHub Pages (about 5 minutes)

1. Sign in to GitHub and create a new repository named **sbarc**
   (or any name, e.g. `sbarc-dashboard`).
2. Click **Add file → Upload files** and drag in everything in this folder
   (`index.html`, `app.js`, `calcs.js`, `shim.js`, `.nojekyll` and the `data` folder). Commit.
3. Open **Settings → Pages**. Under *Build and deployment* choose
   **Deploy from a branch**, branch **main**, folder **/ (root)**, then **Save**.
4. After a minute the site is live at:
   `https://<your-github-username>.github.io/sbarc/`

To get the shorter address `https://sbarc.github.io/`, create a GitHub organization
called `sbarc` (if the name is free) and name the repository `sbarc.github.io`.
A custom domain such as `sbarc.yourcompany.com` can be set under Settings → Pages → Custom domain.

## Important: visibility

GitHub Pages sites are **public** on free plans: anyone with the address can see the
project's cost and man-hour figures. Private Pages need GitHub Enterprise Cloud.

## Weekly update

Replace the two files in `data/` (`pkg_facility.json`, `activities.csv`) with the new week's
versions and commit. Ask Claude to regenerate them from the new export.

Source: ahmed_sayed_sheet.xlsx (earned-value export).
