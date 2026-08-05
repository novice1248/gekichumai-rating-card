# レーティング仕様と出典

実装（`src/tiers.js` / `src/rank.js` / `bookmarklets/`）に埋めた数値の根拠。
ゲームのバージョンアップで表示や計算がズレたら、ここの出典を再確認して直す。

## maimai でらっくす

- 枠構成: 新曲枠15譜面＋ベスト枠35譜面（計50譜面の合計）
- 単曲レート = 譜面定数 × 達成率 × Rank係数（切り捨て）。達成率は100.5%が上限
- 出典: https://gamerch.com/maimai/533647 （レーティング・段位色・Rank係数）
  / https://gamerch.com/maimai/533359 （スコアランク）
  / https://sgimera.github.io/mai_RatingAnalyzer/maidx_rating.html （係数表）
- 対象曲ページ: `/maimai-mobile/home/ratingTargetMusic/`（要スタンダードコース）

## CHUNITHM

- 枠構成: ベスト枠30譜面＋新曲枠20譜面（計50譜面の平均）
- 単曲レート: 定数＋スコア帯ごとの加算（S以上は+0.0〜+2.15、S未満は減算帯）を
  線形補間。端数は各曲・平均とも小数第2位切り捨て
- 出典: https://wikiwiki.jp/chunithmwiki/レーティング・OVER%20POWER
  / https://wikiwiki.jp/chunithmwiki/ゲームシステム1 （スコアランク）
  / https://github.com/AkashiSN/CHUNITHM-Rate-Calculator-PHP （S未満の帯）
- ベスト枠ページ: `/chuni-mobile/html/mobile/home/playerData/ratingDetailBest/`

## オンゲキ（Re:Fresh新体系）

- 枠構成: 新曲枠10譜面＋ベスト枠50譜面＋プラチナスコア枠50譜面（合計÷50）
- 曲別TSレート: 基準点（1,010,000=+2.000 / 1,007,500=+1.750 / 1,000,000=+1.250 /
  990,000=+0.750 / 970,000=±0 / 900,000=−4.000 / 800,000=−6.000）の線形補間
  ＋スコアマーク（SS/SSS/SSS+ = +0.1/0.2/0.3）＋FULL BELL（+0.05）
  ＋クリアマーク（FC/AB/AB+ = +0.1/0.3/0.35）
- 曲別PSレート = ☆数 × 定数² ÷ 1000（☆は達成率94%から1%刻みで★1〜5）。
  達成率99%以上は虹色の★5になるが、PSレートは通常の★5と同じなので区別しない
- 出典: https://wikiwiki.jp/gameongeki/レーティングシステム
  / https://info-ongeki.sega.jp/9070/
- スコアランク: SSS+ 1,007,500 / SSS 1,000,000 / SS 990,000 / S 970,000。
  **AAA以下のしきい値は未確認**（`src/rank.js` で仮置き。表示にのみ影響）
- 対象曲ページ: `/ongeki-mobile/home/ratingTargetMusic/`（要プレミアムコース）

## ゲキチュ“ウマイ”度

- 合算値 = maimai×1 ＋ CHUNITHM×1000 ＋ オンゲキ×1000
- ランク: 虹（極）55,000〜 / 虹 50,000〜 / 鉑 47,750〜 / 金 45,500〜 / 銀 41,250〜
  （銀未満は未公表）
- 出典: 「CHUNITHM X-VERSE稼働直前＆10周年記念！ゲキ！チュウマイ公式生放送」
  https://www.youtube.com/watch?v=8crvpPjYIew （ランク表と例示
  「maimai 15,000 + CHUNITHM 16.00 + オンゲキ 19.000 → 50,000で虹」で係数を確定）

## 楽曲情報API（reiwa.f5.si）

- https://reiwa.f5.si/api.html — 3機種の譜面定数DB（`*_record.json`、chunirec互換）。
  非営利利用のみ・過度なリクエスト禁止。CORS許可あり
- 取得結果はlocalStorageに24時間キャッシュする

## 設計上の制約

- **定数×リザルトの紐付けデータは課金コース加入者にしか作らせない**。データの入口を
  レーティング対象曲ページ（課金限定）に限定し、非会員向けの取得経路や
  全曲スコア＋定数表示は作らない。チェックサムが無い／合わないデータは整数Lv表示に格下げする
- ジャケットは取得スクリプトがNETサイト上（同一オリジン）で取得してdata URLで
  データに同梱する。ツール・リポジトリには著作物を含めない
- maimai・オンゲキのNETはページfetchが`/error/`へリダイレクトされるため、
  開いているページのDOMを直接解析する（チュウニズムのみfetch可）
