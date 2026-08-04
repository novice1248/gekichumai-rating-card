// オンゲキNET 用データ取得スクリプト v0.2
// 使い方: https://ongeki-net.com/ongeki-mobile/home/ratingTargetMusic/
// （ホーム→レーティング対象曲）を開いた状態で、DevToolsコンソールに全文貼り付けて実行。
// ※ maimaiと同じくfetchは /error/ に飛ばされるため、開いているページのDOMを直接解析。
// セクションは見出し画像（title_ratingmusic_*.png）で判別する。

(async () => {
  const VERSION = '0.2.0';
  if (!location.pathname.includes('ratingTargetMusic')) {
    alert('レーティング対象曲ページ（ホーム→レーティング対象曲）を開いてから実行してください\n※このページの閲覧にはオンゲキNETのプレミアムコース（有料）加入が必要です');
    return;
  }
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

  // ---- プレイヤー情報 ----
  const playerName = document.querySelector('.name_block span')?.textContent.trim() ?? '(取得失敗)';
  const rating = parseFloat(
    document.querySelector('.rating_field span')?.textContent.replace(/[^\d.]/g, '') ?? '0') || 0;

  // ---- セクション（見出し画像）ごとに曲ブロックを回収 ----
  // bestnew=新曲枠 / best=ベスト枠 / new_platinum=プラチナ枠 / new_next_*=候補（スキップ）
  const buckets = { recent: [], best: [], platinum: [] };
  let section = null;
  const nodes = document.querySelectorAll('img[src*="title_ratingmusic"], [class*="_score_back"]');
  for (const el of nodes) {
    if (el.tagName === 'IMG') {
      const src = el.src;
      section = src.includes('new_next') ? null
        : src.includes('bestnew') ? 'recent'
        : src.includes('platinum') ? 'platinum'
        : src.includes('ratingmusic_best') ? 'best' : null;
      continue;
    }
    if (!section) continue;
    const cls = el.className;
    const difficulty = /lunatic/.test(cls) ? 'LUNATIC'
      : /remaster/.test(cls) ? 'Re:MASTER'
      : /master/.test(cls) ? 'MASTER'
      : /expert/.test(cls) ? 'EXPERT'
      : /advanced/.test(cls) ? 'ADVANCED' : 'BASIC';
    const lvText = el.querySelector('.score_level')?.textContent.trim() ?? '0';
    // マークアイコン（FB・クリアマーク）。music_icon_ab. は abp との誤マッチ防止でドット付き判定
    const icons = [...el.querySelectorAll('img[src*="music_icon"]')].map((i) => i.src);
    const has = (name) => icons.some((s) => s.includes(`music_icon_${name}.`));
    const song = {
      title: el.querySelector('.music_label')?.textContent.trim() ?? '',
      difficulty,
      level: lvText.includes('+') ? parseInt(lvText, 10) + 0.7 : parseFloat(lvText) || 0,
      isConstant: false,
      score: 0,
      ratingValue: null,
      jacketUrl: null,
      fullBell: has('fb'),
      clearMark: has('abp') ? 'AB+' : has('ab') ? 'AB' : has('fc') ? 'FC' : null,
    };
    if (section === 'platinum') {
      // PLATINUM HIGH SCORE: ☆数と「2,919 / 2,998」形式のスコア
      song.stars = parseInt(
        el.querySelector('.platinum_high_score_star_block .f_b')?.textContent ?? '0', 10) || 0;
      const ps = (el.querySelector('.platinum_score_text_block')?.textContent ?? '').split('/');
      song.score = parseInt(ps[0]?.replace(/[^\d]/g, '') ?? '0', 10) || 0;
      song.scoreMax = parseInt(ps[1]?.replace(/[^\d]/g, '') ?? '0', 10) || 0;
    } else {
      song.score = parseInt(
        el.querySelector('.score_value')?.textContent.replace(/[^\d]/g, '') ?? '0', 10) || 0;
    }
    buckets[section].push(song);
  }
  window.__grcProgress?.(`曲データ回収完了（ベスト${buckets.best.length}・新曲${buckets.recent.length}・プラチナ${buckets.platinum.length}）`);
  console.log('[ongeki] 回収:', Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])));

  // ---- 定数DB補完＋曲別TSレート計算 ----
  // 式の出典: wikiwiki「レーティングシステム」（docs/specs.md）
  // 基準点: 1,010,000=+2.000 / 1,007,500=+1.750 / 1,000,000=+1.250 / 990,000=+0.750 /
  //         970,000=±0 / 900,000=-4.000 / 800,000=-6.000（区間は線形補間）
  const tsBase = (c, s) => {
    if (s >= 1010000) return c + 2.0;
    if (s >= 1007500) return c + 1.75 + (s - 1007500) * 0.0001;
    if (s >= 1000000) return c + 1.25 + ((s - 1000000) / 7500) * 0.5;
    if (s >= 990000) return c + 0.75 + (s - 990000) * 0.00005;
    if (s >= 970000) return c + ((s - 970000) / 20000) * 0.75;
    if (s >= 900000) return c - 4.0 + ((s - 900000) / 70000) * 4.0;
    if (s >= 800000) return c - 6.0 + (s - 800000) * 0.00002;
    return 0;
  };
  const tsRate = (c, s, fb, clear) => {
    const scoreMark = s >= 1007500 ? 0.3 : s >= 1000000 ? 0.2 : s >= 990000 ? 0.1 : 0;
    const clearBonus = clear === 'AB+' ? 0.35 : clear === 'AB' ? 0.3 : clear === 'FC' ? 0.1 : 0;
    return Math.max(0, tsBase(c, s) + scoreMark + (fb ? 0.05 : 0) + clearBonus);
  };
  const d3 = (d) => d.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
  try {
    console.log('[ongeki] 譜面定数DB取得中…');
    window.__grcProgress?.('譜面定数DBを取得中…');
    const db = await dbFetch('https://reiwa.f5.si/ongeki_record.json');
    const map = new Map();
    for (const r of db) map.set(`${r.title}|${d3(r.diff)}`, r);
    for (const [sec, list] of Object.entries(buckets)) {
      for (const s of list) {
        const r = map.get(`${s.title}|${d3(s.difficulty)}`);
        if (!r || typeof r.const !== 'number') continue;
        s.level = r.const;
        s.isConstant = true;
        s.constUnknown = !!(r.is_unknown ?? r.unknown);
        s._img = r.img;
        if (sec === 'platinum') {
          // 曲別PSレート = ☆数 × 定数² ÷ 1000
          s.ratingValue = Math.round((s.stars ?? 0) * r.const * r.const) / 1000;
        } else {
          s.ratingValue = Math.round(tsRate(r.const, s.score, s.fullBell, s.clearMark) * 1000) / 1000;
        }
      }
      if (sec !== 'platinum') list.sort((a, b) => (b.ratingValue ?? -1) - (a.ratingValue ?? -1));
    }
  } catch (e) {
    console.warn('[ongeki] 定数DB取得失敗（定数なしで続行）:', e.message);
  }

  // ---- ジャケット: URLパターンが未確定なので、最初の1曲で候補を試して当たったものを使う ----
  const candidates = [
    (img) => `${location.origin}/ongeki-mobile/img/music/${img}.png`,
    (img) => `${location.origin}/ongeki-mobile/img/jacket/${img}.png`,
    (img) => `${location.origin}/ongeki-mobile/img/${img}.png`,
  ];
  let urlOf = null;
  const probe = [...buckets.recent, ...buckets.best, ...buckets.platinum].find((s) => s._img);
  if (probe) {
    for (const cand of candidates) {
      try {
        const res = await fetch(cand(probe._img));
        if (res.ok && (res.headers.get('content-type') ?? '').startsWith('image')) {
          urlOf = cand;
          break;
        }
      } catch { /* 次の候補へ */ }
      await sleep(300);
    }
    console.log('[ongeki] ジャケットURLパターン:', urlOf ? urlOf('<img>') : '未発見（ジャケットなしで続行）');
  }
  if (urlOf) {
    console.log('[ongeki] ジャケット取得中…');
    const __jList = [...buckets.recent, ...buckets.best, ...buckets.platinum].filter((s) => s._img);
    let __ji = 0;
    for (const s of [...buckets.recent, ...buckets.best, ...buckets.platinum]) {
      if (!s._img) continue;
      window.__grcProgress?.(`ジャケット取得中… ${++__ji}/${__jList.length}`);
      try {
        const res = await fetch(urlOf(s._img));
        if (res.ok) {
          const blob = await res.blob();
          s.jacketUrl = await new Promise((ok, ng) => {
            const fr = new FileReader();
            fr.onload = () => ok(fr.result);
            fr.onerror = ng;
            fr.readAsDataURL(blob);
          });
        }
        await sleep(150);
      } catch (e) {
        console.warn('[ongeki] ジャケット失敗:', s.title, e.message);
      }
    }
  }

  const strip = (l) => l.map(({ _img, ...s }) => s);
  const out = {
    game: 'ongeki',
    playerName,
    rating,
    fetchedAt: new Date().toISOString(),
    toolVersion: VERSION,
    best: strip(buckets.best),
    recent: strip(buckets.recent),
    platinum: strip(buckets.platinum),
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
  a.download = `ongeki-${d0.getFullYear()}${p2(d0.getMonth() + 1)}${p2(d0.getDate())}-${p2(d0.getHours())}${p2(d0.getMinutes())}.json`;
  a.click();
  console.log('[ongeki] 完了:', out);
})();
