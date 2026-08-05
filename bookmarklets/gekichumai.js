// ゲキチュウマイ統合データ取得スクリプト（3機種共通・ブックマーク1個用）
// このファイルは自動生成。編集は bookmarklets/<機種>.js に行い、
// bin/build-unified.py で再生成すること。
// 使い方: 各NETサイト上でコンソールに貼り付けて実行（サイトを自動判別）。
//  - maimai / オンゲキ: レーティング対象曲ページで実行
//  - チュウニズム: ログイン済みならどのページでも可
//  - maimaiのFC/APマーク（任意）: ジャンル別スコアページで実行すると収集される

(async () => {
  // ローダー（script src注入）経由なら、読み込み元＝ツールのオリジンを特定し、
  // 完了時に画面へオーバーレイを出して「タップでツールを開いて送る」（ファイルレス）。
  // 開始時にwindow.openしない理由: ブックマークレット由来のopenはスマホSafariで
  // 毎回ポップアップブロックされる。タップは本物のユーザー操作なので許可される。
  // コンソール貼り付け時は currentScript が無いので従来のダウンロードになる。
  const TOOL_ORIGIN = document.currentScript?.src ? new URL(document.currentScript.src).origin : null;
  window.__grcDownload = (out) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    const d = new Date();
    const ts = d.toISOString().slice(0, 10).replace(/-/g, "") + "-" +
      String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
    a.download = `${out.game}-${ts}.json`;
    a.click();
  };
  // 進捗オーバーレイ（取得中の各段階を表示。完了時は送信ボタンに切り替わる）
  let ovBox = null;
  let ovMsg = null;
  const ensureOverlay = () => {
    if (ovBox) return;
    ovBox = document.createElement("div");
    ovBox.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(10,12,30,.9);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:sans-serif;";
    ovMsg = document.createElement("div");
    ovMsg.style.cssText = "color:#fff;font-size:16px;padding:0 20px;text-align:center;line-height:1.8;";
    ovBox.appendChild(ovMsg);
    document.body.appendChild(ovBox);
  };
  window.__grcProgress = (text) => {
    ensureOverlay();
    ovMsg.textContent = text;
  };
  window.__grcSend = (out) => {
    if (!TOOL_ORIGIN || TOOL_ORIGIN.includes(location.host)) return false;
    ensureOverlay();
    ovBox.textContent = "";
    const msg = document.createElement("div");
    msg.textContent = `${out.game} のデータ取得が完了しました`;
    msg.style.cssText = "color:#fff;font-size:16px;padding:0 20px;text-align:center;";
    const btn = document.createElement("button");
    btn.textContent = "カードを開いて送る";
    btn.style.cssText = "font-size:18px;padding:14px 30px;border-radius:10px;border:0;background:#5b6cff;color:#fff;";
    const alt = document.createElement("button");
    alt.textContent = "JSONで保存する";
    alt.style.cssText = "font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid #778;background:transparent;color:#ccd;";
    const closeB = document.createElement("button");
    closeB.textContent = "閉じる";
    closeB.style.cssText = "font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid #556;background:transparent;color:#99a;";
    closeB.onclick = () => ovBox.remove();
    const ov = ovBox;
    ov.append(msg, btn, alt, closeB);
    // 送信の実体。auto=1で開いたタブは保存後に自分で閉じる（タブが残らない）
    const startSend = (auto) => {
      const w = window.open(`${TOOL_ORIGIN}/?receive=1${auto ? "&auto=1" : ""}`, "grc-tool");
      if (!w) return false;
      const onMsg = (e) => {
        if (e.origin !== TOOL_ORIGIN) return;
        if (e.data === "grc-ready") w.postMessage({ type: "grc-data", payload: out }, TOOL_ORIGIN);
        if (e.data === "grc-saved") {
          window.removeEventListener("message", onMsg);
          msg.textContent = "カードに反映されました";
          btn.textContent = "カードを見る";
          btn.onclick = () => window.open(TOOL_ORIGIN, "grc-tool");
          alt.remove();
        }
      };
      window.addEventListener("message", onMsg);
      msg.textContent = "送信中…";
      return true;
    };
    btn.onclick = () => {
      if (!startSend(false)) msg.textContent = "ポップアップがブロックされました。「JSONで保存する」を使ってください";
    };
    alt.onclick = () => { ov.remove(); window.__grcDownload(out); };
    // まず自動送信を試す（許可されていればタップ不要・タブは保存後に自動で閉じる）。
    // ブロックされたらボタン表示のまま＝従来のワンタップ。
    if (startSend(true)) {
      msg.textContent = "自動送信中…（ブラウザがポップアップを許可している場合）";
    } else {
      msg.textContent = `${out.game} のデータ取得が完了しました（毎回自動にしたい場合は、このサイトのポップアップを許可してください）`;
    }
    return true;
  };
  const host = location.host;
  if (host.includes('maimaidx.jp')) return run_maimai();
  if (host.includes('chunithm-net')) return run_chunithm();
  if (host.includes('ongeki-net.com')) return run_ongeki();
  alert('ゲキチュウマイのNETサイト（maimaidx.jp / chunithm-net / ongeki-net.com）で実行してください');

  async function run_maimai() {
  const VERSION = '0.2.0';
  if (!location.pathname.includes('ratingTargetMusic')) {
    alert('レーティング対象曲ページ（レコード→RATING対象曲）で実行してください\n※このページの閲覧にはmaimaiでらっくすNETのスタンダードコース（有料）加入が必要です');
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

  // ---- FC/AP・SYNCマーク ----
  // マークは対象曲ページに無く、fetchは全経路/error/へリダイレクトされる。
  // ただし同一オリジンの隠しiframeはページ遷移として扱われて読めるため、
  // 難易度別スコア一覧をこのページに居たまま読み込んで拾う。
  {
    const DIFF_NO = { BASIC: 0, ADVANCED: 1, EXPERT: 2, MASTER: 3, 'Re:MASTER': 4 };
    const need = new Set([...buckets.new, ...buckets.best].map((s) => DIFF_NO[s.difficulty]));
    const marks = new Map();
    const seenIcons = new Set();
    const readFrame = (url) =>
      new Promise((res) => {
        const f = document.createElement('iframe');
        f.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
        const timer = setTimeout(() => {
          f.remove();
          res(0);
        }, 20000);
        f.onload = () => {
          clearTimeout(timer);
          let n = 0;
          try {
            const doc = f.contentDocument;
            for (const nameEl of doc.querySelectorAll('.music_name_block')) {
              const row = nameEl.closest('form') ?? nameEl.parentElement;
              if (!row) continue;
              const icons = [...row.querySelectorAll('img')].map((i) => i.getAttribute('src') ?? '');
              icons.forEach((s) => {
                const m = s.match(/music_icon_[a-z0-9_]+/);
                if (m) seenIcons.add(m[0]);
              });
              const has = (x) => icons.some((u) => u.includes(`music_icon_${x}.`));
              const cls = row.className + ' ' + (row.parentElement?.className ?? '');
              const diffSrc = icons.find((s) => /diff_[a-z]+\.png/.test(s)) ?? '';
              const dtext = cls + ' ' + diffSrc;
              const dno = /remaster/.test(dtext) ? 4 : /master/.test(dtext) ? 3
                : /expert/.test(dtext) ? 2 : /advanced/.test(dtext) ? 1 : 0;
              const dx = icons.some((u) => u.includes('music_dx')) ? 1 : 0;
              const comboMark = has('app') ? 'AP+' : has('ap') ? 'AP'
                : has('fcp') ? 'FC+' : has('fc') ? 'FC' : null;
              const syncMark = has('fsdp') ? 'FDX+' : has('fsd') ? 'FDX'
                : has('fsp') ? 'FS+' : has('fs') ? 'FS' : null;
              if (comboMark || syncMark) {
                marks.set(`${nameEl.textContent.trim()}|${dno}|${dx}`, { comboMark, syncMark });
                n++;
              }
            }
          } catch (e) {
            console.warn('[maimai] iframe読み取り失敗:', e.message);
          }
          f.remove();
          res(n);
        };
        f.src = url;
        document.body.appendChild(f);
      });

    for (const dno of [...need].sort()) {
      window.__grcProgress?.(`マーク取得中… 難易度${dno + 1}/${need.size}`);
      const n = await readFrame(
        `${location.origin}/maimai-mobile/record/musicGenre/search/?genre=99&diff=${dno}`);
      console.log(`[maimai] 難易度${dno}: マーク${n}件`);
      await sleep(1200);
    }
    console.log('[maimai] スコア一覧のアイコン:', [...seenIcons].sort().join(', ') || '(なし)');

    let hit = 0;
    for (const s of [...buckets.new, ...buckets.best]) {
      const m = marks.get(`${s.title}|${DIFF_NO[s.difficulty]}|${s._dx ? 1 : 0}`);
      if (m) {
        s.comboMark = m.comboMark;
        s.syncMark = m.syncMark;
        hit++;
      }
    }
    console.log(`[maimai] マーク適用: ${hit}曲 / 収集${marks.size}件`);
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
  }

  async function run_chunithm() {
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
  }

  async function run_ongeki() {
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
  // NET側のアイコン名が変わるとマークが取れなくなるため、実際に出た名前を控えて出す
  const seenIcons = new Set();
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
    // マークアイコン（FB・クリアマーク）。拡張子直前まで見て AB と AB+ を区別する。
    // 「+」の綴りはサイト内で揺れがある（スコアランクは sssplus）ため複数形を許容する
    const icons = [...el.querySelectorAll('img[src*="music_icon"]')].map((i) => i.src);
    icons.forEach((s) => seenIcons.add((s.match(/music_icon_[a-z0-9_]+/) ?? [''])[0]));
    const hasIcon = (re) => icons.some((s) => re.test(s));
    const has = (name) => hasIcon(new RegExp(`music_icon_${name}\\.`));
    const song = {
      title: el.querySelector('.music_label')?.textContent.trim() ?? '',
      difficulty,
      level: lvText.includes('+') ? parseInt(lvText, 10) + 0.7 : parseFloat(lvText) || 0,
      isConstant: false,
      score: 0,
      ratingValue: null,
      jacketUrl: null,
      fullBell: has('fb'),
      clearMark: hasIcon(/music_icon_ab(?:p|plus|_plus)\./) ? 'AB+'
        : has('ab') ? 'AB' : has('fc') ? 'FC' : null,
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
  console.log('[ongeki] マークアイコン:', [...seenIcons].sort().join(', '));
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
  }
})();
