# IPL Fantasy — Scripts

## fetch_player_images.py

Finds the ESPNcricinfo numeric ID for every IPL player in your DB so the app
can display real player headshots instead of initials.

**Private / non-commercial use only.**

---

### Why Playwright?

ESPNcricinfo's search API, the BCCI S3 bucket, and similar cricket data sources
all return **403 Forbidden** to plain Python HTTP requests. They check browser
fingerprints (TLS handshake order, header patterns, etc.).

Playwright runs a **real headless Chromium browser**, which is indistinguishable
from a normal user visit — so it works reliably with zero API keys.

---

### One-time setup (~2 minutes)

```bash
# 1. From the repo root ("IPL fantasy league/")
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# 2. Install Python packages
pip install playwright requests

# 3. Download Chromium (~130 MB, one-time only)
playwright install chromium
```

---

### Run

```bash
# Standard run — reads seed SQL, searches ~240 players, writes output files
python scripts/fetch_player_images.py

# Preview only — prints results but writes no files
python scripts/fetch_player_images.py --dry-run

# Also HEAD-check each CDN URL to confirm a photo actually exists
# (adds ~1s per player but catches players with IDs but no uploaded photo)
python scripts/fetch_player_images.py --verify

# Also download the photos locally to scripts/output/photos/
python scripts/fetch_player_images.py --download

# Read player list live from your Supabase DB instead of the seed SQL
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_KEY=your_anon_key \
python scripts/fetch_player_images.py --source supabase
```

**Runtime:** ~5 minutes for 240 players (1.2s/player). Safe to Ctrl-C and
re-run — results are cached in `scripts/.cache.json` after each player.

---

### Output

| File | Contents |
|---|---|
| `scripts/output/player_images.json` | `{ "Player Name": "<cdn_url>" }` |
| `scripts/output/update_cricinfo_ids.sql` | SQL UPDATE statements |
| `scripts/.cache.json` | Resume cache (do not delete mid-run) |
| `scripts/output/photos/` | Local JPEGs (only with `--download`) |

---

### After running

```
1. Open Supabase → SQL Editor
2. Paste and run:  scripts/output/update_cricinfo_ids.sql
3. Restart dev server:  npm run dev
```

The app's `PlayerAvatar` component already reads `cricinfo_id` from the DB and
constructs the CDN URL — no code changes needed.

---

### How it works

The script opens the ESPNcricinfo search page for each player name and extracts
the numeric ID from the first player result URL:

```
https://www.espncricinfo.com/player/rohit-sharma-35320
                                                 ^^^^^
                                                 this is the cricinfo_id
```

The headshot CDN URL is then:
```
https://img1.hscicdn.com/image/upload/f_auto,t_ds_square_w_320/
lsci/db/PICTURES/CMS/35320/35320.jpg
```

---

### Troubleshooting

| Symptom | Fix |
|---|---|
| `playwright: command not found` | Run `pip install playwright && playwright install chromium` |
| `❌ Seed SQL not found` | Run the script from the `IPL fantasy league/` root, not from inside `scripts/` |
| Player shows ⚠ NAME MISMATCH | The search found a different player — check the link manually: `espncricinfo.com/player/{id}` |
| Player shows ✗ NOT FOUND | The player may be new / less known — search manually on ESPNcricinfo and add to cache: edit `.cache.json` and add `"Player Name": { "cricinfo_id": "12345", "image_url": "...", "found_name": "Player Name", "status": "ok" }` |
| Many ✗ in a row | ESPNcricinfo may be temporarily slow — just re-run (cache keeps previous results) |
