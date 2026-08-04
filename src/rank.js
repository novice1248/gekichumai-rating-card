// スコア→ランク（SSS+等）の導出。
// ⚠️ しきい値は要実測検証。バージョン差異があればここだけ直す。

/** maimai: 達成率% → ランク（出典: docs/specs.md） */
const MAIMAI_RANKS = [
  [100.5, 'SSS+'], [100.0, 'SSS'], [99.5, 'SS+'], [99.0, 'SS'],
  [98.0, 'S+'], [97.0, 'S'], [94.0, 'AAA'], [90.0, 'AA'], [80.0, 'A'],
  [75.0, 'BBB'], [70.0, 'BB'], [60.0, 'B'], [50.0, 'C'],
];

/** CHUNITHM: スコア → ランク（出典: docs/specs.md） */
const CHUNITHM_RANKS = [
  [1009000, 'SSS+'], [1007500, 'SSS'], [1005000, 'SS+'], [1000000, 'SS'],
  [990000, 'S+'], [975000, 'S'], [950000, 'AAA'], [925000, 'AA'], [900000, 'A'],
  [800000, 'BBB'], [700000, 'BB'], [600000, 'B'], [500000, 'C'],
];

/** オンゲキ: テクニカルスコア → ランク
 *  SSS+/SSS/SS/S は確認済み（出典: docs/specs.md）。
 *  ⚠️ AAA以下のしきい値は未確認の仮置き。実データで裏取りしたら直す。 */
const ONGEKI_RANKS = [
  [1007500, 'SSS+'], [1000000, 'SSS'], [990000, 'SS'], [970000, 'S'],
  [940000, 'AAA'], [900000, 'AA'], [850000, 'A'],
];

const TABLES = { maimai: MAIMAI_RANKS, chunithm: CHUNITHM_RANKS, ongeki: ONGEKI_RANKS };

/**
 * @param {"maimai"|"chunithm"|"ongeki"} game
 * @param {number} score
 * @returns {string}
 */
export function rankOf(game, score) {
  const hit = TABLES[game].find(([min]) => score >= min);
  return hit ? hit[1] : 'B';
}

/** ランクの表示色（SSS+系は虹、SSS/SSは金、他は控えめ） */
export function rankColor(rank) {
  if (rank === 'SSS+') return null; // 虹グラデーション
  if (rank === 'SSS') return '#ffd700';
  if (rank.startsWith('SS')) return '#ffe89a';
  if (rank.startsWith('S')) return '#c9d4ff';
  return '#9aa3b8';
}

/** スコアの表示文字列 */
export function formatScore(game, score) {
  if (game === 'maimai') return `${score.toFixed(4)}%`;
  return score.toLocaleString('en-US');
}
