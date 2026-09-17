"""Regex utilities for SEC HTML filing extraction."""
import re

__all__ = [
    "extract_business_section",
    "extract_first_number_after_label",
    "extract_first_number_between",
    "extract_inline_xbrl_fact",
    "extract_inline_xbrl_text",
    "extract_period_end_date",
    "extract_risk_factors_section",
    "extract_scale",
    "extract_title",
    "html_to_text",
    "looks_like_sec_filing",
    "remove_form_suffix",
]


def _strip_script_and_style_tags(html):
    # Matches complete script/style blocks so executable and CSS content is not included as filing text.
    return re.sub(r"<script[\s\S]*?</script>|<style[\s\S]*?</style>", " ", html, flags=re.I)


def _strip_hidden_elements(html):
    # Matches elements marked display:none so embedded metadata does not pollute the visible filing text.
    return re.sub(r"<([a-z][\w:-]*)\b[^>]*style=[\"'][^\"']*display\s*:\s*none[^\"']*[\"'][^>]*>[\s\S]*?</\1>", " ", html, flags=re.I)


def _strip_html_tags(html):
    # Matches any remaining HTML tag by finding text between opening and closing angle brackets.
    return re.sub(r"<[^>]+>", " ", html)


def _replace_html_spaces(text):
    # Matches common HTML non-breaking space encodings and converts them into normal spaces.
    return re.sub(r"&nbsp;|&#160;", " ", text, flags=re.I)


def _collapse_whitespace(text):
    # Matches runs of whitespace so line breaks, tabs, and repeated spaces become a single space.
    return re.sub(r"\s+", " ", text)


def html_to_text(html):
    text = _strip_script_and_style_tags(html)
    text = _strip_hidden_elements(text)
    text = _strip_html_tags(text)
    text = _replace_html_spaces(text)
    return _collapse_whitespace(text)


def looks_like_sec_filing(text):
    # Matches 10-Q, 10-K, or annual report language, allowing dash/en dash/space in form names.
    return re.search(r"10[-– ]?q\b|10[-– ]?k\b|annual report", text, re.I)


def extract_inline_xbrl_fact(html, namespace, tag):
    # Matches an inline-XBRL element with the requested name and captures its displayed value.
    return re.search(
        rf'<[^>]*name=["\'](?:{namespace}:)?{tag}["\'][^>]*>(?:<[^>]+>)*([\(\)-]?\d[\d,]*(?:\.\d+)?)',
        html,
        re.I,
    )


def extract_first_number_after_label(text, label):
    # Matches a text label followed by an optional dollar sign and captures the first table-style number after it.
    match = re.search(
        rf"{re.escape(label)}\s+\$?\s*(\(?-?\d[\d,]*(?:\.\d+)?\)?)",
        text,
        re.I,
    )
    return match.group(1) if match else ""


def extract_first_number_between(text, start_label, value_label, end_label=""):
    # Matches a bounded text section, then delegates to the label-number matcher inside that smaller section.
    start = re.search(re.escape(start_label), text, re.I)
    if not start:
        return ""
    section = text[start.end() :]
    if end_label:
        end = re.search(re.escape(end_label), section, re.I)
        if end:
            section = section[: end.start()]
    return extract_first_number_after_label(section, value_label)


def extract_business_section(text):
    # Matches Item 1. Business headings and captures text until the following Item 1A. Risk Factors heading.
    starts = re.finditer(r"\bItem\s+1[.\s:–-]+Business\b", text, re.I)
    sections = []
    for start in starts:
        section = text[start.end() :]
        end = re.search(r"\bItem\s+1A[.\s:–-]+Risk Factors\b", section, re.I)
        if end:
            section = section[: end.start()]
        sections.append(_collapse_whitespace(section).strip())
    return max(sections, key=len) if sections else ""


def extract_risk_factors_section(text):
    # Matches Item 1A. Risk Factors headings and captures text until Item 1B or the next numbered item.
    starts = re.finditer(r"\bItem\s+1A[.\s:–-]+Risk Factors\b", text, re.I)
    sections = []
    for start in starts:
        section = text[start.end() :]
        end = re.search(r"\bItem\s+(?:1B|2)[.\s:–-]+", section, re.I)
        if end:
            section = section[: end.start()]
        sections.append(_collapse_whitespace(section).strip())
    return max(sections, key=len) if sections else ""


def extract_inline_xbrl_text(html, namespace, tag):
    # Matches an inline-XBRL element with the requested name and captures all content before the closing tag.
    match = re.search(
        rf'name=["\'](?:{namespace}:)?{tag}["\'][^>]*>(.*?)</',
        html,
        re.I | re.S,
    )
    return _strip_html_tags(match.group(1)).strip() if match else ""


def extract_scale(html, namespace, tag):
    # Matches an inline-XBRL scale attribute for the requested fact and captures its integer exponent.
    return re.search(
        rf'name=["\'](?:{namespace}:)?{tag}["\'][^>]*scale=["\'](-?\d+)["\']',
        html,
        re.I,
    )


def extract_title(html):
    # Matches the page title element and captures its contents.
    match = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return _strip_html_tags(match.group(1)).strip() if match else ""


def extract_period_end_date(text):
    # Matches the "fiscal year ended" phrase and captures the following Month Day, Year date.
    match = re.search(r"fiscal year ended\s+([A-Z][a-z]+\s+\d{1,2},\s+\d{4})", text, re.I)
    return match.group(1) if match else ""


def remove_form_suffix(title):
    # Matches the SEC title suffix that starts with "(Form:" and removes it from the company name.
    return re.sub(r"\s+\(Form:.*$", "", title).strip()
