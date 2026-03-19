#!/usr/bin/env python3
"""
IPL Fantasy — Player Image Fetcher  (Wikipedia / Wikidata edition)
==================================================================
Private / non-commercial use only (personal friend group league).

Uses the fully-open Wikipedia + Wikidata APIs (no API key, no bot-blocking)
to find each player's ESPNcricinfo numeric ID (Wikidata property P2697),
then constructs the headshot CDN URL the app already expects.

Setup
-----
    cd "IPL fantasy league/ipl-fantasy"
    python3 -m venv .venv
    source .venv/bin/activate
    pip install requests              # optional, only needed for --download

Run
---
    python scripts/fetch_player_images.py
    python scripts/fetch_player_images.py --dry-run
    python scripts/fetch_player_images.py --download   # save photos locally

After running
-------------
    1. Open Supabase → SQL Editor
    2. Paste and run:  scripts/output/update_cricinfo_ids.sql
    3. Restart dev server → real player headshots appear automatically
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parent
SEED_SQL   = REPO_ROOT / "supabase" / "seed" / "ipl_players_2026.sql"
OUTPUT_DIR = SCRIPT_DIR / "output"
CACHE_FILE = SCRIPT_DIR / ".cache.json"
OUT_JSON   = OUTPUT_DIR / "player_images.json"
OUT_SQL    = OUTPUT_DIR / "update_cricinfo_ids.sql"
OUT_PHOTOS = OUTPUT_DIR / "photos"

RATE_LIMIT  = 0.4   # seconds between API calls — Wikipedia asks for politeness
TIMEOUT     = 12

FALLBACK_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/"
    "Portrait_Placeholder.png/240px-Portrait_Placeholder.png"
)

# Wikipedia / Wikidata require a descriptive User-Agent
WP_HEADERS = {
    "User-Agent": "IPLFantasyPersonalApp/1.0 (private cricket fantasy league; non-commercial)"
}


# ─── CDN URL ──────────────────────────────────────────────────────────────────
def cricinfo_image_url(cricinfo_id) -> str:
    return (
        f"https://img1.hscicdn.com/image/upload/"
        f"f_auto,t_ds_square_w_320/"
        f"lsci/db/PICTURES/CMS/{cricinfo_id}/{cricinfo_id}.jpg"
    )


# ─── Wikipedia / Wikidata helpers ─────────────────────────────────────────────
def wp_get(url: str) -> dict:
    req = urllib.request.Request(url, headers=WP_HEADERS)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read())


def wikipedia_title(player_name: str, is_overseas: bool) -> Optional[str]:
    """
    Return the most likely Wikipedia article title for a cricketer.
    Tries two queries: one with 'cricketer', one without, to improve
    accuracy for overseas players whose pages may not mention 'IPL'.
    """
    queries = [f"{player_name} cricketer"]
    if is_overseas:
        queries.append(player_name)          # fallback without qualifier

    for query in queries:
        data = wp_get(
            "https://en.wikipedia.org/w/api.php?"
            + urllib.parse.urlencode({
                "action": "query", "list": "search",
                "srsearch": query, "format": "json", "srlimit": 3,
            })
        )
        for result in data.get("query", {}).get("search", []):
            title = result["title"]
            # Accept if the title contains any word from the player name
            words = [w.lower() for w in player_name.split() if len(w) > 2]
            if any(w in title.lower() for w in words):
                return title
    return None


def wikidata_id_for_title(title: str) -> Optional[str]:
    """Return the Wikidata Q-id linked to a Wikipedia article title."""
    data = wp_get(
        "https://en.wikipedia.org/w/api.php?"
        + urllib.parse.urlencode({
            "action": "query", "titles": title,
            "prop": "pageprops", "format": "json",
        })
    )
    for page in data.get("query", {}).get("pages", {}).values():
        qid = page.get("pageprops", {}).get("wikibase_item")
        if qid:
            return qid
    return None


def cricinfo_id_from_wikidata(qid: str) -> Optional[str]:
    """
    Look up Wikidata property P2697 = 'ESPNcricinfo.com player ID'.
    Returns the numeric string ID or None.
    """
    data = wp_get(
        "https://www.wikidata.org/w/api.php?"
        + urllib.parse.urlencode({
            "action": "wbgetentities", "ids": qid,
            "props": "claims", "format": "json",
        })
    )
    claims = data.get("entities", {}).get(qid, {}).get("claims", {})
    for v in claims.get("P2697", []):
        val = v.get("mainsnak", {}).get("datavalue", {}).get("value", "")
        if val and str(val).strip():
            return str(val).strip()
    return None


def lookup_player(name: str, is_overseas: bool) -> Optional[dict]:
    """
    Full lookup pipeline: Wikipedia search → Wikidata Q-id → P2697 cricinfo ID.
    Returns { cricinfo_id, found_name, image_url } or None.
    """
    title = wikipedia_title(name, is_overseas)
    if not title:
        return None

    qid = wikidata_id_for_title(title)
    if not qid:
        return None

    cricinfo_id = cricinfo_id_from_wikidata(qid)
    if not cricinfo_id:
        return None

    return {
        "cricinfo_id": cricinfo_id,
        "found_name":  title,
        "image_url":   cricinfo_image_url(cricinfo_id),
    }


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


# ─── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source",   choices=["sql", "supabase"], default="sql")
    parser.add_argument("--dry-run",  action="store_true")
    parser.add_argument("--download", action="store_true",
                        help="Download photos locally to scripts/output/photos/")
    args = parser.parse_args()

    # 1. Load player list ──────────────────────────────────────────────────────
    if args.source == "supabase":
        for var in ("SUPABASE_URL", "SUPABASE_KEY"):
            if not os.environ.get(var):
                sys.exit(f"❌  Missing env var: {var}")
        print("📡  Fetching players from Supabase …")
        players = fetch_players_from_supabase()
    else:
        if not SEED_SQL.exists():
            sys.exit(f"❌  Seed SQL not found:\n    {SEED_SQL}")
        print(f"📄  Reading players from {SEED_SQL.name} …")
        players = parse_players_from_sql(SEED_SQL)

    print(f"   Found {len(players)} players\n")

    # 2. Load cache ────────────────────────────────────────────────────────────
    cache = load_cache()
    cached_count = sum(1 for p in players if p["name"] in cache)
    print(f"💾  Cache: {cached_count}/{len(players)} players already fetched\n")

    # 3. Look up each player ───────────────────────────────────────────────────
    results: dict[str, dict] = {}
    not_found: list[str]     = []
    check_manually: list[str] = []

    for i, p in enumerate(players, 1):
        name = p["name"]
        label = f"[{i:>3}/{len(players)}] {name:<32} ({p['ipl_team']})"

        if name in cache:
            r = cache[name]
            tag = f"✓ cached (id={r['cricinfo_id']})" if r["cricinfo_id"] else "✗ cached (no id)"
            print(f"{label}  {tag}")
            results[name] = r
            continue

        print(f"{label}  … ", end="", flush=True)

        try:
            info = lookup_player(name, p["is_overseas"])
        except Exception as e:
            print(f"✗ error: {e}")
            info = None

        if info:
            pid = info["cricinfo_id"]
            # Check the found Wikipedia title contains the player's last name
            last_word = name.split()[-1].lower()
            name_ok = last_word in info["found_name"].lower()

            if not name_ok:
                check_manually.append(f"{name}  ←→  {info['found_name']}  (id={pid})")
                print(f"⚠  id={pid}  wiki='{info['found_name']}'  [CHECK]")
            else:
                print(f"✓  id={pid}  ({info['found_name']})")

            entry = {
                "cricinfo_id": pid,
                "image_url":   info["image_url"],
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
        time.sleep(RATE_LIMIT)

    # 4. Summary ───────────────────────────────────────────────────────────────
    n_ok    = sum(1 for r in results.values() if r["status"] == "ok")
    n_check = sum(1 for r in results.values() if r["status"] == "check")
    n_miss  = len(not_found)

    print(f"\n{'─'*62}")
    print(f"  ✓ Found & matched   : {n_ok}")
    print(f"  ⚠ Check manually    : {n_check}")
    print(f"  ✗ Not found         : {n_miss}")
    if check_manually:
        print("\n  Verify these (Wikipedia title differed):")
        for line in check_manually:
            print(f"    {line}")
    if not_found:
        print("\n  Not found (will show initials in app):")
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
        "-- Paste and run in Supabase SQL Editor to populate cricinfo_id",
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
    lines += ["", "-- Not found:"]
    for name in not_found:
        lines.append(f"-- {name}")
    if check_manually:
        lines += ["", "-- Check these IDs manually (title mismatch):"]
        for line in check_manually:
            lines.append(f"-- {line}")

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅  {OUT_SQL}")

    # 7. Optional photo download ───────────────────────────────────────────────
    if args.download:
        import requests as req_lib
        print(f"\n⬇   Downloading photos to {OUT_PHOTOS} …")
        for name, r in results.items():
            if r["image_url"] == FALLBACK_URL:
                continue
            dest = OUT_PHOTOS / (name.replace(" ", "_") + ".jpg")
            if dest.exists():
                continue
            print(f"   {name} … ", end="", flush=True)
            try:
                resp = req_lib.get(r["image_url"], timeout=15,
                                   headers={"User-Agent": "Mozilla/5.0"})
                resp.raise_for_status()
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(resp.content)
                print("✓")
            except Exception as e:
                print(f"✗ {e}")
            time.sleep(0.4)
        print(f"\n✅  Photos saved to {OUT_PHOTOS}")

    print(
        f"\n{'─'*62}\n"
        f"Next steps:\n"
        f"  1. Supabase → SQL Editor → run {OUT_SQL.name}\n"
        f"  2. npm run dev  (restart dev server)\n"
        f"  3. Player headshots will load automatically\n"
    )


if __name__ == "__main__":
    main()
