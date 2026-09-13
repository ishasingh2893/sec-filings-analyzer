"""AWS Lambda entry point for small PDF filing analyses."""
import base64
import json
import os
from analyzer import analyze_pdf


def handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method", "POST") != "POST":
        return response(405, {"error": "Only POST is supported."})
    try:
        body = event.get("body") or ""
        data = base64.b64decode(body) if event.get("isBase64Encoded") else body.encode()
        if len(data) > 6 * 1024 * 1024:
            return response(413, {"error": "PDF must be smaller than 6 MB."})
        path = "/tmp/report.pdf"
        with open(path, "wb") as output:
            output.write(data)
        return response(200, analyze_pdf(path))
    except Exception as exc:
        return response(400, {"error": str(exc)})
    finally:
        try:
            os.remove("/tmp/report.pdf")
        except FileNotFoundError:
            pass


def response(status, body):
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}

