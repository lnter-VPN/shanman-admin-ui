'use strict';

// GitHub Pages does not expose per-project response-header configuration.
// Refuse to render the administration UI inside a frame as a best-effort
// clickjacking fallback; the API still requires authenticated requests.
if (window.top !== window.self) {
  document.documentElement.replaceChildren();
  document.documentElement.textContent = '管理后台不能在其他页面中嵌入打开。';
}
