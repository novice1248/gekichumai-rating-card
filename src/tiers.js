// レーティング段位のしきい値と表示色。
// ⚠️ しきい値はバージョンアップで変わりうる。実測とズレたらこのファイルだけ直す。
// 虹レ判定・グラデーション表示の唯一の情報源。

/**
 * @typedef {Object} Tier
 * @property {number} min - この段位の下限（この値以上）
 * @property {string} name - 段位名（表示用）
 * @property {string|null} color - 単色表示のCSSカラー。null なら虹グラデーション
 */

/** maimai でらっくす: でらっくすRATING（整数）
 *  出典: docs/specs.md */
export const MAIMAI_TIERS = [
  { min: 16000, name: '虹（極）', color: null },
  { min: 15000, name: '虹', color: null },
  { min: 14500, name: '白金', color: '#e5e4e2' },
  { min: 14000, name: '金', color: '#ffd700' },
  { min: 13000, name: '銀', color: '#c0c0c0' },
  { min: 12000, name: '銅', color: '#b87333' },
  { min: 10000, name: '紫', color: '#a260bf' },
  { min: 7000, name: '赤', color: '#e64a45' },
  { min: 4000, name: '黄', color: '#f0c419' },
  { min: 2000, name: '緑', color: '#4caf50' },
  { min: 1000, name: '青', color: '#2196f3' },
  { min: 0, name: '白', color: '#f5f5f5' },
];

/** CHUNITHM: レーティング（小数2桁、例 16.24）
 *  出典: docs/specs.md */
export const CHUNITHM_TIERS = [
  { min: 17.0, name: '虹（極）', color: null },
  { min: 16.0, name: '虹', color: null },
  { min: 15.25, name: '鉑', color: '#e5e4e2' },
  { min: 14.5, name: '金', color: '#ffd700' },
  { min: 13.25, name: '銀', color: '#c0c0c0' },
  { min: 12.0, name: '銅', color: '#b87333' },
  { min: 10.0, name: '紫', color: '#a260bf' },
  { min: 7.0, name: '赤', color: '#e64a45' },
  { min: 4.0, name: '橙', color: '#f28c28' },
  { min: 0, name: '緑', color: '#4caf50' },
];

/** オンゲキ: レーティング（小数3桁、Re:Fresh新体系）
 *  出典: docs/specs.md
 *  20.000で虹の発光が強まる仕様があるが、名称が確認できないため段位としては
 *  19.000〜を一律「虹」にしている。 */
export const ONGEKI_TIERS = [
  { min: 22.0, name: '虹（極）・真', color: null },
  { min: 21.0, name: '虹（極）', color: null },
  { min: 19.0, name: '虹', color: null },
  { min: 18.0, name: '白金', color: '#e5e4e2' },
  { min: 17.0, name: '金', color: '#ffd700' },
  { min: 15.0, name: '銀', color: '#c0c0c0' },
  { min: 13.0, name: '銅', color: '#b87333' },
  { min: 11.0, name: '紫', color: '#a260bf' },
  { min: 9.0, name: '赤', color: '#e64a45' },
  { min: 7.0, name: '橙', color: '#f28c28' },
  { min: 4.0, name: '緑', color: '#4caf50' },
  { min: 0, name: '水色', color: '#7fd8f0' },
];

export const GAME_META = {
  maimai: {
    label: 'maimai でらっくす',
    short: 'maimai',
    tiers: MAIMAI_TIERS,
    themeColor: '#00bcd4',
    formatRating: (r) => String(Math.trunc(r)),
    frames: { best: 35, recent: 15 }, // 枠の定員（→ docs/specs.md）
  },
  chunithm: {
    label: 'CHUNITHM',
    short: 'チュウニズム',
    tiers: CHUNITHM_TIERS,
    themeColor: '#f9a825',
    formatRating: (r) => r.toFixed(2),
    frames: { best: 30, recent: 20 },
  },
  ongeki: {
    label: 'オンゲキ',
    short: 'オンゲキ',
    tiers: ONGEKI_TIERS,
    themeColor: '#ec407a',
    formatRating: (r) => r.toFixed(3),
    frames: { best: 50, recent: 10, platinum: 50 },
  },
};

/** 単曲レート値の表示。桁数を機種ごとに固定して、縦に並べたとき右端が揃うようにする */
export function formatSongRating(game, v) {
  if (typeof v !== 'number') return '-';
  return game === 'maimai' ? String(Math.trunc(v)) : v.toFixed(game === 'ongeki' ? 3 : 2);
}

/**
 * 枠の単曲レートからレーティングを再計算する。NET表示との差は、譜面定数DBが
 * ゲームのバージョンに追いついていない・マークが取得できていない等の兆候になる。
 * @returns {{ calc: number, diff: number, tolerance: number } | null} 計算できなければnull
 */
export function recalcRating(game, data) {
  const lists = [data.best, data.recent, data.platinum].filter(Array.isArray);
  const values = lists.flat().map((s) => s.ratingValue);
  if (values.length === 0 || values.some((v) => typeof v !== 'number')) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  // maimaiは50譜面の合計そのもの、他機種は合計÷50（→ docs/specs.md）
  const calc = game === 'maimai' ? sum : Math.floor((sum / 50) * 100) / 100;
  const tolerance = game === 'maimai' ? 0 : 0.01;
  return { calc, diff: Math.round((calc - data.rating) * 1000) / 1000, tolerance };
}

/**
 * ゲキチュ“ウマイ”度（3機種横断の総合指標）。
 * 出典: ゲキ！チュウマイ公式生放送（CHUNITHM X-VERSE稼働直前＆10周年記念）
 * https://www.youtube.com/watch?v=8crvpPjYIew
 * 係数は例示（maimai 15,000 + CHUNITHM 16.00 + オンゲキ 19.000 → 50,000）で確定:
 * maimai×1・CHUNITHM×1000・オンゲキ×1000（＝小数点を払って桁を揃えて合算）。
 * ランク表も同放送より。銀未満の区分は公表されていないため未定義。
 */
export const GEKICHUMAI_POWER = {
  coeffs: { ongeki: 1000, chunithm: 1000, maimai: 1 },
  ranks: [
    { min: 55000, name: '虹（極）', color: null },
    { min: 50000, name: '虹', color: null },
    { min: 47750, name: '鉑', color: '#e5e4e2' },
    { min: 45500, name: '金', color: '#ffd700' },
    { min: 41250, name: '銀', color: '#c0c0c0' },
  ],
};

/** 3機種すべて揃っているときだけ値を返す。欠けていたら null。 */
export function gekichumaiPower(dataByGame) {
  const { coeffs } = GEKICHUMAI_POWER;
  if (!dataByGame.maimai || !dataByGame.chunithm || !dataByGame.ongeki) return null;
  const value =
    dataByGame.ongeki.rating * coeffs.ongeki +
    dataByGame.chunithm.rating * coeffs.chunithm +
    dataByGame.maimai.rating * coeffs.maimai;
  const rank = GEKICHUMAI_POWER.ranks.find((r) => value >= r.min) ?? null;
  return {
    value: Math.round(value),
    rank: rank?.name ?? null,
    rankColor: rank ? rank.color : undefined,
  };
}

/**
 * レーティング値から段位を引く。
 * @param {Tier[]} tiers
 * @param {number} rating
 * @returns {Tier}
 */
export function tierOf(tiers, rating) {
  return tiers.find((t) => rating >= t.min) ?? tiers[tiers.length - 1];
}
