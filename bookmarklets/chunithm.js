// CHUNITHM-NET 用データ取得スクリプト v0.2
// 使い方: https://new.chunithm-net.com/ にログインした状態で、どのページからでも
// DevToolsコンソールに全文貼り付けて実行（チュウニズムはfetchが通ることを確認済み）。
// レーティングは画像数字なのでファイル名から復元する。
// 譜面定数・ジャケットは楽曲情報API（reiwa.f5.si、非営利可）で補完。

(async () => {
  const VERSION = '0.2.0';
  const BASE = `${location.origin}/chuni-mobile/html/mobile`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // 定数DBは24時間localStorageキャッシュ（reiwa.f5.si の「過度なリクエスト禁止」への配慮）
  const dbFetch = async (url) => {
    const KEY = 'grc-db-cache:' + url;
    try {
      const c = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (c && Date.now() - c.t < 24 * 3600 * 1000) {
        console.log('[grc] 定数DBは24hキャッシュを使用');
        return c.d;
      }
    } catch { /* 壊れたキャッシュは無視 */ }
    const d = await (await fetch(url)).json();
    try {
      localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d }));
    } catch { /* 容量超過なら都度取得のまま */ }
    return d;
  };
  const fetchDoc = async (url) => {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`fetch失敗 ${res.status}: ${url}`);
    return new DOMParser().parseFromString(await res.text(), 'text/html');
  };

  // ---- ホーム: 名前と画像数字レーティング ----
  console.log('[chunithm] プレイヤーデータ取得中…');
  window.__grcProgress?.('プレイヤーデータ取得中…');
  const home = await fetchDoc(`${BASE}/home/`);
  const playerName = home.querySelector('.player_name_in')?.textContent.trim() ?? '(取得失敗)';
  let rating = 0;
  {
    // rating_<color>_<n>.png の並び。comma が小数点
    const imgs = home.querySelectorAll('.player_rating_num_block img');
    let s = '';
    for (const img of imgs) {
      const m = img.src.match(/rating_[a-z]+_(comma|\d+)\.png/);
      if (!m) continue;
      s += m[1] === 'comma' ? '.' : String(parseInt(m[1], 10));
    }
    rating = parseFloat(s) || 0;
  }
  await sleep(1500);

  // ---- ベスト枠30・新曲枠20 ----
  const DIFF_BY_INPUT = { 0: 'BASIC', 1: 'ADVANCED', 2: 'EXPERT', 3: 'MASTER', 4: 'ULTIMA' };
  const parseList = (doc) =>
    [...doc.querySelectorAll('.musiclist_box')].map((b) => ({
      title: b.querySelector('.music_title')?.textContent.trim() ?? '',
      difficulty:
        DIFF_BY_INPUT[b.querySelector('input[name="diff"]')?.value] ??
        (/bg_ultima/.test(b.className) ? 'ULTIMA' : /bg_master/.test(b.className) ? 'MASTER' : 'EXPERT'),
      level: 0,
      isConstant: false,
      score: parseInt(
        b.querySelector('.play_musicdata_highscore .text_b')?.textContent.replace(/,/g, '') ?? '0', 10) || 0,
      ratingValue: null,
      jacketUrl: null,
      _idx: b.querySelector('input[name="idx"]')?.value ?? null,
      _diff: b.querySelector('input[name="diff"]')?.value ?? null,
      _genre: b.querySelector('input[name="genre"]')?.value ?? '99',
      _token: b.querySelector('input[name="token"]')?.value ?? null,
    }));

  console.log('[chunithm] ベスト枠取得中…');
  window.__grcProgress?.('ベスト枠を取得中…');
  const best = parseList(await fetchDoc(`${BASE}/home/playerData/ratingDetailBest/`));
  if (best.length === 0) {
    alert('ベスト枠を取得できませんでした。\nCHUNITHM-NETのスタンダードコース（有料）未加入か、ログインが切れている可能性があります');
    return;
  }
  await sleep(1500);
  console.log('[chunithm] 新曲枠取得中…');
  window.__grcProgress?.('新曲枠を取得中…');
  let recent = [];
  try {
    recent = parseList(await fetchDoc(`${BASE}/home/playerData/ratingDetailRecent/`));
  } catch (e) {
    console.warn('[chunithm] 新曲枠取得失敗:', e.message);
  }

  // ---- 定数DB補完＋単曲レート計算 ----
  // 単曲レート式: SSS+(1,009,000)=定数+2.15 / SSS=+2.00 / SS+=+1.50 / SS=+1.00 /
  // S+=+0.60 / S=+0.00、境界間は線形補間（→ docs/specs.md）
  const singleRating = (c, s) => {
    if (s >= 1009000) return c + 2.15;
    if (s >= 1007500) return c + 2.0 + (s - 1007500) * 0.0001;
    if (s >= 1005000) return c + 1.5 + (s - 1005000) * 0.0002;
    if (s >= 1000000) return c + 1.0 + (s - 1000000) * 0.0001;
    if (s >= 990000) return c + 0.6 + (s - 990000) * 0.00004;
    if (s >= 975000) return c + (s - 975000) * 0.00004;
    // S未満にも正のレート値がある（AkashiSN/CHUNITHM-Rate-Calculator準拠の帯。
    // この帯＋「各曲2位切り捨て→合計/50→2位切り捨て」でNET表示と一致する。
    // 注: chunirecのS未満表示とは0.01ズレる例あり（原因未特定））
    if (s >= 950000) return c - 1.5 + ((s - 950000) * 3.0) / 50000;
    if (s >= 925000) return c - 3.0 + ((s - 925000) * 3.0) / 50000;
    if (s >= 900000) return c - 5.0 + ((s - 900000) * 4.0) / 50000;
    if (s >= 800000) return Math.max(0, c - 7.5 + ((s - 800000) * 1.25) / 50000);
    return 0;
  };
  const d3 = (d) => d.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  try {
    console.log('[chunithm] 譜面定数DB取得中…');
    window.__grcProgress?.('譜面定数DBを取得中…');
    const db = await dbFetch('https://reiwa.f5.si/chunithm_record.json');
    const byIdx = new Map();
    const byTitle = new Map();
    for (const r of db) {
      if (r.idx != null) byIdx.set(`${r.idx}|${d3(r.diff)}`, r);
      byTitle.set(`${r.title}|${d3(r.diff)}`, r);
    }
    for (const s of [...best, ...recent]) {
      const r = byIdx.get(`${s._idx}|${d3(s.difficulty)}`) ?? byTitle.get(`${s.title}|${d3(s.difficulty)}`);
      if (!r || typeof r.const !== 'number') continue;
      s.level = r.const;
      s.isConstant = true;
        s.constUnknown = !!(r.is_unknown ?? r.unknown);
      s._img = r.img;
      // 端数は四捨五入ではなく切り捨て（実データ検算でNET表示と完全一致。
      // 四捨五入だと0.01ズレる）
      s.ratingValue = Math.floor(singleRating(r.const, s.score) * 100) / 100;
    }
    best.sort((a, b) => (b.ratingValue ?? -1) - (a.ratingValue ?? -1));
    recent.sort((a, b) => (b.ratingValue ?? -1) - (a.ratingValue ?? -1));
  } catch (e) {
    console.warn('[chunithm] 定数DB取得失敗（定数なしで続行）:', e.message);
  }

  // ---- ジャケット ----
  // chunirecのimgハッシュはNET側のジャケットファイル名とは別物のため使えない。
  // 各曲の詳細ページ（sendMusicDetail、token付きPOST）から本物のジャケットURLを
  // 取り出し、<img>→同一オリジンcanvasでdata URL化する。
  console.log('[chunithm] ジャケット取得中…（曲詳細ページ経由、少し時間がかかります）');
  const imgToDataUrl = (src) =>
    new Promise((res) => {
      const img = new Image();
      const t = setTimeout(() => res(null), 8000);
      img.onload = () => {
        clearTimeout(t);
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          res(c.toDataURL('image/jpeg', 0.9));
        } catch (e) {
          console.warn('[chunithm] canvas変換失敗:', src, e.message);
          res(null);
        }
      };
      img.onerror = () => {
        clearTimeout(t);
        res(null);
      };
      img.src = src;
    });
  let loggedSample = false;
  const __jList = [...best, ...recent].filter((s) => s._idx && s._token);
  let __ji = 0;
  for (const s of [...best, ...recent]) {
    if (!s._idx || !s._token) continue;
    window.__grcProgress?.(`ジャケット取得中… ${++__ji}/${__jList.length}`);
    try {
      const res = await fetch(`${BASE}/record/musicGenre/sendMusicDetail/`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          diff: s._diff ?? '3', genre: s._genre, idx: s._idx, token: s._token,
        }).toString(),
      });
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
      // 詳細ページ内のジャケット: /mobile/img/ 配下でUI部品でない最初の画像
      const imgEl = [...doc.querySelectorAll('img')].find((i) => {
        const src = i.getAttribute('src') ?? '';
        return /\/mobile\/img\//.test(src) && !/icon|btn|bg_|rank|lamp/.test(src);
      });
      if (imgEl) {
        const url = new URL(imgEl.getAttribute('src'), location.origin).href;
        if (!loggedSample) {
          console.log('[chunithm] ジャケットURL例:', url);
          loggedSample = true;
        }
        s.jacketUrl = await imgToDataUrl(url);
      }
      if (!s.jacketUrl) console.warn('[chunithm] ジャケット失敗:', s.title);
    } catch (e) {
      console.warn('[chunithm] 詳細ページ取得失敗:', s.title, e.message);
    }
    await sleep(400);
  }

  const strip = (l) => l.map(({ _idx, _img, _diff, _genre, _token, ...s }) => s);
  const out = {
    game: 'chunithm',
    playerName,
    rating,
    fetchedAt: new Date().toISOString(),
    toolVersion: VERSION,
    best: strip(best),
    recent: strip(recent),
  };

  // 簡易チェックサム（気休めの抑止。コードを読める人には偽造可能 → docs/specs.md）
  const sigOf = (o) => {
    const src = JSON.stringify([o.game, o.playerName, o.rating, o.fetchedAt,
      ...['best', 'recent'].map((k) => (o[k] || []).map((s) => [s.title, s.difficulty, s.score, s.ratingValue]))
    ]) + ':gekichumai-rating-card:v1';
    let h = 5381;
    for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  };
  out.sig = sigOf(out);
  // ブックマークレット経由（統合版）ならツールのタブへ直接送信（ファイルレス）。
  // コンソール貼り付け等で送信手段が無い場合は従来どおりJSONをダウンロード。
  if (window.__grcSend && window.__grcSend(out)) {
    console.log('[%s] ツールへ直接送信しました（ファイル保存なし）', out.game);
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
  const d0 = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  a.download = `chunithm-${d0.getFullYear()}${p2(d0.getMonth() + 1)}${p2(d0.getDate())}-${p2(d0.getHours())}${p2(d0.getMinutes())}.json`;
  a.click();
  console.log('[chunithm] 完了:', out);
})();
