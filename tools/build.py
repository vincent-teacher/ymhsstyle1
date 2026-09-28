# -*- coding: utf-8 -*-
"""
楊梅高中梅岡風 網站資料建置工具

把新的版面圖片放進「梅岡風」資料夾（檔名：梅岡風45期第1版.JPG），
再執行「更新網站.bat」（或 python tools/build.py），即會：
  1. 產生網頁用大圖與縮圖（img/web、img/thumb，WebP）
  2. 以 Windows 內建繁中 OCR 辨識全文，供站內全文檢索
  3. 重新產生 data/issues.js

已處理過且未變動的圖片會自動略過，只處理新增或更新的檔案。
每期的出刊日期、主題可在 data/meta.json 手動補充或修正。
"""
import json, os, re, subprocess, sys, tempfile, time, urllib.parse
from concurrent.futures import ProcessPoolExecutor
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.join(os.path.dirname(ROOT), '梅岡風')
WEB_W, THUMB_W, OCR_W = 2000, 420, 2600
NAME_RE = re.compile(r'梅岡風\s*第?\s*(\d+)\s*期\s*第?\s*(\d+)\s*版')
CJK = r'[㐀-鿿豈-﫿　-〿＀-￯]'


def scan():
    items = []
    for fn in os.listdir(SRC):
        m = NAME_RE.search(fn)
        path = os.path.join(SRC, fn)
        if not m or not os.path.isfile(path):
            continue
        st = os.stat(path)
        items.append(dict(issue=int(m.group(1)), page=int(m.group(2)), fn=fn, path=path,
                          sig=f'{st.st_size}-{int(st.st_mtime)}'))
    items.sort(key=lambda x: (x['issue'], x['page']))
    return items


def key_of(it):
    return f"{it['issue']:03d}-{it['page']:02d}"


def convert(job):
    it, out_web, out_thumb, out_ocr = job
    im = Image.open(it['path'])
    im.load()
    im = im.convert('RGB')
    w, h = im.size
    web = im.resize((WEB_W, round(h * WEB_W / w)), Image.LANCZOS) if w > WEB_W else im
    web.save(out_web, 'WEBP', quality=80, method=4)
    web.resize((THUMB_W, round(web.height * THUMB_W / web.width)), Image.LANCZOS).save(out_thumb, 'WEBP', quality=78)
    if out_ocr:
        g = im.convert('L')
        if w > OCR_W:
            g = g.resize((OCR_W, round(h * OCR_W / w)), Image.LANCZOS)
        g.save(out_ocr, 'PNG')
    return key_of(it), web.size


ZH_NUM = {'一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10}


def zh2int(t):
    if t.isdigit():
        return int(t)
    if t == '十':
        return 10
    if t.startswith('十'):
        return 10 + ZH_NUM.get(t[1:], 0)
    if t.endswith('十'):
        return ZH_NUM.get(t[0], 0) * 10
    if '十' in t:
        x, y = t.split('十', 1)
        return ZH_NUM.get(x, 0) * 10 + ZH_NUM.get(y, 0)
    return ZH_NUM.get(t, 0)


def clean(t):
    t = re.sub(rf'(?<={CJK})\s+(?={CJK})', '', t)
    t = re.sub(rf'(?<={CJK})\s+(?=[0-9A-Za-z])|(?<=[0-9A-Za-z])\s+(?={CJK})', '', t)
    for a, b in ((' , ', '，'), (' ; ', '；'), (' ! ', '！'), (' ? ', '？'), (' : ', '：'), ('( ', '（'), (' )', '）')):
        t = t.replace(a, b)
    t = re.sub(r'\s*([，；！？：])\s*', r'\1', t)
    return t.strip(' ,')


def cjk_len(t):
    return len(re.findall(r'[㐀-鿿]', t))


PAGE_RE = re.compile(r'第([一二三四五六七八九十]{1,2})版')
SKIP_HEAD = re.compile(r'梅岡風|月號|第[一二三四五六七八九十]+版|發行|校址|總編輯|http|TEL|中華民國|星期|^(學校要聞|藝智園|生活與休閒|擲地有聲|多元學習)$')
PURE_CJK = re.compile(r'^[㐀-鿿]{2,8}$')


def analyse(ocr):
    lines = [dict(t=clean(l['t']), h=l['h'], b=l['b']) for l in ocr.get('lines', []) if l.get('t')]
    lines = [l for l in lines if l['t']]
    for l in lines:
        l['t'] = re.sub(r'(?<=\d) (?=\d)', '', l['t'])
    # 版名：找「第X版」，取同一行其餘文字或相鄰的短標籤
    section = ''
    top = lines[:15]
    for i, l in enumerate(top):
        t = l['t'].replace(' ', '')
        m = PAGE_RE.search(t)
        if not m or len(t) > 14:
            continue
        rest = (t[:m.start()] + t[m.end():]).strip('•·|/ ')
        opts = [rest] + [top[j]['t'].replace(' ', '') for j in (i + 1, i - 1) if 0 <= j < len(top)]
        section = next((o for o in opts if PURE_CJK.match(o) and '年' not in o and '月' not in o), '')
        break
    hs = sorted(l['h'] for l in lines if cjk_len(l['t']) >= 2) or [1]
    med = hs[len(hs) // 2]

    def pick(ratio):
        cand = []
        for l in lines:
            t = re.sub(r'^[\W_]+|[\W_]+$', '', l['t'])
            n = cjk_len(t)
            if l['h'] >= med * ratio and 4 <= n <= 26 and n / max(1, len(t)) > 0.7 and not SKIP_HEAD.search(t) and t != section:
                cand.append((l['h'], l['b'][1], t))
        return cand
    cand = pick(1.8)
    if len(cand) < 2:
        cand = pick(1.35)
    cand.sort(key=lambda c: -c[0])
    heads, seen = [], set()
    for h, y, t in cand:
        if t not in seen and not any(t in s or s in t for s in seen):
            heads.append((y, t)); seen.add(t)
        if len(heads) >= 6:
            break
    heads = [t for y, t in sorted(heads)]
    W, H = max(1, ocr.get('w', 1)), max(1, ocr.get('hgt', 1))
    boxes = [[l['t'], round(l['b'][0] * 1000 / W), round(l['b'][1] * 1000 / H),
              round(l['b'][2] * 1000 / W), round(l['b'][3] * 1000 / H)] for l in lines]
    return section, heads, boxes


def find_date(text):
    t = text.replace(' ', '')
    m = re.search(r'((?:19|20)\d{2})年([一二三四五六七八九十]{1,3}|\d{1,2})月號', t)
    if m:
        mo = zh2int(m.group(2))
        if 1 <= mo <= 12:
            return f'{m.group(1)}年{mo}月', int(m.group(1)) * 100 + mo
    m = re.search(r'中華民國(\d{2,3})年(\d{1,2})月', t)
    if m and 80 <= int(m.group(1)) <= 150 and 1 <= int(m.group(2)) <= 12:
        y = int(m.group(1)) + 1911
        return f'{y}年{int(m.group(2))}月', y * 100 + int(m.group(2))
    return '', 0


def main():
    t0 = time.time()
    if not os.path.isdir(SRC):
        sys.exit(f'找不到圖片資料夾：{SRC}')
    for d in ('img/web', 'img/thumb', 'data/ocr'):
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
    cache_fn = os.path.join(ROOT, 'data', 'cache.json')
    cache = json.load(open(cache_fn, encoding='utf-8')) if os.path.exists(cache_fn) else {}
    items = scan()
    print(f'來源：{SRC}\n找到 {len(items)} 張版面圖片')

    tmp = tempfile.mkdtemp(prefix='mgf_')
    jobs = []
    for it in items:
        k = key_of(it)
        web = os.path.join(ROOT, 'img', 'web', k + '.webp')
        thumb = os.path.join(ROOT, 'img', 'thumb', k + '.webp')
        ocrj = os.path.join(ROOT, 'data', 'ocr', k + '.json')
        c = cache.get(k, {})
        fresh = c.get('sig') == it['sig'] and os.path.exists(web) and os.path.exists(thumb)
        need_ocr = not (c.get('sig') == it['sig'] and os.path.exists(ocrj))
        if not fresh or need_ocr:
            jobs.append((it, web, thumb, os.path.join(tmp, k + '.png') if need_ocr else None))
    print(f'需要處理：{len(jobs)} 張')

    if jobs:
        with ProcessPoolExecutor(max_workers=max(1, min(8, (os.cpu_count() or 2) - 1))) as ex:
            for i, (k, size) in enumerate(ex.map(convert, jobs), 1):
                cache.setdefault(k, {})['size'] = list(size)
                print(f'  圖片 {i}/{len(jobs)} {k}', flush=True)
        ocr_jobs = [(j[3], os.path.join(ROOT, 'data', 'ocr', key_of(j[0]) + '.json')) for j in jobs if j[3]]
        if ocr_jobs:
            lst = os.path.join(tmp, 'list.txt')
            with open(lst, 'w', encoding='utf-8') as f:
                f.write('\n'.join(f'{a}\t{b}' for a, b in ocr_jobs))
            print(f'OCR 辨識 {len(ocr_jobs)} 張（Windows 內建繁中 OCR）…', flush=True)
            ps = os.path.join(ROOT, 'tools', 'ocr.ps1')
            p = subprocess.Popen(['powershell', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps, '-ListFile', lst],
                                 stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            for i, line in enumerate(p.stdout, 1):
                print(f'  OCR {i}/{len(ocr_jobs)} ' + line.decode('mbcs', 'replace').strip()[-60:], flush=True)
            p.wait()
        for j in jobs:
            cache[key_of(j[0])]['sig'] = j[0]['sig']
        json.dump(cache, open(cache_fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
        for fn in os.listdir(tmp):
            os.remove(os.path.join(tmp, fn))
        os.rmdir(tmp)

    meta_fn = os.path.join(ROOT, 'data', 'meta.json')
    meta = json.load(open(meta_fn, encoding='utf-8')) if os.path.exists(meta_fn) else {}
    issues = {}
    rel_src = os.path.relpath(SRC, ROOT).replace('\\', '/')
    for it in items:
        k = key_of(it)
        ocrj = os.path.join(ROOT, 'data', 'ocr', k + '.json')
        section, heads, boxes = ('', [], [])
        if os.path.exists(ocrj):
            section, heads, boxes = analyse(json.load(open(ocrj, encoding='utf-8-sig')))
        w, h = cache.get(k, {}).get('size', [WEB_W, 2778])
        iss = issues.setdefault(it['issue'], dict(no=it['issue'], pages=[]))
        iss['pages'].append(dict(p=it['page'], k=k, w=w, h=h, sec=section, heads=heads, L=boxes,
                                 orig=rel_src + '/' + urllib.parse.quote(it['fn'])))
    out = []
    for no in sorted(issues):
        iss = issues[no]
        m = meta.get(str(no), {})
        date, ym = '', 0
        for pg in iss['pages']:
            date, ym = find_date(''.join(b[0] for b in pg['L']))
            if date:
                break
        if m.get('date'):
            date = m['date']
            mm = re.search(r'((?:19|20)\d{2})\D+(\d{1,2})', date)
            ym = int(mm.group(1)) * 100 + int(mm.group(2)) if mm else ym
        iss.update(date=date, ym=ym, title=m.get('title', ''), note=m.get('note', ''))
        out.append(iss)
        meta.setdefault(str(no), dict(date='', title='', note=''))
    json.dump(meta, open(meta_fn, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    data = dict(generated=time.strftime('%Y-%m-%d %H:%M'), issues=out)
    with open(os.path.join(ROOT, 'data', 'issues.js'), 'w', encoding='utf-8') as f:
        f.write('/* 由 tools/build.py 自動產生，請勿手動修改；每期資訊請改 data/meta.json */\n')
        f.write('window.MGF_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    # 更新 index.html 中資料檔的版本號，避免瀏覽器快取舊資料
    idx = os.path.join(ROOT, 'index.html')
    if os.path.exists(idx):
        h = open(idx, encoding='utf-8').read()
        h2 = re.sub(r'data/issues\.js(\?v=\d+)?"', f'data/issues.js?v={int(time.time())}"', h)
        if h2 != h:
            open(idx, 'w', encoding='utf-8').write(h2)
    print(f'完成：{len(out)} 期、{len(items)} 版，耗時 {time.time() - t0:.0f} 秒')


if __name__ == '__main__':
    main()
