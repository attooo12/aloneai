# Test server: /stock returns "SOLD OUT" for the first 3 requests, then "IN STOCK". /reset resets, /hits returns count.
# /flaky: "waiting"; after /down it drops every connection (browser error page); after /up it says "ONLINE".
# /spa renders "SOLD OUT" 1.2s after load. /framed shows /inner in a same-origin iframe ("SOLD OUT" twice, then
# "IN STOCK"). /nbsp: "In&nbsp;stock". /hidden: "In stock" only in a hidden element. /slowimg never finishes
# loading (an image that never arrives); "IN STOCK" from the 2nd request on.
import sys, json, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
state = {"stock": 0, "count": 0, "flaky": 0, "down": False, "was_down": False, "spa": 0, "inner": 0, "slow": 0}
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
        elif p == "/spa":
            state["spa"] += 1
            self.send("<!doctype html><title>SPA</title><div id=app>Loading</div><script>addEventListener('load', () => setTimeout(() => { document.getElementById('app').textContent = 'SOLD OUT'; }, 1200));</script>")
        elif p == "/framed":
            self.send("<!doctype html><title>Framed</title><h1>Booking</h1><iframe src=/inner></iframe>")
        elif p == "/inner":
            state["inner"] += 1
            self.send(f"<!doctype html><p>{'SOLD OUT' if state['inner'] <= 2 else 'IN STOCK'}</p>")
        elif p == "/nbsp":
            self.send("<!doctype html><title>Nbsp</title><p>In&nbsp;stock</p><p>Ships<br>  today</p>")
        elif p == "/hidden":
            self.send("<!doctype html><title>Hidden</title><div id=b><span style='display:none'>In stock</span></div><p>Sold out</p>")
        elif p == "/slowimg":
            state["slow"] += 1
            self.send(f"<!doctype html><title>Slow</title><p>{'SOLD OUT' if state['slow'] <= 1 else 'IN STOCK'}</p><img src=/never>")
        elif p == "/never":
            time.sleep(600)
        elif p == "/count":
            state["count"] += 1
            self.send(f"<!doctype html><title>Counter</title><p>visit {state['count']}</p>")
        elif p == "/reset":
            state.update(stock=0, count=0, flaky=0, down=False, was_down=False, spa=0, inner=0, slow=0); self.send("ok", "text/plain")
        elif p == "/hits":
            self.send(json.dumps(state), "application/json")
        else:
            self.send_response(404); self.end_headers()
ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
