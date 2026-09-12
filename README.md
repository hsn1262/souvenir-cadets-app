# Souvenir for Cadets — Shopify Rebuild

Native replacement for the Google Apps Script "Souvenir for Cadets" tool. Same workflow (Central
Inventory, Events, Token, Invoice, Allocate, Close, Expenses, Reports), rebuilt on Shopify's own
Products, Locations, Draft Orders and staff accounts instead of a spreadsheet.

Scaffolded from Shopify's official [Remix app template](https://github.com/Shopify/shopify-app-template-remix)
(Remix + Prisma + Polaris + the Admin GraphQL API) and extended with this project's own routes and
data model. See the architecture plan doc you already have for the full feature-by-feature mapping
from the old sheet to Shopify — this README is about running and continuing *this* codebase.

## What's actually working right now

- **Central Inventory** (`/app/inventory`) — full product list, add-product form (title, type,
  description, image, variations, the 8 spec fields, cost/price/initial stock), and a detail page
  for editing stock and archiving a product. This replaces `saveProductCatalog()`,
  `getInventoryData()`, `resetSingleProductStock()`, and `deleteMultipleProducts()` from `Code.gs`.
- **Staff Roles** (`/app/settings/roles`) — the replacement for the hardcoded `ADMIN_PIN`. The
  first person to open the screen can promote themselves to Manager; after that, only a Manager can
  change roles. Manager-only actions (deleting a product) check this table against the real,
  logged-in Shopify staff member making the request.
- **Data Fields** (`/app/settings/fields`) — one button that creates the metafield definitions the
  8 spec fields need, so they also show up cleanly on the product page in ordinary Shopify Admin,
  not just inside this app.
- **Events, Online Sale, Reports** — scaffolded as stub pages in the nav so the shape of the
  finished app is visible, but not implemented yet. That's the next phase of work.

## Already done, directly on the live store (cadet-forever.myshopify.com)

Two pieces of setup don't need the app running at all — they're just Admin API calls — so they're
already live on your real store as of this build:

- The **Central Inventory** Location exists (Settings → Locations in Shopify Admin).
- All **21 metafield definitions** exist (16 product spec fields + 5 event fields on Location).

Everything else below — the actual app UI — needs somewhere to run before Shopify can load it.

## Before you can run it

1. **A Shopify Partner account and app record.** If you don't have one yet, create it at
   [partners.shopify.com](https://partners.shopify.com) — Apps → Create app. Since the app already
   needs to talk to `cadet-forever.myshopify.com`, install it on that store (or a development store
   first, if you'd rather test before touching the real one).
2. **Node.js 20.19+ or 22.12+** and the Shopify CLI (`npm install -g @shopify/cli` if you don't
   have it, though `npx shopify` also works without a global install).
3. **A Postgres database.** The template ships with SQLite for local dev, but Vercel's serverless
   functions don't keep a local file around between requests, so this app is already switched to
   Postgres (see `prisma/schema.prisma`). Easiest options: Vercel's own Postgres marketplace addon
   (created from your Vercel project once it exists — see below), or a free
   [Neon](https://neon.tech) / [Supabase](https://supabase.com) database if you want one before
   that. Either way you end up with one `DATABASE_URL` connection string.
4. From this folder:
   ```bash
   npm install
   npm run config:link                     # links this folder to the app you created above
   cp .env.example .env                    # fill in DATABASE_URL at minimum
   npx prisma migrate dev --name init      # creates the tables in your Postgres database
   npm run dev                             # starts the app and gives you an install link
   ```
   `npm run dev` runs `shopify app dev`, which tunnels your local server, updates the app's URLs
   automatically, and prints a link — open it once to install the app on the store.

5. **First-time setup inside the app**, in this order:
   - Open **Settings → Staff Roles** and promote yourself to Manager.
   - Open **Settings → Data Fields** and click "Sync fields" — safe to click even though the
     definitions already exist; it no-ops on anything already created.

## Deploying to Vercel (production)

1. Push this folder to a GitHub repo (Vercel deploys from git) — a plain `git push` once you've
   made your first commit here, no need to keep using `shopify app dev`'s tunnel after this.
2. In Vercel: **Add New → Project → Import** that repo. Vercel auto-detects the Remix/Vite build.
3. Add the same variables from `.env.example` under **Project Settings → Environment Variables** —
   easiest is to add the Postgres marketplace integration from the Vercel project page first
   (Storage tab), which sets `DATABASE_URL` for you automatically.
4. Deploy. Vercel gives you a URL like `https://your-project.vercel.app`.
5. Set `SHOPIFY_APP_URL` (env var, and in `shopify.app.toml`) to that URL, then run
   `npm run config:link` / `npm run deploy` locally once so Shopify's app record points at the
   right redirect URLs, and redeploy on Vercel.
6. Run `npx prisma migrate deploy` once against the production `DATABASE_URL` (pull it locally with
   `vercel env pull` first) to create the tables — `migrate dev` is for local development only.
7. Install the app on `cadet-forever.myshopify.com` from its Partner Dashboard listing.

I can drive steps 3–7 directly once the Vercel project and Postgres addon exist and you've shared
(or connected) access — the account creation and first GitHub push are the only parts that
genuinely need to happen on your side.
   - Go to **Central Inventory → Add product** and add your first item. The "Central Inventory"
     Location is created automatically the first time you do this.

## Known environment quirk (as of this writing, Sept 2026)

The published `@shopify/shopify-app-session-storage-prisma@8.x` still depends on an older
`@shopify/shopify-api` than `@shopify/shopify-app-remix@4.x` does, which breaks TypeScript's
structural typing for the session storage (even though it works fine at runtime). This repo's
`package.json` pins both to `@shopify/shopify-api@13.1.0` via `resolutions`/`overrides` to force a
single deduped copy — if you bump either package later and this comes back, that's the fix.
Also worth knowing: Shopify has deprecated Polaris React (the `@shopify/polaris` package this app
uses for its UI) in favor of new Polaris web components, though the official Remix template still
scaffolds with it and it's what's used throughout this app. It'll keep working, but expect a
migration guide from Shopify at some point — not urgent for now.

## Project layout

```
app/
  models/            Server-side data layer — one file per Shopify concept
    inventory.server.ts   Products, variants, stock (Central Inventory)
    locations.server.ts   The always-on "Central Inventory" Location
    media.server.ts       Product image upload (staged uploads -> Shopify Files)
    metafields.server.ts  Bootstraps the 8 spec-field metafield definitions
    roles.server.ts       Staff Roles — the ADMIN_PIN replacement
  routes/
    app.tsx                    Nav shell (Dashboard / Inventory / Events / Online / Reports / Settings)
    app._index.tsx              Dashboard + build-status overview
    app.inventory._index.tsx    Product list + bulk delete
    app.inventory.new.tsx       Add product form
    app.inventory.$id.tsx       Product detail — stock + archive
    app.settings.*.tsx          Staff Roles, Data Fields, Settings hub
    app.events._index.tsx       Stub — Phase 3
    app.online._index.tsx       Stub — Phase 5
    app.reports._index.tsx      Stub — Phase 6
  lib/constants.ts     Shared constants (spec fields, metafield keys, location name, roles)
prisma/schema.prisma   Session (from the template) + StaffRole + SaleCostSnapshot
```

`SaleCostSnapshot` in the Prisma schema isn't used yet — it's there for Phase 4/5 (Token → Invoice),
to freeze a product's cost rate at the moment of sale so a later cost change never rewrites the P&L
of a sale that already happened, the same way `EventSalesLog` worked in `Code.gs`.

## What's next (in order)

1. **Events as Locations** — `locationAdd`/`locationDeactivate` for the event lifecycle, and
   `inventoryMoveQuantities` for Allocate/Close. The architecture plan doc has the exact mutation
   shapes, already checked against the live Admin API schema.
2. **Token → Draft Order, Invoice → Order** — the thermal ticket and A4 invoice screens, built
   against `draftOrderCreate`/`draftOrderComplete`.
3. **Online Sale** — same Invoice screen, pointed at the Central location.
4. **Expenses & Reports** — metaobjects for expenses, computed P&L reports.
5. **Cutover** — one-time import of the existing Inventory sheet into Shopify Products.
