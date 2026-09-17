"""AWS Lambda entry point for small SEC HTML filing analyses."""
import json
from analyzer import analyze_html


def handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(204, {})
    if event.get("requestContext", {}).get("http", {}).get("method", "POST") != "POST":
        return response(405, {"error": "Only POST is supported."})
    try:
        payload = json.loads(event.get("body") or "{}")
        url = payload.get("url", "")
        if not url.startswith("https://"):
            return response(400, {"error": "Provide an HTTPS SEC filing URL."})
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
