"""Local CORS-enabled HTTP server for testing the analyzer from the frontend."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer

from analyzer import analyze_html


class AnalyzerHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._send_json(204, {})

    def do_POST(self):
        try:
            length = int(self.headers.get("content-length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            url = payload.get("url", "")
            if not url.startswith("https://"):
                self._send_json(400, {"error": "Provide an HTTPS SEC filing URL."})
                return
            self._send_json(200, analyze_html(url))
        except Exception as exc:
            self._send_json(400, {"error": str(exc)})

    def log_message(self, format, *args):
        return

    def _send_json(self, status, body):
        data = b"" if status == 204 else json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("access-control-allow-origin", "*")
        self.send_header("access-control-allow-methods", "POST, OPTIONS")
        self.send_header("access-control-allow-headers", "content-type")
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        if data:
            self.wfile.write(data)


if __name__ == "__main__":
    server = HTTPServer(("localhost", 8000), AnalyzerHandler)
    print("Local analyzer server running at http://localhost:8000/")
    server.serve_forever()
