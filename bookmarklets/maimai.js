// maimai でらっくすNET 用データ取得スクリプト v0.2
// 使い方: https://maimaidx.jp/maimai-mobile/home/ratingTargetMusic/
// （レコード→レーティング対象曲）を開いた状態で、DevToolsコンソールに全文貼り付けて実行。
// ※ fetchで他ページを取りに行くと /error/ に飛ばされるため、開いているページのDOMを
//   直接解析する方式を取る。
// 譜面定数・ジャケットは楽曲情報API（reiwa.f5.si、非営利可）で補完する。

(async () => {
  const VERSION = '0.2.0';
  // レーティング対象曲ページ以外ならマーク収集モード（FC/AP・SYNC用）。
  // fetchは全経路/error/へリダイレクトされるため、マークは表示中のページの
  // DOMから拾ってlocalStorageに貯め、対象曲ページでの実行時に合流させる。
  // ページ構造に依存しないよう、曲名要素から親をたどって行を特定する。
  if (!location.pathname.includes('ratingTargetMusic')) {
    const nameEls = document.querySelectorAll('.music_name_block');
    if (nameEls.length > 0) {
      const store = JSON.parse(localStorage.getItem('grc-marks') ?? '{}');
      const seen = new Set();
      let n = 0;
      for (const nameEl of nameEls) {
        const row = nameEl.closest('form') ?? nameEl.parentElement;
        if (!row) continue;
        const title = nameEl.textContent.trim();
        if (!title) continue;
        const icons = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
        icons.forEach((s) => {
          const m = s.match(/music_icon_[a-z0-9_]+/);
          if (m) seen.add(m[0]);
        });
        // 難易度は行のclassか、行内のdiff_*.png画像から判定する
        const cls = row.className + ' ' + (row.parentElement?.className ?? '');
        const diffSrc = icons.find((s) => /diff_[a-z]+\.png/.test(s)) ?? '';
        const dtext = cls + ' ' + diffSrc;
        const diffNo = /remaster/.test(dtext) ? 4 : /master/.test(dtext) ? 3
          : /expert/.test(dtext) ? 2 : /advanced/.test(dtext) ? 1 : 0;
        const has = (x) => icons.some((u) => u.includes(`music_icon_${x}.`));
        const dx = icons.some((u) => u.includes('music_dx')) ? 1 : 0;
        const comboMark = has('app') ? 'AP+' : has('ap') ? 'AP'
          : has('fcp') ? 'FC+' : has('fc') ? 'FC' : null;
        const syncMark = has('fsdp') ? 'FDX+' : has('fsd') ? 'FDX'
          : has('fsp') ? 'FS+' : has('fs') ? 'FS' : null;
        if (comboMark || syncMark) {
          store[`${title}|${diffNo}|${dx}`] = { comboMark, syncMark };
          n++;
        }
      }
      localStorage.setItem('grc-marks', JSON.stringify(store));
      console.log('[maimai] このページのマークアイコン:', [...seen].sort().join(', ') || '(なし)');
      alert(`このページから ${n} 曲のマークを記録しました（累計 ${Object.keys(store).length} 件）。\n` +
        `曲数 ${nameEls.length}、検出アイコン: ${[...seen].sort().join(', ') || 'なし'}\n` +
        '難易度ごとにスコア一覧を開いて実行し、最後にレーティング対象曲ページで実行してください');
      return;
    }
  }
  if (!location.pathname.includes('ratingTargetMusic')) {
    alert('レーティング対象曲ページ（レコード→RATING対象曲）で実行してください\n※このページの閲覧にはmaimaiでらっくすNETのスタンダードコース（有料）加入が必要です\n（FC/APマークを入れたい場合は、先にレコード→ジャンル別スコアページでも実行）');
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

  // ---- プレイヤー情報（ページ上部） ----
  const playerName = document.querySelector('.name_block')?.textContent.trim() ?? '(取得失敗)';
  const rating = parseInt(
    document.querySelector('.rating_block')?.textContent.replace(/\D/g, '') ?? '0', 10) || 0;

  // ---- セクション（screw_block見出し）ごとに曲ブロックを回収 ----
  const buckets = { new: [], best: [], candNew: [], candBest: [] };
  let section = null;
  const nodes = document.querySelectorAll('.screw_block, [class*="_score_back"]');
  for (const el of nodes) {
    if (el.classList.contains('screw_block')) {
      const t = el.textContent;
      section = t.includes('候補')
        ? (t.includes('新曲') ? 'candNew' : 'candBest')
        : (t.includes('新曲') ? 'new' : 'best');
      continue;
    }
    if (!section) continue;
    const cls = el.className;
    const difficulty = /remaster/.test(cls) ? 'Re:MASTER'
      : /master/.test(cls) ? 'MASTER'
      : /expert/.test(cls) ? 'EXPERT'
      : /advanced/.test(cls) ? 'ADVANCED' : 'BASIC';
    const lvText = el.querySelector('.music_lv_block')?.textContent.trim() ?? '0';
    buckets[section].push({
      title: el.querySelector('.music_name_block')?.textContent.trim() ?? '',
      difficulty,
      level: lvText.includes('+') ? parseInt(lvText, 10) + 0.7 : parseFloat(lvText) || 0,
      isConstant: false,
      score: parseFloat(el.querySelector('.music_score_block')?.textContent.replace(/[^\d.]/g, '')) || 0,
      ratingValue: null,
      jacketUrl: null,
      _dx: !!el.querySelector('img[src*="music_dx"]'),
      _idx: el.querySelector('input[name="idx"]')?.value ?? null,
    });
  }
  window.__grcProgress?.(`曲データ回収完了（ベスト${buckets.best.length}・新曲${buckets.new.length}）`);
  console.log('[maimai] 回収:', Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])));

  // ---- 譜面定数DBで補完（title+難易度+DX/STDで突合） ----
  const RANK_FACTORS = [
    [100.5, 22.4], [100.0, 21.6], [99.5, 21.1], [99.0, 20.8], [98.0, 20.3], [97.0, 20.0],
    [94.0, 16.8], [90.0, 15.2], [80.0, 13.6], [75.0, 12.0], [70.0, 11.2], [60.0, 9.6], [50.0, 8.0],
  ];
  const d3 = (d) => d.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3); // MAS/REM/EXP/ADV/BAS
  try {
    console.log('[maimai] 譜面定数DB取得中…');
    window.__grcProgress?.('譜面定数DBを取得中…');
    const db = await dbFetch('https://reiwa.f5.si/maimai_record.json');
    const map = new Map();
    for (const r of db) map.set(`${r.title}|${d3(r.diff)}|${r.is_dx ? 1 : 0}`, r);
    for (const list of Object.values(buckets)) {
      for (const s of list) {
        const r = map.get(`${s.title}|${d3(s.difficulty)}|${s._dx ? 1 : 0}`);
        if (!r) continue;
        s.level = r.const;
        s.isConstant = true;
        s.constUnknown = !!(r.is_unknown ?? r.unknown);
        s._img = r.img;
        const ach = Math.min(s.score, 100.5);
        const factor = (RANK_FACTORS.find(([min]) => ach >= min) ?? [0, 0])[1];
        s.ratingValue = Math.floor(r.const * (ach / 100) * factor);
      }
      list.sort((a, b) => (b.ratingValue ?? -1) - (a.ratingValue ?? -1));
    }
  } catch (e) {
    console.warn('[maimai] 定数DB取得失敗（レベル・単曲レートなしで続行）:', e.message);
  }

  // ---- FC/APマーク（ジャンル別スコアページで事前収集したものを適用） ----
  {
    const DIFF_NO = { BASIC: 0, ADVANCED: 1, EXPERT: 2, MASTER: 3, 'Re:MASTER': 4 };
    const store = JSON.parse(localStorage.getItem('grc-marks') ?? '{}');
    let hit = 0;
    for (const s of [...buckets.new, ...buckets.best]) {
      const m = store[`${s.title}|${DIFF_NO[s.difficulty]}|${s._dx ? 1 : 0}`];
      if (m) {
        s.comboMark = m.comboMark;
        s.syncMark = m.syncMark;
        hit++;
      }
    }
    console.log(`[maimai] マーク適用: ${hit}曲（収集済み${Object.keys(store).length}件。` +
      '0件の場合はジャンル別スコアページで先に実行すると入ります）');
  }

  // ---- ジャケット（同一オリジンの公式画像→data URL） ----
  console.log('[maimai] ジャケット取得中…');
  {
    const jList = [...buckets.new, ...buckets.best].filter((s) => s._img);
    let ji = 0;
  for (const s of jList) {
    window.__grcProgress?.(`ジャケット取得中… ${++ji}/${jList.length}`);
    try {
      const res = await fetch(`${location.origin}/maimai-mobile/img/Music/${s._img}.png`);
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
      console.warn('[maimai] ジャケット失敗:', s.title, e.message);
    }
  }
  }

  const strip = (l) => l.map(({ _dx, _img, _idx, ...s }) => s);
  const out = {
    game: 'maimai',
    playerName,
    rating,
    fetchedAt: new Date().toISOString(),
    toolVersion: VERSION,
    best: strip(buckets.best),
    recent: strip(buckets.new),
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
  a.download = `maimai-${d0.getFullYear()}${p2(d0.getMonth() + 1)}${p2(d0.getDate())}-${p2(d0.getHours())}${p2(d0.getMinutes())}.json`;
  a.click();
  console.log('[maimai] 完了:', out);
})();
