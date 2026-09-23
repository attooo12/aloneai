import json, urllib.request, time
out=[]; off=0
while True:
    u=f"https://api.apify.com/v2/store?limit=1000&offset={off}"
    d=json.load(urllib.request.urlopen(u,timeout=60))["data"]
    items=d["items"]
    for it in items:
        s=it.get("stats",{}); p=it.get("currentPricingInfo") or {}
        r=s.get("publicActorRunStats30Days") or {}
        out.append(dict(id=it["id"],title=it.get("title"),name=it.get("name"),user=it.get("username"),
          desc=(it.get("description") or "")[:200],cats=it.get("categories"),
          u30=s.get("totalUsers30Days",0),u7=s.get("totalUsers7Days",0),u=s.get("totalUsers",0),
          runs=s.get("totalRuns",0),rating=s.get("actorReviewRating"),reviews=s.get("actorReviewCount"),
          ok30=r.get("SUCCEEDED",0),fail30=r.get("FAILED",0),tot30=r.get("TOTAL",0),
          model=p.get("pricingModel"),url=it.get("url")))
    off+=len(items)
    if not items or off>=d["total"]: break
json.dump(out,open("store.json","w"))
print(len(out), d["total"])
