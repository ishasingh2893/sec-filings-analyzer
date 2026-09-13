"""Focused, rule-based PDF filing extraction for Lambda."""
import re
from urllib.request import Request, urlopen
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


def analyze_html(url):
    request = Request(url, headers={"User-Agent": "Filing Notes research tool contact@example.com"})
    with urlopen(request, timeout=20) as response:
        html = response.read(12 * 1024 * 1024).decode("utf-8", errors="replace")
    text = re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"&nbsp;|&#160;", " ", text, flags=re.I)
    text = re.sub(r"\s+", " ", text)
    if not re.search(r"10[-– ]?q\b|10[-– ]?k\b|annual report", text, re.I):
        raise ValueError("The URL does not appear to be an SEC 10-Q or 10-K filing.")
    company_match=re.search(r"name=[\"'](?:dei:)?EntityRegistrantName[\"'][^>]*>(.*?)</", html, re.I|re.S); company=(re.sub(r"<[^>]+>","",company_match.group(1)).strip() if company_match else ""); period_match=re.search(r"name=[\"'](?:dei:)?DocumentPeriodEndDate[\"'][^>]*>(.*?)</", html, re.I|re.S); period=(re.sub(r"<[^>]+>","",period_match.group(1)).strip() if period_match else ""); metric_tags={"revenue":["Revenues","RevenueFromContractWithCustomerExcludingAssessedTax","SalesRevenueNet"],"net_income":["NetIncomeLoss","ProfitLoss"],"operating_cash_flow":["NetCashProvidedByUsedInOperatingActivities"],"cash":["CashAndCashEquivalentsAtCarryingValue"],"long_term_debt":["LongTermDebtNoncurrent","LongTermDebt"],"shares":["WeightedAverageNumberOfDilutedSharesOutstanding"]}; metrics={};`n    for key,tags in metric_tags.items():`n        found=None`n        for tag in tags:`n            m=re.search(rf"name=[\"'](?:us-gaap:)?{tag}[\"'][^>]*>([\(\)-]?\d[\d,]*(?:\.\d+)?)</",html,re.I)`n            if m:`n                value=float(m.group(1).replace(",","").replace("(","-")); scale_match=re.search(rf"name=[\"'](?:us-gaap:)?{tag}[\"'][^>]*scale=[\"'](-?\d+)[\"']",html,re.I); scale=int(scale_match.group(1)) if scale_match else 0; value=value*(10**scale)/1000000; found=value; break`n        metrics[key]=found`n    return {"company": company, "period": period, "metrics": metrics, "sections": {"document": text[:4000]}, "method": "SEC HTML inline-XBRL extraction"}
