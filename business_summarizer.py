"""Small extractive summarizer for 10-K Business sections."""
import html
import math
import re
from collections import Counter

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "has",
    "in",
    "into",
    "is",
    "it",
    "its",
    "of",
    "on",
    "or",
    "our",
    "that",
    "the",
    "their",
    "these",
    "this",
    "to",
    "was",
    "we",
    "with",
}

BOILERPLATE = (
    "fiscal year",
    "annual report",
    "form 10-k",
    "forward-looking",
    "table of contents",
)

RISK_BOILERPLATE = (
    "following summarizes",
    "accurately predict",
    "statements in this section",
    "not representations as to whether",
    "not representations as to",
    "additional risks",
    "not the only risks",
)

PRODUCT_SERVICE_TERMS = {
    "advertising",
    "accessories",
    "applications",
    "cards",
    "cloud",
    "computers",
    "consumer",
    "customers",
    "deposit",
    "deposits",
    "devices",
    "digital",
    "energy",
    "equipment",
    "hardware",
    "insurance",
    "line",
    "loans",
    "markets",
    "merchandise",
    "operations",
    "platform",
    "platforms",
    "products",
    "retail",
    "segments",
    "services",
    "software",
    "solutions",
    "smartphones",
    "subscriptions",
    "tablets",
    "technology",
    "vehicles",
    "wearables",
}

MAX_TEXTRANK_SENTENCES = 120


def summarize_business_section(text, sentence_count=4, max_chars=900):
    return _summarize_section(text, sentence_count, max_chars, BOILERPLATE, 8)


def summarize_risk_factors_section(text, sentence_count=4, max_chars=1000):
    block_summaries = _summarize_risk_blocks(text, sentence_count)
    if block_summaries:
        return _join_with_limit(block_summaries, max_chars)
    return _summarize_section(text, sentence_count, max_chars, BOILERPLATE + RISK_BOILERPLATE, 1_000_000, 0.38)


def summarize_products_services_section(text, sentence_count=4, max_chars=900):
    sentences = _candidate_sentences(text, BOILERPLATE)
    if not sentences:
        return ""
    scored = []
    for index, sentence in enumerate(sentences[:MAX_TEXTRANK_SENTENCES]):
        words = set(_words(sentence))
        term_score = len(words & PRODUCT_SERVICE_TERMS)
        heading_score = 2 if re.search(r"\b(products?|services?|segments?|solutions?|platforms?)\b", sentence, re.I) else 0
        phrase_score = 3 if re.search(r"\b(line of|provides?|offers?|sells?|products? and services?|principal business)\b", sentence, re.I) else 0
        risk_penalty = 3 if re.search(r"\b(competition|competitive|risk|adverse|litigation)\b", sentence, re.I) else 0
        score = term_score + heading_score + phrase_score - risk_penalty
        if score > 0:
            scored.append((score, -index, index, _clean_product_sentence(sentence)))
    if not scored:
        return ""
    ranked = sorted(scored, reverse=True)
    selected = sorted(ranked[:sentence_count], key=lambda item: item[2])
    return _join_with_limit([sentence for _, _, _, sentence in selected], max_chars)


def _clean_product_sentence(sentence):
    return re.sub(
        r"^[A-Z][A-Za-z& /-]{2,35}\s+(?=(?:The Company|We|Our)\b)",
        "",
        sentence,
    ).strip()


def _summarize_section(text, sentence_count, max_chars, boilerplate, position_half_life, diversity_threshold=None):
    sentences = _candidate_sentences(text, boilerplate)[:MAX_TEXTRANK_SENTENCES]
    if not sentences:
        return ""

    ranked = _textrank(sentences, position_half_life)
    vectors = [_sentence_vector(sentence) for sentence in sentences]
    selected = _select_sentences(ranked, vectors, sentence_count, diversity_threshold)
    selected = sorted(selected, key=lambda item: item[0])
    summary = ""
    for _, sentence in selected:
        candidate = f"{summary} {sentence}".strip()
        if summary and len(candidate) > max_chars:
            break
        summary = candidate
    return summary


def _summarize_risk_blocks(text, sentence_count):
    blocks = _risk_blocks(text)
    summaries = []
    for block in blocks:
        summary = _first_useful_sentence(block, BOILERPLATE + RISK_BOILERPLATE)
        if summary:
            summaries.append(summary)
        if len(summaries) == sentence_count:
            break
    return summaries


def _first_useful_sentence(text, boilerplate):
    sentences = _candidate_sentences(text, boilerplate)
    return sentences[0] if sentences else ""


def _risk_blocks(text):
    cleaned = _clean_text_for_risk_blocks(text)
    headings = list(
        re.finditer(
            r"(?:^|(?<=[.!?])\s+|\|\s+\d+\s+|\s+\d+\s+)([A-Z][A-Za-z,& /-]{3,80} Risks)\s+(?=[A-Z])",
            cleaned,
        )
    )
    blocks = []
    for index, heading in enumerate(headings):
        start = heading.end()
        end = headings[index + 1].start() if index + 1 < len(headings) else len(cleaned)
        block = cleaned[start:end].strip()
        if block:
            blocks.append(block)
    return blocks


def _join_with_limit(sentences, max_chars):
    summary = ""
    for sentence in sentences:
        candidate = f"{summary} {sentence}".strip()
        if summary and len(candidate) > max_chars:
            break
        summary = candidate
    return summary


def _candidate_sentences(text, boilerplate):
    cleaned = _clean_text(text)
    sentences = re.split(r"(?<=[.!?])\s+", cleaned)
    return [sentence for sentence in sentences if _is_useful_sentence(sentence, boilerplate)]


def _clean_text(text):
    text = html.unescape(text)
    text = _remove_page_markers(text)
    text = re.sub(r"\b(Company Background|Products|Services|Markets|Competition)\b", " ", text)
    text = re.sub(r"\b[A-Z][A-Za-z,& /-]+ Risks\s+(?=(?:The|If|Because|Changes|Adverse|Failure|The Company)\b)", " ", text)
    text = re.sub(r"\b([A-Za-z][A-Za-z0-9+]+)\s+\1\s+([®™]\s+)?is\b", r"\1 \2is", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _clean_text_for_risk_blocks(text):
    text = html.unescape(text)
    text = _remove_page_markers(text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _remove_page_markers(text):
    return re.sub(r"\b[A-Z][A-Za-z .,&'-]{1,80}\s+\|\s+\d{4}\s+Form\s+10-K\s+\|\s+\d+\b", " ", text)


def _is_useful_sentence(sentence, boilerplate):
    words = _words(sentence)
    if len(words) < 8 or len(sentence) > 350:
        return False
    if not re.match(r"[A-Z0-9\"'“‘(]", sentence):
        return False
    lower = sentence.lower()
    return not any(phrase in lower for phrase in boilerplate)


def _textrank(sentences, position_half_life):
    vectors = [_sentence_vector(sentence) for sentence in sentences]
    centroid = _centroid(vectors)
    count = len(sentences)
    scores = [1.0] * count

    for _ in range(20):
        next_scores = [0.15] * count
        for i in range(count):
            links = [(j, _cosine(vectors[i], vectors[j])) for j in range(count) if i != j]
            total_weight = sum(weight for _, weight in links)
            if total_weight == 0:
                continue
            for j, weight in links:
                next_scores[j] += 0.85 * scores[i] * weight / total_weight
        scores = next_scores

    ranked = sorted(
        enumerate(sentences),
        key=lambda item: (
            (scores[item[0]] + _cosine(vectors[item[0]], centroid)) * _position_weight(item[0], position_half_life),
            -item[0],
        ),
        reverse=True,
    )
    return ranked


def _sentence_vector(sentence):
    return Counter(word for word in _words(sentence) if word not in STOPWORDS)


def _words(sentence):
    return re.findall(r"[a-z][a-z0-9-]{2,}", sentence.lower())


def _cosine(left, right):
    common = set(left) & set(right)
    numerator = sum(left[word] * right[word] for word in common)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    return numerator / (left_norm * right_norm) if left_norm and right_norm else 0


def _centroid(vectors):
    centroid = Counter()
    for vector in vectors:
        centroid.update(vector)
    return centroid


def _select_sentences(ranked, vectors, sentence_count, diversity_threshold):
    if diversity_threshold is None:
        return ranked[:sentence_count]
    selected = []
    for index, sentence in ranked:
        if all(_cosine(vectors[index], vectors[other_index]) < diversity_threshold for other_index, _ in selected):
            selected.append((index, sentence))
        if len(selected) == sentence_count:
            break
    return selected or ranked[:sentence_count]


def _position_weight(index, half_life):
    return 0.5 ** (index / half_life)
