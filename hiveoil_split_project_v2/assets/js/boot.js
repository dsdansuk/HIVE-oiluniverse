
window.HIVEOIL_PAGE_IDS = ["owner-dash", "owner-login", "driver-login", "hq-login", "dashboard", "map", "billing", "waste", "order", "owner-history", "history", "price", "price-view", "esg", "owner", "qr", "consumer", "esg-school", "esg-franchise", "support", "privacy", "terms", "apply", "register", "admin", "security", "schedule"];
async function loadPanelFragments() {
  const host = document.getElementById('panelHost');
  for (const id of window.HIVEOIL_PAGE_IDS) {
    const res = await fetch('pages/' + id + '.html?v=' + (window.APP_BUILD || Date.now()), { cache: 'no-store' });
    if (!res.ok) throw new Error('페이지 로드 실패: ' + id + ' (' + res.status + ')');
    host.insertAdjacentHTML('beforeend', await res.text());
  }
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src + '?v=' + (window.APP_BUILD || Date.now());
    s.onload = resolve;
    s.onerror = () => reject(new Error('스크립트 로드 실패: ' + src));
    document.body.appendChild(s);
  });
}
document.addEventListener('DOMContentLoaded', async function() {
  if (window.__HIVEOIL_BOOTED) return;
  window.__HIVEOIL_BOOTED = true;
  try {
    await loadPanelFragments();
    await loadScript('assets/js/app.js');
    // app.js는 분리 후 동적 로드되므로, app.js 내부 DOMContentLoaded 초기화 루틴을 한 번 실행시킵니다.
    document.dispatchEvent(new Event('DOMContentLoaded'));
    window.dispatchEvent(new Event('load'));
    document.dispatchEvent(new CustomEvent('hiveoil:ready'));
  } catch (err) {
    console.error('[HIVEOIL BOOT]', err);
    document.body.insertAdjacentHTML('beforeend', '<div style="position:fixed;inset:20px;z-index:999999;background:#fff;border:2px solid #C0392B;border-radius:14px;padding:20px;font-family:sans-serif;color:#C0392B;">앱 로드 실패<br><small>' + err.message + '</small></div>');
  }
});
