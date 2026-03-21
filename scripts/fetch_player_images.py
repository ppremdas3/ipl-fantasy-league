#!/usr/bin/env python3
"""
IPL Fantasy — Player Image Fetcher  (single Wikidata SPARQL query)
==================================================================
Private / non-commercial use only.

Strategy
--------
One single SPARQL query to Wikidata fetches ALL ~31k cricketers who have an
ESPNcricinfo player ID (property P2697).  We then match our 243 players
against that local table — no per-player HTTP calls, no rate limiting.

Setup
-----
    cd "IPL fantasy league/ipl-fantasy"
    # No extra packages needed — uses only Python stdlib
    # (add 'requests' only if you want --download)

Run
---
    python scripts/fetch_player_images.py
    python scripts/fetch_player_images.py --dry-run
    python scripts/fetch_player_images.py --download   # also save photos locally

After running
-------------
    1. Supabase → SQL Editor → paste + run  scripts/output/update_cricinfo_ids.sql
    2. npm run dev  →  real player headshots load automatically
"""

import argparse
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

# ─── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).parent
REPO_ROOT  = SCRIPT_DIR.parent
SEED_SQL   = REPO_ROOT / "supabase" / "seed" / "ipl_players_2026.sql"
OUTPUT_DIR = SCRIPT_DIR / "output"
OUT_JSON   = OUTPUT_DIR / "player_images.json"
OUT_SQL    = OUTPUT_DIR / "update_cricinfo_ids.sql"
OUT_PHOTOS = OUTPUT_DIR / "photos"

FALLBACK_URL = (
    "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/"
    "Portrait_Placeholder.png/240px-Portrait_Placeholder.png"
)

HEADERS = {
    "User-Agent": "IPLFantasyPersonalApp/1.0 (private non-commercial cricket league)",
    "Accept": "application/sparql-results+json",
}

# ─── Wikidata country labels → our seed nationality strings ───────────────────
# Used to disambiguate duplicate names (e.g. two "Rohit Sharma" cricketers)
COUNTRY_MAP = {
    "India": ["India"],
    "Australia": ["Australia"],
    "England": ["England"],
    "South Africa": ["South Africa"],
    "New Zealand": ["New Zealand"],
    "West Indies": ["West Indies", "Trinidad and Tobago", "Jamaica", "Barbados",
                    "Guyana", "Saint Kitts and Nevis"],
    "Afghanistan": ["Afghanistan"],
    "Sri Lanka": ["Sri Lanka"],
    "Bangladesh": ["Bangladesh"],
    "Pakistan": ["Pakistan"],
    "Zimbabwe": ["Zimbabwe"],
    "Ireland": ["Ireland"],
    "Netherlands": ["Netherlands"],
    "United States": ["United States of America"],
}


# ─── CDN URL ──────────────────────────────────────────────────────────────────
def cricinfo_image_url(pid) -> str:
    return (
        f"https://img1.hscicdn.com/image/upload/"
        f"f_auto,t_ds_square_w_320/"
        f"lsci/db/PICTURES/CMS/{pid}/{pid}.jpg"
    )


# ─── Normalise name for fuzzy matching ───────────────────────────────────────
def normalise(s: str) -> str:
    """Lowercase, strip accents, remove punctuation."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


# ─── Fetch full Wikidata cricketer lookup in one SPARQL query ─────────────────
def fetch_wikidata_cricketers() -> list[dict]:
    """
    Returns a list of { name, cricinfo_id, nationality } for every cricketer
    in Wikidata that has an ESPNcricinfo player ID (P2697).
    ~31 000 rows, takes a few seconds.
    """
    query = """
    SELECT ?playerLabel ?cricinfoId ?nationalityLabel WHERE {
      ?player wdt:P2697 ?cricinfoId .
      ?player wdt:P106  wd:Q12299841 .
      OPTIONAL { ?player wdt:P27 ?nationality . }
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "en" .
      }
    }
    """
    url = "https://query.wikidata.org/sparql?" + urllib.parse.urlencode(
        {"query": query, "format": "json"}
    )
    print("🌐  Querying Wikidata for all cricketers with ESPNcricinfo IDs …", flush=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())

    rows = []
    for b in data["results"]["bindings"]:
        rows.append({
            "name":        b["playerLabel"]["value"],
            "cricinfo_id": b["cricinfoId"]["value"].strip(),
            "nationality": b.get("nationalityLabel", {}).get("value", ""),
        })
    print(f"   Got {len(rows)} entries\n")
    return rows


# ─── Build lookup table ───────────────────────────────────────────────────────
def build_lookup(rows: list[dict]) -> dict[str, list[dict]]:
    """
    Returns { normalised_name: [row, ...] } — a list because multiple
    cricketers can share a name (e.g. two 'Rohit Sharma').
    """
    lookup: dict[str, list[dict]] = {}
    for row in rows:
        key = normalise(row["name"])
        lookup.setdefault(key, []).append(row)
    return lookup


def best_match(candidates: list[dict], seed_nationality: str) -> dict:
    """
    Pick the best candidate when there are multiple cricketers with the same
    name by preferring the one whose Wikidata nationality matches the seed.
    Falls back to the entry with the smallest (oldest) cricinfo ID.
    """
    if len(candidates) == 1:
        return candidates[0]

    # Try nationality match
    expected_countries = COUNTRY_MAP.get(seed_nationality, [seed_nationality])
    for c in candidates:
        if any(ec.lower() in c["nationality"].lower() for ec in expected_countries):
            return c

    # Fall back: smallest numeric cricinfo_id = more established player
    def id_key(c):
        try:
            return int(c["cricinfo_id"])
        except ValueError:
            return 999_999_999

    return min(candidates, key=id_key)


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
        print(f"  ✗ {e}")
        return False


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
    print(f"   {len(players)} players loaded\n")

    # 2. Single bulk Wikidata query ────────────────────────────────────────────
    wikidata_rows = fetch_wikidata_cricketers()
    lookup = build_lookup(wikidata_rows)

    # 3. Match each player ─────────────────────────────────────────────────────
    results: dict[str, dict] = {}
    not_found: list[str]     = []
    multi_match: list[str]   = []

    for i, p in enumerate(players, 1):
        name = p["name"]
        label = f"[{i:>3}/{len(players)}] {name:<32} ({p['ipl_team']})"
        key = normalise(name)
        candidates = lookup.get(key, [])

        if not candidates:
            # Try matching on last name only as a fallback
            last = normalise(name.split()[-1])
            first = normalise(name.split()[0])
            candidates = [
                r for r in wikidata_rows
                if normalise(r["name"]).endswith(last)
                and normalise(r["name"]).startswith(first)
            ]

        if candidates:
            row = best_match(candidates, p["nationality"])
            pid = row["cricinfo_id"]
            had_multi = len(candidates) > 1
            if had_multi:
                multi_match.append(
                    f"{name}  →  id={pid}  ({row['name']}, {row['nationality']})  "
                    f"[{len(candidates)} candidates]"
                )
            print(f"{label}  ✓  id={pid}  ({row['name']})"
                  + ("  ⚠ multi" if had_multi else ""))
            results[name] = {
                "cricinfo_id": pid,
                "image_url":   cricinfo_image_url(pid),
                "found_name":  row["name"],
                "status":      "ok",
            }
        else:
            print(f"{label}  ✗  not found — fallback")
            not_found.append(name)
            results[name] = {
                "cricinfo_id": None,
                "image_url":   FALLBACK_URL,
                "found_name":  name,
                "status":      "not_found",
            }

    # 4. Summary ───────────────────────────────────────────────────────────────
    n_ok   = sum(1 for r in results.values() if r["status"] == "ok")
    n_miss = len(not_found)

    print(f"\n{'─'*62}")
    print(f"  ✓ Found       : {n_ok}")
    print(f"  ⚠ Multi-match : {len(multi_match)}  (auto-resolved by nationality/oldest ID)")
    print(f"  ✗ Not found   : {n_miss}")
    if multi_match:
        print("\n  Auto-resolved multi-match (verify if photos look wrong):")
        for line in multi_match:
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
        "-- Paste and run in Supabase SQL Editor",
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
    lines += ["", "-- Not found (no Wikipedia/Wikidata entry):"]
    for name in not_found:
        lines.append(f"-- {name}")
    if multi_match:
        lines += ["", "-- Auto-resolved multi-match (verify):"]
        for line in multi_match:
            lines.append(f"-- {line}")

    OUT_SQL.write_text("\n".join(lines), encoding="utf-8")
    print(f"✅  {OUT_SQL}")

    # 7. Optional download ────────────────────────────────────────────────────
    if args.download:
        import requests as _r  # noqa
        print(f"\n⬇   Downloading photos to {OUT_PHOTOS} …")
        for name, r in results.items():
            if r["image_url"] == FALLBACK_URL:
                continue
            dest = OUT_PHOTOS / (name.replace(" ", "_") + ".jpg")
            if dest.exists():
                continue
            print(f"   {name} … ", end="", flush=True)
            print("✓" if download_image(r["image_url"], dest) else "✗")
            time.sleep(0.3)

    print(
        f"\n{'─'*62}\n"
        f"Next steps:\n"
        f"  1. Supabase → SQL Editor → run {OUT_SQL.name}\n"
        f"  2. npm run dev  (restart the dev server)\n"
        f"  3. Player headshots load automatically\n"
    )


if __name__ == "__main__":
    main()
