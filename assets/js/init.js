// 빌드 버전 콘솔 표시 (사용자가 새 버전인지 확인 가능)
    window.APP_BUILD = '2026-05-13-v115-price-label-min';
    console.log('%c🫒 식용유니버스 빌드:', 'color:#05C46B;font-weight:bold;font-size:14px', window.APP_BUILD);
    // 🔧 관리자 대시보드에 빌드 버전 표시
    document.addEventListener('DOMContentLoaded', function() {
      var el = document.getElementById('adminBuildVersionText');
      if (el) el.textContent = window.APP_BUILD;
    });
    // 🔍 글로벌 에러 핸들러 — SyntaxError 등 모든 에러 캡처
    window.addEventListener('error', function(ev) {
      console.error('🚨 [GLOBAL ERROR]', {
        message: ev.message,
        filename: ev.filename,
        line: ev.lineno,
        col: ev.colno,
        error: ev.error,
        stack: ev.error ? ev.error.stack : null
      });
    });
    window.addEventListener('unhandledrejection', function(ev) {
      console.error('🚨 [UNHANDLED PROMISE]', ev.reason);
    });
    // 휴지통 마이그레이션 — v8 이전의 단순 raw: 키 제거 (오작동 방지)
    try {
      var _delSet = JSON.parse(localStorage.getItem('hiveoil_deleted_history') || '{}');
      var _migrated = false;
      Object.keys(_delSet).forEach(function(k) {
        // v8 이전 형식: raw:<ISO> (콜론이 정확히 1개) → 새 형식과 매칭 안 되니 제거
        if (k.indexOf('raw:') === 0) {
          var afterRaw = k.substring(4);
          // 새 형식은 raw:bizId:type:qty:rawDate (콜론 4개 이상)
          // 옛 형식은 raw:rawDate (콜론 0개 in afterRaw — ISO date도 콜론 있긴 함, 더 정확히 검증)
          var colonCount = (afterRaw.match(/:/g) || []).length;
          // ISO 날짜는 시각 부분에 콜론 2개 (HH:MM:SS), 새 형식은 + 추가 콜론 3개 → 5개 이상
          if (colonCount < 4) {
            delete _delSet[k];
            _migrated = true;
          }
        }
      });
      if (_migrated) {
        localStorage.setItem('hiveoil_deleted_history', JSON.stringify(_delSet));
        console.log('🔄 휴지통 마이그레이션 완료 — 옛 키 제거');
      }
    } catch(e) {}
    // 모바일 당겨서 새로고침 차단 (세션 유지 목적)
    // 스크롤 최상단에서 아래로 당길 때만 차단
    var _pty = 0, _ptScrollTop = 0;
    document.addEventListener('touchstart', function(e) {
      _pty = e.touches[0].clientY;
      _ptScrollTop = document.documentElement.scrollTop || document.body.scrollTop || 0;
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      var dy = e.touches[0].clientY - _pty;
      // 최상단(scrollTop=0)에서 아래로 당기는 경우만 차단
      if (_ptScrollTop <= 0 && dy > 10) {
        e.preventDefault();
      }
    }, { passive: false });