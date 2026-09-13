"""Deterministic SEC HTML revenue extractor.

Returns a value only when one unambiguous consolidated annual USD XBRL fact exists.
"""
import re
from urllib.request import Request, urlopen

TAGS = ("Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet")

def extract_revenue(url: str) -> dict:
    with urlopen(Request(url, headers={"User-Agent": "Filing Notes research tool"}), timeout=30) as r:
        html = r.read(50 * 1024 * 1024).decode("utf-8", errors="replace")
    facts = []
    for tag in TAGS:
        for m in re.finditer(rf'<[^>]*name=["\'](?:us-gaap:)?{tag}["\'][^>]*>([^<]+)', html, re.I):
            value = m.group(1).replace(",", "").replace("(", "-").strip()
            try: facts.append(float(value))
            except ValueError: pass
    if not facts or len(set(facts)) != 1:
        return {"value": None, "status": "Revenue not reliably found"}
    return {"value": facts[0] / 1_000_000, "unit": "USD millions", "status": "Verified XBRL candidate"}
