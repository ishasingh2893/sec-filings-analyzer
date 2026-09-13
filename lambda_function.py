"""AWS Lambda entry point for small PDF filing analyses."""
import json
from analyzer import analyze_html


def handler(event, context):
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
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}
