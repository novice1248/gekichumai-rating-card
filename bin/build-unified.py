#!/usr/bin/env python3
"""bookmarklets/{maimai,chunithm,ongeki}.js から統合版 gekichumai.js を生成する。

各ファイルは `(async () => { ... })();` のIIFE。中身を関数化してホスト判別で振り分ける。
個別ファイルが正典。編集したらこのスクリプトを再実行すること:
    /usr/bin/python3 bin/build-unified.py
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'bookmarklets'
parts = []
for game in ['maimai', 'chunithm', 'ongeki']:
    src = (root / f'{game}.js').read_text(encoding='utf-8')
    m = re.search(r'\(async \(\) => \{\n(.*)\n\}\)\(\);\n?$', src, re.S)
    assert m, game
    body = m.group(1)
    parts.append(f'  async function run_{game}() {{\n{body}\n  }}\n')

out = (
    '// ゲキチュウマイ統合データ取得スクリプト（3機種共通・ブックマーク1個用）\n'
    '// このファイルは自動生成。編集は bookmarklets/<機種>.js に行い、\n'
    '// bin/build-unified.py で再生成すること。\n'
    '// 使い方: 各NETサイト上でコンソールに貼り付けて実行（サイトを自動判別）。\n'
    '//  - maimai / オンゲキ: レーティング対象曲ページで実行\n'
    '//  - チュウニズム: ログイン済みならどのページでも可\n'
    '//  - maimaiのFC/APマーク（任意）: ジャンル別スコアページで実行すると収集される\n\n'
    '(async () => {\n'
    '  // ローダー（script src注入）経由なら、読み込み元＝ツールのオリジンを特定し、\n'
    '  // 完了時に画面へオーバーレイを出して「タップでツールを開いて送る」（ファイルレス）。\n'
    '  // 開始時にwindow.openしない理由: ブックマークレット由来のopenはスマホSafariで\n'
    '  // 毎回ポップアップブロックされる。タップは本物のユーザー操作なので許可される。\n'
    '  // コンソール貼り付け時は currentScript が無いので従来のダウンロードになる。\n'
    '  const TOOL_ORIGIN = document.currentScript?.src ? new URL(document.currentScript.src).origin : null;\n'
    '  window.__grcDownload = (out) => {\n'
    '    const a = document.createElement("a");\n'
    '    a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));\n'
    '    const d = new Date();\n'
    '    const ts = d.toISOString().slice(0, 10).replace(/-/g, "") + "-" +\n'
    '      String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");\n'
    '    a.download = `${out.game}-${ts}.json`;\n'
    '    a.click();\n'
    '  };\n'
    '  // 進捗オーバーレイ（取得中の各段階を表示。完了時は送信ボタンに切り替わる）\n'
    '  let ovBox = null;\n'
    '  let ovMsg = null;\n'
    '  const ensureOverlay = () => {\n'
    '    if (ovBox) return;\n'
    '    ovBox = document.createElement("div");\n'
    '    ovBox.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(10,12,30,.9);' \
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;font-family:sans-serif;";\n'
    '    ovMsg = document.createElement("div");\n'
    '    ovMsg.style.cssText = "color:#fff;font-size:16px;padding:0 20px;text-align:center;line-height:1.8;";\n'
    '    ovBox.appendChild(ovMsg);\n'
    '    document.body.appendChild(ovBox);\n'
    '  };\n'
    '  window.__grcProgress = (text) => {\n'
    '    ensureOverlay();\n'
    '    ovMsg.textContent = text;\n'
    '  };\n'
    '  window.__grcSend = (out) => {\n'
    '    if (!TOOL_ORIGIN || TOOL_ORIGIN.includes(location.host)) return false;\n'
    '    ensureOverlay();\n'
    '    ovBox.textContent = "";\n'
    '    const msg = document.createElement("div");\n'
    '    msg.textContent = `${out.game} のデータ取得が完了しました`;\n'
    '    msg.style.cssText = "color:#fff;font-size:16px;padding:0 20px;text-align:center;";\n'
    '    const btn = document.createElement("button");\n'
    '    btn.textContent = "カードを開いて送る";\n'
    '    btn.style.cssText = "font-size:18px;padding:14px 30px;border-radius:10px;border:0;background:#5b6cff;color:#fff;";\n'
    '    const alt = document.createElement("button");\n'
    '    alt.textContent = "JSONで保存する";\n'
    '    alt.style.cssText = "font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid #778;background:transparent;color:#ccd;";\n'
    '    const closeB = document.createElement("button");\n'
    '    closeB.textContent = "閉じる";\n'
    '    closeB.style.cssText = "font-size:13px;padding:8px 18px;border-radius:8px;border:1px solid #556;background:transparent;color:#99a;";\n'
    '    closeB.onclick = () => ovBox.remove();\n'
    '    const ov = ovBox;\n'
    '    ov.append(msg, btn, alt, closeB);\n'
    '    // 送信の実体。auto=1で開いたタブは保存後に自分で閉じる（タブが残らない）\n'
    '    const startSend = (auto) => {\n'
    '      const w = window.open(`${TOOL_ORIGIN}/?receive=1${auto ? "&auto=1" : ""}`, "grc-tool");\n'
    '      if (!w) return false;\n'
    '      const onMsg = (e) => {\n'
    '        if (e.origin !== TOOL_ORIGIN) return;\n'
    '        if (e.data === "grc-ready") w.postMessage({ type: "grc-data", payload: out }, TOOL_ORIGIN);\n'
    '        if (e.data === "grc-saved") {\n'
    '          window.removeEventListener("message", onMsg);\n'
    '          msg.textContent = "カードに反映されました";\n'
    '          btn.textContent = "カードを見る";\n'
    '          btn.onclick = () => window.open(TOOL_ORIGIN, "grc-tool");\n'
    '          alt.remove();\n'
    '        }\n'
    '      };\n'
    '      window.addEventListener("message", onMsg);\n'
    '      msg.textContent = "送信中…";\n'
    '      return true;\n'
    '    };\n'
    '    btn.onclick = () => {\n'
    '      if (!startSend(false)) msg.textContent = "ポップアップがブロックされました。「JSONで保存する」を使ってください";\n'
    '    };\n'
    '    alt.onclick = () => { ov.remove(); window.__grcDownload(out); };\n'
    '    // まず自動送信を試す（許可されていればタップ不要・タブは保存後に自動で閉じる）。\n'
    '    // ブロックされたらボタン表示のまま＝従来のワンタップ。\n'
    '    if (startSend(true)) {\n'
    '      msg.textContent = "自動送信中…（ブラウザがポップアップを許可している場合）";\n'
    '    } else {\n'
    '      msg.textContent = `${out.game} のデータ取得が完了しました（毎回自動にしたい場合は、このサイトのポップアップを許可してください）`;\n'
    '    }\n'
    '    return true;\n'
    '  };\n'
    '  const host = location.host;\n'
    "  if (host.includes('maimaidx.jp')) return run_maimai();\n"
    "  if (host.includes('chunithm-net')) return run_chunithm();\n"
    "  if (host.includes('ongeki-net.com')) return run_ongeki();\n"
    "  alert('ゲキチュウマイのNETサイト（maimaidx.jp / chunithm-net / ongeki-net.com）で実行してください');\n\n"
    + '\n'.join(parts)
    + '})();\n'
)
(root / 'gekichumai.js').write_text(out, encoding='utf-8')
print('generated bookmarklets/gekichumai.js', len(out), 'bytes')
