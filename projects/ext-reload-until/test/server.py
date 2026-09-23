# Test server: /stock returns "SOLD OUT" for the first 3 requests, then "IN STOCK". /reset resets, /hits returns count.
import sys, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
state = {"stock": 0, "count": 0}
class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def send(self, body, ctype="text/html"):
        b = body.encode(); self.send_response(200)
        self.send_header("Content-Type", ctype); self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/stock":
            state["stock"] += 1
            txt = "SOLD OUT" if state["stock"] <= 3 else "IN STOCK"
            self.send(f"<!doctype html><title>Shop</title><h1>Widget</h1><p id=s>{txt}</p><p>req {state['stock']}</p>")
        elif p == "/count":
            state["count"] += 1
            self.send(f"<!doctype html><title>Counter</title><p>visit {state['count']}</p>")
        elif p == "/reset":
            state["stock"] = 0; state["count"] = 0; self.send("ok", "text/plain")
        elif p == "/hits":
            self.send(json.dumps(state), "application/json")
        else:
            self.send_response(404); self.end_headers()
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
