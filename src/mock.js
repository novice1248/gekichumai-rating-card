// 描画確認用のモックデータ。全機種・全枠が定員まで埋まった状態を決定論的に生成する
// （maimai 35+15 / チュウニズム 30+20 / オンゲキ 50+10+プラチナ50）。
// 値は架空だが、単曲レートの並び・段位・ゲキチュウマイ度が「それらしく」見える水準に調整。

const TITLES = [
  'Astral Gate', '電脳スカイダイバー', 'Fractal Bloom', '真夜中シンドローム', 'Quasar Drive',
  '花吹雪エピローグ', 'Iron Lotus', 'ネオン・パレード', 'Gravity Waltz', '星屑テレグラフ',
  'Crimson Vector', 'ゆめうつつトラベラー', 'Paradox Engine', '雷鳴ガールズトーク', 'Silent Meteor',
  'はじまりのファンファーレ', 'Chrome Butterfly', '螺旋階段のマーチ', 'Last Horizon', '真紅のアリア',
  'Pixel Storm', 'おやすみユニバース', 'Zenith Breaker', '追憶レコード', 'Prism Cascade',
  '無限大スケッチ', 'Vortex Lullaby', '春雷カウントダウン', 'Eternal Compass', '月光ディストーション',
];

const title = (i) => (i < TITLES.length ? TITLES[i] : `${TITLES[i % TITLES.length]} ${Math.floor(i / TITLES.length) + 1}`);
const jitter = (i, k) => ((i * 7919 + k * 104729) % 97) / 97; // 決定論的な擬似乱数[0,1)

// maimai: 定数×達成率×Rank係数（→ src/tiers.js と同じ文法の値になるよう再現）
function maimaiSongs(count, topConst, diffPool) {
  return Array.from({ length: count }, (_, i) => {
    const c = Math.round((topConst - i * 0.04 - jitter(i, 1) * 0.05) * 10) / 10;
    const score = Math.round((100.9 - i * 0.02 - jitter(i, 2) * 0.4) * 10000) / 10000;
    const factor = score >= 100.5 ? 22.4 : score >= 100 ? 21.6 : 21.1;
    return {
      title: title(i), difficulty: diffPool[i % diffPool.length],
      level: c, isConstant: true, score,
      ratingValue: Math.floor(c * (Math.min(score, 100.5) / 100) * factor),
      jacketUrl: null,
      comboMark: i % 4 === 0 ? (i % 8 === 0 ? 'AP' : 'FC') : null,
      syncMark: i % 6 === 0 ? 'FS' : null,
    };
  }).sort((a, b) => b.ratingValue - a.ratingValue);
}

// チュウニズム: 定数＋スコア補間
function chunithmSongs(count, topConst, diffPool) {
  return Array.from({ length: count }, (_, i) => {
    const c = Math.round((topConst - i * 0.05 - jitter(i, 3) * 0.05) * 10) / 10;
    const score = Math.round(1009500 - i * 350 - jitter(i, 4) * 800);
    const bonus = score >= 1009000 ? 2.15 : score >= 1007500 ? 2.0 + (score - 1007500) * 0.0001 : 1.5;
    return {
      title: title(i + 5), difficulty: diffPool[i % diffPool.length],
      level: c, isConstant: true, score,
      ratingValue: Math.round((c + bonus) * 100) / 100,
      jacketUrl: null,
    };
  }).sort((a, b) => b.ratingValue - a.ratingValue);
}

// オンゲキ: 定数＋TS補間＋マーク加点
function ongekiSongs(count, topConst, diffPool) {
  return Array.from({ length: count }, (_, i) => {
    const c = Math.round((topConst - i * 0.03 - jitter(i, 5) * 0.05) * 10) / 10;
    const score = Math.round(1009800 - i * 280 - jitter(i, 6) * 600);
    const fullBell = i % 2 === 0;
    const clearMark = i % 3 === 0 ? 'AB' : i % 3 === 1 ? 'FC' : null;
    const base = score >= 1007500 ? 1.75 + (score - 1007500) * 0.0001 : 1.25;
    const marks = (score >= 1007500 ? 0.3 : 0.2) + (fullBell ? 0.05 : 0) +
      (clearMark === 'AB' ? 0.3 : clearMark === 'FC' ? 0.1 : 0);
    return {
      title: title(i + 10), difficulty: diffPool[i % diffPool.length],
      level: c, isConstant: true, score,
      ratingValue: Math.round((c + base + marks) * 1000) / 1000,
      jacketUrl: null, fullBell, clearMark,
    };
  }).sort((a, b) => b.ratingValue - a.ratingValue);
}

function ongekiPlatinum(count, topConst) {
  return Array.from({ length: count }, (_, i) => {
    const c = Math.round((topConst - i * 0.05 - jitter(i, 7) * 0.05) * 10) / 10;
    const stars = i < 10 ? 5 : i < 25 ? 4 : i < 40 ? 3 : 2;
    const max = Math.round(c * 230);
    return {
      title: title(i + 15), difficulty: i % 3 === 0 ? 'MASTER' : 'EXPERT',
      level: c, isConstant: true,
      score: Math.round(max * (0.93 + stars * 0.012)), scoreMax: max, stars,
      ratingValue: Math.round(stars * c * c) / 1000,
      jacketUrl: null,
    };
  }).sort((a, b) => b.ratingValue - a.ratingValue);
}

const NOW = '2026-08-04T12:00:00+09:00';

export const MOCK_DATA = {
  maimai: {
    game: 'maimai', playerName: 'ＭＯＣＫ', rating: 15432, fetchedAt: NOW, toolVersion: 'mock',
    best: maimaiSongs(35, 14.9, ['MASTER', 'MASTER', 'Re:MASTER', 'EXPERT']),
    recent: maimaiSongs(15, 14.4, ['MASTER', 'Re:MASTER']),
  },
  chunithm: {
    game: 'chunithm', playerName: 'ＭＯＣＫ', rating: 16.52, fetchedAt: NOW, toolVersion: 'mock',
    best: chunithmSongs(30, 14.8, ['MASTER', 'MASTER', 'ULTIMA', 'EXPERT']),
    recent: chunithmSongs(20, 14.2, ['MASTER', 'ULTIMA']),
  },
  ongeki: {
    game: 'ongeki', playerName: 'ＭＯＣＫ', rating: 20.123, fetchedAt: NOW, toolVersion: 'mock',
    best: ongekiSongs(50, 14.6, ['MASTER', 'EXPERT', 'MASTER', 'LUNATIC']),
    recent: ongekiSongs(10, 14.1, ['MASTER', 'EXPERT']),
    platinum: ongekiPlatinum(50, 14.5),
  },
};
