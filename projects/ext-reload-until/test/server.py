# Test server: /stock returns "SOLD OUT" for the first 3 requests, then "IN STOCK". /reset resets, /hits returns count.
# /flaky: "waiting"; after /down it drops every connection (browser error page); after /up it says "ONLINE".
import sys, json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
state = {"stock": 0, "count": 0, "flaky": 0, "down": False, "was_down": False}
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
        elif p == "/flaky":
            state["flaky"] += 1
            if state["down"]:
                self.close_connection = True; return
            txt = "ONLINE" if state["was_down"] else "waiting"
            self.send(f"<!doctype html><title>Status</title><p>{txt}</p>")
        elif p in ("/down", "/up"):
            state["down"] = p == "/down"; state["was_down"] = True; self.send("ok", "text/plain")
        elif p == "/count":
            state["count"] += 1
            self.send(f"<!doctype html><title>Counter</title><p>visit {state['count']}</p>")
        elif p == "/reset":
            state["stock"] = 0; state["count"] = 0; state["flaky"] = 0; state["down"] = False; state["was_down"] = False; self.send("ok", "text/plain")
        elif p == "/hits":
            self.send(json.dumps(state), "application/json")
        else:
            self.send_response(404); self.end_headers()
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
