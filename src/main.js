import { renderCard } from './render.js';
import { validateGameData, verifySignature } from './schema.js';
import { MOCK_DATA } from './mock.js';
import { GAME_META, recalcRating } from './tiers.js';

const state = { maimai: null, chunithm: null, ongeki: null };
const sigStates = { maimai: null, chunithm: null, ongeki: null };

// ---- IndexedDBへの自動保存（JSONファイルを取っておかなくて済むように） ----
const DB_NAME = 'gekichumai-rating-card';
function idbOpen() {
  return new Promise((ok, ng) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('games');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => ng(req.error);
  });
}
async function idbSave(game, data) {
  try {
    const db = await idbOpen();
    await new Promise((ok, ng) => {
      const tx = db.transaction('games', 'readwrite');
      tx.objectStore('games').put(data, game);
      tx.oncomplete = ok;
      tx.onerror = () => ng(tx.error);
    });
  } catch (e) {
    console.warn('保存失敗（動作には影響なし）:', e);
  }
}
async function idbLoadAll() {
  try {
    const db = await idbOpen();
    const out = {};
    for (const g of ['maimai', 'chunithm', 'ongeki']) {
      out[g] = await new Promise((ok) => {
        const req = db.transaction('games').objectStore('games').get(g);
        req.onsuccess = () => ok(req.result ?? null);
        req.onerror = () => ok(null);
      });
    }
    return out;
  } catch {
    return {};
  }
}
async function idbClear() {
  const db = await idbOpen();
  await new Promise((ok) => {
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').clear();
    tx.oncomplete = ok;
  });
}

const canvas = document.getElementById('card');
const statusEl = document.getElementById('status');
const diffEl = document.getElementById('rating-diff');

// 同一オリジンのタブ間同期: どこかのタブが新データを保存したら、
// 開きっぱなしの他のタブも自動で最新表示になる
const bc = 'BroadcastChannel' in window ? new BroadcastChannel('grc-sync') : null;
async function notifyAndReloadPeers(game) {
  bc?.postMessage({ type: 'updated', game });
}
bc?.addEventListener('message', async (e) => {
  if (e.data?.type !== 'updated') return;
  const saved = await idbLoadAll();
  for (const [g, d] of Object.entries(saved)) {
    if (!d) continue;
    state[g] = d;
    sigStates[g] = d.sig ? verifySignature(d) : 'missing';
  }
  rerender();
});

let rendering = false;
let pending = false;

function currentOpts() {
  return {
    layout: document.getElementById('layout').value,
    showBest: document.getElementById('show-best').checked,
    bestCount: (() => {
      const v = document.getElementById('best-count').value;
      return v === 'all' ? 'all' : Number(v);
    })(),
    showScore: document.getElementById('show-score').checked,
    nameOverride: document.getElementById('name-override').value,
    games: {
      maimai: document.getElementById('game-maimai').checked,
      chunithm: document.getElementById('game-chunithm').checked,
      ongeki: document.getElementById('game-ongeki').checked,
    },
    sigStates,
  };
}

async function rerender() {
  // ジャケット読み込みで非同期になるので、多重実行を潰す
  if (rendering) {
    pending = true;
    return;
  }
  rendering = true;
  // モック表示中は実データに触れず、表示だけ差し替える（保存データは常に無傷）
  const mockOn = document.getElementById('mock-toggle')?.checked;
  try {
    if (mockOn) {
      await renderCard(canvas, structuredClone(MOCK_DATA), {
        ...currentOpts(),
        sigStates: { maimai: 'valid', chunithm: 'valid', ongeki: 'valid' },
      });
    } else {
      await renderCard(canvas, state, currentOpts());
    }
  } finally {
    rendering = false;
    if (pending) {
      pending = false;
      rerender();
    }
  }
  const loaded = Object.entries(state)
    .filter(([, v]) => v)
    .map(([k]) => k);
  statusEl.textContent = mockOn
    ? 'モックデータ表示中（チェックを外すと自分のデータに戻ります）'
    : loaded.length
      ? `読み込み済み: ${loaded.join(', ')}`
      : 'データ未読み込み（下の「初回セットアップ」からブックマークレットを登録して、各NETサイトで実行してください）';
  showRatingDiff(mockOn);
}

// 枠から再計算したレーティングとNET表示の差を出す。差があるときは譜面定数DBが
// ゲームのバージョンに未追従などの可能性があるので、その旨も添える
function showRatingDiff(mockOn) {
  diffEl.textContent = '';
  if (mockOn) return;
  const msgs = [];
  for (const [game, data] of Object.entries(state)) {
    if (!data) continue;
    const r = recalcRating(game, data);
    if (!r || Math.abs(r.diff) <= r.tolerance) continue;
    const fmt = GAME_META[game].formatRating;
    msgs.push(`${GAME_META[game].short}: 計算 ${fmt(r.calc)} / NET表示 ${fmt(data.rating)}`);
  }
  if (msgs.length === 0) return;
  diffEl.textContent =
    `⚠ 単曲レートの合計がNET表示と一致しません（${msgs.join('、')}）。` +
    '譜面定数DBがゲームの最新バージョンに追いついていない可能性があります。' +
    '画像にはNET表示の値を使っているため、カード自体は正しく出ています。';
}

document.getElementById('mock-toggle').addEventListener('change', rerender);

document.getElementById('file-input').addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    try {
      const parsed = JSON.parse(await file.text());
      const result = validateGameData(parsed);
      if (!result.ok) {
        alert(`${file.name}: ${result.error}`);
        continue;
      }
      state[result.data.game] = result.data;
      sigStates[result.data.game] = verifySignature(result.data);
      idbSave(result.data.game, result.data).then(() => notifyAndReloadPeers(result.data.game)); // 保存後はJSONファイルを消してOK
    } catch (err) {
      alert(`${file.name}: JSONの読み込みに失敗しました (${err.message})`);
    }
  }
  e.target.value = '';
  rerender();
});

// 軽量=JPEG・0.75倍縮小（Discordの上限対策）。巨大data URLはiOSで
// 扱えないため、toBlob＋objectURL方式にする
async function renderBlob() {
  const lite = document.getElementById('img-quality').value === 'lite';
  let src = canvas;
  if (lite) {
    const t = document.createElement('canvas');
    t.width = Math.round(canvas.width * 0.75);
    t.height = Math.round(canvas.height * 0.75);
    const g = t.getContext('2d');
    g.fillStyle = '#0e1220'; // JPEGは透過が使えないので背景色を敷く
    g.fillRect(0, 0, t.width, t.height);
    g.drawImage(canvas, 0, 0, t.width, t.height);
    src = t;
  }
  const blob = await new Promise((r) => src.toBlob(r, lite ? 'image/jpeg' : 'image/png', 0.82));
  if (!blob) {
    alert('画像の生成に失敗しました。表示曲数を減らして試してください');
    return null;
  }
  return { blob, ext: lite ? 'jpg' : 'png' };
}

// 画像を大きく表示する。新しいタブ（blob URL）だとiOSで「写真に追加」が
// 出ないことがあるため、通常の<img>としてこのページ上に出す
document.getElementById('open-image').addEventListener('click', async () => {
  const made = await renderBlob();
  if (!made) return;
  // iOSはdata URLの方が長押し保存の互換性が高い。大きすぎる場合のみblob URLにする
  let url;
  if (made.blob.size < 8 * 1024 * 1024) {
    url = await new Promise((r) => {
      const fr = new FileReader();
      fr.onload = () => r(fr.result);
      fr.readAsDataURL(made.blob);
    });
  } else {
    url = URL.createObjectURL(made.blob);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  }
  showImageInline(url);
});

function showImageInline(url) {
  document.querySelectorAll('.grc-image-overlay').forEach((d) => d.remove());
  const ov = document.createElement('div');
  ov.className = 'grc-image-overlay';
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0e1220;overflow:auto;' +
    '-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;align-items:center;' +
    'gap:12px;padding:16px;';
  const note = document.createElement('p');
  note.textContent = '画像を長押し →「写真に追加」で保存できます';
  note.style.cssText = 'color:#aab1c6;font-size:14px;margin:0;text-align:center;';
  const img = document.createElement('img');
  img.src = url;
  img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;';
  const close = document.createElement('button');
  close.textContent = '閉じる';
  close.style.cssText = 'background:#2b3350;color:#e8ebf2;border:1px solid #3d4670;' +
    'border-radius:8px;padding:10px 24px;font-size:14px;';
  close.onclick = () => ov.remove();
  ov.append(note, img, close);
  document.body.appendChild(ov);
}

document.getElementById('download').addEventListener('click', async () => {
  const made = await renderBlob();
  if (!made) return;
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.download = `rating-card-${date}.${made.ext}`;
  a.href = URL.createObjectURL(made.blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
});

for (const id of ['layout', 'show-best', 'best-count', 'show-score', 'name-override',
  'game-maimai', 'game-chunithm', 'game-ongeki']) {
  document.getElementById(id).addEventListener('change', rerender);
}

// デバッグ用フック: コンソールやテストからデータ差し替え・PNG取得ができる
window.__card = {
  async setData(dataByGame) {
    for (const g of ['maimai', 'chunithm', 'ongeki']) {
      state[g] = dataByGame[g] ?? null;
      sigStates[g] = state[g] ? (state[g].sig ? verifySignature(state[g]) : 'valid') : null;
    }
    await renderCard(canvas, state, currentOpts());
  },
  async setOpts(opts) {
    for (const [k, v] of Object.entries(opts)) {
      const el = document.getElementById(k);
      if (el) el.type === 'checkbox' ? (el.checked = v) : (el.value = v);
    }
    await renderCard(canvas, state, currentOpts());
  },
  toDataURL: () => canvas.toDataURL('image/png'),
};

// ブックマークレット登録UI（配布先ではこのページのオリジンからスクリプトを読み込む）
{
  // プレビュー配信のURLからコピーすると、そのデプロイに固定されて古い版を
  // 読み込み続けるため、pages.dev上では常に本番オリジンを指す
  const PROD_ORIGIN = 'https://gekichumai-card-3e325b.pages.dev';
  const origin = location.hostname.endsWith('pages.dev') ? PROD_ORIGIN : location.origin;
  const loader =
    `javascript:(()=>{const s=document.createElement('script');` +
    `s.src='${origin}/bookmarklets/gekichumai.js?t='+Date.now();` +
    `document.head.appendChild(s);})();`;
  // ドラッグ登録は最近のChromeで壊れる（JSがタイトルに入る）ため、コピー登録のみ提供
  document.getElementById('copy-bookmarklet').addEventListener('click', async () => {
    await navigator.clipboard.writeText(loader);
    alert('ブックマークレットのURLをコピーしました。\nブックマークマネージャの「新しいブックマークを追加」でURL欄に貼り付けてください\n（アドレスバーに貼っても実行されません）');
  });
}

document.getElementById('clear-saved').addEventListener('click', async () => {
  if (!confirm('ブラウザ内に保存されたデータを消しますか？')) return;
  await idbClear();
  state.maimai = state.chunithm = state.ongeki = null;
  sigStates.maimai = sigStates.chunithm = sigStates.ongeki = null;
  rerender();
});

// ブックマークレットからのpostMessage受信（ファイルレス受け渡し）
// 送信元はNETサイトに限定。ペイロードは通常のJSON読み込みと同じ検証を通す。
const ALLOWED_SENDERS = ['maimaidx.jp', 'chunithm-net.com', 'ongeki-net.com'];
// 接尾辞比較（endsWith）だと evilmaimaidx.jp のような別ドメインが通るため、
// ホスト名の完全一致またはサブドメイン一致で判定する
const isAllowedOrigin = (origin) => {
  try {
    const { hostname } = new URL(origin);
    return ALLOWED_SENDERS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch {
    return false;
  }
};
window.addEventListener('message', (e) => {
  if (!isAllowedOrigin(e.origin)) return;
  if (e.data?.type !== 'grc-data') return;
  const result = validateGameData(e.data.payload);
  if (!result.ok) {
    statusEl.textContent = `受信データが不正です: ${result.error}`;
    return;
  }
  state[result.data.game] = result.data;
  sigStates[result.data.game] = verifySignature(result.data);
  idbSave(result.data.game, result.data).then(() => {
    notifyAndReloadPeers(result.data.game);
    // 送信元（NETページのオーバーレイ）に完了を返す
    try {
      e.source?.postMessage('grc-saved', e.origin);
    } catch { /* 返せなくても保存は済んでいる */ }
    // 自動送信で開かれたタブは、保存を終えたら自分で閉じてタブを残さない
    if (location.search.includes('auto=1') && window.opener) {
      statusEl.textContent = '保存しました。このタブは自動で閉じます';
      setTimeout(() => window.close(), 700);
    }
  });
  rerender();
});
if (location.search.includes('receive=1')) {
  statusEl.textContent = 'NETサイトからのデータを受信しています…';
  // 開いた側（NETページ）に受信準備完了を伝える。相手のオリジンは機種により
  // 異なるため '*' で送るが、内容は合図の文字列のみでデータは含まない
  if (window.opener) {
    let tries = 0;
    const timer = setInterval(() => {
      try {
        window.opener.postMessage('grc-ready', '*');
      } catch { /* openerが閉じられたら止まるだけ */ }
      if (++tries > 20) clearInterval(timer);
    }, 250);
  }
}

// 起動時: 前回読み込んだデータを自動復元（JSONファイルを取っておく必要はない）
(async () => {
  const saved = await idbLoadAll();
  let restored = false;
  for (const [g, d] of Object.entries(saved)) {
    if (!d) continue;
    state[g] = d;
    sigStates[g] = verifySignature(d);
    restored = true;
  }
  if (restored) console.log('前回のデータを復元しました');
  rerender();
})();
