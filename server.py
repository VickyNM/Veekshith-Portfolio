"""Local preview server for the portfolio.

Run:  python server.py        then open http://localhost:8000
Files are served with no-cache headers so edits to portfolio.yaml show up on refresh.
"""
import http.server
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


class Server(socketserver.TCPServer):
    allow_reuse_address = True


if __name__ == "__main__":
    with Server(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving on http://localhost:{PORT}  (Ctrl+C to stop)")
        httpd.serve_forever()
