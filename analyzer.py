"""Focused, rule-based PDF filing extraction for Lambda."""
import re
from pypdf import PdfReader

LABELS = {
    "revenue": r"(?:total\s+)?(?:revenue|revenues|net sales)",
    "net_income": r"net (?:income|earnings)",
    "operating_cash_flow": r"net cash .*operating activities",
    "cash": r"cash and cash equivalents",
    "long_term_debt": r"long[-– ]term debt",
}


def analyze_pdf(path):
    text = "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    if len(text.strip()) < 300:
        raise ValueError("Not enough readable text. Scanned PDFs need OCR first.")
    if not re.search(r"10[-– ]?k\b|annual report", text, re.I):
        raise ValueError("This does not appear to be a 10-K or annual report.")
    metrics = {}
    for key, label in LABELS.items():
        match = re.search(rf"{label}\s*\$?\s*([\(\)-]?\d[\d,]*(?:\.\d+)?)", text, re.I)
        metrics[key] = float(match.group(1).replace(",", "").replace("(", "-")) if match else None
    sections = {}
    for name, heading in (("business", r"Item\s+1[.\s:–-]+Business"), ("risk_factors", r"Item\s+1A[.\s:–-]+Risk Factors"), ("management_discussion", r"Item\s+7[.\s:–-]+Management")):
        found = re.search(rf"{heading}(.*?)(?=Item\s+\d+[A-Z]?[.\s:]|$)", text, re.I | re.S)
        if found:
            sections[name] = re.sub(r"\s+", " ", found.group(1)).strip()[:1200]
    return {"metrics": metrics, "sections": sections, "method": "PDF text extraction; figures require review"}

