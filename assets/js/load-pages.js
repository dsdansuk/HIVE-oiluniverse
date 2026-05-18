(function () {
  var container = document.getElementById('page-container');
  if (!container) {
    console.error('[page-loader] #page-container를 찾을 수 없습니다.');
    return;
  }
  var routes = window.PAGE_ROUTES || [];
  var html = '';
  routes.forEach(function (route) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', route.file, false); // app.js 실행 전에 패널 DOM을 먼저 넣기 위한 동기 로드
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 || xhr.status === 0) {
        html += '\n' + xhr.responseText;
      } else {
        console.error('[page-loader] 페이지 로드 실패:', route.file, xhr.status);
      }
    } catch (e) {
      console.error('[page-loader] 페이지 로드 오류:', route.file, e);
    }
  });
  container.innerHTML = html;
})();
