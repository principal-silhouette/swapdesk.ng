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

# The device list in step 1 uses SwapDesk's own format (the price list's look), not the engine's.
# Only the display changes: the same items, filters, search and selection as the engine.
PICKER = r"""function renderPicker(){
  /* SwapDesk format: one card per model, storage in bold, SIM version and condition underneath, price on the right. */
  var box=$('picklist');box.textContent='';
  var s=shown();
  var COND={'Brand New':'Brand New','Active':'Active Brand New','UK Used':'Foreign USED'};
  var CORD={'Brand New':0,'Active':1,'UK Used':2};
  var SIMS=['P+eSIM','Dual SIM','eSIM Only','Physical SIM'];
  function gb(st){var m=String(st||'').match(/(\d+(?:\.\d+)?)\s*(tb|gb)/i);return m?parseFloat(m[1])*(m[2].toLowerCase()==='tb'?1024:1):0}
  function sim(name,st){
    var m=String(st||'').match(/^\s*(\d+(?:\.\d+)?\s*(?:tb|gb))\s*(.*)$/i);
    var size=m?m[1]:String(st||''),x=(m?m[2]:'').trim()
      .replace(/^p\s*[\/+]\s*esim$/i,'P+eSIM').replace(/^esim\s*only$/i,'eSIM Only').replace(/^dual\s*sim$/i,'Dual SIM');
    if(!x&&/^iphone\b/i.test(name||''))x=/\bAir\b/i.test(name)?'eSIM Only':/^iphone (7|8|x)\b(?! ?[rs])/i.test(name)?'Physical SIM':'P+eSIM';
    return [size,x];
  }
  function title(t){return String(t||'').replace(/[A-Za-z][\w'’-]*/g,function(w,at){if(/[A-Z]/.test(w.slice(1)))return w;return at>0&&/^(and|with|of|on|in|a|an|the|or|for|to)$/i.test(w)?w.toLowerCase():w[0].toUpperCase()+w.slice(1)})}
  function row(item,top,sub,val,extra){
    var inp=pickBox(item);
    var main=h('span',{class:'sd-main'},[]);
    if(extra)main.appendChild(extra);
    main.appendChild(h('b',{class:'sd-st',text:top}));
    if(sub)main.appendChild(h('span',{class:'sd-sub',text:sub}));
    return h('label',{class:'sd-row'},[main,h('span',{class:'sd-val',text:val}),inp]);
  }
  function card(titleText,rows){var c=h('div',{class:'sd-card'},[h('p',{class:'sd-t',text:titleText})]);rows.forEach(function(r){c.appendChild(r)});return c}
  /* deals */
  if(s.deal.length){
    box.appendChild(h('div',{class:'ph2',text:'Deals'}));
    s.deal.forEach(function(d){
      var p=sim(d.model,d.storage),st=d.std;
      var note=[p[1],d.diff?title(d.diff):''].filter(Boolean).join(' · ');
      if(st&&st.save>0)note+=(note?' · ':'')+naira(st.save)+' less than '+st.primaryLabel;
      box.appendChild(card(d.model,[row({kind:'deal',id:d.id},p[0]||d.model,note,naira(d.price),h('span',{class:'sd-tag',text:'One unit'}))]));
    });
  }
  /* phones for sale: one card per model */
  if(s.sale.length){
    box.appendChild(h('div',{class:'ph2',text:'Phones For Sale'}));
    var groups={},ord=[];
    s.sale.forEach(function(t){if(!groups[t.name]){groups[t.name]=[];ord.push(t.name)}groups[t.name].push(t)});
    ord.sort(function(a,b){var ra=groups[a][0].rank,rb=groups[b][0].rank;if(ra<0&&rb<0)return a<b?-1:1;if(ra<0)return 1;if(rb<0)return -1;return rb-ra});
    ord.forEach(function(n){
      var list=groups[n].slice().sort(function(a,b){
        var sa=sim(a.name,a.storage),sb=sim(b.name,b.storage);
        return gb(b.storage)-gb(a.storage)||SIMS.indexOf(sa[1])-SIMS.indexOf(sb[1])||(CORD[a.cond]||9)-(CORD[b.cond]||9);
      });
      box.appendChild(card(n,list.map(function(t){
        var p=sim(t.name,t.storage);
        return row({kind:'sale',id:t.id},p[0],[p[1],COND[t.cond]||t.cond].filter(Boolean).join(' · '),naira(t.price));
      })));
    });
  }
  /* nigerian used */
  if(s.source.length){
    box.appendChild(h('div',{class:'ph2',text:'Nigerian Used'}));
    var sg={},so=[];
    s.source.forEach(function(x){var n=E.srcDisplay(x);if(!sg[n]){sg[n]=[];so.push(n)}sg[n].push(x)});
    so.sort();
    so.forEach(function(n){
      var list=sg[n].slice().sort(function(a,b){return gb(b.storage)-gb(a.storage)});
      box.appendChild(card(n,list.map(function(x){return row({kind:'source',id:x.id},x.storage,'Trade-In Value',naira(x.ti))})));
    });
  }
  if(!s.sale.length&&!s.source.length&&!s.deal.length){
    box.appendChild(h('p',{class:'empty',text:filter==='deal'&&!availDeals().length?'No deals are marked Available in the sheet right now.':'Nothing matches. Try a shorter search.'}));
  }
  upd();
}
function renderPickerEngine(){"""
NEED = ['function renderPicker(){', 'function shown(){', 'function pickBox(', 'E.srcDisplay(', 'function availDeals(']
if all(n in body for n in NEED):
    body = body.replace('function renderPicker(){', PICKER, 1)
else:
    print('Note: the engine\'s device list changed shape; keeping the engine\'s own device list. Check before publishing.')

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
/* Device list in SwapDesk's format */
.picklist{gap:12px}
.picklist>*{flex:none}
.picklist{max-height:62vh}
.sd-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;overflow:hidden}
.sd-t{margin:0;padding:12px 16px 6px;font:700 1rem var(--font-display);color:var(--ink)}
.sd-row{display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--line);cursor:pointer}
.sd-row:first-of-type{border-top:0}
.sd-row:has(input:checked){background:var(--accent-soft)}
.sd-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.sd-st{font-weight:700;font-size:1rem}
.sd-sub{font-size:.84rem;color:var(--muted)}
.sd-val{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.sd-row input{width:20px;height:20px;margin:0;flex:none;accent-color:var(--accent)}
.sd-tag{align-self:flex-start;font-size:.74rem;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--accent-soft);color:var(--accent);margin-bottom:2px}
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
