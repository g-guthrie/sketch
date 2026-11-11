"""rd: client for the Retro Diffusion API (pixel-art generation).

The key is read from $RD_API_KEY or the file named by $RD_KEY_FILE; it is never
stored in the repository. Every paid call is appended to art/gen/ledger.jsonl
with its prompt, style, seed and cost, so any asset can be traced or regenerated.

    from rd import gen, animate, edit, credits
"""
import os, sys, json, time, uuid, base64, io
import requests
from PIL import Image

API = 'https://api.retrodiffusion.ai/v2'
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
RAW = os.path.join(ROOT, 'art', 'gen', 'raw')
LEDGER = os.path.join(ROOT, 'art', 'gen', 'ledger.jsonl')


def _key():
    k = os.environ.get('RD_API_KEY')
    if not k and os.environ.get('RD_KEY_FILE'):
        k = open(os.environ['RD_KEY_FILE']).read().strip()
    if not k:
        sys.exit('set RD_API_KEY or RD_KEY_FILE')
    return k


def H(extra=None):
    h = {'X-RD-Token': _key()}
    h.update(extra or {})
    return h


def b64(im):
    """PIL image or path -> raw base64 PNG. Transparent images are flattened onto
    a background colour, because the API wants RGB."""
    if isinstance(im, str):
        im = Image.open(im)
    b = io.BytesIO()
    im.save(b, 'PNG')
    return base64.b64encode(b.getvalue()).decode()


def flat(im, bg=(0, 255, 0)):
    im = im.convert('RGBA')
    o = Image.new('RGB', im.size, bg)
    o.paste(im, (0, 0), im)
    return o


def credits():
    return requests.get(f'{API}/inferences/credits', headers=H(), timeout=30).json()['balance']


def _log(rec):
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, 'a') as f:
        f.write(json.dumps(rec) + '\n')


def _save(name, images):
    os.makedirs(RAW, exist_ok=True)
    out = []
    for i, d in enumerate(images):
        raw = base64.b64decode(d)
        ext = 'gif' if raw[:3] == b'GIF' else 'png'
        p = os.path.join(RAW, f'{name}_{i}.{ext}' if len(images) > 1 else f'{name}.{ext}')
        open(p, 'wb').write(raw)
        out.append(p)
    return out


def cost(payload):
    r = requests.post(f'{API}/inferences', headers=H(), json={**payload, 'check_cost': True}, timeout=60)
    j = r.json()
    if 'task_id' in j:
        j = _poll(j['task_id'])
    return j.get('balance_cost', j)


def _poll(task_id, every=3, limit=600):
    t0 = time.time()
    while time.time() - t0 < limit:
        t = requests.get(f'{API}/inferences/tasks/{task_id}', headers=H(), timeout=60).json()
        if t.get('status') in ('pending', 'running', 'accepted', 'queued'):
            time.sleep(every)
            continue
        if t.get('status') == 'failed':
            raise RuntimeError(f"failed: {t.get('error')}")
        return t['result']
    raise RuntimeError('timed out polling ' + task_id)


def gen(name, prompt, style, w, h, n=1, **kw):
    """Paid generation. Saves outputs to art/gen/raw/<name>*.png and returns their paths."""
    payload = dict(prompt=prompt, prompt_style=style, width=w, height=h, num_images=n, **kw)
    idem = str(uuid.uuid4())
    r = requests.post(f'{API}/inferences', headers=H({'Idempotency-Key': idem}), json=payload, timeout=120)
    j = r.json()
    if r.status_code >= 400:
        raise RuntimeError(f'{r.status_code}: {json.dumps(j)[:400]}')
    res = _poll(j['task_id']) if 'task_id' in j else j
    paths = _save(name, res.get('base64_images', []))
    _log(dict(name=name, prompt=prompt, style=style, w=w, h=h, n=n, cost=res.get('balance_cost'),
              left=res.get('remaining_balance'), files=[os.path.basename(p) for p in paths],
              extra={k: (v if not isinstance(v, (str, list)) or len(str(v)) < 80 else '<image>') for k, v in kw.items()}))
    print(f"{name}: ${res.get('balance_cost')}  left ${res.get('remaining_balance')}  -> {len(paths)} file(s)")
    return paths


def edit(name, tool, **body):
    """Canvas edit tool (inpainting, image_edit, outpainting, ...). Result may come back as a URL."""
    r = requests.post(f'{API}/edit/tools/{tool}/tasks', headers=H(), json={**body, 'custom_id': str(uuid.uuid4())}, timeout=120)
    j = r.json()
    if r.status_code >= 400:
        raise RuntimeError(f'{r.status_code}: {json.dumps(j)[:400]}')
    tid = j['task_id']
    t0 = time.time()
    while True:
        t = requests.get(f'{API}/edit/tasks/{tid}', headers=H(), timeout=60).json()
        if t.get('status') == 'succeeded':
            break
        if t.get('status') == 'failed':
            raise RuntimeError(f"failed: {t.get('error')}")
        if time.time() - t0 > 600:
            raise RuntimeError('edit timed out')
        time.sleep(3)
    res = t.get('result', t)
    imgs = res.get('base64_images') or []
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, name + '.png')
    if imgs:
        open(p, 'wb').write(base64.b64decode(imgs[0]))
    else:
        open(p, 'wb').write(requests.get(res['output_urls'][0], timeout=120).content)
    _log(dict(name=name, tool=tool, prompt=body.get('prompt'), cost=res.get('balance_cost'), left=res.get('remaining_balance'), files=[name + '.png']))
    print(f"{name}: ${res.get('balance_cost')}  left ${res.get('remaining_balance')}")
    return p
