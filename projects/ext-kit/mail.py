import json,urllib.request,sys,re
c=json.load(open('/home/agent/workspace/.private/email.json'))
def rq(p,d=None,t=None):
    h={"Content-Type":"application/json"}
    if t:h["Authorization"]="Bearer "+t
    return json.load(urllib.request.urlopen(urllib.request.Request(c["api"]+p,data=json.dumps(d).encode() if d else None,headers=h)))
t=rq("/token",{"address":c["address"],"password":c["password"]})["token"]
ms=rq("/messages",t=t)["hydra:member"]
for m in ms[:int(sys.argv[1]) if len(sys.argv)>1 else 5]:
    full=rq("/messages/"+m["id"],t=t)
    print("==",m["from"]["address"],"|",m["subject"],"|",m["createdAt"]); print((full.get("text") or "")[:1500])
