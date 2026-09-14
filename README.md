# Meridian — Life Command Dashboard

A personal life management dashboard built around split-focus peak windows (7–11 AM and 9 PM–12 AM HKT), tuned to HK + US market cycles.

## Features

- **Peak window timeline** — 24-hour ribbon with live "now" indicator; add / edit / delete peak, market, and restore blocks in the UI (saved with dashboard data)
- **Visual skins** — Diablo, D&D, Castlevania, EVA, and Cyberpunk 2077 (picker in the top bar; remembered in `localStorage`)
- **Task tracks** — Trading prep, Online learning, Health, Reading, LinkedIn, Networking with priorities (P1–P4) and due dates
- **Eisenhower matrix** — drag tasks into Do / Schedule / Delegate / Eliminate quadrants, or auto-sort
- **Weekly habit tracker** — tap-to-log with streak counts and weekly totals
- **Reminders & alerts** — pre-loaded for HK + US market cycle, native browser notifications
- **Life KPIs + distribution chart** — see where your time actually goes
- **Daily journal** — wins, lessons, tomorrow's first move (auto-saved per date)
- **Trade log** — symbol, side, P/L, note → auto-calculates W/L, hit rate, running P/L
- **J.Law Daily Trading Routine** — Pre-open → Session → After-close → MRA checklist, per-day notes, streak, and the 18 Winner Rules (quick-ref). Persists in `localStorage` under `meridian.jlawRoutine.v1` (wipe-routine does not touch the main `meridian_v1` store). Use the **Routine** quick-action to jump there.
- **Dark / light themes** — toggle in the top-right (pairs with each skin)
- **Auto-save** — uses browser localStorage, plus JSON export/import for backup or cross-device transfer

## How to use

### Option 1 — Live URL (GitHub Pages)

Once Pages is enabled, the dashboard is live at the URL shown in the repo settings. Just bookmark it.

### Option 2 — Run locally

```bash
git clone <this-repo>
cd meridian-dashboard
# Just open index.html in any modern browser
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Backing up your data

The dashboard auto-saves to your browser's localStorage. To back up or move to another device:

1. Click **Export JSON** in the Data & sync section → saves a `meridian-YYYY-MM-DD.json` file
2. On another device or browser, open the dashboard and click **Import JSON** → pick the file

## Tech

- Pure HTML / CSS / vanilla JS — zero dependencies, no build step
- Persists via `localStorage`
- Works offline once loaded
- Single-page, ~80KB total

## File structure

```
meridian-dashboard/
├── index.html          # Markup
├── style.css           # Design system + components + skins
├── app.js              # State, rendering, interactivity
├── assets/banners/     # Skin hero strips (webp)
└── README.md           # This file
```

## Customizing your schedule

The Peak window timeline is editable in the dashboard — no code changes needed.

1. Click **✎** on a block (or click its segment on the 24-hour ribbon) to change start/end, label, type (`peak` / `market` / `rest`), and description.
2. Use **Add block** under the cards to insert a new window. Changing start/end repositions it on the ribbon (sorted by time). End at `00:00` means midnight (`24:00`).
3. **Reset to default** restores the shipped HK + US rhythm (7–9:30 AM deep work plus 9 PM–12 AM US focus, with HK market sessions in between).

Edits persist on `schedule` inside the main `meridian_v1` localStorage object (`null` = still on defaults). They round-trip with **Export JSON** / **Import JSON**. The J.Law routine store (`meridian.jlawRoutine.v1`) is separate and untouched.

## Visual skins

Use the segmented control in the top bar: **Diablo** (default), **D&D**, **Castlevania**, **EVA**, or **2077** (Cyberpunk). The choice is stored in `meridian_skin` and survives reload. Each skin still has dark / light via the moon/sun toggle.

## License

Personal use. Built with Perplexity Computer.
