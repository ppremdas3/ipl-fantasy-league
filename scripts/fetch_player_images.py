#!/usr/bin/env python3
"""
IPL Fantasy — Player Image Fetcher  (Playwright edition)
=========================================================
Private / non-commercial use only (personal friend group league).

Uses a real headless Chromium browser (Playwright) to search ESPNcricinfo
for each player and extract their numeric cricinfo ID, then constructs the
headshot CDN URL the app already expects.

Setup — one time only
---------------------
    cd "IPL fantasy league"
    python3 -m venv .venv
    source .venv/bin/activate          # Windows: .venv\\Scripts\\activate
    pip install playwright
    playwright install chromium        # ~130 MB download, one-time only
    pip install requests               # for the optional --download flag

Run
---
    python scripts/fetch_player_images.py              # reads seed SQL, writes output
    python scripts/fetch_player_images.py --dry-run    # preview only, no files written
    python scripts/fetch_player_images.py --verify     # HEAD-check each CDN URL too
    python scripts/fetch_player_images.py --download   # also save images locally

Output files
------------
    scripts/output/player_images.json       { "Player Name": "<cdn_url>" }
    scripts/output/update_cricinfo_ids.sql  paste into Supabase SQL Editor
    scripts/.cache.json                     resume cache (re-run safe)
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parent          # = ipl-fantasy/
SEED_SQL   = REPO_ROOT / "supabase" / "seed" / "ipl_players_2026.sql"
OUTPUT_DIR = SCRIPT_DIR / "output"
CACHE_FILE = SCRIPT_DIR / ".cache.json"
OUT_JSON   = OUTPUT_DIR / "player_images.json"
OUT_SQL    = OUTPUT_DIR / "update_cricinfo_ids.sql"
OUT_PHOTOS = OUTPUT_DIR / "photos"

# ESPNcricinfo base URL
CRICINFO = "https://www.espncricinfo.com"

# Rate limit between player searches (seconds)
PAGE_DELAY = 1.2

# Generic silhouette fallback for players not found anywhere
FALLBACK_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/"
    "Portrait_Placeholder.png/240px-Portrait_Placeholder.png"
)


# ─── CDN URL helpers ──────────────────────────────────────────────────────────
def cricinfo_image_url(cricinfo_id) -> str:
    return (
        f"https://img1.hscicdn.com/image/upload/"
        f"f_auto,t_ds_square_w_320/"
        f"lsci/db/PICTURES/CMS/{cricinfo_id}/{cricinfo_id}.jpg"
    )


# ─── Parse player names from seed SQL ─────────────────────────────────────────
def parse_players_from_sql(path: Path) -> list[dict]:
    players = []
    pattern = re.compile(
        r"\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*\d+,\s*(true|false)\)",
        re.IGNORECASE,
    )
    for m in pattern.finditer(path.read_text(encoding="utf-8")):
        players.append({
            "name":        m.group(1),
            "ipl_team":    m.group(2),
            "role":        m.group(3),
            "nationality": m.group(4),
            "is_overseas": m.group(5).lower() == "true",
        })
    return players


# ─── Fetch from Supabase REST API ─────────────────────────────────────────────
def fetch_players_from_supabase() -> list[dict]:
    import requests
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/ipl_players"
    key = os.environ["SUPABASE_KEY"]
    resp = requests.get(
        url,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
        params={"select": "name,ipl_team,role,nationality,is_overseas", "limit": "1000"},
        timeout=15,
    )
    resp.raise_for_status()
    return resp.json()


# ─── Cache helpers ─────────────────────────────────────────────────────────────
def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_cache(cache: dict):
    CACHE_FILE.write_text(json.dumps(cache, indent=2, ensure_ascii=False), encoding="utf-8")


# ─── Playwright search ────────────────────────────────────────────────────────
def get_cricinfo_id_playwright(page, name: str) -> Optional[dict]:
    """
    Uses a live Chromium page to search ESPNcricinfo and extract the
    numeric player ID from the first matching result URL.

    The player URL pattern is:  /player/name-slug-{numeric_id}
    """
    search_url = f"{CRICINFO}/search?search={name.replace(' ', '+')}"
    try:
        page.goto(search_url, wait_until="domcontentloaded", timeout=20_000)
        # Wait for player links to appear
        page.wait_for_selector("a[href*='/player/']", timeout=10_000)
    except Exception as e:
        print(f"✗ page load failed: {e}")
        return None

    # Collect all hrefs that look like player pages
    links = page.eval_on_selector_all(
        "a[href*='/player/']",
        "els => els.map(e => e.getAttribute('href'))"
    )

    for href in links:
        m = re.search(r"/player/[a-z0-9\-]+-(\d+)", href or "")
        if m:
            pid = m.group(1)
            # Build display name from slug (best effort)
            slug = href.rsplit("/", 1)[-1]
            found_name = " ".join(p.capitalize() for p in re.sub(r"-\d+$", "", slug).split("-"))
            return {
                "cricinfo_id": pid,
                "found_name":  found_name,
                "image_url":   cricinfo_image_url(pid),
            }

    return None


# ─── Optional: verify image exists on CDN ─────────────────────────────────────
def image_exists(url: str) -> bool:
    try:
        import requests
        resp = requests.head(url, timeout=8, allow_redirects=True,
                             headers={"User-Agent": "Mozilla/5.0"})
        length = int(resp.headers.get("content-length", 0))
        return resp.status_code == 200 and length > 5_000
    except Exception:
        return False


# ─── Optional: download image ─────────────────────────────────────────────────
def download_image(url: str, dest: Path) -> bool:
    try:
        import requests
        resp = requests.get(url, timeout=15, headers={"User-Agent": "Mozilla/5.0"})
        resp.raise_for_status()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(resp.content)
        return True
    except Exception as e:
        print(f"  ✗ download failed: {e}")
        return False


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Fetch ESPNcricinfo IDs for IPL players")
    parser.add_argument("--source",   choices=["sql", "supabase"], default="sql")
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--verify",   action="store_true",
                        help="HEAD-check CDN URL — falls back to silhouette if photo missing")
    parser.add_argument("--download", action="store_true",
                        help="Download player photos to scripts/output/photos/")
    args = parser.parse_args()

    # Check Playwright is installed
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        sys.exit(
            "\n❌  Playwright not installed.\n"
            "   Run:  pip install playwright && playwright install chromium\n"
        )

    # 1. Load player list ──────────────────────────────────────────────────────
    if args.source == "supabase":
        for var in ("SUPABASE_URL", "SUPABASE_KEY"):
            if not os.environ.get(var):
                sys.exit(f"❌  Missing env var: {var}")
        print("📡  Fetching players from Supabase …")
        players = fetch_players_from_supabase()
    else:
        if not SEED_SQL.exists():
            sys.exit(f"❌  Seed SQL not found:\n    {SEED_SQL}\n"
                     "    Run from the 'IPL fantasy league/' root directory.")
        print(f"📄  Reading players from {SEED_SQL.name} …")
        players = parse_players_from_sql(SEED_SQL)

    print(f"   Found {len(players)} players\n")

    # 2. Load cache ────────────────────────────────────────────────────────────
    cache = load_cache()
    cached_count = sum(1 for p in players if p["name"] in cache)
    print(f"💾  Cache: {len(cache)} entries ({cached_count} of your players already cached)\n")
    if cached_count == len(players):
        print("   All players cached — skipping browser launch.")

    # 3. Launch Playwright & search ────────────────────────────────────────────
    results: dict[str, dict] = {}
    not_found: list[str]     = []
    check_manually: list[str] = []

    needs_fetch = [p for p in players if p["name"] not in cache]

    if needs_fetch:
        print(f"🌐  Opening headless Chromium to search {len(needs_fetch)} players …\n"
              f"    (This takes ~{len(needs_fetch) * PAGE_DELAY:.0f}s at {PAGE_DELAY}s/player)\n")

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 800},
            locale="en-US",
        )
        page = ctx.new_page()
        # Block images/fonts for speed — we only need the HTML
        page.route("**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf}", lambda r: r.abort())

        # Pre-fill cache entries
        for p in players:
            name = p["name"]
            if name in cache:
                results[name] = cache[name]

        total = len(players)
        fetch_idx = 0

        for i, p in enumerate(players, 1):
            name = p["name"]
            label = f"[{i:>3}/{total}] {name:<32} ({p['ipl_team']})"

            if name in cache:
                r = cache[name]
                tag = "✓ cached" if r["cricinfo_id"] else "✗ cached (no id)"
                print(f"{label}  {tag}")
                results[name] = r
                continue

            fetch_idx += 1
            print(f"{label}  … ", end="", flush=True)

            info = get_cricinfo_id_playwright(page, name)

            if info:
                pid = info["cricinfo_id"]

                # Verify photo exists on CDN if requested
                img_url = info["image_url"]
                if args.verify and not image_exists(img_url):
                    img_url = FALLBACK_URL
                    print(f"⚠  ID={pid} but no CDN photo", end="")

                # Rough name-match check
                last_word = name.split()[-1].lower()
                name_ok = last_word in info["found_name"].lower()
                if not name_ok:
                    check_manually.append(f"{name}  ←→  {info['found_name']}  (id={pid})")
                    print(f"⚠  id={pid}  found='{info['found_name']}'  [CHECK]")
                else:
                    print(f"✓  id={pid}  ({info['found_name']})")

                entry = {
                    "cricinfo_id": pid,
                    "image_url":   img_url,
                    "found_name":  info["found_name"],
                    "status":      "ok" if name_ok else "check",
                }
            else:
                print("✗  NOT FOUND — fallback silhouette")
                not_found.append(name)
                entry = {
                    "cricinfo_id": None,
                    "image_url":   FALLBACK_URL,
                    "found_name":  name,
                    "status":      "not_found",
                }

            results[name] = entry
            cache[name]   = entry
            save_cache(cache)

            # Rate limit only between actual fetches
            if fetch_idx < len(needs_fetch):
                time.sleep(PAGE_DELAY)

        browser.close()

    # 4. Summary ───────────────────────────────────────────────────────────────
    n_ok    = sum(1 for r in results.values() if r["status"] == "ok")
    n_check = sum(1 for r in results.values() if r["status"] == "check")
    n_miss  = len(not_found)

    print(f"\n{'─'*62}")
    print(f"  ✓ Found & matched   : {n_ok}")
    print(f"  ⚠ Check manually    : {n_check}")
    print(f"  ✗ Not found         : {n_miss}")
    if check_manually:
        print("\n  Players to verify (search name differed from expected):")
        for line in check_manually:
            print(f"    {line}")
    if not_found:
        print("\n  Players with no match (will show initials fallback):")
        for n in not_found:
            print(f"    {n}")
    print()

    if args.dry_run:
        print("[dry-run] Skipping file output.")
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 5. player_images.json ───────────────────────────────────────────────────
    image_map = {name: r["image_url"] for name, r in results.items()}
    OUT_JSON.write_text(json.dumps(image_map, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"✅  {OUT_JSON}")

    # 6. SQL UPDATE statements ────────────────────────────────────────────────
    lines = [
        "-- Auto-generated by scripts/fetch_player_images.py",
        "-- Paste and run in Supabase SQL Editor → populates cricinfo_id column",
        "-- After running, restart your Next.js dev server to load real photos.",
        "",
    ]
    for name, r in results.items():
        if r["cricinfo_id"]:
            safe = name.replace("'", "''")
            lines.append(
                f"UPDATE public.ipl_players"
                f"  SET cricinfo_id = '{r['cricinfo_id']}'"
                f"  WHERE name = '{safe}';"
            )
    lines += [
        "",
        "-- Players with no cricinfo_id found (will show initials):",
    ]
    for name in not_found:
        lines.append(f"-- {name}")
    if check_manually:
        lines += ["", "-- Name-mismatch results — double-check these IDs are correct:"]
        for line in check_manually:
            lines.append(f"-- {line}")

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅  {OUT_SQL}")

    # 7. Optionally download images ───────────────────────────────────────────
    if args.download:
        import requests as _r  # noqa — just check it's importable
        print(f"\n⬇   Downloading {n_ok + n_check} photos to {OUT_PHOTOS} …")
        for name, r in results.items():
            if r["image_url"] == FALLBACK_URL:
                continue
            fname = name.replace(" ", "_") + ".jpg"
            dest  = OUT_PHOTOS / fname
            if dest.exists():
                continue
            print(f"   {name} … ", end="", flush=True)
            ok = download_image(r["image_url"], dest)
            print("✓" if ok else "✗")
            time.sleep(0.5)
        print(f"\n✅  Photos saved to {OUT_PHOTOS}")

    print(
        f"\n{'─'*62}\n"
        f"Next steps:\n"
        f"  1. Open Supabase → SQL Editor\n"
        f"  2. Paste and run:  {OUT_SQL}\n"
        f"  3. npm run dev  (restart the app)\n"
        f"  4. Player photos will now load from the ESPNcricinfo CDN\n"
    )


if __name__ == "__main__":
    main()
