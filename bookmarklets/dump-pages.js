// 診断用: NETサイトの主要ページのHTMLをダウンロードする（3機種共通・1本）。
// 使い方: 各NETサイトにログインした状態でDevToolsコンソールに全文貼り付けて実行。
// サイトを自動判別し、候補ページを順に取得して <site>-<name>.html を落とす。
// ついでに各URLのHTTPステータス一覧も <site>-status.json として落とす。
// 外部への送信は一切しない（自分のPCへの保存のみ）。取得間隔は1.5秒。

(async () => {
  const WAIT_MS = 1500;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const host = location.host;
  let site, targets;
  if (host.includes('maimaidx.jp')) {
    site = 'maimai';
    targets = {
      home: '/maimai-mobile/home/',
      playerData: '/maimai-mobile/playerData/',
      ratingTarget: '/maimai-mobile/home/ratingTargetMusic/',
    };
  } else if (host.includes('chunithm-net')) {
    site = 'chunithm';
    targets = {
      home: '/chuni-mobile/html/mobile/home/',
      playerData: '/chuni-mobile/html/mobile/home/playerData/',
      ratingBest: '/chuni-mobile/html/mobile/home/playerData/ratingDetailBest/',
      ratingNew: '/chuni-mobile/html/mobile/home/playerData/ratingDetailRecent/',
    };
  } else if (host.includes('ongeki-net.com')) {
    site = 'ongeki';
    targets = {
      home: '/ongeki-mobile/home/',
      playerData: '/ongeki-mobile/record/playerData/',
      ratingTarget: '/ongeki-mobile/home/ratingTargetMusic/',
    };
  } else {
    alert('対応外のサイトです: ' + host);
    return;
  }

  const save = (name, text, type = 'text/html') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
  };

  const status = { site, host, fetchedAt: new Date().toISOString(), pages: {} };
  // まず今開いているページ自体も保存（fetch不要・確実に本物）
  save(`${site}-current(${location.pathname.replace(/\//g, '_')}).html`,
    document.documentElement.outerHTML);

  for (const [name, path] of Object.entries(targets)) {
    try {
      const res = await fetch(path, { credentials: 'include' });
      status.pages[name] = { path, status: res.status, finalUrl: res.url };
      if (res.ok) save(`${site}-${name}.html`, await res.text());
    } catch (e) {
      status.pages[name] = { path, error: e.message };
    }
    await sleep(WAIT_MS);
  }
  save(`${site}-status.json`, JSON.stringify(status, null, 2), 'application/json');
  console.log('[dump] 完了', status);
})();
