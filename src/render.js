// 一枚絵のCanvasレンダラ。
// レイアウト2種:
//   - summary: 3機種横並びのカード型（機種モチーフ背景）
//   - grid:    ジャケット主体のタイルグリッド型（縦長・機種ごとのセクション）
// ジャケットURLが無い曲は曲名から生成する疑似ジャケットで埋める。

import { GAME_META, tierOf, gekichumaiPower, formatSongRating, frameStats } from './tiers.js';
import { rankOf, rankColor, formatScore } from './rank.js';

export const CARD_W = 1200;

const GAMES_ORDER = ['maimai', 'chunithm', 'ongeki'];
const FONT = '"Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif';
const NUM_FONT = '"Helvetica Neue", "Arial", sans-serif';
// 飾り（枠・バッジ）用の彩度高めの虹
const RAINBOW = ['#ff4d6d', '#ffa94d', '#ffe14d', '#4dff88', '#4dc4ff', '#8d6bff', '#ff6bd6'];
// 数字用のパステル虹（彩度を落として可読性を優先。縁取りとセットで使う）
const RAINBOW_SOFT = ['#ffb3c1', '#ffd9a8', '#fff3b0', '#c0f0cf', '#b8e2ff', '#d4c8ff', '#ffc2ea'];

// ---------------------------------------------------------------- 共通素材

function rainbowGradient(ctx, x, y, w, colors = RAINBOW) {
  const g = ctx.createLinearGradient(x, y, x + w, y + 24);
  colors.forEach((c, i) => g.addColorStop(i / (colors.length - 1), c));
  return g;
}

/**
 * レーティング数字の共通描画。虹はパステル虹＋暗色縁取りで可読性を確保する。
 * @param {string|null} color - 段位色。null なら虹
 */
function drawRatingText(ctx, text, x, y, sizePx, color) {
  const isRainbow = color === null;
  ctx.save();
  ctx.font = `italic 800 ${sizePx}px ${NUM_FONT}`;
  const w = ctx.measureText(text).width;
  // 縁取り（グローより先に、文字の輪郭を締める）
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, sizePx * 0.07);
  ctx.strokeStyle = 'rgba(8,10,22,0.85)';
  ctx.strokeText(text, x, y);
  // グロー: 単色の下敷きテキストにshadowを付けて落とす。
  // グラデ塗り＋shadowはSafari(WebKit)で二重・ズレて描画されるバグがあるため、
  // グラデ本体は最後にshadowなしで重ねる
  ctx.save();
  ctx.shadowColor = isRainbow ? 'rgba(255,255,255,0.55)' : hexA(color, 0.8);
  ctx.shadowBlur = sizePx * 0.22;
  ctx.fillStyle = isRainbow ? '#eef1ff' : color;
  ctx.fillText(text, x, y);
  ctx.restore();
  // 本体（shadowなしのグラデ）
  ctx.fillStyle = isRainbow
    ? rainbowGradient(ctx, x, y, w, RAINBOW_SOFT)
    : ratingFill(ctx, color, x, y, sizePx);
  ctx.fillText(text, x, y);
  ctx.restore();
  return w;
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

function drawTracked(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
}

/** drawTracked＋描画幅を返す版 */
function drawTrackedW(ctx, text, x, y, tracking) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + tracking;
  }
  return cx - x;
}

function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return t + '…';
}

function paraPath(ctx, x, y, w, h, skew) {
  ctx.beginPath();
  ctx.moveTo(x + skew, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w - skew, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function panelPath(ctx, x, y, w, h, cut) {
  // 右上と左下を斜めにカットした形（対角のカットで疾走感を出す）
  const cut2 = Math.min(cut * 0.7, 16);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - cut, y);
  ctx.lineTo(x + w, y + cut);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + cut2, y + h);
  ctx.lineTo(x, y + h - cut2);
  ctx.closePath();
}

/** 機種ロゴ画像（assets/logos/<game>.png があれば使う）。renderCardで事前ロード */
const logoImages = {};

async function preloadLogos() {
  await Promise.all(
    GAMES_ORDER.map(async (g) => {
      logoImages[g] = await loadImage(`./assets/logos/${g}.png`);
    })
  );
}

/** 機種名タグ。ロゴ画像があればそれを、なければテーマ色の平行四辺形タグを描く。
 *  公式ロゴは著作物のためリポジトリに同梱しない（利用者が手元に置いた場合のみ表示）。 */
function drawGameTag(ctx, x, y, game, meta, h = 28) {
  const logo = logoImages[game];
  if (logo) {
    const w = (logo.width / logo.height) * h * 1.35;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 10;
    ctx.drawImage(logo, x, y - h * 0.2, w, h * 1.35);
    ctx.restore();
    return w;
  }
  return drawLogotype(ctx, game, x, y, h);
}

/** ロゴ画像なしのデフォルト: 機種の雰囲気に寄せた自作ロゴタイプ。
 *  公式ロゴの複製ではなく「書体の空気」だけ再現する（配布しても問題ない）。 */
function drawLogotype(ctx, game, x, y, h) {
  const size = h * 0.82;
  ctx.save();
  ctx.textBaseline = 'top';
  let w = 0;
  if (game === 'maimai') {
    // 丸ゴシック・ポップ。ピンク→水色の2トーン＋白縁取り
    const font = `900 ${size}px "Hiragino Maru Gothic ProN", "Hiragino Kaku Gothic ProN", sans-serif`;
    ctx.font = font;
    const t1 = 'maimai';
    const t2 = ' でらっくす';
    const w1 = ctx.measureText(t1).width;
    ctx.font = `800 ${size * 0.62}px "Hiragino Maru Gothic ProN", sans-serif`;
    const w2 = ctx.measureText(t2).width;
    w = w1 + w2;
    ctx.font = font;
    ctx.lineJoin = 'round';
    // 暗背景で沈まないよう、暗色の外縁→白の内縁→明るめグラデの三層
    ctx.lineWidth = size * 0.34;
    ctx.strokeStyle = 'rgba(10,12,30,0.95)';
    ctx.strokeText(t1, x, y);
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = '#ffffff';
    ctx.strokeText(t1, x, y);
    const g = ctx.createLinearGradient(x, y, x + w1, y + size);
    g.addColorStop(0, '#ff77b1');
    g.addColorStop(1, '#2fd6f5');
    ctx.fillStyle = g;
    ctx.fillText(t1, x, y);
    ctx.font = `800 ${size * 0.62}px "Hiragino Maru Gothic ProN", sans-serif`;
    ctx.lineWidth = size * 0.24;
    ctx.strokeStyle = 'rgba(10,12,30,0.95)';
    ctx.strokeText(t2, x + w1, y + size * 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t2, x + w1, y + size * 0.3);
  } else if (game === 'chunithm') {
    // 鋭い斜体・大文字。黄→橙グラデ＋下のスラッシュ
    ctx.font = `italic 900 ${size}px "Helvetica Neue", sans-serif`;
    const t = 'CHUNITHM';
    w = ctx.measureText(t).width + 8;
    ctx.lineJoin = 'miter';
    ctx.lineWidth = size * 0.14;
    ctx.strokeStyle = 'rgba(10,12,30,0.9)';
    ctx.strokeText(t, x, y);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, '#ffe14d');
    g.addColorStop(1, '#ff9a3d');
    ctx.fillStyle = g;
    ctx.fillText(t, x, y);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 3; i++) {
      paraPath(ctx, x + w + 6 + i * 8, y + size * 0.55, 5, size * 0.45, 4);
      ctx.fill();
    }
    w += 34;
  } else {
    // オンゲキ: 太斜体・ほぼ白の本体＋暗色縁取り＋ピンクの下線
    // （ピンク系グラデはピンク地のセクションに溶けるため橙寄りにしている）
    ctx.font = `italic 900 ${size}px "Hiragino Kaku Gothic ProN", sans-serif`;
    const t = 'オンゲキ';
    w = ctx.measureText(t).width + 6;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.32;
    ctx.strokeStyle = 'rgba(10,12,30,0.95)';
    ctx.strokeText(t, x, y);
    const g = ctx.createLinearGradient(x, y, x, y + size);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#ffd9ea');
    ctx.fillStyle = g;
    ctx.fillText(t, x, y);
    ctx.fillStyle = '#ff5fa2';
    paraPath(ctx, x + 2, y + size + 4, w - 8, 4, 4);
    ctx.fill();
  }
  ctx.restore();
  return w;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------- 機種モチーフ

/** 機種ごとの背景モチーフ。clip済みの領域内にうっすら描く前提。 */
function drawMotif(ctx, game, x, y, w, h, color) {
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  if (game === 'maimai') {
    // 筐体の円形ボタン配置をイメージした同心円＋外周ドット
    const cx = x + w * 0.78;
    const cy = y + h * 0.3;
    for (const r of [40, 70, 100, 130]) {
      ctx.lineWidth = r === 100 ? 6 : 2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 100, cy + Math.sin(a) * 100, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (game === 'chunithm') {
    // 判定ラインに降るノーツをイメージした縦バー
    for (let i = 0; i < 7; i++) {
      const bx = x + w * 0.55 + i * 26;
      const bh = 60 + ((i * 53) % 90);
      roundRectPath(ctx, bx, y + 24 + ((i * 37) % 60), 14, bh, 7);
      ctx.fill();
    }
  } else {
    // 弾幕＋レーンをイメージした斜めビームと小円
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(x + w * 0.5 + i * 60, y);
      ctx.rotate(Math.PI / 8);
      ctx.fillRect(0, -20, 10, h + 60);
      ctx.restore();
    }
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(x + w * 0.6 + ((i * 83) % 160), y + 30 + ((i * 61) % (h - 60)), 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- ジャケット

const imageCache = new Map();

function loadImage(url) {
  if (imageCache.has(url)) return imageCache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
  imageCache.set(url, p);
  return p;
}

/** 対象データのジャケットを事前ロードしておく（失敗はnullでプレースホルダーに落ちる） */
async function preloadJackets(dataByGame, bestCount) {
  const urls = [];
  for (const g of GAMES_ORDER) {
    const d = dataByGame[g];
    if (!d) continue;
    const nBest = bestCount === 'all' ? d.best.length : bestCount;
    d.best.slice(0, nBest).forEach((s) => s.jacketUrl && urls.push(s.jacketUrl));
    if (bestCount === 'all') {
      (d.recent ?? []).forEach((s) => s.jacketUrl && urls.push(s.jacketUrl));
      (d.platinum ?? []).forEach((s) => s.jacketUrl && urls.push(s.jacketUrl));
    }
  }
  return Promise.all(urls.map(loadImage));
}

/** 曲名ハッシュから色相を決めた疑似ジャケット */
function drawPlaceholderJacket(ctx, x, y, size, title, themeColor) {
  let hash = 0;
  for (const ch of title) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const hue = hash % 360;
  const g = ctx.createLinearGradient(x, y, x + size, y + size);
  g.addColorStop(0, `hsl(${hue}, 55%, 34%)`);
  g.addColorStop(1, `hsl(${(hue + 60) % 360}, 60%, 20%)`);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, size, size);
  // 斜めの光
  const sg = ctx.createLinearGradient(x, y, x + size, y + size * 0.6);
  sg.addColorStop(0, 'rgba(255,255,255,0.14)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, size, size);
  // 頭文字
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `800 ${Math.round(size * 0.42)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText([...title][0] ?? '?', x + size / 2, y + size / 2 + 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  // 機種色の縁
  ctx.strokeStyle = hexA(themeColor, 0.5);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, size - 1.5, size - 1.5);
}

async function drawJacket(ctx, x, y, size, song, themeColor) {
  const img = song.jacketUrl ? await loadImage(song.jacketUrl) : null;
  if (img) {
    ctx.save();
    roundRectPath(ctx, x, y, size, size, 6);
    ctx.clip();
    ctx.drawImage(img, x, y, size, size);
    ctx.restore();
  } else {
    ctx.save();
    roundRectPath(ctx, x, y, size, size, 6);
    ctx.clip();
    drawPlaceholderJacket(ctx, x, y, size, song.title, themeColor);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- 背景・ヘッダー

function drawBaseBackground(ctx, W, H) {
  // 深い藍→菫→マゼンタ寄りのグラデーション（Arcaea系の色温度）
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0a0c1e');
  bg.addColorStop(0.45, '#141a38');
  bg.addColorStop(0.8, '#241542');
  bg.addColorStop(1, '#2c1240');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // 六角形メッシュ（右上と左下に偏らせて視線の抜けを作る）
  hexMesh(ctx, W * 0.62, -40, W * 0.5, 300, 34, 'rgba(160,180,255,0.05)');
  hexMesh(ctx, -60, H - 260, W * 0.42, 300, 34, 'rgba(255,140,220,0.04)');

  // 光条: 左上から差し込むビーム
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const [x0, w0, a] of [[W * 0.06, 130, 0.05], [W * 0.16, 60, 0.035], [W * 0.30, 90, 0.028]]) {
    ctx.save();
    ctx.translate(x0, -40);
    ctx.rotate(Math.PI / 7);
    const g = ctx.createLinearGradient(0, 0, 0, H * 1.4);
    g.addColorStop(0, `rgba(180,210,255,${a})`);
    g.addColorStop(1, 'rgba(180,210,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w0, H * 1.5);
    ctx.restore();
  }
  ctx.restore();

  // ハーフトーンドット（右下、対角に減衰）
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let iy = 0; iy < 10; iy++) {
    for (let ix = 0; ix < 16; ix++) {
      const r = 3.2 - (ix + iy) * 0.12;
      if (r <= 0.4) continue;
      ctx.beginPath();
      ctx.arc(W - 40 - ix * 16, H - 36 - iy * 16, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  // 微細な斜線テクスチャ
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.018)';
  ctx.lineWidth = 1;
  for (let x = -H; x < W + H; x += 14) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + H, H);
    ctx.stroke();
  }
  ctx.restore();

  // 四隅を締めるビネット
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,10,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

/** 六角形メッシュを1領域に描く */
function hexMesh(ctx, x, y, w, h, r, stroke) {
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  const dy = r * Math.sqrt(3) / 2;
  for (let row = 0; row * dy < h; row++) {
    for (let col = 0; col * (r * 1.5) < w; col++) {
      const cx = x + col * r * 1.5;
      const cy = y + row * dy * 2 + (col % 2 ? dy : 0);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + Math.PI / 6;
        const px = cx + Math.cos(a) * r * 0.92;
        const py = cy + Math.sin(a) * r * 0.92;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** 斜めストライプで塗る（clip済みパスに対して使う） */
function fillStripes(ctx, x, y, w, h, color, gap = 8, lw = 3) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  for (let sx = x - h; sx < x + w + h; sx += gap) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + h, y);
    ctx.stroke();
  }
  ctx.restore();
}

function allRainbow(dataByGame) {
  const games = GAMES_ORDER.filter((g) => dataByGame[g]);
  return (
    games.length === 3 &&
    games.every((g) => tierOf(GAME_META[g].tiers, dataByGame[g].rating).color === null)
  );
}

function drawRainbowFrame(ctx, W, H) {
  ctx.save();
  ctx.strokeStyle = rainbowGradient(ctx, 0, 0, W);
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, W - 5, H - 5);
  ctx.restore();
}

function drawHeader(ctx, W, dataByGame, nameOverride) {
  const anyGame = GAMES_ORDER.find((g) => dataByGame[g]);
  const anyData = anyGame ? dataByGame[anyGame] : null;
  // 機種間で名前が違う場合に備え、上書き名 > 最初に見つかったデータの名前 の優先順。
  // 機種間で名義が異なる場合があるため、自動採用時はどの機種の名義かを添える
  const overridden = !!(nameOverride || '').trim();
  const playerName = overridden ? nameOverride.trim() : (anyData ? anyData.playerName : 'NO DATA');
  const nameSource = !overridden && anyGame ? `${GAME_META[anyGame].short}名義` : null;
  const dateStr = anyData ? anyData.fetchedAt.slice(0, 10) : '';

  // 名前の背後に機種3色の斜めバナー（奥行きのレイヤー）
  ctx.save();
  const bannerColors = ['#00bcd4', '#f9a825', '#ec407a'];
  bannerColors.forEach((c, i) => {
    ctx.save();
    paraPath(ctx, 24 + i * 8, 30 + i * 10, 400 - i * 60, 12, 14);
    ctx.fillStyle = hexA(c, 0.32 - i * 0.07);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // 名前: 斜体ヘビー＋ズレ影の二重レイヤー
  ctx.textBaseline = 'top';
  ctx.save();
  ctx.font = `italic 900 44px ${FONT}`;
  ctx.fillStyle = 'rgba(90,120,255,0.5)';
  drawTracked(ctx, playerName, 40, 37, 6);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(140,160,255,0.5)';
  ctx.shadowBlur = 20;
  const nameEnd = 36 + drawTrackedW(ctx, playerName, 36, 33, 6);
  ctx.restore();
  if (nameSource) {
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(`（${nameSource}）`, nameEnd + 10, 58);
  }

  // 罫線: グラデーション＋先端に斜めストライプのアクセント
  const line = ctx.createLinearGradient(36, 0, 640, 0);
  line.addColorStop(0, 'rgba(255,255,255,0.85)');
  line.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = line;
  ctx.fillRect(36, 94, 604, 2);
  ctx.save();
  paraPath(ctx, 648, 88, 56, 12, 8);
  ctx.clip();
  fillStripes(ctx, 648, 88, 56, 12, 'rgba(255,255,255,0.5)', 7, 2);
  ctx.restore();

  // ゲキチュウマイ度: このツールの看板なのでヒーロー扱いの専用パネル（右上）。
  // 機種を絞った単体カードでは3機種合算の意味がないためパネルごと出さない
  const slots = GAMES_ORDER.filter((g) => g in dataByGame);
  if (slots.length < 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `600 13px ${NUM_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(dateStr, CARD_W - 44, 40);
    ctx.textAlign = 'left';
    return;
  }
  const power = gekichumaiPower(dataByGame);
  const panelW = 372;
  const panelX = W - 36 - panelW;
  const panelY = 18;
  const panelH = 84;

  // 斜めパネル（虹の縁光り）
  ctx.save();
  paraPath(ctx, panelX, panelY, panelW, panelH, 20);
  const pg = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
  pg.addColorStop(0, 'rgba(255,255,255,0.10)');
  pg.addColorStop(1, 'rgba(255,255,255,0.035)');
  ctx.fillStyle = pg;
  ctx.fill();
  ctx.shadowColor = 'rgba(180,160,255,0.5)';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = rainbowGradient(ctx, panelX, panelY, panelW);
  ctx.lineWidth = 1.6;
  paraPath(ctx, panelX, panelY, panelW, panelH, 20);
  ctx.stroke();
  ctx.restore();

  // ラベル行: 和文＋欧文の二段構え
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = `800 15px ${FONT}`;
  ctx.fillText('ゲキチュ“ウマイ”度', panelX + 30, panelY + 12);
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.font = `700 9px ${FONT}`;
  drawTracked(ctx, 'GEKICHUMAI POWER', panelX + 31, panelY + 32, 2.2);

  if (power) {
    // 本体数字: ヘッダーで最大の要素にする。ランク到達時はランク色（虹/鉑/金/銀）
    const numColor = power.rank ? (power.rankColor ?? null) : '#f0f2ff';
    ctx.font = `italic 800 44px ${NUM_FONT}`;
    const vw = ctx.measureText(String(power.value)).width;
    drawRatingText(ctx, String(power.value), panelX + panelW - vw - 26, panelY + 26, 44, numColor);
    if (power.rank) {
      // ランク名は箱なしでダイヤ＋テキスト（虹バッジ廃止方針に合わせる）
      const isRainbow = power.rankColor === null;
      ctx.save();
      ctx.translate(panelX + 36, panelY + 56);
      ctx.rotate(Math.PI / 4);
      ctx.shadowColor = isRainbow ? '#ffffff' : power.rankColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = isRainbow ? rainbowGradient(ctx, -5, -5, 10) : power.rankColor;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `800 15px ${FONT}`;
      ctx.fillText(power.rank, panelX + 48, panelY + 48);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `600 14px ${FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText('3機種そろうと表示', panelX + panelW - 26, panelY + 40);
    ctx.textAlign = 'left';
  }

  // 日付はパネル下に小さく
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = `600 13px ${NUM_FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(dateStr, W - 44, panelY + panelH + 8);
  ctx.textAlign = 'left';
}

// ---------------------------------------------------------------- summary

const SUMMARY_H = 675;

function drawSummary(ctx, dataByGame, { showBest, bestCount, nameOverride, sigStates }) {
  drawBaseBackground(ctx, CARD_W, SUMMARY_H);
  drawHeader(ctx, CARD_W, dataByGame, nameOverride);

  const top = 118;
  const colGap = 20;
  const sideM = 36;
  // 選択された機種だけを等分レイアウト（1機種なら全幅の単体カードになる）
  const games = GAMES_ORDER.filter((g) => g in dataByGame);
  const colW = (CARD_W - sideM * 2 - colGap * (games.length - 1)) / Math.max(1, games.length);
  games.forEach((game, i) => {
    const x = sideM + i * (colW + colGap);
    drawSummaryColumn(ctx, x, top, colW, SUMMARY_H - top - 44, game, dataByGame[game], {
      showBest,
      bestCount: bestCount === 'all' ? 10 : Math.min(bestCount, 10),
      sigState: sigStates?.[game],
    });
  });

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('GEKICHUMAI RATING CARD', CARD_W - 36, SUMMARY_H - 24);
  ctx.textAlign = 'left';

  if (allRainbow(dataByGame)) drawRainbowFrame(ctx, CARD_W, SUMMARY_H);
}

/**
 * 枠ごとの平均レートと目安の定数。空いている領域に小さく置く。
 * @param {'left'|'right'} align 右揃えなら x を右端として扱う
 */
function drawFrameStats(ctx, x, y, game, data, align = 'left') {
  const stats = frameStats(game, data);
  if (stats.length === 0) return;
  const digits = game === 'ongeki' ? 3 : game === 'chunithm' ? 2 : 0;
  ctx.save();
  ctx.textBaseline = 'top';
  stats.forEach((s, i) => {
    const ly = y + i * 17;
    const avg = s.key === 'platinum' ? s.avg.toFixed(3) : s.avg.toFixed(digits);
    const req = s.reqConst > 0 ? `≒定数 ${s.reqConst.toFixed(1)}` : '';
    ctx.textAlign = align === 'right' ? 'right' : 'left';
    const lx = align === 'right' ? x : x;
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.font = `700 11px ${FONT}`;
    if (align === 'right') {
      ctx.fillText(req, lx, ly + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = `700 13px ${NUM_FONT}`;
      const reqW = 78;
      ctx.fillText(avg, lx - reqW, ly);
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(s.label, lx - reqW - 54, ly + 1);
    } else {
      ctx.fillText(s.label, lx, ly + 1);
      ctx.fillStyle = 'rgba(255,255,255,0.62)';
      ctx.font = `700 13px ${NUM_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(avg, lx + 96, ly);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.32)';
      ctx.font = `700 11px ${FONT}`;
      ctx.fillText(req, lx + 104, ly + 1);
    }
  });
  ctx.textAlign = 'left';
  ctx.restore();
}

/** チェックサム未検証マーク（気休めの抑止。→ schema.js verifySignature） */
function drawSigWarning(ctx, x, y, sigState) {
  if (sigState !== 'invalid' && sigState !== 'missing') return;
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = sigState === 'invalid' ? 'rgba(255,150,70,0.9)' : 'rgba(255,255,255,0.35)';
  ctx.font = `700 12px ${FONT}`;
  ctx.fillText(sigState === 'invalid' ? '⚠ 検証NG' : '未検証', x, y);
  ctx.restore();
}

function drawSummaryColumn(ctx, x, y, w, h, game, data, { showBest, bestCount, sigState }) {
  const meta = GAME_META[game];
  const cut = 22;

  ctx.save();
  panelPath(ctx, x, y, w, h, cut);
  const glass = ctx.createLinearGradient(x, y, x, y + h);
  glass.addColorStop(0, 'rgba(255,255,255,0.085)');
  glass.addColorStop(1, 'rgba(255,255,255,0.03)');
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // モチーフはパネル内にclipして描く
  panelPath(ctx, x, y, w, h, cut);
  ctx.clip();
  drawMotif(ctx, game, x, y, w, h, meta.themeColor);
  ctx.restore();

  ctx.save();
  ctx.shadowColor = meta.themeColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = meta.themeColor;
  ctx.fillRect(x, y + 8, 4, h - 16);
  ctx.restore();

  // パネル上辺に沿うテーマ色のアクセントライン
  ctx.fillStyle = hexA(meta.themeColor, 0.55);
  ctx.fillRect(x + 10, y, w - 46, 2);

  drawGameTag(ctx, x + 16, y + 16, game, meta);
  drawSigWarning(ctx, x + w - 26, y + 14, sigState);

  if (!data) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillText('NO DATA', x + 22, y + 84);
    return;
  }

  const tier = tierOf(meta.tiers, data.rating);
  const ratingText = meta.formatRating(data.rating);
  const isRainbow = tier.color === null;

  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `700 12px ${FONT}`;
  drawTracked(ctx, 'RATING', x + 22, y + 58, 3);

  drawRatingText(ctx, ratingText, x + 22, y + 78, 62, isRainbow ? null : tier.color);

  const badgeY = y + 158;
  drawTierBadge(ctx, x + 22, badgeY, tier);
  // 段位バッジの行から下は右側が空くので、枠ごとの平均と目安の定数をそこに置く
  drawFrameStats(ctx, x + w - 22, y + 152, game, data, 'right');

  if (showBest && (data.best?.length ?? 0) + (data.recent?.length ?? 0) > 0) {
    let ry = badgeY + 54;
    // パネル下端からはみ出さない行数に自動クランプ
    const maxRows = Math.max(1, Math.floor((y + h - (ry + 22) - 14) / 30));
    const songs = mergedTop(data);
    const count = Math.min(bestCount, maxRows, songs.length);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `700 12px ${FONT}`;
    drawTracked(ctx, `BEST ${count}`, x + 22, ry, 3);
    ry += 22;
    songs.slice(0, count).forEach((s, i) => {
      const rowH = 30;
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.045)';
        paraPath(ctx, x + 16, ry - 5, w - 34, rowH - 4, 5);
        ctx.fill();
      }
      ctx.fillStyle = hexA(meta.themeColor, 0.9);
      ctx.font = `italic 800 15px ${NUM_FONT}`;
      ctx.fillText(String(i + 1).padStart(2, '0'), x + 24, ry);
      // 難易度色のバー
      ctx.fillStyle = diffStyleOf(s.difficulty).color;
      ctx.fillRect(x + 48, ry + 1, 4, 13);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `600 14px ${FONT}`;
      ctx.fillText(truncate(ctx, s.title, w - 168), x + 60, ry + 1);
      ctx.textAlign = 'right';
      // 譜面定数（難易度色・小さめ）→ 単曲レート値。
      // チェックサムが合わないデータは整数Lv・レート値なしに格下げ（課金機能の
      // 「定数×リザルト」を検証できないデータに与えないため → docs/specs.md）
      const degraded = sigState === 'missing' || sigState === 'invalid';
      // レート値（右端）→ その左に定数、と右から詰めて重なりを防ぐ
      const rvText = !degraded && s.ratingValue != null
        ? formatSongRating(game, s.ratingValue) + (s.constUnknown ? '?' : '')
        : '-';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = `700 14px ${NUM_FONT}`;
      ctx.fillText(rvText, x + w - 22, ry + 1);
      const rvW = ctx.measureText(rvText).width;
      if (s.level) {
        ctx.fillStyle = hexA(diffStyleOf(s.difficulty).color, 0.85);
        ctx.font = `700 12px ${NUM_FONT}`;
        const constText = degraded
          ? String(Math.floor(s.level))
          : (s.level.toFixed ? s.level.toFixed(1) : String(s.level)) + (s.constUnknown ? '?' : '');
        ctx.fillText(constText, x + w - 22 - rvW - 12, ry + 3);
      }
      ctx.textAlign = 'left';
      ry += rowH;
    });
  }
}

function drawTierBadge(ctx, x, y, tier) {
  // 段位バッジは箱なし（段位色のダイヤ＋テキストのみ）
  const isRainbow = tier.color === null;
  ctx.save();
  ctx.translate(x + 8, y + 14);
  ctx.rotate(Math.PI / 4);
  ctx.shadowColor = isRainbow ? '#ffffff' : tier.color;
  ctx.shadowBlur = 8;
  ctx.fillStyle = isRainbow ? rainbowGradient(ctx, -6, -6, 12) : tier.color;
  ctx.fillRect(-5.5, -5.5, 11, 11);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.font = `700 14px ${FONT}`;
  ctx.fillText(`${tier.name}レート`, x + 22, y + 6);
}

function ratingFill(ctx, color, x, y, sizePx = 62) {
  const g = ctx.createLinearGradient(x, y, x, y + sizePx);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, color);
  g.addColorStop(1, shade(color, -0.25));
  return g;
}

// ---------------------------------------------------------------- grid

const GRID_COLS = 6;
const GRID_SIDE = 36;
const GRID_GAP = 14;
const TILE_TEXT_H = 58;

// 全枠モードはタイル総数から列数を自動選択し、縦横比が約1:1.8
// （スマホ全画面比に近く、Xタイムラインでも破綻しにくい）に寄せる
function gridLayoutOf(bestCount, dataByGame) {
  if (bestCount !== 'all') return { W: CARD_W, cols: GRID_COLS };
  const TILE = 150; // タイルの目標サイズを固定し、列数で幅を決める
  let pick = { W: 1680, cols: 10, d: Infinity };
  for (let cols = 8; cols <= 14; cols++) {
    const W = GRID_SIDE * 2 + cols * TILE + (cols - 1) * GRID_GAP;
    const H = gridTotalHeight(dataByGame ?? {}, 'all', W, cols);
    const d = Math.abs(H / W - 1.8);
    if (d < pick.d) pick = { W, cols, d };
  }
  return pick;
}

function tileWidth(W, cols) {
  return (W - GRID_SIDE * 2 - GRID_GAP * (cols - 1)) / cols;
}

/** 表示する曲数。bestCount='all' なら機種の枠の定義どおり
 *  （ベスト全曲＋新曲枠＋プラチナ枠(オンゲキ)も表示） */
function frameCounts(d, bestCount) {
  const nBest = bestCount === 'all' ? d.best.length : Math.min(bestCount, mergedTop(d).length);
  const nRec = bestCount === 'all' ? (d.recent?.length ?? 0) : 0;
  const nPlat = bestCount === 'all' ? (d.platinum?.length ?? 0) : 0;
  return { nBest, nRec, nPlat };
}

/** 曲数を絞って出すときは枠を分けず、旧曲＋新曲の単曲レート上位を並べる
 *  （枠ごとに見たいときは「全枠」を使う） */
function mergedTop(d) {
  return [...(d.best ?? []), ...(d.recent ?? [])]
    .slice()
    .sort((a, b) => (b.ratingValue ?? -1) - (a.ratingValue ?? -1));
}

function rowsHeight(n, W, cols) {
  return Math.ceil(n / cols) * (tileWidth(W, cols) + TILE_TEXT_H + GRID_GAP);
}

function gridSectionHeight(d, bestCount, W, cols) {
  const { nBest, nRec, nPlat } = frameCounts(d, bestCount);
  const groups = [Math.max(1, nBest)];
  if (nRec) groups.push(nRec);
  if (nPlat) groups.push(nPlat);
  const labeled = groups.length > 1;
  let h = 86;
  groups.forEach((n, i) => {
    h += (labeled ? 26 : 0) + rowsHeight(n, W, cols) + (i < groups.length - 1 ? 14 : 0);
  });
  return h;
}

function gridTotalHeight(dataByGame, bestCount, W, cols) {
  let h = 118; // ヘッダー
  for (const g of GAMES_ORDER) {
    const d = dataByGame[g];
    if (!d) continue;
    h += gridSectionHeight(d, bestCount, W, cols) + 18;
  }
  return h + 30;
}

async function drawGrid(ctx, W, H, dataByGame, { bestCount, cols, showScore, nameOverride, sigStates }) {
  drawBaseBackground(ctx, W, H);
  drawHeader(ctx, W, dataByGame, nameOverride);

  let y = 118;
  for (const game of GAMES_ORDER) {
    const data = dataByGame[game];
    if (!data) continue;
    y = await drawGridSection(ctx, W, cols, y, game, data, {
      bestCount, showScore, sigState: sigStates?.[game],
    });
    y += 18;
  }

  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.font = `600 12px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText('GEKICHUMAI RATING CARD', W - 36, H - 24);
  ctx.textAlign = 'left';

  if (allRainbow(dataByGame)) drawRainbowFrame(ctx, W, H);
}

async function drawGridSection(ctx, W, cols, y, game, data, { bestCount, showScore, sigState }) {
  const meta = GAME_META[game];
  const { nBest, nRec, nPlat } = frameCounts(data, bestCount);
  const secH = gridSectionHeight(data, bestCount, W, cols);
  const x = GRID_SIDE;
  const w = W - GRID_SIDE * 2;

  // セクション背景（機種色のティント＋モチーフ）
  ctx.save();
  panelPath(ctx, x - 10, y, w + 20, secH, 26);
  const tint = ctx.createLinearGradient(x, y, x, y + secH);
  tint.addColorStop(0, hexA(meta.themeColor, 0.10));
  tint.addColorStop(0.25, 'rgba(255,255,255,0.045)');
  tint.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = tint;
  ctx.fill();
  ctx.strokeStyle = hexA(meta.themeColor, 0.35);
  ctx.lineWidth = 1;
  ctx.stroke();
  panelPath(ctx, x - 10, y, w + 20, secH, 26);
  ctx.clip();
  drawMotif(ctx, game, x, y, w, Math.min(secH, 240), meta.themeColor);
  ctx.restore();

  // セクションヘッダー
  ctx.save();
  ctx.shadowColor = meta.themeColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = meta.themeColor;
  ctx.fillRect(x - 10, y + 10, 4, 46);
  ctx.restore();

  drawGameTag(ctx, x + 14, y + 18, game, meta, 30);

  drawFrameStats(ctx, x + 250, y + 22, game, data, 'left');

  const tier = tierOf(meta.tiers, data.rating);
  const isRainbow = tier.color === null;
  const ratingText = meta.formatRating(data.rating);
  ctx.font = `italic 800 38px ${NUM_FONT}`;
  const rw = ctx.measureText(ratingText).width;
  const rx = W - GRID_SIDE - rw - 16;
  drawRatingText(ctx, ratingText, rx, y + 14, 38, isRainbow ? null : tier.color);
  ctx.font = `700 14px ${FONT}`;
  const btw = ctx.measureText(`${tier.name}レート`).width + 22;
  drawTierBadge(ctx, W - GRID_SIDE - btw - 16, y + 58, tier);
  drawSigWarning(ctx, rx - 20, y + 26, sigState);

  // タイル（全枠モードでは BEST / NEW / P-SCORE をサブ見出し（定員つき）で描く）
  const tileW = tileWidth(W, cols);
  // チェックサムが合わないデータは整数Lv・レート値なしに格下げ（→ docs/specs.md）
  const degraded = sigState === 'missing' || sigState === 'invalid';
  const drawGroup = async (list, count, startY, label, cap, mode) => {
    let ty = startY;
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = `800 13px ${FONT}`;
      drawTracked(ctx, cap ? `${label} ${count}/${cap}` : `${label} ${count}`, x + 4, ty, 3);
      ty += 26;
    }
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const tx = x + col * (tileW + GRID_GAP);
      await drawTile(ctx, tx, ty, tileW, game, meta, list[i], i, showScore, mode, degraded);
      if (col === cols - 1) ty += tileW + TILE_TEXT_H + GRID_GAP;
    }
    if (count % cols !== 0) ty += tileW + TILE_TEXT_H + GRID_GAP;
    return ty;
  };

  let ty = y + 86;
  const caps = meta.frames ?? {};
  if (nRec > 0 || nPlat > 0) {
    ty = await drawGroup(data.best, nBest, ty, 'BEST', caps.best);
    if (nRec > 0) {
      ty += 14;
      ty = await drawGroup(data.recent, nRec, ty, 'NEW', caps.recent);
    }
    if (nPlat > 0) {
      ty += 14;
      await drawGroup(data.platinum, nPlat, ty, 'P-SCORE', caps.platinum, 'platinum');
    }
  } else {
    await drawGroup(mergedTop(data), nBest, ty, null);
  }

  return y + secH;
}

/** 難易度の表示スタイル（各機種おおむね共通の色文法） */
const DIFF_STYLE = {
  BASIC: { label: 'BAS', color: '#66bb6a' },
  ADVANCED: { label: 'ADV', color: '#ffa726' },
  EXPERT: { label: 'EXP', color: '#ff7b7b' },
  MASTER: { label: 'MAS', color: '#ab7ee0' },
  'Re:MASTER': { label: 'Re:M', color: '#e6c9ff' },
  // ULTIMAは黒地に濃い赤の公式配色。EXPERTを明るい赤に寄せ、こちらは
  // 彩度の高い深紅にして、暗い背景でも沈まずに区別できるようにする
  ULTIMA: { label: 'ULT', color: '#e01235' },
  // オンゲキのLUNATICはmaimaiのRe:MASTERと同じ位置づけなので淡い紫に寄せる
  LUNATIC: { label: 'LUN', color: '#e6c9ff' },
};

function diffStyleOf(difficulty) {
  return DIFF_STYLE[difficulty] ?? { label: difficulty?.slice(0, 4) ?? '?', color: '#9aa3b8' };
}

async function drawTile(ctx, x, y, w, game, meta, song, index, showScore, mode, degraded = false) {
  const diff = diffStyleOf(song.difficulty);
  const isPlatinum = mode === 'platinum';

  // ジャケット＋難易度色の縁
  await drawJacket(ctx, x, y, w, song, meta.themeColor);
  ctx.save();
  roundRectPath(ctx, x + 1, y + 1, w - 2, w - 2, 5);
  ctx.strokeStyle = diff.color;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // 順位チップ（ジャケット左上）
  ctx.save();
  paraPath(ctx, x - 3, y + 6, 40, 22, 6);
  ctx.fillStyle = 'rgba(11,14,29,0.85)';
  ctx.fill();
  ctx.fillStyle = hexA(meta.themeColor, 1);
  ctx.font = `italic 800 14px ${NUM_FONT}`;
  ctx.fillText(`#${index + 1}`, x + 6, y + 10);
  ctx.restore();

  // ランクチップ（ジャケット右上）。プラチナ枠は☆数を出す
  {
    const label = isPlatinum ? `★${song.stars ?? 0}` : rankOf(game, song.score);
    const rc = isPlatinum
      ? (song.stars >= 5 ? null : '#ffe9a3')
      : rankColor(rankOf(game, song.score));
    ctx.font = `italic 800 13px ${NUM_FONT}`;
    const tw = ctx.measureText(label).width + 16;
    ctx.save();
    paraPath(ctx, x + w - tw + 2, y + 6, tw, 20, 5);
    ctx.fillStyle = 'rgba(11,14,29,0.85)';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = rc === null ? rainbowGradient(ctx, x + w - tw, y + 6, tw, RAINBOW_SOFT) : rc;
    ctx.font = `italic 800 13px ${NUM_FONT}`;
    ctx.fillText(label, x + w - tw + 10, y + 9);
  }

  // レート値（ジャケット右下に重ねる）。格下げ時は出さない。定数未確定は「?」付き
  if (!degraded && song.ratingValue != null) {
    const t = formatSongRating(game, song.ratingValue) + (song.constUnknown ? '?' : '');
    ctx.font = `italic 800 16px ${NUM_FONT}`;
    const tw = ctx.measureText(t).width + 18;
    ctx.save();
    paraPath(ctx, x + w - tw - 2, y + w - 26, tw, 22, 6);
    ctx.fillStyle = 'rgba(11,14,29,0.85)';
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(t, x + w - tw + 8, y + w - 22);
  }

  // 曲名
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = `600 13px ${FONT}`;
  ctx.fillText(truncate(ctx, song.title, w), x, y + w + 8);

  // マーク（オンゲキ: FB/FC/AB、maimai: FC/AP/FS等）はジャケット左下のチップに
  if (song.fullBell || song.clearMark || song.comboMark || song.syncMark) {
    const parts = [];
    if (song.fullBell) parts.push(['FB', '#5fd4e8']);
    if (song.clearMark) parts.push([song.clearMark, '#ffd97a']);
    if (song.comboMark) parts.push([song.comboMark, song.comboMark.startsWith('AP') ? '#ffb84d' : '#7ee08a']);
    if (song.syncMark) parts.push([song.syncMark, '#7fb8ff']);
    ctx.font = `800 11px ${NUM_FONT}`;
    const tw = parts.reduce((a, [t]) => a + ctx.measureText(t).width + 6, 10);
    ctx.save();
    paraPath(ctx, x - 3, y + w - 24, tw, 18, 5);
    ctx.fillStyle = 'rgba(11,14,29,0.85)';
    ctx.fill();
    ctx.restore();
    let mx = x + 5;
    for (const [t, c] of parts) {
      ctx.fillStyle = c;
      ctx.fillText(t, mx, y + w - 21);
      mx += ctx.measureText(t).width + 6;
    }
  }

  // 難易度＋定数（左・難易度色）／スコア（右）
  ctx.font = `800 13px ${NUM_FONT}`;
  ctx.fillStyle = diff.color;
  // 定数未確定（DB側is_unknown）は「12.7?」のように表示
  const diffText = song.level
    ? (degraded
      ? `${diff.label} ${Math.floor(song.level)}`
      : `${diff.label} ${song.level.toFixed ? song.level.toFixed(1) : song.level}${song.constUnknown ? '?' : ''}`)
    : diff.label;
  ctx.fillText(diffText, x, y + w + 27);
  if (showScore) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = `600 12px ${NUM_FONT}`;
    ctx.textAlign = 'right';
    ctx.fillText(formatScore(game, song.score), x + w, y + w + 29);
    ctx.textAlign = 'left';
  }
}

// ---------------------------------------------------------------- エントリポイント

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{maimai?: object, chunithm?: object, ongeki?: object}} dataByGame
 * @param {{ layout?: 'summary'|'grid', showBest?: boolean, bestCount?: number,
 *           showScore?: boolean }} [opts]
 */
export async function renderCard(canvas, dataByGame, opts = {}) {
  const layout = opts.layout ?? 'summary';
  const showBest = opts.showBest ?? true;
  const bestCount = opts.bestCount ?? 5;
  const showScore = opts.showScore ?? true;
  const nameOverride = opts.nameOverride ?? '';

  // 機種の選択（opts.games で false の機種は完全に除外 = 機種単体カード）
  const enabled = GAMES_ORDER.filter((g) => opts.games?.[g] !== false);
  const filtered = {};
  for (const g of enabled) filtered[g] = dataByGame[g] ?? null;
  dataByGame = filtered;

  await Promise.all([preloadJackets(dataByGame, bestCount), preloadLogos()]);

  const { W: gridW, cols } = gridLayoutOf(bestCount, dataByGame);
  const W = layout === 'grid' ? gridW : CARD_W;
  const H = layout === 'grid' ? gridTotalHeight(dataByGame, bestCount, W, cols) : SUMMARY_H;
  const dpr = H > 2200 ? 1.5 : 2;
  canvas.width = W * dpr;
  canvas.height = Math.round(H * dpr);
  canvas.style.width = '100%';
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.textBaseline = 'top';

  if (layout === 'grid') {
    await drawGrid(ctx, W, H, dataByGame, { bestCount, cols, showScore, nameOverride, sigStates: opts.sigStates });
  } else {
    drawSummary(ctx, dataByGame, { showBest, bestCount, nameOverride, sigStates: opts.sigStates });
  }
}
