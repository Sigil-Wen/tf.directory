"""Check data/fellows.json and data/companies.json before a pull request merges.

Run from the repository root: python3 .github/scripts/check_data.py
Exits with status 1 and lists every problem found.
"""
import json
import os
import re
import sys
from datetime import date

SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
URL = re.compile(r"^https?://\S+$")
LINKEDIN = re.compile(r"^https://(www\.)?linkedin\.com/in/[^/?#\s]+/?$")
HANDLE = re.compile(r"^[A-Za-z0-9_]{1,15}$")
MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")
STATUSES = {"private", "public", "acquired", "defunct", "nonprofit", "protocol"}
CONFIDENCE = {"high", "medium", "low"}
BILLIONAIRE = {"current", "former"}
SECTORS = {
    "AI", "Bio & Health", "Consumer", "Crypto", "Education", "Energy & Climate", "Fintech",
    "Hardware & Deep Tech", "Investing", "Other", "Research", "Software & SaaS", "Space & Defense",
}

errors = []


def err(where, msg):
    errors.append(f"{where}: {msg}")


def load(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        err(path, f"could not be read as JSON ({e})")
        return None


def check_url(where, field, value, pattern=URL):
    if value is not None and (not isinstance(value, str) or not pattern.match(value)):
        err(where, f"{field} is not a valid link: {value!r}")


def check_sources(where, sources):
    if not isinstance(sources, list) or not sources:
        err(where, "needs at least one public source link in sources")
        return
    for s in sources:
        check_url(where, "a source", s)


def check_asset(where, field, path, folder):
    if path is None:
        return
    if not isinstance(path, str) or not path.startswith(folder) or not os.path.isfile(path):
        err(where, f"{field} points to a missing file: {path!r} (expected under {folder})")


def check_money(where, field, value):
    if value is not None and (not isinstance(value, (int, float)) or isinstance(value, bool) or value < 0):
        err(where, f"{field} must be a number of US dollars or null, got {value!r}")


def check_fellows(data):
    fellows = data.get("fellows") if isinstance(data, dict) else None
    if not isinstance(fellows, list):
        err("data/fellows.json", "must have a fellows list")
        return {}
    meta = data.get("meta", {})
    if meta.get("count") != len(fellows):
        err("data/fellows.json", f"meta.count is {meta.get('count')} but there are {len(fellows)} fellows")
    last_class = date.today().year + 1
    by_id = {}
    for i, f in enumerate(fellows):
        fid = f.get("id")
        where = f"fellow {fid or '#' + str(i)}"
        if not isinstance(fid, str) or not SLUG.match(fid):
            err(where, "id must be lowercase words joined by hyphens, like dylan-field")
        elif fid in by_id:
            err(where, "id is used by more than one fellow")
        else:
            by_id[fid] = f
        if not str(f.get("name") or "").strip():
            err(where, "name is missing")
        if not isinstance(f.get("class"), int) or not 2011 <= f["class"] <= last_class:
            err(where, f"class must be a year from 2011 to {last_class}, got {f.get('class')!r}")
        if f.get("sector") is not None and f["sector"] not in SECTORS:
            err(where, f"sector {f['sector']!r} is not one of: {', '.join(sorted(SECTORS))}")
        if f.get("confidence") not in CONFIDENCE:
            err(where, "confidence must be high, medium or low")
        if f.get("billionaire") is not None and f["billionaire"] not in BILLIONAIRE:
            err(where, "billionaire must be current, former or left out")
        if not isinstance(f.get("previous", []), list):
            err(where, "previous must be a list")
        x = f.get("x")
        if x is not None and (not isinstance(x, str) or not HANDLE.match(x.lstrip("@"))):
            err(where, f"x must be an X handle without the URL, got {x!r}")
        check_url(where, "linkedin", f.get("linkedin"), LINKEDIN)
        for field in ("companyUrl", "website", "billionaireSource"):
            check_url(where, field, f.get(field))
        check_asset(where, "photo", f.get("photo"), "assets/people/")
        check_sources(where, f.get("sources"))
    return by_id


def check_companies(data, fellows):
    companies = data.get("companies") if isinstance(data, dict) else None
    if not isinstance(companies, list):
        err("data/companies.json", "must have a companies list")
        return
    seen = set()
    for i, c in enumerate(companies):
        cid = c.get("id")
        where = f"company {cid or '#' + str(i)}"
        if not isinstance(cid, str) or not SLUG.match(cid):
            err(where, "id must be lowercase words joined by hyphens, like figma")
        elif cid in seen:
            err(where, "id is used by more than one company")
        seen.add(cid)
        if not str(c.get("name") or "").strip():
            err(where, "name is missing")
        if c.get("status") is not None and c["status"] not in STATUSES:
            err(where, f"status must be one of {', '.join(sorted(STATUSES))} or null")
        if c.get("sector") is not None and c["sector"] not in SECTORS:
            err(where, f"sector {c['sector']!r} is not one of: {', '.join(sorted(SECTORS))}")
        ids = c.get("fellows")
        if not isinstance(ids, list) or not ids:
            err(where, "fellows must list at least one fellow id")
            ids = []
        for fid in ids:
            if fid not in fellows:
                err(where, f"lists fellow {fid!r}, who is not in data/fellows.json")
        titles = c.get("titles") or {}
        if not isinstance(titles, dict):
            err(where, "titles must map fellow ids to titles")
            titles = {}
        for fid in titles:
            if fid not in ids:
                err(where, f"has a title for {fid!r}, who is not in its fellows list")
        for field in ("valuationUSD", "peakValuationUSD", "totalRaisedUSD"):
            check_money(where, field, c.get(field))
        for field in ("valuationDate", "peakDate"):
            if c.get(field) is not None and not MONTH.match(str(c[field])):
                err(where, f"{field} must look like 2025-08, got {c[field]!r}")
        if c.get("valuationUSD") and not c.get("valuationNote"):
            err(where, "a valuation needs a valuationNote saying what it is and when, like 'Last round · May 2026'")
        rounds = c.get("rounds")
        if rounds is not None:
            if not isinstance(rounds, list):
                err(where, "rounds must be a list")
                rounds = []
            last = ""
            for r in rounds:
                if not isinstance(r, dict) or not MONTH.match(str(r.get("date"))) or not str(r.get("round") or "").strip():
                    err(where, f"each round needs a date like 2025-10 and a round name, got {r!r}")
                    continue
                if r["date"] < last:
                    err(where, "rounds must be listed oldest first")
                last = r["date"]
                for field in ("valuationUSD", "raisedUSD"):
                    check_money(where, f"{r['round']} {field}", r.get(field))
                if not r.get("valuationUSD"):
                    err(where, f"{r['round']} needs a valuationUSD")
                check_url(where, f"{r['round']} source", r.get("source"))
                if not r.get("source"):
                    err(where, f"{r['round']} needs a source")
        check_url(where, "url", c.get("url"))
        check_asset(where, "logo", c.get("logo"), "assets/logos/")
        # A company with no figure can lean on its founders' sources; a valuation needs its own.
        if c.get("valuationUSD") or c.get("peakValuationUSD") or c.get("sources"):
            check_sources(where, c.get("sources"))


def main():
    fellows = check_fellows(load("data/fellows.json"))
    check_companies(load("data/companies.json"), fellows)
    if errors:
        print(f"Found {len(errors)} problem{'s' if len(errors) != 1 else ''} in the data:\n")
        for e in errors:
            print(f"- {e}")
        return 1
    print(f"Data looks good: {len(fellows)} fellows checked.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
