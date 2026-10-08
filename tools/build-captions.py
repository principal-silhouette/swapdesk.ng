#!/usr/bin/env python3
"""Rebuild admin/captions/index.html from the Caption Engine artifact.

The engine lives in its own artifact, kept up to date by the engine agent. This copies it onto the
admin site without touching its logic. Only three things change:
  1. The page shell: SwapDesk Admin title, icons, a back link, and SwapDesk colours and fonts.
  2. getMcp(): instead of Claude's Google Sheets connector, the sheet is read through the admin
     endpoint (op "rows"), with the admin password saved on this phone.
  3. One message that only made sense inside Claude.
Usage: python3 tools/build-captions.py <engine.html>   (the artifact's full HTML, saved locally)
"""
import re, sys, pathlib

src = pathlib.Path(sys.argv[1]).read_text(encoding='utf-8')
root = pathlib.Path(__file__).resolve().parent.parent
endpoint = re.search(r"endpoint:\s*'([^']+)'", (root / 'js/config.js').read_text()).group(1)

# The artifact's own content: everything after the publish skeleton's <body>, up to </body>.
body = src.split('<body>', 1)[1].rsplit('</body>', 1)[0]
if 'function getMcp(){' not in body or 'window.SwapEngine' not in body:
    sys.exit('The engine page has changed shape: getMcp() or window.SwapEngine is missing. Look before publishing.')

ADAPTER = """function getMcp(){
  /* SwapDesk admin: read the sheet through the admin endpoint with the saved admin password. */
  var key='';try{key=localStorage.getItem('swapdesk.admin.key')||''}catch(e){}
  if(!key)return Promise.resolve(null);
  return Promise.resolve({callTool:function(server,tool,args){
    return fetch('%s',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'admin',key:key,op:'rows',range:args.range})})
      .then(function(r){return r.json()}).then(function(j){if(!j.ok)throw {code:'tool_error',message:j.error};return {payload:{values:j.values}}});
  }});
}""" % endpoint
body = re.sub(r"function getMcp\(\)\{.*?\n", ADAPTER + "\n", body, count=1)
body = body.replace('Refreshing only works when this page is open in Claude.', 'Open the admin site and sign in, then press Refresh.')

# Saved captions go to the "Captions" tab of the sheet (admin endpoint), so they show on any phone.
# The engine's own store (Claude's database, or this phone's storage) stays as the fallback.
if 'function initStore(){' in body:
    STORE = '''function sdAdmin(op,extra){
  var key='';try{key=localStorage.getItem('swapdesk.admin.key')||''}catch(e){}
  var payload={action:'admin',key:key,op:op};for(var k in extra)payload[k]=extra[k];
  return fetch('%s',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)})
    .then(function(r){return r.json()}).then(function(j){if(!j.ok)throw {code:j.code||'tool_error',message:j.error};return j});
}
function initStore(){
  var key='';try{key=localStorage.getItem('swapdesk.admin.key')||''}catch(e){}
  if(!key)return initStoreEngine();
  return sdAdmin('captions',{}).then(function(){
    var listener=null;
    function reload(){return sdAdmin('captions',{}).then(function(j){if(listener)listener(j.saves||[])})}
    return {kind:'sheet',
      load:function(cb,err){listener=cb;reload().catch(function(e){if(err)err(e)});return function(){listener=null}},
      add:function(rec){return sdAdmin('saveCaption',{rec:rec}).then(reload)},
      remove:function(id){return sdAdmin('deleteCaption',{id:id}).then(reload)}};
  }).catch(function(){return initStoreEngine()});
}
function initStoreEngine(){''' % endpoint
    body = body.replace('function initStore(){', STORE, 1)
else:
    print('Note: this engine version has no initStore(); saved captions keep the engine\'s own storage.')

SHELL_TOP = """<!doctype html>
<html lang="en-NG">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="../icons/icon.svg?v=2" type="image/svg+xml">
<link rel="apple-touch-icon" href="../icons/icon-180.png?v=2">
<meta name="theme-color" content="#F4F8FC" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E2238" media="(prefers-color-scheme: dark)">
</head>
<body>
"""
# SwapDesk look, laid over the engine's own tokens (built from the admin site's palette).
SKIN = """<style>
:root{--bg:#F4F8FC;--surface:#FFFFFF;--ink:#0E2238;--muted:#5B6F86;--line:#DCE6F1;--accent:#007BFF;--accent-ink:#FFFFFF;--accent-soft:#E6F1FD;
  --font-display:-apple-system,BlinkMacSystemFont,"SF Pro Display","Inter","Helvetica Neue",Arial,sans-serif;
  --font-body:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Helvetica Neue",Arial,sans-serif;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0E2238;--surface:#142D4A;--ink:#EAF2FB;--muted:#9DB3CB;--line:#24446A;--accent:#4DA3FF;--accent-ink:#06182B;--accent-soft:#1A3A5E;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0E2238;--surface:#142D4A;--ink:#EAF2FB;--muted:#9DB3CB;--line:#24446A;--accent:#4DA3FF;--accent-ink:#06182B;--accent-soft:#1A3A5E;color-scheme:dark}
body{margin:0;padding-top:calc(env(safe-area-inset-top,0px) + 12px)}
.step,.post,.opt,.card,.controls{border-radius:16px}
.btn{border-radius:12px}.btn.sm{border-radius:10px}
.sd-back{display:inline-flex;align-items:center;gap:8px;margin:0 auto 10px;max-width:860px;width:100%;font:600 14px var(--font-body);color:var(--accent);text-decoration:none}
.sd-back img{width:28px;height:28px;border-radius:7px}
</style>
<div class="wrap"><a class="sd-back" href="../"><img src="../icons/icon-180.png?v=2" alt="">‹ SwapDesk Admin</a></div>
"""
out = SHELL_TOP + body.replace('<title>SwapDesk Caption Engine</title>', '<title>SwapDesk Captions</title>', 1)
# The skin goes after the engine's own <style> so it wins.
i = out.index('<div class="wrap">')
out = out[:i] + SKIN + out[i:] + '\n</body>\n</html>\n'
dest = root / 'admin/captions/index.html'
dest.parent.mkdir(parents=True, exist_ok=True)
dest.write_text(out, encoding='utf-8')
print('Wrote', dest, len(out), 'bytes')
