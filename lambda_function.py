"""AWS Lambda entry point for small SEC HTML filing analyses."""
import json
from analyzer import analyze_html, sec_10k_url_for_company_year


def handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(204, {})
    if event.get("requestContext", {}).get("http", {}).get("method", "POST") != "POST":
        return response(405, {"error": "Only POST is supported."})
    try:
        payload = json.loads(event.get("body") or "{}")
        url = payload.get("url", "")
        if payload.get("company") and payload.get("year"):
            url = sec_10k_url_for_company_year(payload["company"], str(payload["year"]))
        if not url.startswith("https://"):
            return response(400, {"error": "Provide an HTTPS SEC filing URL or a company and fiscal year."})
        return response(200, analyze_html(url))
    except Exception as exc:
        return response(400, {"error": str(exc)})


def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, OPTIONS",
            "access-control-allow-headers": "content-type",
            "content-type": "application/json",
        },
        "body": "" if status == 204 else json.dumps(body),
    }
