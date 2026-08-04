// 3機種共通のデータスキーマ。ブックマークレットの出力もこの形に正規化する。
// スキーマを変えるときは bookmarklets/ 側と mock.js も揃えること。

/**
 * @typedef {Object} SongEntry
 * @property {string} title - 曲名（NETの表記そのまま。大小文字・記号を勝手に変換しない）
 * @property {string} difficulty - 難易度名（例 "MASTER", "Re:MASTER", "ULTIMA", "LUNATIC"）
 * @property {number} level - 譜面定数または表記レベル（取れた方。どちらかは constant フラグで区別）
 * @property {boolean} isConstant - level が譜面定数（内部値）なら true、表記レベルなら false
 * @property {number} score - スコア（maimai は達成率%を 100.5 のような数値で、
 *   CHUNITHM/オンゲキは 1010000 のような整数スコア）
 * @property {number|null} ratingValue - この曲がレーティングに寄与する値（算出できた場合）
 * @property {string|null} jacketUrl - ジャケット画像URL（NET上のURL直接参照。null 可）
 */

/**
 * @typedef {Object} GameData
 * @property {"maimai"|"chunithm"|"ongeki"} game
 * @property {string} playerName
 * @property {number} rating - 現在のレーティング値
 * @property {string} fetchedAt - 取得日時 ISO8601
 * @property {SongEntry[]} best - ベスト枠（旧曲枠）。取れなければ空配列
 * @property {SongEntry[]} recent - 新曲枠 / リーセント枠。取れなければ空配列
 * @property {string} toolVersion - 出力したブックマークレットのバージョン
 */

/**
 * 簡易チェックサムの検証。ブックマークレット側の sigOf と同一実装であること。
 * ⚠️ これは「カジュアルな手書き換えへの気休めの抑止」であり、セキュリティではない
 * （コードが公開されている以上、読める人は偽造できる）。→ docs/specs.md
 * @returns {'valid'|'invalid'|'missing'}
 */
export function verifySignature(o) {
  if (typeof o.sig !== 'string') return 'missing';
  const src = JSON.stringify([o.game, o.playerName, o.rating, o.fetchedAt,
    ...['best', 'recent'].map((k) => (o[k] || []).map((s) => [s.title, s.difficulty, s.score, s.ratingValue]))
  ]) + ':gekichumai-rating-card:v1';
  let h = 5381;
  for (let i = 0; i < src.length; i++) h = ((h * 33) ^ src.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0') === o.sig ? 'valid' : 'invalid';
}

/**
 * 読み込んだJSONの最低限の検証。壊れたデータで描画が黙って崩れるのを防ぐ。
 * @param {any} data
 * @returns {{ ok: true, data: GameData } | { ok: false, error: string }}
 */
export function validateGameData(data) {
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'JSONがオブジェクトではありません' };
  }
  if (!['maimai', 'chunithm', 'ongeki'].includes(data.game)) {
    return { ok: false, error: `game が不正です: ${data.game}` };
  }
  if (typeof data.rating !== 'number' || Number.isNaN(data.rating)) {
    return { ok: false, error: 'rating が数値ではありません' };
  }
  if (typeof data.playerName !== 'string') {
    return { ok: false, error: 'playerName がありません' };
  }
  if (!Array.isArray(data.best) || !Array.isArray(data.recent)) {
    return { ok: false, error: 'best / recent が配列ではありません' };
  }
  // 曲エントリの型検証。jacketUrlはdata:image限定
  // （postMessage経由で外部URLを注入されると、描画時に外部サーバーへ
  //   画像リクエストが飛ぶ／CORS汚染でPNG書き出しが壊れるため）
  for (const list of [data.best, data.recent, data.platinum ?? []]) {
    for (const s of list) {
      if (typeof s !== 'object' || s === null || typeof s.title !== 'string') {
        return { ok: false, error: '曲データの形式が不正です' };
      }
      if (typeof s.score !== 'number' || Number.isNaN(s.score)) {
        return { ok: false, error: `スコアが数値ではありません: ${s.title}` };
      }
      if (s.jacketUrl != null &&
        (typeof s.jacketUrl !== 'string' || !s.jacketUrl.startsWith('data:image/'))) {
        s.jacketUrl = null;
      }
    }
  }
  return { ok: true, data };
}
