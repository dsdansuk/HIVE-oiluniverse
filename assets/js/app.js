
    // 빌드 버전 콘솔 표시 (사용자가 새 버전인지 확인 가능)
    window.APP_BUILD = '2026-05-14-v150-orphan-div';
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
  


// ===== 전역 시세 데이터 (관리자 수정 가능) =====
const PRICES_DEFAULT = {
  oils: {
    soy:    { label:'대두유',     unit:'18L', price:41000, vat:true },
    canola: { label:'카놀라유',   unit:'18L', price:43000, vat:true },
    corn:   { label:'옥수수유',   unit:'18L', price:46000, vat:true },
    sun:    { label:'해바라기유', unit:'18L', price:50000, vat:true },
  },
  // 제품별 세부 시세 (유종별 최고가가 topbar에 표시됨)
  products: {
    // 대두유
    soy_wonju:   { label:'원주식용유',         type:'soy',    unit:'18L', price:41000, vat:true },
    soy_grewell: { label:'그리웰 콩식용유',     type:'soy',    unit:'18L', price:40000, vat:true },
    soy_oilers:  { label:'오일러스 콩식용유',   type:'soy',    unit:'18L', price:39000, vat:true },
    soy_ottogi:  { label:'오뚜기 콩식용유',     type:'soy',    unit:'18L', price:0,     vat:true, hideTop:true },
    soy_haepyo:  { label:'해표 콩식용유',       type:'soy',    unit:'18L', price:0,     vat:true, hideTop:true },
    // 카놀라유
    can_grewell: { label:'그리웰 카놀라유',     type:'canola', unit:'18L', price:43000, vat:true },
    can_oilers:  { label:'오일러스 카놀라유',   type:'canola', unit:'18L', price:42000, vat:true },
    // 옥수수유
    corn_oilers: { label:'오일러스 옥배유',     type:'corn',   unit:'18L', price:46000, vat:true },
    // 해바라기유 🆕
    sun_grewell: { label:'그리웰 해바라기유',   type:'sun',    unit:'18L', price:50000, vat:true },
  },
  waste: {
    can: { label:'캔', kg:16.5, price:19000, vat:true },
  },
  esgRate: 8.75,
  carbonRate: 0.7,
  // 🆕 ESG 포인트 적립율
  pointRates: {
    purchase: 0.05,  // 식용유 구매 시 5%
    waste:    0.05,  // 폐유 수거 시 5%
  },
  // 🆕 자동 임계값 시스템 기본값 (업체별로 override 가능)
  thresholds: {
    autoOrder:   2,  // 식용유 N캔 이하 시 자동발주 트리거
    autoCollect: 2,  // 폐유 M캔 이상 시 자동수거 트리거
  },
};

// 시세는 코드 기본값 사용 (서버 DB 연동 전까지)
const PRICES = JSON.parse(JSON.stringify(PRICES_DEFAULT));

// ============================================================
// 🌿 ESG 포인트 헬퍼 함수
// ============================================================
// 거래 1건당 적립될 포인트 계산
function calcEarnedPoints(historyItem) {
  if (!historyItem) return 0;
  if (historyItem.deleted_at) return 0;
  if (historyItem.status !== 'done') return 0;

  // ISCC 미동의 업체는 포인트 적립 X
  if (typeof isIsccAgreed === 'function' && !isIsccAgreed(historyItem.bizId)) return 0;

  // 🚫 타사 브랜드 제외 (자체 제품만 5% 적립)
  // 해표·오뚜기 식용유는 발주해도 적립 X
  var POINT_EXCLUDED_PRODUCTS = ['soy_ottogi', 'soy_haepyo'];
  if (historyItem.type === '식용유발주' &&
      historyItem.productKey &&
      POINT_EXCLUDED_PRODUCTS.indexOf(historyItem.productKey) !== -1) {
    return 0;
  }

  var amt = parseInt((historyItem.amount || '0').toString().replace(/[^0-9]/g, '')) || 0;
  if (amt <= 0) return 0;

  var rate = 0;
  if (historyItem.type === '식용유발주') {
    rate = (PRICES.pointRates && PRICES.pointRates.purchase) || 0.05;
  } else if (historyItem.type === '폐유수거') {
    rate = (PRICES.pointRates && PRICES.pointRates.waste) || 0.05;
  } else {
    return 0;
  }
  return Math.round(amt * rate);
}

// 업체별 누적 포인트 잔액 (적립 - 차감)
function getBizPointBalance(bizId) {
  if (!bizId) return 0;
  var earned = 0, used = 0;
  historyData.forEach(function(h) {
    if (h.deleted_at) return;
    if (String(h.bizId) !== String(bizId)) return;
    earned += (h.earnedPoints || 0);
    used += (h.usedPoints || 0);
  });
  return earned - used;
}

// 전체 누적 포인트 (전체 업체 합산)
function getTotalPointBalance() {
  var earned = 0, used = 0;
  historyData.forEach(function(h) {
    if (h.deleted_at) return;
    earned += (h.earnedPoints || 0);
    used += (h.usedPoints || 0);
  });
  return { earned: earned, used: used, balance: earned - used };
}

// history 항목에 포인트가 비어있으면 자동 채워서 DB에 동기화 (마이그레이션)
async function backfillPointsIfMissing(historyItem) {
  if (!historyItem || !historyItem.id) return;
  if (typeof historyItem.earnedPoints === 'number' && historyItem.earnedPoints > 0) return;
  if (historyItem.status !== 'done') return;
  var pts = calcEarnedPoints(historyItem);
  if (pts <= 0) return;
  historyItem.earnedPoints = pts;
  try {
    if (typeof db !== 'undefined') {
      await db.from('history').update({ earned_points: pts }).eq('id', historyItem.id);
    }
  } catch(e) { console.warn('[Points] backfill 실패:', e.message); }
}

// 모든 done 거래 일괄 backfill (관리자 콘솔에서 호출 가능)
window.backfillAllPoints = async function() {
  var done = historyData.filter(function(h) {
    return h.status === 'done' && !h.deleted_at && (!h.earnedPoints || h.earnedPoints === 0);
  });
  console.log('[Points] backfill 대상:', done.length, '건');
  for (var i = 0; i < done.length; i++) {
    await backfillPointsIfMissing(done[i]);
  }
  console.log('[Points] backfill 완료');
  saveHistory();
  if (typeof renderEsgPanel === 'function') renderEsgPanel();
  return done.length;
};

// ============================================================
// 🆕 업주 친화 단위 헬퍼 (kg → 캔 표시)
// ============================================================
// 업주 모드일 때만 단순 "캔"으로 표시, 관리자/드라이버는 kg 그대로
function isOwnerView() {
  return (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn) 
    && !(typeof isAdminMode !== 'undefined' && isAdminMode) 
    && !(typeof isDriverMode !== 'undefined' && isDriverMode);
}
// 캔수 기반 표시 — 업주: "5캔", 그 외: "5캔(82.5kg)"
function formatCans(cans) {
  cans = cans || 0;
  if (isOwnerView()) {
    return cans + '캔';
  }
  var kg = (cans * PRICES.waste.can.kg).toFixed(1);
  return cans + '캔 (' + kg + 'kg)';
}
// 단순 무게 표시 — 업주: 캔으로 환산, 그 외: kg 그대로
function formatWeightKg(kg) {
  kg = kg || 0;
  if (isOwnerView()) {
    var cans = (kg / PRICES.waste.can.kg).toFixed(1);
    return cans + '캔';
  }
  return kg.toFixed(1) + 'kg';
}

// ============================================================
// 🆕 업체별 자동 임계값 헬퍼
// ============================================================
function getAutoOrderThreshold(biz) {
  if (biz && typeof biz.autoOrderThreshold === 'number' && biz.autoOrderThreshold > 0) {
    return biz.autoOrderThreshold;
  }
  return (PRICES.thresholds && PRICES.thresholds.autoOrder) || 2;
}
function getAutoCollectThreshold(biz) {
  if (biz && typeof biz.autoCollectThreshold === 'number' && biz.autoCollectThreshold > 0) {
    return biz.autoCollectThreshold;
  }
  return (PRICES.thresholds && PRICES.thresholds.autoCollect) || 2;
}
// 자동발주 필요 여부
// 🔇 자동발주 알림 24시간 dismiss — 카드의 [취소] 버튼
async function dismissAutoOrder(bizId) {
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;
  if (!confirm('이 업체의 자동발주 알림을 24시간 동안 끌까요?\n\n(자동발주 설정 자체는 그대로 유지됩니다)')) return;
  var until = Date.now() + 24 * 60 * 60 * 1000;
  biz._suppressAutoOrder = until;
  saveBusinesses();
  try {
    if (typeof db !== 'undefined') {
      await db.from('businesses')
        .update({ suppress_auto_order_until: new Date(until).toISOString() })
        .eq('id', biz.id);
    }
  } catch(e) { console.warn('suppress 동기화 실패:', e.message); }
  showToast('t1','🔇 알림 24h 끄기', biz.name + ' 자동발주 알림 일시 중지');
  window._lastBizListSig = null;
  if (typeof renderOrderPanel === 'function') renderOrderPanel();
  if (typeof refreshAllPanels === 'function') refreshAllPanels();
}

// 🔇 자동수거 알림 24시간 dismiss — 카드의 [취소] 버튼
async function dismissAutoCollect(bizId) {
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;
  if (!confirm('이 업체의 자동수거 알림을 24시간 동안 끌까요?\n\n(자동수거 설정 자체는 그대로 유지됩니다)')) return;
  var until = Date.now() + 24 * 60 * 60 * 1000;
  biz._suppressAutoCollect = until;
  saveBusinesses();
  try {
    if (typeof db !== 'undefined') {
      await db.from('businesses')
        .update({ suppress_auto_collect_until: new Date(until).toISOString() })
        .eq('id', biz.id);
    }
  } catch(e) { console.warn('suppress 동기화 실패:', e.message); }
  showToast('t1','🔇 알림 24h 끄기', biz.name + ' 자동수거 알림 일시 중지');
  window._lastBizListSig = null;
  if (typeof renderCollectPanel === 'function') renderCollectPanel();
  if (typeof refreshAllPanels === 'function') refreshAllPanels();
}

// 🆕 v146: 자동수거 항목 '진짜' 취소 — 항목을 목록에서 제거 + 자동수거 OFF
async function cancelAutoCollect(bizId) {
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;
  // 권한: 업주 본인 / 관리자 / 운반자
  var canCancel = (ownerLoggedIn && String(bizId) === String(ownerBizId)) || isAdminMode || isDriverMode;
  if (!canCancel) { showToast('t1','🔒 권한 없음',''); return; }

  if (!confirm('이 업체의 수거 요청을 취소할까요?\n\n• 화면 목록에서 즉시 제거\n• 자동수거 알림 OFF (수량 다시 채워지면 알림 재발생)')) return;

  // ① 자동수거 OFF (사용자 의도: "이 항목 제거")
  biz.autoCollect = false;
  // ② suppress도 같이 해제 (혹시 켜져 있었다면)
  biz._suppressAutoCollect = 0;

  saveBusinesses();
  try {
    if (typeof db !== 'undefined') {
      await db.from('businesses')
        .update({
          auto_collect: false,
          suppress_auto_collect_until: null
        })
        .eq('id', biz.id);
    }
  } catch(e) { console.warn('autoCollect OFF 동기화 실패:', e.message); }

  showToast('t1','✅ 수거 요청 취소', biz.name + ' 자동수거 OFF');
  window._lastBizListSig = null;
  if (typeof renderCollectPanel === 'function') renderCollectPanel();
  if (typeof renderWastePendingList === 'function') renderWastePendingList();
  if (typeof refreshAllPanels === 'function') refreshAllPanels();
}

// 🆕 v146: 자동발주 항목 '진짜' 취소 — 항목을 목록에서 제거 + 자동발주 OFF
async function cancelAutoOrderRow(bizId) {
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;
  var canCancel = (ownerLoggedIn && String(bizId) === String(ownerBizId)) || isAdminMode || isDriverMode;
  if (!canCancel) { showToast('t1','🔒 권한 없음',''); return; }

  if (!confirm('이 업체의 발주 요청을 취소할까요?\n\n• 화면 목록에서 즉시 제거\n• 자동발주 알림 OFF (재고 다시 줄어들면 알림 재발생)')) return;

  biz.auto = false;
  biz._suppressAutoOrder = 0;

  saveBusinesses();
  try {
    if (typeof db !== 'undefined') {
      await db.from('businesses')
        .update({
          auto_order: false,
          suppress_auto_order_until: null
        })
        .eq('id', biz.id);
    }
  } catch(e) { console.warn('autoOrder OFF 동기화 실패:', e.message); }

  showToast('t1','✅ 발주 요청 취소', biz.name + ' 자동발주 OFF');
  window._lastBizListSig = null;
  if (typeof renderDeliveryPanel === 'function') renderDeliveryPanel();
  if (typeof refreshAllPanels === 'function') refreshAllPanels();
}

function shouldAutoOrder(biz) {
  if (!biz || biz.auto === false) return false;
  // 🆕 24h dismiss 적용 중이면 알림 끔
  if (biz._suppressAutoOrder && Date.now() < biz._suppressAutoOrder) return false;
  var current = getBizTotalNewOil(biz);
  var threshold = getAutoOrderThreshold(biz);
  return current <= threshold;
}
// 자동수거 필요 여부
function shouldAutoCollect(biz) {
  if (!biz || biz.autoCollect === false) return false;
  // 🆕 24h dismiss 적용 중이면 알림 끔
  if (biz._suppressAutoCollect && Date.now() < biz._suppressAutoCollect) return false;
  var threshold = getAutoCollectThreshold(biz);
  return (biz.wasteOil || 0) >= threshold;
}

// ============================================================
// 🆕 노트 #2 — 알림 시스템 (인앱 + 환경설정)
// ============================================================
// 알림 환경설정 - 기본값: 모두 ON
function loadNotifSettings() {
  try {
    var saved = localStorage.getItem('hiveoil_notif_settings');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return {
    enabled: true,
    register: true,    // 회원가입 신청
    lowStock:  true,   // 재고 부족
    order:     true,   // 발주
    collect:   true,   // 폐유 수거
    sound:     true,   // 알림음
    pushApi:   false,  // 브라우저 푸시 API 사용 (옵션)
  };
}
function saveNotifSettings(s) {
  try { localStorage.setItem('hiveoil_notif_settings', JSON.stringify(s)); } catch(e) {}
}
var notifSettings = loadNotifSettings();

// 알림 데이터
function loadNotifications() {
  try {
    var saved = localStorage.getItem('hiveoil_notifications');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [];
}
function saveNotifications() {
  try {
    // 최근 100건만 유지
    var recent = notifications.slice(0, 100);
    localStorage.setItem('hiveoil_notifications', JSON.stringify(recent));
  } catch(e) { console.warn('알림 저장 실패:', e.message); }
}
var notifications = loadNotifications();

// ============================================================
// 🔔 Web Push API — 백엔드 푸시 알림 (앱이 닫혀있어도 옴)
// ============================================================
const VAPID_PUBLIC_KEY = 'BEeP9jp06sQ_ZrzgzL8oQwx1vayL2tG2tIE3yY_inDGXY4Pg1CKgeHFzkhy9vt1rUGY7tARcufZoO3OJDKBxCyQ';

function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// 현재 로그인 사용자의 푸시 식별자 (user_id, role)
function pushGetUserContext() {
  if (typeof isAdminMode !== 'undefined' && isAdminMode) {
    return { user_id: 'admin', role: 'admin' };
  }
  if (typeof isDriverMode !== 'undefined' && isDriverMode) {
    var sess = null;
    try { sess = JSON.parse(localStorage.getItem('hiveoil_session') || 'null'); } catch(e) {}
    return { user_id: 'driver_' + ((sess && sess.loginId) || 'unknown'), role: 'driver' };
  }
  if (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn) {
    return { user_id: 'biz_' + (ownerBizId || 'unknown'), role: 'owner' };
  }
  return null; // 로그인 안 됨
}

// 푸시 구독 여부 (현재 브라우저 기준)
async function pushIsSubscribed() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch(e) { return false; }
}

// ════════════════════════════════════════════════════════════════════
// 🆕 v145: 푸시 알림 진단·재구독·테스트 도구
// ════════════════════════════════════════════════════════════════════

async function pushDiagnose(showInUI) {
  showInUI = showInUI !== false;
  var report = [];
  var ok = true;

  // 1. 브라우저 지원
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    report.push('❌ <b>브라우저 미지원</b> — iOS Safari는 홈화면 추가(PWA 설치) 후에만 푸시 가능');
    ok = false;
  } else {
    report.push('✅ 브라우저 API 지원');
  }

  // 2. PWA 설치 여부 (iOS는 standalone 모드일 때만 푸시 작동)
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  var ua = navigator.userAgent || '';
  var isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS && !isStandalone) {
    report.push('⚠️ <b>iOS는 홈화면 추가 필요</b> — Safari [공유] → [홈 화면에 추가] 후 그 아이콘으로 열어야 푸시 가능');
    ok = false;
  } else if (isStandalone) {
    report.push('✅ PWA 설치 상태 (standalone)');
  } else {
    report.push('ℹ️ 브라우저 모드 (PWA 미설치) — Android Chrome은 그래도 작동');
  }

  // 3. 알림 권한
  var perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  if (perm === 'granted') {
    report.push('✅ 알림 권한: 허용됨');
  } else if (perm === 'denied') {
    report.push('❌ <b>알림 권한 거부됨</b> — 브라우저 설정에서 사이트 권한 → 알림 허용으로 변경 필요');
    ok = false;
  } else {
    report.push('⚠️ 알림 권한: 미설정 (default) — 아래 [🔔 알림 켜기] 버튼 클릭');
    ok = false;
  }

  // 4. Service Worker 등록 상태
  if ('serviceWorker' in navigator) {
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        report.push('✅ SW 등록됨 (scope: ' + reg.scope.replace(window.location.origin, '') + ')');
      } else {
        report.push('❌ <b>SW 등록 안 됨</b> — 새로고침 또는 /clear.html 시도');
        ok = false;
      }
    } catch(e) {
      report.push('⚠️ SW 조회 실패: ' + e.message);
      ok = false;
    }
  }

  // 5. 푸시 구독 상태
  if ('serviceWorker' in navigator && perm === 'granted') {
    try {
      var reg2 = await navigator.serviceWorker.ready;
      var sub = await reg2.pushManager.getSubscription();
      if (sub) {
        var endpointShort = sub.endpoint.slice(0, 40) + '...';
        report.push('✅ 푸시 구독 활성: <code style="font-size:10px;">' + endpointShort + '</code>');

        // DB 등록 여부 확인
        try {
          var dbCheck = await db.from('push_subscriptions').select('id, last_used_at').eq('endpoint', sub.endpoint).maybeSingle();
          if (dbCheck.data) {
            report.push('✅ DB 등록 확인 (마지막 사용: ' + (dbCheck.data.last_used_at || '미정') + ')');
          } else {
            report.push('⚠️ <b>구독은 됐지만 DB에 없음</b> — [🔄 재구독] 클릭으로 복구');
            ok = false;
          }
        } catch(e) { report.push('⚠️ DB 확인 실패: ' + e.message); }
      } else {
        report.push('❌ <b>푸시 구독 없음</b> — 아래 [🔔 알림 켜기] 클릭으로 구독 시작');
        ok = false;
      }
    } catch(e) {
      report.push('⚠️ 구독 조회 실패: ' + e.message);
      ok = false;
    }
  }

  // 6. 로그인 컨텍스트
  var ctx = pushGetUserContext();
  if (ctx) {
    report.push('✅ 로그인 상태: ' + ctx.role + ' / ' + (ctx.user_id || '익명'));
  } else {
    report.push('⚠️ <b>로그인 안 됨</b> — 푸시는 로그인 후에만 구독 가능');
    ok = false;
  }

  if (showInUI) {
    var box = document.getElementById('pushDiagBox');
    if (box) {
      box.style.display = 'block';
      box.style.background = ok ? '#E8F5E9' : '#FEF2F2';
      box.style.borderColor = ok ? '#2E7D32' : '#C0392B';
      box.style.color = ok ? '#1B5E20' : '#7F1D1D';
      box.innerHTML = '<div style="font-size:13px;font-weight:800;margin-bottom:8px;">' + (ok ? '✅' : '⚠️') + ' 푸시 알림 진단 결과</div>'
        + report.map(function(r){ return '<div style="margin:4px 0;">' + r + '</div>'; }).join('')
        + '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap;">'
        +   '<button onclick="pushResubscribe()" style="background:#1F4D30;color:#FFEB3B;border:none;border-radius:8px;padding:8px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">🔄 재구독</button>'
        +   '<button onclick="pushTest()" style="background:#1565C0;color:#fff;border:none;border-radius:8px;padding:8px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">🧪 테스트 알림</button>'
        +   '<button onclick="this.parentElement.parentElement.style.display=\'none\'" style="background:transparent;color:currentColor;border:1px solid currentColor;border-radius:8px;padding:8px 14px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;">닫기</button>'
        + '</div>';
    }
  }
  return { ok: ok, report: report };
}

// 재구독: 기존 구독 해제 후 새로 구독
async function pushResubscribe() {
  showToast('t1', '🔄 재구독 시작', '잠시만 기다려주세요...');
  try {
    if ('serviceWorker' in navigator) {
      var reg = await navigator.serviceWorker.ready;
      var oldSub = await reg.pushManager.getSubscription();
      if (oldSub) {
        try { await db.from('push_subscriptions').delete().eq('endpoint', oldSub.endpoint); } catch(e) {}
        await oldSub.unsubscribe();
      }
    }
  } catch(e) { console.warn('재구독 해제 단계 오류:', e); }
  var ok = await pushSubscribe();
  if (ok) {
    showToast('t1', '✅ 재구독 완료', '이제 푸시 알림을 받을 수 있어요');
    setTimeout(function(){ pushDiagnose(true); }, 500);
  }
}

// 로컬 테스트 알림 (SW 통해 표시 — 푸시가 작동하는지 확인)
async function pushTest() {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    showToast('t1', '⚠️ 권한 없음', '먼저 알림 권한을 허용해주세요');
    return;
  }
  try {
    var reg = await navigator.serviceWorker.ready;
    await reg.showNotification('🫒 식용유니버스 테스트 알림', {
      body: '이 알림이 보이면 푸시 시스템이 정상입니다!',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'hiveoil-test',
      vibrate: [100, 50, 100],
      requireInteraction: false
    });
    showToast('t1', '✅ 테스트 알림 발송', '알림창을 확인해보세요');
  } catch(e) {
    showToast('t1', '⚠️ 발송 실패', e.message);
    console.error('[Push Test]', e);
  }
}

// 푸시 구독 — 권한 요청 + endpoint 발급 + Supabase 저장
async function pushSubscribe() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    showToast('t1', '❌ 미지원', '이 브라우저는 푸시 알림을 지원하지 않아요');
    return false;
  }
  // 알림 권한
  var perm = Notification.permission;
  if (perm !== 'granted') {
    perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      showToast('t1', '⚠️ 권한 거부', '알림 권한을 허용해야 사용할 수 있어요');
      return false;
    }
  }
  // 사용자 식별
  var ctx = pushGetUserContext();
  if (!ctx) {
    showToast('t1', '🔒 로그인 필요', '로그인 후 푸시 알림을 켤 수 있어요');
    return false;
  }
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
    }
    var j = sub.toJSON();
    var row = {
      user_id: ctx.user_id,
      role: ctx.role,
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      user_agent: (navigator.userAgent || '').substring(0, 200),
      last_used_at: new Date().toISOString()
    };
    var res = await db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (res.error) {
      console.error('[Push] DB 저장 실패', res.error);
      showToast('t1', '⚠️ 저장 실패', res.error.message || '서버에 저장 못했어요');
      return false;
    }
    console.log('[Push] 구독 완료', ctx);
    return true;
  } catch(e) {
    console.error('[Push] 구독 실패', e);
    showToast('t1', '⚠️ 푸시 구독 실패', (e && e.message) || '잠시 후 다시 시도해주세요');
    return false;
  }
}

// 푸시 구독 해제
async function pushUnsubscribe() {
  if (!('serviceWorker' in navigator)) return true;
  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (sub) {
      var endpoint = sub.endpoint;
      await sub.unsubscribe();
      try { await db.from('push_subscriptions').delete().eq('endpoint', endpoint); } catch(e) {}
    }
    return true;
  } catch(e) {
    console.warn('[Push] 구독 해제 실패', e);
    return false;
  }
}

// 로그인/역할변경 후 자동 재구독 (이미 권한 있는 경우만)
async function pushSyncAfterLogin() {
  if (!notifSettings.pushApi) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  await pushAutoResync();
}

// 🔁 스마트 자동 재구독 — 브라우저 구독과 DB 동기화 체크
// 끊긴 구독을 자동으로 감지하고 사용자 모르게 재등록
async function pushAutoResync() {
  if (!notifSettings.pushApi) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  var ctx = pushGetUserContext();
  if (!ctx) return; // 로그인 안 된 상태면 스킵

  try {
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();

    // 케이스 1 — 브라우저에 구독 자체가 없음 → 새로 구독
    if (!sub) {
      console.log('[Push] resync: no browser sub → fresh subscribe');
      await pushSubscribe();
      return;
    }

    // 케이스 2 — 브라우저 구독은 있는데 DB에 있는지 확인
    var dbCheck = await db.from('push_subscriptions')
      .select('id, user_id, role')
      .eq('endpoint', sub.endpoint)
      .limit(1);

    if (dbCheck.data && dbCheck.data.length > 0) {
      var dbRow = dbCheck.data[0];
      // DB에 살아있음. user_id/role이 현재 컨텍스트와 다르면 업데이트 (역할 전환 케이스)
      if (dbRow.user_id !== ctx.user_id || dbRow.role !== ctx.role) {
        console.log('[Push] resync: updating user_id/role on existing sub');
        await db.from('push_subscriptions')
          .update({ user_id: ctx.user_id, role: ctx.role, last_used_at: new Date().toISOString() })
          .eq('id', dbRow.id);
      } else {
        // 헬스체크 — last_used_at만 갱신
        try {
          await db.from('push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', dbRow.id);
        } catch(e) {}
      }
      console.log('[Push] resync: subscription healthy ✓');
      return;
    }

    // 케이스 3 — 브라우저엔 구독 있는데 DB엔 없음
    // → Edge Function이 410으로 정리한 뒤 좀비 endpoint가 남은 상태
    // → 강제 unsubscribe 후 새로 구독 (사이클 끊기)
    console.warn('[Push] resync: DB missing endpoint → forcing fresh subscription (zombie 정리)');
    try { await sub.unsubscribe(); } catch(e) {}
    await pushSubscribe();
  } catch(e) {
    console.warn('[Push] auto-resync 실패 (다음 기회에 재시도):', e.message);
  }
}

// 알림 추가 (목적: target 별로 필터링)
// type: 'register'|'low_stock'|'order'|'collect'
// target: 'admin'|'owner_{bizId}'|'all'
function addNotif(opts) {
  if (!notifSettings.enabled) return;
  // 타입별 ON/OFF 체크
  var typeKey = (opts.type === 'low_stock') ? 'lowStock' : opts.type;
  if (notifSettings[typeKey] === false) return;
  
  var now = new Date();
  var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0') 
              + ' ' + String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  
  var notif = {
    id: Date.now() + Math.random(),
    type: opts.type || 'general',
    target: opts.target || 'admin',
    title: opts.title || '알림',
    body: opts.body || '',
    createdAt: dateStr,
    read: false,
    bizId: opts.bizId || null,
    link: opts.link || null,
  };
  notifications.unshift(notif);
  saveNotifications();
  
  // 인앱 토스트로 즉시 표시 (현재 사용자가 대상이면)
  if (isNotifForCurrentUser(notif)) {
    showInAppNotif(notif);
    // 알림음
    if (notifSettings.sound) playNotifSound();
    // 브라우저 푸시 (옵션 - 권한 있을 때만)
    if (notifSettings.pushApi && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(notif.title, { body: notif.body, icon: './icon-192.png', tag: 'hiveoil-' + notif.type }); } catch(e) {}
    }
  }
  
  // 뱃지 갱신
  try { updateNotifBadge && updateNotifBadge(); } catch(e) {}
}

// 현재 로그인 상태로 봤을 때 이 알림이 내 것인지
function isNotifForCurrentUser(notif) {
  if (notif.target === 'all') return true;
  if (notif.target === 'admin') return (typeof isAdminMode !== 'undefined' && isAdminMode);
  if (notif.target.startsWith('owner_')) {
    var bid = notif.target.replace('owner_', '');
    return (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn) 
        && (typeof ownerBizId !== 'undefined' && String(ownerBizId) === String(bid));
  }
  return false;
}

// 미읽음 카운트
function getUnreadNotifCount() {
  return notifications.filter(function(n) { 
    return !n.read && isNotifForCurrentUser(n); 
  }).length;
}

// 인앱 토스트 (오른쪽 위에서 슬라이드)
function showInAppNotif(notif) {
  var existing = document.getElementById('inappNotifContainer');
  if (!existing) {
    existing = document.createElement('div');
    existing.id = 'inappNotifContainer';
    existing.style.cssText = 'position:fixed;top:14px;right:14px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:340px;';
    document.body.appendChild(existing);
  }
  
  var iconMap = { register:'🆕', low_stock:'⚠️', order:'📦', collect:'♻️', general:'🔔' };
  var colorMap = { register:'#185FA5', low_stock:'#E65100', order:'#0FA366', collect:'#FF9500', general:'#666' };
  var icon = iconMap[notif.type] || '🔔';
  var color = colorMap[notif.type] || '#666';
  
  var card = document.createElement('div');
  card.style.cssText = 'background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,0.18);padding:13px 14px;border-left:4px solid ' + color + ';display:flex;align-items:flex-start;gap:10px;pointer-events:auto;cursor:pointer;animation:slideInRight 0.3s ease-out;font-family:var(--font-body);max-width:320px;';
  card.innerHTML = '<div style="font-size:22px;flex-shrink:0;line-height:1;">' + icon + '</div>'
    + '<div style="flex:1;min-width:0;">'
    +   '<div style="font-size:13px;font-weight:800;color:#0D0D0D;margin-bottom:2px;">' + notif.title + '</div>'
    +   '<div style="font-size:11px;color:#666;line-height:1.4;">' + notif.body + '</div>'
    + '</div>'
    + '<div style="font-size:14px;color:#aaa;flex-shrink:0;cursor:pointer;" onclick="event.stopPropagation();this.parentElement.remove();">×</div>';
  card.onclick = function() {
    // 알림 읽음 처리 + 링크로 이동
    notif.read = true;
    saveNotifications();
    if (notif.link) {
      try { showPanel(notif.link, null); } catch(e) {}
    }
    card.remove();
    try { updateNotifBadge && updateNotifBadge(); } catch(e) {}
  };
  existing.appendChild(card);
  // 5초 후 자동 제거
  setTimeout(function() { try { card.remove(); } catch(e) {} }, 5000);
}

// 알림음 (Web Audio - 가벼운 ding)
function playNotifSound() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch(e) {}
}

// 알림 모두 읽음 처리
function markAllNotifsRead() {
  notifications.forEach(function(n) {
    if (isNotifForCurrentUser(n)) n.read = true;
  });
  saveNotifications();
  try { updateNotifBadge && updateNotifBadge(); } catch(e) {}
  try { renderNotifPanel && renderNotifPanel(); } catch(e) {}
}
// 알림 모두 삭제
function clearAllNotifs() {
  if (!confirm('모든 알림을 삭제하시겠습니까?')) return;
  notifications = notifications.filter(function(n) { return !isNotifForCurrentUser(n); });
  saveNotifications();
  try { updateNotifBadge && updateNotifBadge(); } catch(e) {}
  try { renderNotifPanel && renderNotifPanel(); } catch(e) {}
  showToast('t1','🗑️ 알림 삭제', '모든 알림이 삭제됐어요');
}

// 슬라이드인 애니메이션 (CSS 한 번만 추가)
(function injectNotifCss() {
  if (document.getElementById('notifAnimCss')) return;
  var style = document.createElement('style');
  style.id = 'notifAnimCss';
  style.textContent = '@keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
  document.head.appendChild(style);
})();


// ============================================================
// 품목별(oilProducts) 헬퍼 함수
// ============================================================
function getProductInfo(key) {
  return (PRICES.products && PRICES.products[key]) || { label: key, price: 0, type: 'soy', unit: '18L' };
}
function getBizProducts(biz) {
  if (biz.oilProducts && biz.oilProducts.length > 0) return biz.oilProducts;
  // 구 데이터 호환: oiltype + newOil → 단일 제품 배열로 변환
  const typeToKey = { '대두유': 'soy_wonju', '카놀라유': 'can_grewell', '옥수수유': 'corn_oilers', '혼합': 'soy_wonju' };
  const key = typeToKey[biz.oiltype] || 'soy_wonju';
  return [{ key, qty: biz.newOil || 0 }];
}
function getBizTotalNewOil(biz) {
  // oilProducts가 있으면 그 합산이 가장 정확함
  if (biz.oilProducts && biz.oilProducts.length > 0) {
    return biz.oilProducts.reduce(function(s, p) { return s + (p.qty || 0); }, 0);
  }
  // fallback: biz.newOil
  return biz.newOil || 0;
}
function getBizProductSummary(biz) {
  return getBizProducts(biz).map(function(p) {
    return getProductInfo(p.key).label + ' ' + p.qty + '캔';
  }).join(' / ');
}
function getProductUnitPrice(key) {
  var info = getProductInfo(key);
  return info.price || (PRICES.oils[info.type] || {}).price || 0;
}
// ============================================================


function applyPrices() {
  try {
    // 제품별 시세에서 유종별 최저가 자동 계산 (0원/미설정 제외)
    if (PRICES.products) {
      ['soy','canola','corn','sun'].forEach(function(type) {
        var prices = Object.values(PRICES.products)
          .filter(function(p){ return p.type === type && Number(p.price) > 0; })
          .map(function(p){ return Number(p.price); });
        if (prices.length > 0 && PRICES.oils[type]) {
          PRICES.oils[type].price = Math.min.apply(null, prices);
        }
      });
    }
  } catch(e) {}
  // topbar 가격칩 업데이트 (안전하게 각각 try)
  try { var el = document.getElementById('tc_soy');   if (el) el.textContent = (PRICES.oils.soy.price > 0 ? PRICES.oils.soy.price.toLocaleString() + '원' : '—'); } catch(e) {}
  try { var el = document.getElementById('tc_can');   if (el) el.textContent = (PRICES.oils.canola.price > 0 ? PRICES.oils.canola.price.toLocaleString() + '원' : '—'); } catch(e) {}
  try { var el = document.getElementById('tc_corn');  if (el) el.textContent = (PRICES.oils.corn.price > 0 ? PRICES.oils.corn.price.toLocaleString() + '원' : '—'); } catch(e) {}
  try { var el = document.getElementById('tc_sun');   if (el) el.textContent = (PRICES.oils.sun && PRICES.oils.sun.price > 0 ? PRICES.oils.sun.price.toLocaleString() + '원' : '—'); } catch(e) {}
  try { var el = document.getElementById('tc_waste'); if (el) el.textContent = PRICES.waste.can.price.toLocaleString() + '원'; } catch(e) {}
  // 주간 시세 페이지 업데이트
  try { renderPricePage && renderPricePage(); } catch(e) {}
  // 업주 대시보드 시세 직접 업데이트 (renderOwnerDash 의존 없이)
  try {
    var ods = document.getElementById('odSoy');    if(ods) ods.textContent = PRICES.oils.soy.price.toLocaleString()+'원';
    var odc = document.getElementById('odCanola'); if(odc) odc.textContent = PRICES.oils.canola.price.toLocaleString()+'원';
    var odo = document.getElementById('odCorn');   if(odo) odo.textContent = PRICES.oils.corn.price.toLocaleString()+'원';
    var odw = document.getElementById('odWaste');  if(odw) odw.textContent = PRICES.waste.can.price.toLocaleString()+'원/캔';
  } catch(e) {}
  try { renderOwnerDash && renderOwnerDash(); } catch(e) {}
  // 발주 select 옵션 텍스트 업데이트
  const optMap = { soy:'opt_soy', canola:'opt_canola', corn:'opt_corn' };
  Object.entries(PRICES.oils).forEach(([k,v]) => {
    const el = document.getElementById(optMap[k]);
    if (el) el.textContent = { soy:'🫘', canola:'🌿', corn:'🌽' }[k] + ' ' + v.label + ' — 18L (' + v.price.toLocaleString() + '원 VAT포함)';
  });
  const summaryTotal = document.getElementById('summary-total');
  const summaryQty   = document.getElementById('summary-qty');
  if (summaryTotal && summaryQty) calcOrderPrice();
  const vols = document.querySelectorAll('.volume-opt');
  const wKeys = Object.keys(PRICES.waste);
  vols.forEach((v, i) => {
    if (!wKeys[i]) return;
    const w = PRICES.waste[wKeys[i]];
    const volEl   = v.querySelector('.vol');
    const priceEl = v.querySelector('.vol-price');
    if (volEl)   volEl.textContent   = w.label;
    if (priceEl) priceEl.textContent = w.price.toLocaleString() + '원';
  });
  if (typeof calcWastePrice === 'function') calcWastePrice();
  // 수거 패널이 열려있으면 단가 변경 즉시 반영
  try {
    var activePanel = (document.querySelector('.panel.active') || {}).id || '';
    if (activePanel === 'panel-waste') {
      renderWasteTable && renderWasteTable();
      renderWastePendingList && renderWastePendingList();
    }
  } catch(e) {}
}

// ===== 원주 실제 업체 데이터 =====
// businesses localStorage 로드
function getKSTDate(dateStr) {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

function isSameMonth(h, year, month) {
  // 1순위: date 필드 "2026.04.07" 형식 직접 파싱 (가장 신뢰)
  if (h.date && h.date !== '—') {
    const parts = String(h.date).replace(/-/g, '.').split('.');
    if (parts.length === 3) {
      const y = parseInt(parts[0]);
      const m = parseInt(parts[1]) - 1; // 0-indexed
      if (!isNaN(y) && !isNaN(m)) return y === year && m === month;
    }
  }
  // 2순위: rawDate ISO 문자열 (Supabase created_at)
  if (h.rawDate) {
    try {
      // KST 기준으로 날짜 추출 (UTC+9)
      const d = new Date(h.rawDate);
      const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
      return kst.getUTCFullYear() === year && kst.getUTCMonth() === month;
    } catch(e) {}
  }
  return false;
}

function loadBusinesses() {
  try {
    const saved = localStorage.getItem('hiveoil_businesses');
    if (saved) {
      var arr = JSON.parse(saved);
      // 🛡️ deleted 항목은 메모리에서 제외 (localStorage 캐시에 옛 데이터 남아있을 수 있음)
      return arr.filter(function(b){ return !b.deleted; });
    }
  } catch(e) {}
  return [];
}
function saveBusinesses() {
  try {
    localStorage.setItem('hiveoil_businesses', JSON.stringify(businesses));
  } catch(e) {
    console.warn('businesses 저장 실패 (quota?) — 슬림 모드로 재시도:', e.message);
    // 큰 base64 이미지 제외하고 메타만 저장
    try {
      var slim = businesses.map(function(b) {
        var copy = {};
        for (var k in b) {
          if (!b.hasOwnProperty(k)) continue;
          if (typeof b[k] === 'string' && b[k].length > 1024 && /^data:/.test(b[k])) {
            copy[k] = '__OMITTED__';
          } else {
            copy[k] = b[k];
          }
        }
        return copy;
      });
      localStorage.setItem('hiveoil_businesses', JSON.stringify(slim));
    } catch(e2) {
      console.warn('businesses 슬림 저장도 실패:', e2.message);
    }
  }
}
const businesses = loadBusinesses();

function loadHistory() {
  try {
    const saved = localStorage.getItem('hiveoil_history');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [];
}
function saveHistory() {
  try {
    localStorage.setItem('hiveoil_history', JSON.stringify(historyData));
  } catch(e) {
    console.warn('history 저장 실패 (quota?) — 200건만 저장:', e.message);
    try {
      // 최근 200건만 저장
      var recent = historyData.slice(0, 200);
      localStorage.setItem('hiveoil_history', JSON.stringify(recent));
    } catch(e2) {
      console.warn('history 슬림 저장도 실패:', e2.message);
    }
  }
}
var historyData = loadHistory();

// ===== 네이버 지도 =====
let kakaoMap = null, markers = [], infoWindows = [], mapInitialized = false;
let currentFilter = 'all', currentBiz = null;

function initNaverMap() {
  if (mapInitialized) return;
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    document.getElementById('naverMap').innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#f8f9fa;gap:14px;">
        <div style="font-size:48px;">🗺️</div>
        <div style="font-family:var(--font-display);font-size:18px;font-weight:800;">카카오맵 로딩 실패</div>
        <div style="font-size:13px;color:var(--gray);text-align:center;max-width:320px;line-height:1.6;">
          브라우저를 새로고침(F5) 해주세요.<br>계속 안 되면 Live Server로 열어주세요.
        </div>
      </div>`;
    return;
  }
  mapInitialized = true;

  const container = document.getElementById('naverMap');
  const options = {
    center: new kakao.maps.LatLng(37.3450, 127.9280),
    level: 5,
  };
  kakaoMap = new kakao.maps.Map(container, options);

  // 지도 컨트롤 추가
  const zoomControl = new kakao.maps.ZoomControl();
  kakaoMap.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);
  const mapTypeControl = new kakao.maps.MapTypeControl();
  kakaoMap.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);

  businesses.forEach(biz => addMarkerToMap(biz));
  renderBizList();

  // 지도 클릭 시 열린 인포윈도우 닫기
  kakao.maps.event.addListener(kakaoMap, 'click', function() {
    infoWindows.forEach(function(iw){ iw.setMap(null); });
    document.querySelectorAll('.biz-item').forEach(function(el){ el.classList.remove('selected'); });
  });
}

function addMarkerToMap(biz) {
  const totalNewOil = getBizTotalNewOil(biz);
  const isLow   = totalNewOil <= 2;
  const isWaste = biz.wasteOil >= 5;
  const color   = isLow ? '#E83A2F' : isWaste ? '#FF8C00' : '#05C46B';
  const emoji   = isLow ? '⚠️' : isWaste ? '🗑️' : '🫙';

  const markerContent = document.createElement('div');
  markerContent.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer">
    <div style="background:${color};border:2.5px solid white;border-radius:50% 50% 50% 0;width:38px;height:38px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 3px 10px rgba(0,0,0,0.3)">
      <span style="transform:rotate(45deg);font-size:15px;line-height:1">${emoji}</span>
    </div>
    <div style="background:rgba(0,0,0,0.82);color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;margin-top:3px;white-space:nowrap;font-family:'Pretendard',sans-serif;">${biz.name.split(' ')[0]}</div>
  </div>`;

  const customOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(biz.lat, biz.lng),
    content: markerContent,
    yAnchor: 1,
  });
  customOverlay.setMap(kakaoMap);

  // 인포윈도우
  const iwContent = document.createElement('div');
  iwContent.className = 'kakao-iw';
  iwContent.innerHTML = `
    <div class="iw-name">${biz.name}</div>
    <div class="iw-type">${biz.type}</div>
    <div class="iw-stocks">
      <div class="iw-stock new"><label>새식용유</label><strong style="color:${isLow?'#E83A2F':'#00a857'}">${getBizTotalNewOil(biz)}</strong><span style="font-size:9px;color:#999">캔</span></div>
      <div class="iw-stock waste"><label>폐식용유</label><strong style="color:${isWaste?'#7A5000':'#D4621A'}">${biz.wasteOil}</strong><span style="font-size:9px;color:#999">캔 대기</span></div>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
      <div style="font-size:9px;color:#888;">🕐 ${biz.lastUpdate || '—'} 업데이트</div>
      ${biz.auto ? '<div class="iw-auto">⚡ 자동발주 ON</div>' : ''}
    </div>
    <div class="iw-btns">
      <button class="iw-btn collect" style="font-size:12px;padding:9px 0;" onclick="event.stopPropagation();openCollectFromMap(${biz.id})">♻️ 수거 신청</button>
      <button class="iw-btn order" style="font-size:12px;padding:9px 0;" onclick="event.stopPropagation();openOrderFromMap(${biz.id})">🫙 발주 납품</button>
    </div>`;

  const infoOverlay = new kakao.maps.CustomOverlay({
    position: new kakao.maps.LatLng(biz.lat, biz.lng),
    content: iwContent,
    yAnchor: 1.15,
    zIndex: 10,
  });

  // 마커 클릭 시 인포윈도우 토글
  markerContent.addEventListener('click', () => {
    infoWindows.forEach(iw => iw.setMap(null));
    const isOpen = infoOverlay.getMap();
    if (!isOpen) {
      infoOverlay.setMap(kakaoMap);
      kakaoMap.setCenter(new kakao.maps.LatLng(biz.lat, biz.lng));
    }
    document.querySelectorAll('.biz-item').forEach(el => el.classList.remove('selected'));
    const el = document.getElementById('biz-' + biz.id);
    if (el) { el.classList.add('selected'); el.scrollIntoView({behavior:'smooth',block:'nearest'}); }
  });

  markers.push({ biz, overlay: customOverlay });
  infoWindows.push(infoOverlay);
}



function refreshMapMarkers() {
  if (!kakaoMap || !mapInitialized) return;
  markers.forEach(m => m.overlay.setMap(null));
  infoWindows.forEach(iw => iw.setMap(null));
  markers = []; infoWindows = [];
  businesses.forEach(b => addMarkerToMap(b));
  renderBizList();
  updateTabBadges();
}

function openCollectFromMap(id) {
  try { infoWindows.forEach(iw => { try { iw.setMap(null); } catch(e) {} }); } catch(e) {}
  // showPanel은 biz 유무와 무관하게 먼저 실행 (ID 타입 불일치로 biz 못 찾아도 패널 이동 보장)
  window._skipLoginCheck = true;
  showPanel('waste', null);
  window._skipLoginCheck = false;
  // biz는 String 비교로 안전하게 찾기
  const biz = businesses.find(b => String(b.id) === String(id));
  if (!biz) { showToast('t1', '♻️ 수거 신청', '수거 신청 패널로 이동했어요'); return; }
  // 해당 업체 행 하이라이트
  setTimeout(() => {
    const tbody = document.getElementById('wasteTableBody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
      if (row.textContent.includes(biz.name)) {
        row.style.transition = 'background 0.3s';
        row.style.background = '#FFF3E0';
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { row.style.background = ''; }, 2000);
      }
    });
  }, 200);
  showToast('t1', '♻️ ' + biz.name, '폐유 ' + biz.wasteOil + '캔 · 수거 신청 버튼을 눌러주세요');
}

function openOrderFromMap(id) {
  try { infoWindows.forEach(iw => { try { iw.setMap(null); } catch(e) {} }); } catch(e) {}
  // showPanel은 biz 유무와 무관하게 먼저 실행
  window._skipLoginCheck = true;
  showPanel('order', null);
  window._skipLoginCheck = false;
  // biz는 String 비교로 안전하게 찾기
  const biz = businesses.find(b => String(b.id) === String(id));
  // 업체 자동 선택
  setTimeout(() => {
    populateOrderBizSelect();
    updateOrderMonthStats();
    renderOrderPendingList();
    const sel = document.getElementById('orderBizSelect');
    if (sel) {
      sel.value = String(id);
      Array.from(sel.options).forEach(opt => {
        if (String(opt.value) === String(id)) opt.selected = true;
      });
      onOrderBizChange();
    }
    if (biz) showToast('t1', '🫙 ' + biz.name, '발주 업체로 자동 선택됐어요');
    else showToast('t1', '🫙 발주 신청', '발주 신청 패널로 이동했어요');
  }, 300);
}


// ============================================================
// 최적 수거·납품 경로 (카카오내비 연동)
// ============================================================
// 두 지점 간 거리 (km, 위경도 기반)
function _haversine(lat1, lon1, lat2, lon2) {
  var R = 6371;
  var dLat = (lat2-lat1) * Math.PI/180;
  var dLon = (lon2-lon1) * Math.PI/180;
  var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
          Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
          Math.sin(dLon/2)*Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// 최근접 이웃 알고리즘으로 방문 순서 최적화
function _nearestNeighbor(points, startLat, startLon) {
  var remaining = points.slice();
  var ordered = [];
  var curLat = startLat, curLon = startLon;
  while (remaining.length > 0) {
    var nearest = null, nearestDist = Infinity, nearestIdx = -1;
    remaining.forEach(function(p, i) {
      var d = _haversine(curLat, curLon, p.lat, p.lng);
      if (d < nearestDist) { nearestDist = d; nearest = p; nearestIdx = i; }
    });
    ordered.push(nearest);
    curLat = nearest.lat; curLon = nearest.lng;
    remaining.splice(nearestIdx, 1);
  }
  return ordered;
}

// ============================================================
// 🆕 노트 #3 — 탄소저감 기부 포인트 (영업이익 연동형)
// ============================================================
// 기존 ESG 포인트와 별도로 작동 — 거래건당 0.1%, 월별 캡 적용
// 매출 구간별 월간 캡 (영업이익 부담 최소화)
function getMonthlyDonationCap(monthlyRevenue) {
  monthlyRevenue = monthlyRevenue || 0;
  // 매출 구간별 캡 (사용자 결정 사항이지만 합리적 기본값)
  if (monthlyRevenue < 1000000)   return 1000;    // 100만 미만 → 1천원
  if (monthlyRevenue < 5000000)   return 5000;    // 500만 미만 → 5천원
  if (monthlyRevenue < 20000000)  return 20000;   // 2천만 미만 → 2만원
  if (monthlyRevenue < 50000000)  return 50000;   // 5천만 미만 → 5만원
  if (monthlyRevenue < 100000000) return 100000;  // 1억 미만 → 10만원
  return 200000;  // 1억 이상 → 20만원
}
// 거래건당 적립 비율 (매출 대비 0.1%)
var DONATION_RATE = 0.001;

// 기부 적립 데이터 로드/저장
function loadDonations() {
  try {
    var saved = localStorage.getItem('hiveoil_donations');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return [];  // [{ bizId, amount, month, type, date }]
}
function saveDonations() {
  try {
    var recent = donations.slice(-500);  // 최근 500건만
    localStorage.setItem('hiveoil_donations', JSON.stringify(recent));
  } catch(e) { console.warn('기부 적립 저장 실패:', e.message); }
}
var donations = loadDonations();

// 거래 발생 시 호출 — 자동 0.1% 적립 (캡 적용)
// type: 'purchase'|'waste'  (식용유 구매 또는 폐유 매입)
// amount: 거래 금액 (원)
function accrueDonation(bizId, amount, type) {
  amount = parseInt(amount) || 0;
  if (amount <= 0 || !bizId) return null;
  
  var rawAccrual = Math.round(amount * DONATION_RATE);
  if (rawAccrual <= 0) return null;
  
  // 이번 달 누적 확인
  var now = new Date();
  var month = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0');
  var bizMonthDonations = donations.filter(function(d) {
    return String(d.bizId) === String(bizId) && d.month === month;
  });
  var bizMonthTotal = bizMonthDonations.reduce(function(s, d) { return s + (d.amount || 0); }, 0);
  
  // 업체 이번달 매출 (history에서 이번달 합계)
  var monthlyRevenue = getBizMonthlyRevenue(bizId, month);
  var cap = getMonthlyDonationCap(monthlyRevenue);
  
  // 캡 적용 - 누적 + 신규 ≤ cap
  var available = Math.max(0, cap - bizMonthTotal);
  var actualAccrual = Math.min(rawAccrual, available);
  if (actualAccrual <= 0) return { capped: true, attempted: rawAccrual };
  
  var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  var record = {
    id: Date.now() + Math.random(),
    bizId: bizId,
    amount: actualAccrual,
    rawAmount: rawAccrual,
    cappedAmount: rawAccrual - actualAccrual,
    month: month,
    type: type || 'general',
    transactionAmount: amount,
    date: dateStr,
  };
  donations.push(record);
  saveDonations();
  return record;
}

// 업체 월별 거래 매출 합계 (history에서)
function getBizMonthlyRevenue(bizId, month) {
  if (typeof historyData === 'undefined') return 0;
  return historyData.reduce(function(sum, h) {
    if (String(h.bizId) !== String(bizId)) return sum;
    if (!h.date || !h.date.startsWith(month)) return sum;
    if (h.status === 'cancelled') return sum;
    var amt = 0;
    if (typeof h.amount === 'string') {
      amt = parseInt(h.amount.replace(/[^0-9]/g, '')) || 0;
    } else if (typeof h.amount === 'number') {
      amt = h.amount;
    }
    return sum + amt;
  }, 0);
}

// 업체 이번 달 기부 누적
function getBizMonthlyDonation(bizId) {
  var now = new Date();
  var month = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0');
  return donations.filter(function(d) {
    return String(d.bizId) === String(bizId) && d.month === month;
  }).reduce(function(s, d) { return s + (d.amount || 0); }, 0);
}

// 전체 누적 기부금
function getTotalDonations() {
  return donations.reduce(function(s, d) { return s + (d.amount || 0); }, 0);
}
// 이번 달 전체 기부금
function getCurrentMonthDonations() {
  var now = new Date();
  var month = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0');
  return donations.filter(function(d) { return d.month === month; })
                  .reduce(function(s, d) { return s + (d.amount || 0); }, 0);
}
// 이번 달 참여 업체 수
function getCurrentMonthParticipants() {
  var now = new Date();
  var month = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0');
  var bizSet = {};
  donations.forEach(function(d) { if (d.month === month) bizSet[d.bizId] = true; });
  return Object.keys(bizSet).length;
}


function updateNotifBadge() {
  var count = getUnreadNotifCount();
  var badge = document.getElementById('notifBellBadge');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function openNotifPanel() {
  var existing = document.getElementById('notifPanelModal');
  if (existing) { existing.remove(); return; }
  
  var modal = document.createElement('div');
  modal.id = 'notifPanelModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:99998;display:flex;align-items:flex-start;justify-content:flex-end;padding:14px;';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  
  modal.innerHTML = 
    '<div style="background:#fff;border-radius:14px;width:100%;max-width:380px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 40px rgba(0,0,0,0.3);overflow:hidden;font-family:var(--font-body);" onclick="event.stopPropagation();">'
    + '<div style="background:linear-gradient(135deg,#0FA366,#10D67A);color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;">🔔 알림</div>'
    +     '<div style="font-size:11px;opacity:0.9;margin-top:2px;" id="notifPanelSubtitle">미읽음 0건</div>'
    +   '</div>'
    +   '<button onclick="document.getElementById(\'notifPanelModal\').remove()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="display:flex;gap:6px;padding:10px 14px;background:#F8FAF8;border-bottom:1px solid #E5E5E5;flex-shrink:0;">'
    +   '<button onclick="markAllNotifsRead()" style="flex:1;padding:8px;background:#fff;border:1px solid #DDD;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">✓ 모두 읽음</button>'
    +   '<button onclick="clearAllNotifs()" style="flex:1;padding:8px;background:#fff;border:1px solid #DDD;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🗑️ 모두 삭제</button>'
    +   '<button onclick="document.getElementById(\'notifPanelModal\').remove(); showPanel(\'security\', null); setTimeout(function(){ pushDiagnose(true); var sec = document.getElementById(\'pushDiagBox\'); if(sec) sec.scrollIntoView({behavior:\'smooth\', block:\'center\'}); }, 300);" style="padding:8px 12px;background:#1565C0;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);" title="푸시 알림 진단">🔔</button>'
    +   '<button onclick="openNotifSettings()" style="padding:8px 12px;background:#fff;border:1px solid #DDD;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">⚙️</button>'
    + '</div>'
    + '<div id="notifPanelList" style="flex:1;overflow-y:auto;padding:8px;"></div>'
    + '</div>';
  document.body.appendChild(modal);
  renderNotifPanel();
}

function renderNotifPanel() {
  var list = document.getElementById('notifPanelList');
  var sub = document.getElementById('notifPanelSubtitle');
  if (!list) return;
  
  var myNotifs = notifications.filter(function(n) { return isNotifForCurrentUser(n); });
  var unread = myNotifs.filter(function(n) { return !n.read; }).length;
  if (sub) sub.textContent = '미읽음 ' + unread + '건 · 전체 ' + myNotifs.length + '건';
  
  if (myNotifs.length === 0) {
    list.innerHTML = '<div style="text-align:center;padding:50px 20px;color:#999;font-size:13px;"><div style="font-size:48px;margin-bottom:10px;opacity:0.3;">🔕</div>알림이 없어요</div>';
    return;
  }
  
  var iconMap = { register:'🆕', low_stock:'⚠️', order:'📦', collect:'♻️', general:'🔔' };
  var colorMap = { register:'#185FA5', low_stock:'#E65100', order:'#0FA366', collect:'#FF9500', general:'#666' };
  
  list.innerHTML = myNotifs.map(function(n) {
    var icon = iconMap[n.type] || '🔔';
    var color = colorMap[n.type] || '#666';
    var bg = n.read ? '#F8FAF8' : '#FFFFFF';
    var border = n.read ? '#EEE' : color;
    return '<div onclick="onNotifClick(' + n.id + ')" style="background:' + bg + ';border:1px solid ' + (n.read ? '#EEE' : '#DDE8E1') + ';border-left:3px solid ' + border + ';border-radius:9px;padding:11px 13px;margin-bottom:6px;cursor:pointer;display:flex;gap:10px;align-items:flex-start;' + (n.read ? 'opacity:0.7;' : '') + '">'
      + '<div style="font-size:20px;flex-shrink:0;line-height:1.2;">' + icon + '</div>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:13px;font-weight:' + (n.read ? '600' : '800') + ';color:#0D0D0D;">' + n.title + '</div>'
      +   '<div style="font-size:11px;color:#666;margin-top:2px;line-height:1.4;">' + n.body + '</div>'
      +   '<div style="font-size:10px;color:#999;margin-top:4px;">' + n.createdAt + '</div>'
      + '</div>'
      + (n.read ? '' : '<div style="width:8px;height:8px;background:#FF3B30;border-radius:50%;flex-shrink:0;margin-top:6px;"></div>')
      + '</div>';
  }).join('');
}

function onNotifClick(notifId) {
  var n = notifications.find(function(x) { return String(x.id) === String(notifId); });
  if (!n) return;
  n.read = true;
  saveNotifications();
  if (n.link) {
    try {
      var modal = document.getElementById('notifPanelModal');
      if (modal) modal.remove();
      showPanel(n.link, null);
    } catch(e) {}
  }
  updateNotifBadge();
  renderNotifPanel();
}

function openNotifSettings() {
  var existing = document.getElementById('notifSettingsModal');
  if (existing) { existing.remove(); return; }
  
  var s = notifSettings;
  var modal = document.createElement('div');
  modal.id = 'notifSettingsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  
  function rowHtml(key, label, desc) {
    var checked = s[key] !== false;
    return '<label style="display:flex;align-items:center;gap:12px;padding:11px 13px;background:#F8FAF8;border-radius:9px;cursor:pointer;margin-bottom:6px;">'
      + '<input type="checkbox" ' + (checked ? 'checked' : '') + ' onchange="toggleNotifSetting(\'' + key + '\', this.checked)" style="width:20px;height:20px;cursor:pointer;flex-shrink:0;accent-color:#3D9E6E;">'
      + '<div style="flex:1;">'
      +   '<div style="font-size:13px;font-weight:700;color:#0D0D0D;">' + label + '</div>'
      +   (desc ? '<div style="font-size:10px;color:#666;margin-top:2px;">' + desc + '</div>' : '')
      + '</div>'
      + '</label>';
  }
  
  modal.innerHTML = 
    '<div style="background:#fff;border-radius:14px;width:100%;max-width:420px;max-height:85vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.3);" onclick="event.stopPropagation();">'
    + '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;">⚙️ 알림 설정</div>'
    +     '<div style="font-size:11px;opacity:0.85;margin-top:2px;">받을 알림 종류를 선택하세요</div>'
    +   '</div>'
    +   '<button onclick="document.getElementById(\'notifSettingsModal\').remove()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="padding:16px 18px;">'
    +   '<div style="font-size:11px;font-weight:800;color:#1B5E20;margin-bottom:8px;">🎚️ 전체 설정</div>'
    +   rowHtml('enabled', '🔔 알림 받기', '꺼두면 모든 알림이 안 와요')
    +   rowHtml('sound', '🔊 알림음', '새 알림이 올 때 소리')
    +   rowHtml('pushApi', '📲 브라우저 푸시', '앱이 닫혀있어도 알림 (권한 필요)')
    +   '<div style="font-size:11px;font-weight:800;color:#1B5E20;margin:14px 0 8px;">📋 알림 종류</div>'
    +   rowHtml('register', '🆕 회원가입 신청', '신규 업체 가입 요청 시 (관리자)')
    +   rowHtml('lowStock', '⚠️ 재고 부족', '식용유 재고가 임계값 이하일 때')
    +   rowHtml('order', '📦 발주', '발주 신청/완료 알림')
    +   rowHtml('collect', '♻️ 폐유 수거', '수거 신청/완료 알림')
    +   '<div style="margin-top:14px;padding:11px 13px;background:#FFF8E7;border:1px solid #FCD34D;border-radius:9px;font-size:11px;color:#92400E;line-height:1.5;">'
    +     '💡 브라우저 푸시는 브라우저 권한이 필요해요. 켜면 권한 요청 팝업이 떠요.'
    +   '</div>'
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
}

function toggleNotifSetting(key, checked) {
  notifSettings[key] = !!checked;
  saveNotifSettings(notifSettings);
  // 푸시 알림 토글 — Web Push API (서버에서 발송, 앱 닫혀있어도 옴)
  if (key === 'pushApi') {
    if (checked) {
      pushSubscribe().then(function(ok) {
        if (ok) {
          showToast('t1','✅ 푸시 알림 활성화','이제 앱이 닫혀있어도 알림이 와요');
        } else {
          notifSettings.pushApi = false;
          saveNotifSettings(notifSettings);
          var el = document.querySelector('#notifSettingsModal input[onchange*="pushApi"]');
          if (el) el.checked = false;
        }
      });
    } else {
      pushUnsubscribe().then(function() {
        showToast('t1','🔕 푸시 알림 끔','앱 내 알림만 받게 돼요');
      });
    }
  }
}

// ============================================================
// 🆕 탄소저감 기부 상세 모달
// ============================================================
function openDonationDetailModal() {
  var existing = document.getElementById('donationDetailModal');
  if (existing) { existing.remove(); return; }
  
  var now = new Date();
  var month = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0');
  var monthDonations = donations.filter(function(d) { return d.month === month; });
  
  // 업체별 그룹화
  var byBiz = {};
  monthDonations.forEach(function(d) {
    if (!byBiz[d.bizId]) byBiz[d.bizId] = { bizId: d.bizId, total: 0, count: 0, capped: 0 };
    byBiz[d.bizId].total += d.amount || 0;
    byBiz[d.bizId].count++;
    byBiz[d.bizId].capped += d.cappedAmount || 0;
  });
  // 정렬 (큰 금액 순)
  var sorted = Object.values(byBiz).sort(function(a, b) { return b.total - a.total; });
  
  var participantRows = sorted.map(function(b) {
    var biz = (typeof businesses !== 'undefined') ? businesses.find(function(x) { return String(x.id) === String(b.bizId); }) : null;
    var name = biz ? biz.name : ('업체 #' + b.bizId);
    var revenue = getBizMonthlyRevenue(b.bizId, month);
    var cap = getMonthlyDonationCap(revenue);
    var pct = cap > 0 ? Math.min(100, (b.total / cap) * 100) : 0;
    return '<div style="background:#F8FAF8;border-radius:9px;padding:10px 12px;margin-bottom:6px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">'
      +   '<div style="font-size:12px;font-weight:700;color:#0D0D0D;">' + name + '</div>'
      +   '<div style="font-size:13px;font-weight:800;color:#0FA366;font-family:var(--font-display);">+' + b.total.toLocaleString() + '원</div>'
      + '</div>'
      + '<div style="font-size:10px;color:#666;display:flex;justify-content:space-between;">'
      +   '<span>월 캡: ' + cap.toLocaleString() + '원 · 거래 ' + b.count + '건</span>'
      +   '<span style="color:' + (pct >= 90 ? '#E65100' : '#888') + ';font-weight:700;">' + pct.toFixed(0) + '%</span>'
      + '</div>'
      + '<div style="background:#E5E5E5;border-radius:3px;height:4px;margin-top:5px;overflow:hidden;">'
      +   '<div style="background:linear-gradient(90deg,#0FA366,#10D67A);height:100%;width:' + pct + '%;border-radius:3px;"></div>'
      + '</div>'
      + '</div>';
  }).join('');
  
  if (sorted.length === 0) {
    participantRows = '<div style="text-align:center;padding:40px 20px;color:#999;font-size:12px;">이번 달 적립된 기부금이 없어요</div>';
  }
  
  var modal = document.createElement('div');
  modal.id = 'donationDetailModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
  modal.onclick = function(e) { if (e.target === modal) modal.remove(); };
  
  modal.innerHTML = 
    '<div style="background:#fff;border-radius:14px;width:100%;max-width:520px;max-height:90vh;overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.3);font-family:var(--font-body);" onclick="event.stopPropagation();">'
    + '<div style="background:linear-gradient(135deg,#1B5E20 0%,#0FA366 100%);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;">🌱 탄소저감 기부 상세</div>'
    +     '<div style="font-size:11px;opacity:0.9;margin-top:2px;">' + month + ' · 참여 업체 일동의 공동 기부</div>'
    +   '</div>'
    +   '<button onclick="document.getElementById(\'donationDetailModal\').remove()" style="background:rgba(255,255,255,0.25);border:none;color:#fff;border-radius:8px;width:32px;height:32px;font-size:14px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="padding:18px 22px;">'
    +   '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:16px;">'
    +     '<div style="background:#E8F5E9;border-radius:10px;padding:12px;text-align:center;border:1.5px solid #A5D6A7;">'
    +       '<div style="font-size:9px;color:#2E7D32;font-weight:700;">이번 달 적립</div>'
    +       '<div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:#1B5E20;margin-top:3px;">' + getCurrentMonthDonations().toLocaleString() + '원</div>'
    +     '</div>'
    +     '<div style="background:#FFF8E7;border-radius:10px;padding:12px;text-align:center;border:1.5px solid #FCD34D;">'
    +       '<div style="font-size:9px;color:#92400E;font-weight:700;">참여 업체</div>'
    +       '<div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:#92400E;margin-top:3px;">' + getCurrentMonthParticipants() + ' 개</div>'
    +     '</div>'
    +     '<div style="background:#F0F4FF;border-radius:10px;padding:12px;text-align:center;border:1.5px solid #B3D4FC;">'
    +       '<div style="font-size:9px;color:#185FA5;font-weight:700;">전체 누적</div>'
    +       '<div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:#185FA5;margin-top:3px;">' + getTotalDonations().toLocaleString() + '원</div>'
    +     '</div>'
    +   '</div>'
    +   '<div style="background:#FFF8E7;border:1px solid #FCD34D;border-radius:9px;padding:11px 13px;margin-bottom:14px;font-size:11px;color:#92400E;line-height:1.6;">'
    +     '💡 <strong>적립 방식</strong><br>'
    +     '• 거래 발생 시 거래금액의 <strong>0.1%</strong>를 자동 적립<br>'
    +     '• 업체별 매출 구간에 따라 <strong>월간 캡</strong> 적용 (최대 20만원)<br>'
    +     '• 매월 누적 금액을 <strong>"식용유니버스 참여 업체 일동"</strong> 명의로 일괄 기부'
    +   '</div>'
    +   '<div style="font-size:12px;font-weight:800;color:#1B5E20;margin-bottom:8px;">📋 업체별 ' + month + ' 적립 현황</div>'
    +   participantRows
    + '</div>'
    + '</div>';
  document.body.appendChild(modal);
}

function showOptimalRoute() {
  var targets = businesses.filter(function(b) {
    return shouldAutoOrder(b) || shouldAutoCollect(b);
  });
  if (targets.length === 0) {
    showToast('t1','✅ 조치 필요 업체 없음','모든 업체 재고 정상이에요');
    return;
  }

  // 현재 위치 기준 최근접 이웃 정렬
  function doRoute(startLat, startLon) {
    var ordered = _nearestNeighbor(targets, startLat, startLon);

    // 방문 순서 표시바
    var routeEl = document.getElementById('routeInfoBar');
    if (routeEl) {
      routeEl.style.display = 'block';
      routeEl.innerHTML = '📍 ' + ordered.map(function(b,i){
        return '<span style="background:#1565C0;color:#fff;border-radius:50%;width:15px;height:15px;display:inline-flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;margin-right:2px;">'+(i+1)+'</span>'+b.name.split(' ')[0];
      }).join(' → ');
    }

    // 지도에 번호 오버레이 + 경로 라인
    if (kakaoMap && mapInitialized) {
      if (window._routeOverlays) window._routeOverlays.forEach(function(o){ o.setMap(null); });
      if (window._routePolyline) window._routePolyline.setMap(null);
      window._routeOverlays = [];

      // 번호 오버레이
      ordered.forEach(function(b, i) {
        var el = document.createElement('div');
        el.innerHTML = '<div style="background:#1565C0;color:#fff;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);">'+(i+1)+'</div>';
        var overlay = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(b.lat, b.lng), content: el, yAnchor: 1.4, zIndex: 20 });
        overlay.setMap(kakaoMap);
        window._routeOverlays.push(overlay);
      });

      // 경로 라인 (현위치 → 1 → 2 → ... → N)
      var linePath = [new kakao.maps.LatLng(startLat, startLon)].concat(
        ordered.map(function(b){ return new kakao.maps.LatLng(b.lat, b.lng); })
      );
      window._routePolyline = new kakao.maps.Polyline({
        path: linePath,
        strokeWeight: 4,
        strokeColor: '#1565C0',
        strokeOpacity: 0.8,
        strokeStyle: 'shortdash'
      });
      window._routePolyline.setMap(kakaoMap);

      // 지도 범위를 경로 전체로 맞춤
      var bounds = new kakao.maps.LatLngBounds();
      bounds.extend(new kakao.maps.LatLng(startLat, startLon));
      ordered.forEach(function(b){ bounds.extend(new kakao.maps.LatLng(b.lat, b.lng)); });
      kakaoMap.setBounds(bounds);
    }

    // 카카오내비 - 첫 번째(가장 가까운) 업체로만 안내
    var first = ordered[0];
    if (/Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      var naviUrl = 'kakaomap://route?ep='+first.lat+','+first.lng+'&eName='+encodeURIComponent(first.name)+'&by=CAR';
      var fallbackUrl = 'https://map.kakao.com/link/to/'+encodeURIComponent(first.name)+','+first.lat+','+first.lng;
      var t = setTimeout(function(){ window.open(fallbackUrl,'_blank'); }, 2000);
      window.location.href = naviUrl;
    } else {
      var webUrl = 'https://map.kakao.com/link/to/'+encodeURIComponent(first.name)+','+first.lat+','+first.lng;
      window.open(webUrl, '_blank');
    }
    showToast('t1','🗺️ 첫 번째 방문지 안내', '① '+first.name+' → 총 '+ordered.length+'개 업체');
  }

  // 현재 GPS 위치 시도 → 실패 시 원주 시청 기준
  if (navigator.geolocation) {
    showToast('t1','📍 위치 확인 중...','현재 위치 기준으로 최적 경로를 계산해요');
    navigator.geolocation.getCurrentPosition(
      function(pos){
        showToast('t1','📍 현재 위치 확인','GPS 기준으로 경로 계산 중...');
        doRoute(pos.coords.latitude, pos.coords.longitude);
      },
      function(){
        showToast('t1','📍 위치 권한 없음','원주 시청 기준으로 경로 계산해요');
        doRoute(37.3422, 127.9202);
      },
      { timeout: 4000, enableHighAccuracy: true }
    );
  } else {
    doRoute(37.3422, 127.9202);
  }
}

// 🆕 v126: 지도 페이지 프랜차이즈 필터 상태
var frMapFilterBrandId = '';  // '' = 전체, '__individual__' = 일반만, '__all_franchise__' = 모든 프랜차이즈, brandId = 특정 브랜드

function renderBizList(filter = currentFilter, query = '') {
  // 1) 권한별 1차 필터
  let data;
  if (ownerLoggedIn && ownerBizId) {
    // 가맹점주: 자기 매장만
    data = businesses.filter(b => String(b.id) === String(ownerBizId));
  } else if (hqLoggedIn && hqBrandId) {
    // 본사: 자기 브랜드 가맹점만
    data = businesses.filter(b => b.tenantType === 'franchise_store' && b.franchiseBrandId === hqBrandId);
  } else {
    data = businesses;
  }

  // 2) 🆕 v126: 프랜차이즈 필터 (관리자 모드에서만 활성)
  if (isAdminMode && frMapFilterBrandId) {
    if (frMapFilterBrandId === '__individual__') {
      data = data.filter(b => !b.tenantType || b.tenantType === 'individual');
    } else if (frMapFilterBrandId === '__all_franchise__') {
      data = data.filter(b => b.tenantType === 'franchise_store' && b.franchiseBrandId);
    } else {
      // 특정 브랜드 ID
      data = data.filter(b => b.franchiseBrandId === frMapFilterBrandId);
    }
  }

  // 3) 기존 필터들
  if (filter === 'low')   data = data.filter(b => shouldAutoOrder(b));
  if (filter === 'waste') data = data.filter(b => shouldAutoCollect(b));
  if (filter === 'ok')    data = data.filter(b => !shouldAutoOrder(b) && !shouldAutoCollect(b));
  if (query) data = data.filter(b => b.name.includes(query));

  const bizListEl2 = document.getElementById('bizList');
  if (!bizListEl2) return;
  bizListEl2.innerHTML = data.map(b => {
    var brandTag = '';
    if (b.tenantType === 'franchise_store' && b.franchiseBrandId) {
      var brand = getBrandById(b.franchiseBrandId);
      if (brand) {
        brandTag = '<div style="font-size:9px;color:var(--green-dark);font-weight:800;background:var(--green-pale);padding:1px 6px;border-radius:4px;margin-top:3px;display:inline-block;">🏪 ' + escapeHtml(brand.name) + (b.storeCode ? ' #' + escapeHtml(b.storeCode) : '') + '</div>';
      }
    }
    return `
    <div class="biz-item" onclick="selectBizFromList(${b.id})" id="biz-${b.id}">
      <div class="biz-header"><div class="biz-name">${b.name}</div><div class="biz-type">${b.type}</div></div>
      ${brandTag}
      <div class="biz-stocks">
        <div class="stock-pill new-oil ${getBizTotalNewOil(b)<=2?'alert-low':''}"><div class="sp-label">새식용유</div><div class="sp-val">${getBizTotalNewOil(b)}캔</div></div>
        <div class="stock-pill waste-oil ${b.wasteOil>=5?'alert-high':''}"><div class="sp-label">폐식용유</div><div class="sp-val">${b.wasteOil}캔</div></div>
      </div>
      ${b.auto ? '<div class="auto-badge">⚡ 자동발주 ON</div>' : ''}
    </div>`;
  }).join('');

  markers.forEach(({biz, overlay}) => overlay.setMap(data.find(d => d.id === biz.id) ? kakaoMap : null));
}

// 🆕 v126: 지도 프랜차이즈 필터 변경 핸들러
function onMapFranchiseFilterChange(value) {
  frMapFilterBrandId = value;
  // 재고 힌트 표시
  var hintEl = document.getElementById('mapFranchiseInventoryHint');
  if (hintEl) {
    if (!value || value === '__individual__') {
      hintEl.style.display = 'none';
    } else {
      var stores;
      if (value === '__all_franchise__') {
        stores = businesses.filter(b => b.tenantType === 'franchise_store' && b.franchiseBrandId);
      } else {
        stores = businesses.filter(b => b.franchiseBrandId === value);
      }
      var totalNew = stores.reduce((s,b) => s + (b.newOil || 0), 0);
      var totalWaste = stores.reduce((s,b) => s + (b.wasteOil || 0), 0);
      hintEl.innerHTML = '📦 ' + totalNew + '캔 · ♻️ ' + totalWaste + '캔 (' + stores.length + '개 매장)';
      hintEl.style.display = 'block';
    }
  }
  renderBizList(currentFilter, '');
}

// 🆕 v126: 지도 프랜차이즈 필터 셀렉트 옵션 갱신
function refreshMapFranchiseFilterOptions() {
  var bar = document.getElementById('mapFranchiseFilterBar');
  var sel = document.getElementById('mapFranchiseFilter');
  if (!bar || !sel) return;
  // 권한별 표시
  if (isAdminMode) {
    bar.style.display = 'block';
    sel.disabled = false;
    sel.style.background = '#fff';
    sel.style.color = '';
    // 옵션 갱신
    var opts = '<option value="">🌐 전체 보기</option>'
             + '<option value="__individual__">📋 일반 사업자만</option>'
             + '<option value="__all_franchise__">🏪 모든 프랜차이즈</option>';
    if (franchiseBrands.length > 0) {
      opts += '<optgroup label="── 개별 브랜드 ──">';
      opts += franchiseBrands.map(function(b){
        var cnt = getStoresOfBrand(b.id).length;
        return '<option value="' + b.id + '">🏪 ' + escapeHtml(b.name) + ' (' + cnt + '개)</option>';
      }).join('');
      opts += '</optgroup>';
    }
    sel.innerHTML = opts;
    sel.value = frMapFilterBrandId;
    // 힌트 영역 갱신
    onMapFranchiseFilterChange(frMapFilterBrandId);
  } else if (hqLoggedIn && hqBrandId) {
    // 본사: 자기 브랜드만 (잠금)
    bar.style.display = 'block';
    var brand = getBrandById(hqBrandId);
    sel.innerHTML = '<option value="' + hqBrandId + '">🏪 ' + escapeHtml(brand ? brand.name : '') + ' (우리 가맹점만)</option>';
    sel.disabled = true;
    sel.style.background = 'var(--green-pale)';
    sel.style.color = 'var(--green-dark)';
    sel.style.fontWeight = '700';
    frMapFilterBrandId = hqBrandId;
    // 힌트 박스 강제 표시
    var hintEl = document.getElementById('mapFranchiseInventoryHint');
    if (hintEl) {
      var myStores = getStoresOfBrand(hqBrandId);
      var totalNew = myStores.reduce(function(s,b){ return s + (b.newOil||0); }, 0);
      var totalWaste = myStores.reduce(function(s,b){ return s + (b.wasteOil||0); }, 0);
      hintEl.innerHTML = '🔒 본사 권한 · 📦 ' + totalNew + '캔 · ♻️ ' + totalWaste + '캔';
      hintEl.style.display = 'block';
    }
  } else {
    bar.style.display = 'none';
  }
}

function selectBizFromList(id) {
  document.querySelectorAll('.biz-item').forEach(el => el.classList.remove('selected'));
  document.getElementById('biz-' + id).classList.add('selected');
  const m = markers.find(m => m.biz.id === id);
  if (m && kakaoMap) {
    kakaoMap.setCenter(m.overlay.getPosition());
    kakaoMap.setLevel(3);
    infoWindows.forEach(iw => iw.setMap(null));
    const idx = markers.indexOf(m);
    if (infoWindows[idx]) infoWindows[idx].setMap(kakaoMap);
  }
}

function toggleFilter(el, filter) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentFilter = filter;
  renderBizList(filter);
}

function filterBizList(q) { renderBizList(currentFilter, q); }

// ===== PANEL NAV =====
function showPanel(id, navEl, pushState=true) {
  // 패널 전환
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('panel-' + id);
  if (!target) return;
  target.classList.add('active');

  // 패널 전환 시 가입 폼 영역 복원 (감사 화면 유지 방지)
  if (id === 'register') {
    var formArea = document.getElementById('signupFormArea');
    var thankYou = document.getElementById('signupThankYou');
    if (thankYou) thankYou.style.display = 'none';
    if (formArea) formArea.style.display = 'block';
    // 🛡️ 신청 락 강제 해제 (좀비 락 방지)
    window._signupSubmitting = false;
    window._signupSubmitStartTime = null;
    window._pendingSignupResult = null;
    // 🔄 버튼도 정상 상태로 복구
    var regBtn = document.getElementById('regCompleteBtn');
    if (regBtn) {
      regBtn.innerHTML = '✅ 업체 등록 신청';
      regBtn.disabled = false;
      regBtn.style.background = '';
    }
  }

  // 패널 전환 시 즉시 스크롤 최상단 (부드러운 사용자 경험)
  try {
    target.scrollTop = 0;
    var mainEl = document.querySelector('.main');
    if (mainEl) mainEl.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch(e) {
    window.scrollTo(0, 0);
  }

  // 네비 활성화
  if (navEl && navEl.classList) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    navEl.classList.add('active');
  } else {
    const navMatch = document.querySelector(`.nav-item[onclick*="'${id}'"]`);
    if (navMatch) {
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      navMatch.classList.add('active');
    }
  }

  // 🔐 v106: 보안 페이지 진입 시 기본 탭 자동 활성화
  if (id === 'security') {
    setTimeout(function() {
      try { securityShowTab('admin'); } catch(e) {}
    }, 50);
  }

  // 탭바 동기화 - onclick 속성으로 매칭
  document.querySelectorAll('.tab-item').forEach(function(t) {
    t.classList.remove('active');
    var oc = t.getAttribute('onclick') || '';
    if (oc.includes("'" + id + "'")) t.classList.add('active');
  });

  // 모바일: 사이드바 닫기
  if (window.innerWidth <= 768) {
    document.getElementById('mainSidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('open');
  }

  // 페이지 타이틀
  const titles = { 'owner-dash':'📊 대시보드', dashboard:'📊 관리자 대시보드', map:'🗺️ 원주 지도 현황', waste:'♻️ 수거 신청', order:'🫙 발주 신청', history:'📋 진행 이력', price:'💹 가격변동 이력', esg:'🏅 CERTIFICATION', schedule:'📅 드라이버 주간 일정', owner:'🏪 업주 전용', hq:'🏢 본사 통합 대시보드', 'hq-login':'🏢 관리자 로그인', admin:'⚙️ 시세 관리', security:'🔐 보안 설정', register:'➕ 업체 등록', delivery:'🚛 납품 처리', qr:'📱 재고 입력', apply:'🏫 수거 신청 관리', billing:'💰 정산 관리', privacy:'🔒 개인정보처리방침', terms:'📋 이용약관', 'esg-school':'🏫 급식소 ESG', 'esg-franchise':'🏬 프랜차이즈 ESG' };
  const title = titles[id] || '';
  const titleEl = document.getElementById('page-title-text');
  if (titleEl) titleEl.textContent = title;
  document.title = '식용유니버스 — ' + title;

  // 해시 업데이트
  if (pushState) history.pushState({ panel: id }, title, '#' + id);

  // 패널별 렌더
  if (id === 'dashboard') { updateDashboard(); }
  if (id === 'map')       { 
    setTimeout(() => { 
      if (!mapInitialized) initNaverMap(); else renderBizList(); 
      if (kakaoMap) kakaoMap.relayout?.(); 
      // 🆕 v126: 프랜차이즈 필터 옵션 갱신
      loadFranchiseBrandsFromDB().then(function(){
        refreshMapFranchiseFilterOptions();
      });
    }, 80); 
  }
  if (id === 'billing') {
    initBillingMonthSel && initBillingMonthSel();
    loadHistoryFromDB().then(function() { renderBilling && renderBilling(); });
  }
  // 🆕 v120: 프랜차이즈 관리자 패널
  if (id === 'franchise-admin') {
    loadFranchiseBrandsFromDB().then(function() {
      return loadHqAccountsFromDB();
    }).then(function() {
      // 🆕 v137: 페이지 진입 시 필터 리셋
      if (typeof frOpsResetFilters === 'function') frOpsResetFilters();
      renderFranchiseAdminPage();
    });
  }
  if (id === 'franchise-brand-detail') {
    loadFranchiseBrandsFromDB().then(function() {
      return loadHqAccountsFromDB();
    }).then(function() {
      renderFrBrandDetail();
    });
  }
  // 🆕 v139: 급식소 관리 패널
  if (id === 'school-admin') {
    if (typeof frOpsResetFilters === 'function') frOpsResetFilters();
    if (typeof schoolAdminSetFilter === 'function') {
      schoolAdminFilterType = null;  // 진입 시 전체 필터로 리셋
    }
    setTimeout(function(){
      if (typeof renderSchoolAdminPage === 'function') renderSchoolAdminPage();
    }, 50);
  }
  // 🆕 v123: 본사 대시보드
  if (id === 'fr-hq-dashboard') {
    setTimeout(function(){
      if (typeof frOpsResetFilters === 'function') frOpsResetFilters();
      renderFrHqDashboard();
    }, 50);
  }
  // 🆕 v129: 가맹점 자율 가입 - 브랜드 드롭다운 초기화
  if (id === 'fr-store-signup') {
    setTimeout(function(){ frStoreSignupInit(); }, 50);
  }
  // 🛡️ v71: 라우팅 함수 호출을 모두 try-catch로 감싸 한 패널 에러가 다른 패널 진입을 막지 않도록
  function safeCall(fnName, fn) {
    try { fn(); } catch(e) {
      console.error('[showPanel:' + id + '] ' + fnName + ' 에러:', e);
      // 화면에 에러 표시
      try {
        var errBox = document.getElementById('panelErrorBox') || document.createElement('div');
        errBox.id = 'panelErrorBox';
        errBox.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#FEF2F2;border:2px solid #C0392B;border-radius:10px;padding:14px 18px;z-index:99999;max-width:480px;font-size:12px;color:#C0392B;font-family:var(--font-body);box-shadow:0 6px 20px rgba(0,0,0,0.15);';
        errBox.innerHTML = '⚠️ <strong>' + fnName + ' 오류</strong>: ' + (e.message || e) + '<br><span style="font-size:10px;opacity:0.8;">콘솔(F12)에서 자세히 확인하세요</span>'
          + '<button onclick="this.parentElement.remove()" style="float:right;background:#C0392B;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;cursor:pointer;">닫기</button>';
        document.body.appendChild(errBox);
        setTimeout(function(){ try{ errBox.remove(); }catch(e){} }, 8000);
      } catch(e2) {}
    }
  }

  if (id === 'history')   {
    safeCall('loadHistoryFromDB', function() {
      if (typeof loadHistoryFromDB === 'function') loadHistoryFromDB().then(function(){
        try { cleanupExpiredTrash && cleanupExpiredTrash(); } catch(e) {}
        try { renderHistory(); } catch(e) { console.warn(e); }
      });
    });
    safeCall('renderHistory', function() { renderHistory(); });
    safeCall('cleanupExpiredTrash', function() { cleanupExpiredTrash && cleanupExpiredTrash(); });
  }
  if (id === 'price')     { 
    safeCall('loadPricesFromDB', function(){ loadPricesFromDB && loadPricesFromDB(); });
    safeCall('renderPricePage', function(){ renderPricePage(); });
    // 🆕 v72: fallback - 100ms 후에도 비어있으면 다시 호출
    setTimeout(function() {
      var c = document.getElementById('pricePageContent');
      if (c && c.innerHTML.trim().length < 100) {
        console.warn('⚠️ panel-price 컨텐츠 비어있음 — fallback 렌더 시도');
        try { renderPricePage(); } catch(e) { 
          c.innerHTML = '<div style="padding:40px;text-align:center;color:#999;">'
            + '<div style="font-size:48px;margin-bottom:12px;">⚠️</div>'
            + '<div style="font-size:14px;font-weight:700;color:#C0392B;">렌더링 오류</div>'
            + '<div style="font-size:12px;margin-top:8px;color:#666;">' + e.message + '</div>'
            + '<button onclick="location.reload()" style="margin-top:16px;padding:10px 24px;background:#0FA366;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">새로고침</button>'
            + '</div>';
        }
      }
    }, 200);
  }
  if (id === 'price-view') { 
    safeCall('renderPriceView', function(){ renderPriceView(); });
  }
  if (id === 'owner-history') {
    safeCall('renderOwnerHistoryPanel', function() {
      // 🆕 v68: 패널 진입 시 첫 로드면 "오늘" 기본 설정
      if (_ownerHistRangeStart === null && _ownerHistRangeEnd === null && _ownerHistRangeLabel === '오늘') {
        setTimeout(function() {
          var todayBtn = document.querySelector('.ohist-quick-btn');
          if (todayBtn) setOwnerHistRange(todayBtn, 'today');
        }, 100);
      } else {
        renderOwnerHistoryPanel && renderOwnerHistoryPanel();
      }
    });
  }
  if (id === 'esg')       { 
    safeCall('renderEsgPanel', function(){ renderEsgPanel(); }); 
    safeCall('renderEsgPointHistory', function(){ renderEsgPointHistory && renderEsgPointHistory(); });
  }
  if (id === 'schedule')  { safeCall('renderDriverSchedule', function(){ renderDriverSchedule && renderDriverSchedule(); }); }
  if (id === 'owner')     { safeCall('renderOwnerPanel', function(){ renderOwnerPanel && renderOwnerPanel(); }); }
  if (id === 'register')  {
    const adminSec = document.getElementById('adminBizManageSection');
    if (adminSec) adminSec.style.display = isAdminMode ? '' : 'none';
    initRegProductRows && initRegProductRows();
    if (isAdminMode) {
      window._bizSelectedSet = {};
      renderRegBizList();
      renderDeletedBizList();
      loadPendingBizFromDB && loadPendingBizFromDB();
      updateRegisterBadge();
      updateBizTrashCount && updateBizTrashCount();
    }
    // 서명 캔버스 초기화 (DOM 그려진 후)
    setTimeout(function() { initRegSignatureCanvas && initRegSignatureCanvas(); }, 100);
  }

  if (id === 'support')   { 
    safeCall('loadDriverAccountsFromDB', function() {
      if (typeof loadDriverAccountsFromDB === 'function') 
        loadDriverAccountsFromDB().then(function(){ 
          try { renderDriverAccounts && renderDriverAccounts(); } catch(e) {}
        });
    });
    // 🆕 v107: 고객센터 진입 시 FAQ 탭 기본 활성화
    setTimeout(function() {
      try { switchSupportTab('faq'); } catch(e) {}
    }, 50);
  }
  // 🆕 v141: 운반자 로그인 패널 진입 시 driver_accounts 자동 로드 (다른 기기/clear 후 대응)
  if (id === 'driver-login') {
    if (typeof loadDriverAccountsFromDB === 'function') {
      loadDriverAccountsFromDB().then(function() {
        console.log('[Driver] 계정 로드 완료 — ' + (driverAccounts ? driverAccounts.length : 0) + '명');
      }).catch(function(e) {
        console.warn('[Driver] DB 로드 실패, localStorage fallback 사용:', e);
      });
    }
  }
  if (id === 'admin') {
    safeCall('admin 라우팅', function() {
      // 관리자 로그인 상태면 비번 화면 건너뛰고 바로 대시 표시
      if (isAdminMode) {
        const ls = document.getElementById('adminLoginState');
        const ds = document.getElementById('adminDashState');
        if (ls) ls.style.display = 'none';
        if (ds) ds.style.display = 'block';
      } else {
        const hint = document.getElementById('adminPwHint');
        if (hint) hint.style.display = localStorage.getItem('hiveoil_admin_pw') ? 'none' : 'block';
      }
      renderAdminPrices && renderAdminPrices();
      setTimeout(function(){ try { fillAdminNoticeForm && fillAdminNoticeForm(); } catch(e) {} }, 200);
    });
  }
  if (id === 'apply')     { safeCall('apply 라우팅', function(){ renderApplyList(); updateApplyKpi(); }); }
  if (id === 'esg-school') { safeCall('esg-school', function(){ renderEsgSchoolMini(); schoolDemoCalc(); }); }
  if (id === 'esg-franchise') { safeCall('esg-franchise', function(){ franchiseDemoCalc(); }); }
  if (id === 'owner-dash') {
    renderOwnerDash();
    applyPrices();
    // 공지사항 적용
    applyNoticeToDashboard && applyNoticeToDashboard();
    // DB에서 최신 시세 로드 (다른 기기에서 변경된 시세 즉시 반영)
    loadPricesFromDB && loadPricesFromDB();
    // 공지도 새로고침
    loadNotice && loadNotice();
    // DB에서 최신 업체 정보 로드
    if (ownerBizId) {
      loadBusinessesFromDB && loadBusinessesFromDB();
    }
  }
  if (id === 'qr') {
    // 비로그인 시 로그인 화면으로 리다이렉트
    if (!ownerLoggedIn && !isAdminMode && !isDriverMode) {
      showPanel('owner-login', null, pushState);
      showToast('t1','🔒 로그인 필요','업주 로그인 후 이용 가능합니다');
      return;
    }
    // businesses가 있으면 즉시, 없으면 DB 로드 후 채우기
    if (businesses.length > 0) {
      initQRPanel && initQRPanel();
    } else {
      loadBusinessesFromDB().then(() => initQRPanel && initQRPanel());
    }
  }
  if (id === 'waste' || id === 'order') {
    if (!ownerLoggedIn && !isAdminMode && !isDriverMode && !window._skipLoginCheck) {
      showPanel('owner-login', null, pushState);
      showToast('t1','🔒 로그인 필요','업주 로그인 후 이용 가능합니다');
      return;
    }
    if (id === 'waste') {
      // 수거 대기 목록(businesses) + 이력 모두 최신으로 로드
      Promise.all([
        loadBusinessesFromDB ? loadBusinessesFromDB() : Promise.resolve(),
        loadHistoryFromDB ? loadHistoryFromDB() : Promise.resolve()
      ]).then(function() {
        renderWasteTable && renderWasteTable();
        renderWastePendingList && renderWastePendingList();
        renderWasteHistList && renderWasteHistList();
        updateTabBadges && updateTabBadges();
      });
    }
    if (id === 'order') {
      // 업체 재고(businesses) + 이력 모두 최신으로 로드
      Promise.all([
        loadBusinessesFromDB ? loadBusinessesFromDB() : Promise.resolve(),
        loadHistoryFromDB ? loadHistoryFromDB() : Promise.resolve()
      ]).then(function() {
        renderDeliveryPanel && renderDeliveryPanel();
        updateOrderMonthStats && updateOrderMonthStats();
      });
    }
  }
  if (id === 'delivery')  { showPanel('order', null, pushState); return; }
}

// 뒤로가기 / 앞으로가기 처리
window.addEventListener('popstate', (e) => {
  const panel = (e.state && e.state.panel) ? e.state.panel : 'dashboard';
  showPanel(panel, null, false);
});

// 첫 로드 시 URL 해시로 패널 결정
(function() {
  const validPanels = ['owner-dash','dashboard','map','waste','order','history','price','price-view','esg','schedule','owner','hq-login','admin','register','qr','apply','support','esg-school','esg-franchise','owner-history'];
  const rawHash = location.hash.replace('#','');
  // 🆕 QR 스캔 URL (#stock?biz=...) 은 별도 처리 — handleQRScanUrl가 처리하므로 hash/패널 변경 안 함
  if (rawHash.startsWith('stock')) {
    console.log('[hash 라우팅] QR 스캔 URL 감지 — handleQRScanUrl 대기');
    return;  // 패널 변경 안 함, handleQRScanUrl가 처리
  }
  const hash = rawHash;
  const startPanel = (hash && validPanels.includes(hash)) ? hash : 'owner-dash';
  history.replaceState({ panel: startPanel }, '', '#' + startPanel);
  // qr 패널은 세션 복원(DB 로드 후)까지 기다렸다가 열기
  if (startPanel === 'qr') {
    const tryOpen = function() {
      if (ownerLoggedIn || isAdminMode || isDriverMode) {
        showPanel('qr', null, false);
      } else {
        showPanel('owner-login', null, false);
      }
    };
    if (window._onBusinessesLoaded) {
      const prev = window._onBusinessesLoaded;
      window._onBusinessesLoaded = function() { prev(); tryOpen(); };
    } else {
      setTimeout(tryOpen, 800); // DB 로드 대기
    }
  } else if (startPanel !== 'dashboard') {
    showPanel(startPanel, null, false);
  }
})();

// ===== WASTE =====
function renderWasteTable() {
  // 업주 로그인 시 자기 업체만, 아니면 전체
  var allBiz = businesses;
  var myBiz  = (ownerLoggedIn && ownerBizId) ? businesses.filter(function(b){ return String(b.id) === String(ownerBizId); }) : allBiz;

  // 상단 KPI 업데이트
  // 🔧 fix v67: 자동수거 임계값 사용 (autoCollect ON 업체만 트리거 만족 시 표시)
  const waitBiz  = myBiz.filter(b => shouldAutoCollect(b));
  const waitEl  = document.getElementById('wasteWaitCount');
  const waitSub = document.getElementById('wasteWaitSub');
  if (waitEl)  waitEl.textContent = waitBiz.length;
  if (waitSub) waitSub.textContent = waitBiz.length > 0
    ? '업체 · 총 ' + (waitBiz.reduce((s,b) => s + b.wasteOil, 0) * PRICES.waste.can.kg).toFixed(0) + 'kg 대기'
    : '수거 대기 없음';
  const now2 = new Date();
  const thisMonth2 = now2.getMonth();
  const thisYear2  = now2.getFullYear();
  const doneHistory = historyData.filter(h => { if(h.deleted_at) return false;
    if (h.type !== '폐유수거' || h.status !== 'done') return false;
    if (!isSameMonth(h, thisYear2, thisMonth2)) return false;
    // 업주 로그인 시 자기 업체 이력만
    if (ownerLoggedIn && ownerBizId && String(h.bizId) !== String(ownerBizId)) return false;
    return true;
  });
  const doneEl  = document.getElementById('wasteDoneCount');
  const doneSub = document.getElementById('wasteDoneSub');
  if (doneEl)  doneEl.textContent = doneHistory.length;
  if (doneSub) doneSub.textContent = doneHistory.length > 0
    ? '건 · 총 ' + doneHistory.reduce((s,h) => s + (h.qty||0), 0) + '캔 수거 완료'
    : '완료된 수거 없음';
  // 패널이 열려 있으면 목록도 같이 갱신
  const donePanel = document.getElementById('wasteDonePanel');
  if (donePanel && donePanel.style.display !== 'none') renderWasteDoneList();

  const pendingBiz = myBiz.filter(b => shouldAutoCollect(b)).sort((a,b) => b.wasteOil - a.wasteOil);
  const wasteTableBody = document.getElementById('wasteTableBody');
  if (!wasteTableBody) return;
  if (pendingBiz.length === 0) {
    wasteTableBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">♻️ 수거 대기 중인 업체가 없어요</td></tr>';
    return;
  }
  const validPendingBiz = pendingBiz.filter(b => b.wasteOil > 0);
  wasteTableBody.innerHTML = validPendingBiz.map(b => {
    const cans    = b.wasteOil;
    const kg      = (cans * PRICES.waste.can.kg).toFixed(1);
    const price   = (cans * PRICES.waste.can.price).toLocaleString();
    const isUrgent = cans >= 5;
    const hasPending = historyData.some(h => String(h.bizId) === String(b.id) && h.type === '폐유수거' && h.status === 'pending');

    // 상태 뱃지
    let statusBadge;
    if (hasPending) {
      statusBadge = '<span class="status-pill status-inprogress">🚛 수거 예정</span>';
    } else if (isUrgent) {
      statusBadge = '<span class="status-pill status-pending">🔴 긴급 수거</span>';
    } else {
      statusBadge = '<span class="status-pill" style="background:#FFF8F0;color:#D4621A;">⏳ 수거 대기</span>';
    }

    // 액션 버튼 — 2단계 흐름: [수거 신청] → [수거 완료(kg입력)]
    const visitInfo = (() => {
      const p = historyData.find(h => String(h.bizId)===String(b.id) && h.type==='폐유수거' && h.status==='pending');
      return p && p.visitLabel ? ' · ' + p.visitLabel : '';
    })();
    const actionBtn = hasPending
      ? `<button class="btn" style="padding:6px 14px;font-size:12px;background:#E8F5E9;color:#2E7D32;border:1.5px solid #A5D6A7;white-space:nowrap;font-weight:800;border-radius:9px;"
            onclick="showCompleteCollectModal(${b.id})">✅ 수거 완료${visitInfo}</button>`
      : `<button class="btn btn-danger" style="padding:6px 14px;font-size:12px;white-space:nowrap;font-weight:800;border-radius:9px;"
            onclick="requestCollect(${b.id})">🚛 수거 신청</button>`;

    return `<tr>
      <td>
        <strong>${b.name}</strong>
        ${b.deliveryDays && b.deliveryDays.length > 0 ? '<div style="font-size:10px;color:#1565C0;margin-top:2px;">📅 희망: ' + b.deliveryDays.map(function(d){return {mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d]||d;}).join('/') + '</div>' : ''}
        ${b.closedDays && b.closedDays.length > 0 ? '<div style="font-size:10px;color:var(--red-accent);margin-top:1px;">🚫 휴무: ' + b.closedDays.map(function(d){return {mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d]||d;}).join('/') + '</div>' : ''}
      </td>
      <td style="color:var(--gray)">${b.type}</td>
      <td><strong style="color:${isUrgent?'var(--red-accent)':'#D4621A'}">${cans}캔</strong></td>
      <td><strong>${getBizTotalNewOil(b)}</strong>캔</td>
      <td>
        <div style="font-weight:700;color:var(--black);">${cans}캔 (${kg}kg)</div>
        <div style="font-size:11px;color:var(--green-dark);font-weight:700;margin-top:2px;">${price}원</div>
      </td>
      <td>${statusBadge}</td>
      <td>${actionBtn}</td>
    </tr>`;
  }).join('');
}

// ===== HISTORY =====
function fmtHistDate(h) {
  if (h.rawDate) {
    var d = new Date(h.rawDate);
    return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0')
      + ' ' + String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
  }
  return h.date || '—';
}

function isAutoAlertOnly(h) {
  // 폐유수거는 method에 상관없이 항상 표시
  if (h.type === '폐유수거') return false;
  // 자동발주 알림/감지 항목 (실제 납품 아님) — method 또는 content로 판별
  if (h.method === '자동⚡') return true;
  if (h.content && h.content.indexOf('자동발주 알림') !== -1) return true;
  if (h.content && h.content.indexOf('자동발주 납품 완료') !== -1) return true;
  return false;
}

// 현재 활성 탭 추적
var _currentHistTab = 'all';

function renderHistory(filter) {
  filter = filter || _currentHistTab || 'all';
  _currentHistTab = filter;

  let data = historyData;
  // 🗑️ 휴지통 (deleted_at 있는 것)은 제외
  data = data.filter(d => !d.deleted_at);
  // 업주 로그인 시 자기 업체 이력만
  if (ownerLoggedIn && ownerBizId) {
    data = data.filter(d => String(d.bizId) === String(ownerBizId));
  }
  // 자동발주 알림/감지 항목 제외 (납품·수거 완료 이력만 표시)
  data = data.filter(d => !isAutoAlertOnly(d));
  if (filter === 'waste') data = data.filter(d => d.type === '폐유수거');
  if (filter === 'order') data = data.filter(d => d.type === '식용유발주');
  if (filter === 'auto')  data = data.filter(d => d.type === '자동발주');

  // 🔍 추가 필터 (드롭다운)
  var fBiz     = (document.getElementById('histFilterBiz')||{}).value || '';
  var fMonth   = (document.getElementById('histFilterMonth')||{}).value || '';
  var fProduct = (document.getElementById('histFilterProduct')||{}).value || '';
  var fStatus  = (document.getElementById('histFilterStatus')||{}).value || '';

  if (fBiz) data = data.filter(d => String(d.bizId) === String(fBiz));
  if (fMonth) data = data.filter(d => (d.date || '').startsWith(fMonth));
  if (fProduct) {
    if (fProduct === 'waste') data = data.filter(d => d.type === '폐유수거');
    else data = data.filter(d => {
      // productKey가 fProduct(soy/canola/corn)로 시작하는지
      var pk = d.productKey || '';
      return pk.indexOf(fProduct) === 0;
    });
  }
  if (fStatus) data = data.filter(d => d.status === fStatus);

  // 필터 옵션 갱신 (업체/월 드롭다운)
  populateHistoryFilterOptions();

  // 결과 개수 표시
  var resultEl = document.getElementById('histFilterResultCount');
  if (resultEl) {
    var hasFilter = fBiz || fMonth || fProduct || fStatus;
    resultEl.textContent = hasFilter ? '결과 ' + data.length + '건' : '';
  }

  // 휴지통 카운트 갱신
  updateTrashCount();

  const sm = { pending:'<span class="status-pill status-pending">대기중</span>', inprogress:'<span class="status-pill status-inprogress">처리중</span>', done:'<span class="status-pill status-done">완료</span>', cancelled:'<span class="status-pill" style="background:#FFEBEE;color:#C0392B;">취소</span>' };
  const actionBtn = (h, i) => {
    var btns = '';
    if (h.type === '식용유발주' && h.status === 'pending')
      btns += '<button class="btn" style="padding:3px 8px;font-size:10px;background:#E8F5E9;color:#2E7D32;border:none;border-radius:6px;cursor:pointer;margin-right:3px" onclick="completeOrder(\'' + (h.dbId || i) + '\')">✅ 납품완료</button>';
    if (h.type === '폐유수거' && h.status === 'pending')
      btns += '<button class="btn btn-danger" style="padding:3px 8px;font-size:10px;margin-right:3px" onclick="completeCollect(' + h.bizId + ')">✅ 수거완료</button>';
    // 📋 ISCC 건별 발행 — 완료된 폐유 수거 + ISCC 동의 업체만
    if (h.type === '폐유수거' && h.status === 'done') {
      var bizForIscc = businesses.find(function(b){ return String(b.id) === String(h.bizId); });
      if (bizForIscc && bizForIscc.iscc_agreed === true) {
        btns += '<button title="이 거래만 ISCC 자가선언서 발행" style="padding:3px 8px;font-size:10px;background:#E3F2FD;color:#1565C0;border:1px solid #BBDEFB;border-radius:6px;cursor:pointer;margin-right:3px;font-family:var(--font-body);font-weight:700;" onclick="generateIsccDeclaration(businesses.find(function(b){return String(b.id)===String(' + h.bizId + ');}), \'' + (h.dbId || h.id || '') + '\')">📋 ISCC</button>';
      }
    }
    // 🗑️ 삭제 버튼 (관리자 전용)
    if (isAdminMode) {
      btns += '<button title="휴지통으로 이동 (30일 보관)" style="padding:3px 8px;font-size:10px;background:#FFF5F5;color:#C0392B;border:1px solid #FFB3B3;border-radius:6px;cursor:pointer;font-family:var(--font-body);" onclick="softDeleteHistory(\'' + (h.dbId || h.rawDate || i) + '\')">🗑️</button>';
    }
    return btns;
  };
  const histBodyEl = document.getElementById('historyBody');
  if (!histBodyEl) return;
  // 일괄 삭제 모드 — 관리자 전용
  var bulkMode = isAdminMode;
  var colspan = bulkMode ? 11 : 10;
  // 일괄 삭제용 헬퍼: row의 unique 키 (selected set 매칭에 사용)
  var rowKey = function(d) {
    return d.dbId ? ('db:' + d.dbId) : ((d.rawDate || '') + '|' + (d.bizId || '') + '|' + (d.type || ''));
  };
  // 체크박스 셀 생성 (모든 거래 선택 가능 — 휴지통 복구가 안전망)
  var chkCell = function(d) {
    if (!bulkMode) return '';
    var key = rowKey(d).replace(/"/g, '&quot;');
    var checked = (window._historySelectedSet && window._historySelectedSet[rowKey(d)]) ? 'checked' : '';
    return '<td style="text-align:center;"><input type="checkbox" class="hist-row-chk" data-key="' + key + '" ' + checked + ' onchange="onHistoryRowCheck(this)" style="cursor:pointer;width:14px;height:14px;"></td>';
  };

  if (data.length === 0) {
    histBodyEl.innerHTML = '<tr><td colspan="' + colspan + '" style="text-align:center;padding:30px;color:var(--gray);">조건에 맞는 이력이 없어요</td></tr>';
    updateHistoryBulkBar(); // 결과 0건이어도 바 갱신
    return;
  }

  // 🆕 단가 셀 생성 헬퍼
  function _unitPriceCell(d) {
    var unitPrice = d.unitPrice || _extractUnitPrice(d) || 0;
    var displayPrice = unitPrice ? unitPrice.toLocaleString() + '원' : '—';
    var rowKeyStr = (d.dbId ? 'db:'+d.dbId : (d.rawDate||'') + '|' + (d.bizId||'') + '|' + (d.type||''));
    if (isAdminMode && d.dbId) {
      // 관리자: 클릭 가능한 버튼 형식 (수정 모달)
      return '<td style="text-align:right;font-size:11px;white-space:nowrap;"><button onclick="editHistoryUnitPrice(\'' + d.dbId + '\')" style="background:#EEF4FF;border:1px solid #B3D4FC;color:#185FA5;border-radius:5px;padding:2px 7px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);" title="단가 수정">' + displayPrice + ' ✏️</button></td>';
    }
    return '<td style="text-align:right;font-size:11px;color:#555;">' + displayPrice + '</td>';
  }
  function _qtyCell(d) {
    var qty = d.qty || 0;
    var unit = d.type === '폐유수거' ? '캔' : '캔';
    return '<td style="text-align:center;font-size:11px;font-weight:700;">' + qty + unit + '</td>';
  }

  // 월별 그룹핑
  if (filter === 'all' || filter === 'waste' || filter === 'order') {
    const groups = {};
    data.forEach(function(d) {
      const ym = (d.date||'').slice(0,7);
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(d);
    });
    histBodyEl.innerHTML = Object.keys(groups).sort(function(a,b){return b.localeCompare(a);}).map(function(ym) {
      const items = groups[ym];
      const totalQty = items.reduce(function(s,h){return s+(h.qty||0);},0);
      const totalAmt = items.reduce(function(s,h){
        var n=parseInt((h.amount||'0').replace(/[^0-9]/g,''));
        return s+(isNaN(n)?0:n);
      },0);
      const wasteAmt = items.filter(function(h){return h.type==='폐유수거';}).reduce(function(s,h){
        var n=parseInt((h.amount||'0').replace(/[^0-9]/g,''));
        return s+(isNaN(n)?0:n);
      },0);
      const orderAmt = items.filter(function(h){return h.type==='식용유발주';}).reduce(function(s,h){
        var n=parseInt((h.amount||'0').replace(/[^0-9]/g,''));
        return s+(isNaN(n)?0:n);
      },0);
      return '<tr style="background:#F0F4F8;"><td colspan="' + colspan + '" style="padding:8px 12px;font-weight:800;font-size:12px;border-bottom:2px solid #CBD5E0;">'
        + ym.replace('.','-') + ' &nbsp;|&nbsp; 총 ' + items.length + '건 · ' + totalQty + '캔'
        + (orderAmt>0?' &nbsp;<span style="color:var(--green-dark)">납품 '+orderAmt.toLocaleString()+'원</span>':'')
        + (wasteAmt>0?' &nbsp;<span style="color:#D4621A">수거 '+wasteAmt.toLocaleString()+'원</span>':'')
        + '</td></tr>'
        + items.map(function(d,i) {
          return '<tr>'
            + chkCell(d)
            + '<td style="font-size:11px;white-space:nowrap;">'+fmtHistDate(d)+'</td>'
            + '<td><strong>'+d.biz+'</strong></td>'
            + '<td><span class="tag '+(d.type==='폐유수거'?'tag-alert':'tag-pending')+'">'+d.type+'</span></td>'
            + '<td>'+d.content+'</td>'
            + _unitPriceCell(d)
            + _qtyCell(d)
            + '<td style="text-align:right;font-weight:800;white-space:nowrap;">'+d.amount+'</td>'
            + '<td style="color:'+(d.method==='수동'?'var(--gray)':'var(--green-dark)')+';font-weight:600">'+d.method+'</td>'
            + '<td>'+(sm[d.status]||'')+'</td>'
            + '<td>'+actionBtn(d,historyData.indexOf(d))+'</td>'
            + '</tr>';
        }).join('');
    }).join('');
  } else {
    histBodyEl.innerHTML = data.map(function(d,i) {
      return '<tr>'
        + chkCell(d)
        + '<td style="font-size:11px;white-space:nowrap;">'+fmtHistDate(d)+'</td>'
        + '<td><strong>'+d.biz+'</strong></td>'
        + '<td><span class="tag '+(d.type==='폐유수거'?'tag-alert':'tag-pending')+'">'+d.type+'</span></td>'
        + '<td>'+d.content+'</td>'
        + _unitPriceCell(d)
        + _qtyCell(d)
        + '<td style="text-align:right;font-weight:800;white-space:nowrap;">'+d.amount+'</td>'
        + '<td style="color:'+(d.method==='수동'?'var(--gray)':'var(--green-dark)')+';font-weight:600">'+d.method+'</td>'
        + '<td>'+(sm[d.status]||'')+'</td>'
        + '<td>'+actionBtn(d,historyData.indexOf(d))+'</td>'
        + '</tr>';
    }).join('');
  }

  // 표시 후 일괄 삭제 바 갱신 (필터 결과 카운트 포함)
  window._historyVisibleData = data;
  updateHistoryBulkBar();
}

function switchHistTab(el, f) {
  document.querySelectorAll('.h-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  _currentHistTab = f;
  // 탭 전환 시 선택 해제
  window._historySelectedSet = {};
  renderHistory(f);
}

// ============================================================
// 🗑️ 일괄 삭제 시스템
// ============================================================
window._historySelectedSet = window._historySelectedSet || {}; // { rowKey: row 객체 }
window._historyVisibleData = window._historyVisibleData || [];

// 행 체크박스 클릭 핸들러
function onHistoryRowCheck(chk) {
  var key = chk.getAttribute('data-key');
  if (!key) return;
  // visible data에서 해당 row 찾기
  var matched = (window._historyVisibleData || []).find(function(d) {
    var rk = d.dbId ? ('db:' + d.dbId) : ((d.rawDate || '') + '|' + (d.bizId || '') + '|' + (d.type || ''));
    return rk === key;
  });
  if (chk.checked) {
    window._historySelectedSet[key] = matched || true;
  } else {
    delete window._historySelectedSet[key];
  }
  updateHistoryBulkBar();
}

// 전체 선택 토글
function toggleHistorySelectAll(chk) {
  var visible = window._historyVisibleData || [];
  if (chk.checked) {
    visible.forEach(function(d) {
      var rk = d.dbId ? ('db:' + d.dbId) : ((d.rawDate || '') + '|' + (d.bizId || '') + '|' + (d.type || ''));
      window._historySelectedSet[rk] = d;
    });
  } else {
    visible.forEach(function(d) {
      var rk = d.dbId ? ('db:' + d.dbId) : ((d.rawDate || '') + '|' + (d.bizId || '') + '|' + (d.type || ''));
      delete window._historySelectedSet[rk];
    });
  }
  // 화면 체크박스 동기화
  document.querySelectorAll('.hist-row-chk').forEach(function(c) {
    c.checked = chk.checked;
  });
  updateHistoryBulkBar();
}

// 선택 해제
function clearHistorySelection() {
  window._historySelectedSet = {};
  document.querySelectorAll('.hist-row-chk').forEach(function(c) { c.checked = false; });
  var allChk = document.getElementById('histSelectAllChk');
  if (allChk) allChk.checked = false;
  updateHistoryBulkBar();
}

// 일괄 삭제 바 갱신 (선택 개수, 필터 전체삭제 버튼 노출 등)
function updateHistoryBulkBar() {
  var bar = document.getElementById('histBulkActionBar');
  if (!bar) return;
  // 관리자 전용
  if (!isAdminMode) { bar.style.display = 'none'; return; }

  var selectedKeys = Object.keys(window._historySelectedSet || {});
  var selectedCount = selectedKeys.length;
  var visible = window._historyVisibleData || [];

  // 선택 항목의 type breakdown
  var orderCount = 0, wasteCount = 0, doneCount = 0;
  selectedKeys.forEach(function(k) {
    var d = window._historySelectedSet[k];
    if (d && typeof d === 'object') {
      if (d.type === '식용유발주') orderCount++;
      else if (d.type === '폐유수거') wasteCount++;
      if (d.status === 'done') doneCount++;
    }
  });

  // 필터 적용 여부 — 4개 필터 중 하나라도 활성?
  var fBiz     = (document.getElementById('histFilterBiz')||{}).value || '';
  var fMonth   = (document.getElementById('histFilterMonth')||{}).value || '';
  var fProduct = (document.getElementById('histFilterProduct')||{}).value || '';
  var fStatus  = (document.getElementById('histFilterStatus')||{}).value || '';
  var hasFilter = !!(fBiz || fMonth || fProduct || fStatus);

  // 표시 결정: 1건 이상 선택 OR 필터 결과 1건 이상이면 바 표시
  if (selectedCount > 0 || (hasFilter && visible.length > 0)) {
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }

  // 선택 카운트 표시
  var sCntEl = document.getElementById('histSelectedCount');
  if (sCntEl) sCntEl.textContent = selectedCount;
  var btnCntEl = document.getElementById('histBulkBtnCount');
  if (btnCntEl) btnCntEl.textContent = selectedCount;

  // breakdown
  var breakdown = '';
  if (selectedCount > 0) {
    var parts = [];
    if (orderCount > 0) parts.push('🫙 발주 ' + orderCount);
    if (wasteCount > 0) parts.push('♻️ 수거 ' + wasteCount);
    if (doneCount > 0) parts.push('<span style="color:#FFD699">⚠ 완료된 거래 ' + doneCount + '건 포함</span>');
    breakdown = '· ' + parts.join(', ');
  }
  var bdEl = document.getElementById('histBulkBreakdown');
  if (bdEl) bdEl.innerHTML = breakdown;

  // 필터 일괄삭제 버튼 (필터 적용 시에만 표시)
  var filterBtn = document.getElementById('histBulkFilterBtn');
  var filterCnt = document.getElementById('histBulkFilterCount');
  if (filterBtn && filterCnt) {
    if (hasFilter && visible.length > 0) {
      filterBtn.style.display = 'inline-block';
      filterCnt.textContent = visible.length;
    } else {
      filterBtn.style.display = 'none';
    }
  }
}

// 선택 항목 일괄 삭제 (체크박스로 선택한 항목)
async function bulkDeleteSelected() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  var selectedKeys = Object.keys(window._historySelectedSet || {});
  if (selectedKeys.length === 0) { showToast('t1','⚠️ 선택된 항목 없음','체크박스로 항목을 선택해주세요'); return; }

  // type breakdown
  var orderCount = 0, wasteCount = 0, doneCount = 0;
  selectedKeys.forEach(function(k) {
    var d = window._historySelectedSet[k];
    if (d && typeof d === 'object') {
      if (d.type === '식용유발주') orderCount++;
      else if (d.type === '폐유수거') wasteCount++;
      if (d.status === 'done') doneCount++;
    }
  });

  // 1차 컨펌
  var msg = '선택한 ' + selectedKeys.length + '건을 휴지통으로 이동할까요?\n\n';
  if (orderCount > 0) msg += '· 식용유 발주: ' + orderCount + '건\n';
  if (wasteCount > 0) msg += '· 폐유 수거: ' + wasteCount + '건\n';
  if (doneCount > 0) msg += '\n⚠️ 이 중 ' + doneCount + '건은 이미 완료된 거래입니다 (정산에서 차감됩니다)\n';
  msg += '\n휴지통에서 30일간 복구 가능해요.';
  if (!confirm(msg)) return;

  // 2차 더블 컨펌
  if (!confirm('정말 ' + selectedKeys.length + '건을 모두 휴지통으로 이동하시겠어요?\n\n마지막 확인입니다.')) return;

  // 실행 — softDeleteHistorySilent로 일괄 처리 (개별 confirm 없이)
  var deletedAt = new Date().toISOString();
  var deletedSet = _loadDeletedSet();
  var successCount = 0;
  var errorCount = 0;
  var dbUpdates = [];

  selectedKeys.forEach(function(rk) {
    // historyData에서 해당 row 찾기
    var idx = historyData.findIndex(function(h) {
      var hKey = h.dbId ? ('db:' + h.dbId) : ((h.rawDate || '') + '|' + (h.bizId || '') + '|' + (h.type || ''));
      return hKey === rk;
    });
    if (idx < 0) { errorCount++; return; }
    var h = historyData[idx];
    h.deleted_at = deletedAt;
    h.deleted_by = 'admin-bulk';
    var hisKey = _historyKey(h);
    var auxKey = _historyAuxKey(h);
    if (hisKey) deletedSet[hisKey] = deletedAt;
    if (auxKey) deletedSet[auxKey] = deletedAt;
    if (h.dbId) dbUpdates.push(h.dbId);
    successCount++;
  });

  saveHistory();
  _saveDeletedSet(deletedSet);

  // DB 일괄 update (컬럼 있으면 update, 없으면 row 삭제 fallback)
  dbUpdates.forEach(function(dbId) {
    try {
      db.from('history').update({ deleted_at: deletedAt }).eq('id', dbId).then(function(res){
        if (res.error) {
          var msg = res.error.message || '';
          if (/deleted_at|column .* does not exist/i.test(msg)) {
            // 컬럼 없음 → DB row 직접 삭제 (localStorage 휴지통은 별개로 보존되어 복구 가능)
            db.from('history').delete().eq('id', dbId).then(function(res2){
              if (res2.error) console.warn('DB row 삭제 실패:', dbId, res2.error.message);
            });
          } else {
            console.warn('일괄삭제 DB 동기화 실패:', dbId, msg);
          }
        }
      });
    } catch(e) {}
  });

  // 선택 해제 + UI 갱신
  window._historySelectedSet = {};
  showToast('t1','🗑️ 일괄 휴지통 이동 완료', successCount + '건 이동' + (errorCount > 0 ? ' (' + errorCount + '건 실패)' : ''));
  renderHistory(_currentHistTab);
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  updateHqRealStats && updateHqRealStats();
  renderDeliveryPanel && renderDeliveryPanel();
  renderOwnerDash && renderOwnerDash();
  renderEsgPanel && renderEsgPanel();
  renderBilling && renderBilling();
  updateTrashCount();
}

// 현재 필터 결과 전체를 일괄 삭제 (휴지통 30일 복구 안전망)
async function bulkDeleteFiltered() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  var visible = window._historyVisibleData || [];
  if (visible.length === 0) { showToast('t1','⚠️ 삭제 가능한 항목 없음',''); return; }

  // 필터 정보 표시
  var fBiz     = (document.getElementById('histFilterBiz')||{});
  var fMonth   = (document.getElementById('histFilterMonth')||{});
  var fProduct = (document.getElementById('histFilterProduct')||{});
  var fStatus  = (document.getElementById('histFilterStatus')||{});
  var bizName = fBiz.value ? fBiz.options[fBiz.selectedIndex].textContent : '';
  var monthName = fMonth.value ? fMonth.options[fMonth.selectedIndex].textContent : '';
  var prodName = fProduct.value ? fProduct.options[fProduct.selectedIndex].textContent : '';
  var statusName = fStatus.value ? fStatus.options[fStatus.selectedIndex].textContent : '';
  var filterDesc = [bizName, monthName, prodName, statusName].filter(function(x){return x;}).join(' · ');

  // 완료된 거래 카운트 (경고용)
  var doneCount = visible.filter(function(d) { return d.status === 'done'; }).length;

  var msg = '🔍 현재 필터 조건의 결과를 모두 휴지통으로 이동할까요?\n\n';
  if (filterDesc) msg += '필터: ' + filterDesc + '\n\n';
  msg += '· 삭제 대상: ' + visible.length + '건\n';
  if (doneCount > 0) msg += '\n⚠️ 이 중 ' + doneCount + '건은 이미 완료된 거래입니다 (정산에서 차감됩니다)\n';
  msg += '\n휴지통에서 30일간 복구 가능해요.';
  if (!confirm(msg)) return;

  // 더블 컨펌
  if (!confirm('정말 ' + visible.length + '건을 모두 휴지통으로 이동하시겠어요?\n\n마지막 확인입니다.')) return;

  var deletedAt = new Date().toISOString();
  var deletedSet = _loadDeletedSet();
  var successCount = 0;
  var dbUpdates = [];

  visible.forEach(function(d) {
    var idx = historyData.findIndex(function(h) {
      if (d.dbId && h.dbId) return String(h.dbId) === String(d.dbId);
      return h.rawDate === d.rawDate && h.bizId === d.bizId && h.type === d.type;
    });
    if (idx < 0) return;
    var h = historyData[idx];
    h.deleted_at = deletedAt;
    h.deleted_by = 'admin-filter-bulk';
    var hisKey = _historyKey(h);
    var auxKey = _historyAuxKey(h);
    if (hisKey) deletedSet[hisKey] = deletedAt;
    if (auxKey) deletedSet[auxKey] = deletedAt;
    if (h.dbId) dbUpdates.push(h.dbId);
    successCount++;
  });

  saveHistory();
  _saveDeletedSet(deletedSet);

  dbUpdates.forEach(function(dbId) {
    try {
      db.from('history').update({ deleted_at: deletedAt }).eq('id', dbId).then(function(res){
        if (res.error) {
          var msg = res.error.message || '';
          if (/deleted_at|column .* does not exist/i.test(msg)) {
            // 컬럼 없음 → DB row 직접 삭제
            db.from('history').delete().eq('id', dbId).then(function(res2){
              if (res2.error) console.warn('DB row 삭제 실패:', dbId, res2.error.message);
            });
          } else {
            console.warn('필터 일괄삭제 DB 동기화 실패:', dbId, msg);
          }
        }
      });
    } catch(e) {}
  });

  window._historySelectedSet = {};
  showToast('t1','🗑️ 필터 결과 일괄 휴지통 이동', successCount + '건 이동');
  renderHistory(_currentHistTab);
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  updateHqRealStats && updateHqRealStats();
  renderDeliveryPanel && renderDeliveryPanel();
  renderOwnerDash && renderOwnerDash();
  renderEsgPanel && renderEsgPanel();
  renderBilling && renderBilling();
  updateTrashCount();
}

// ============================================================
// 🔍 진행 이력 필터 옵션 자동 생성 (업체별 / 월별)
// ============================================================
function populateHistoryFilterOptions() {
  // 업체 드롭다운
  var bizSel = document.getElementById('histFilterBiz');
  if (bizSel) {
    var currentVal = bizSel.value;
    var bizSet = {};
    historyData.forEach(function(h) {
      if (h.deleted_at) return;
      if (h.bizId && h.biz) bizSet[h.bizId] = h.biz;
    });
    var options = ['<option value="">전체 업체</option>'];
    Object.keys(bizSet).sort(function(a,b){
      return bizSet[a].localeCompare(bizSet[b], 'ko');
    }).forEach(function(bid) {
      options.push('<option value="' + bid + '"' + (String(currentVal)===String(bid)?' selected':'') + '>' + bizSet[bid] + '</option>');
    });
    bizSel.innerHTML = options.join('');
  }
  // 월 드롭다운
  var monthSel = document.getElementById('histFilterMonth');
  if (monthSel) {
    var currentMonth = monthSel.value;
    var monthSet = {};
    historyData.forEach(function(h) {
      if (h.deleted_at) return;
      var ym = (h.date || '').slice(0, 7); // "2026.04"
      if (ym && ym.length === 7) monthSet[ym] = true;
    });
    var monthOpts = ['<option value="">전체 기간</option>'];
    Object.keys(monthSet).sort(function(a,b){return b.localeCompare(a);}).forEach(function(ym) {
      monthOpts.push('<option value="' + ym + '"' + (currentMonth===ym?' selected':'') + '>' + ym.replace('.','년 ') + '월</option>');
    });
    monthSel.innerHTML = monthOpts.join('');
  }
}

function resetHistoryFilters() {
  ['histFilterBiz','histFilterMonth','histFilterProduct','histFilterStatus'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderHistory(_currentHistTab);
  showToast('t1','🔄 필터 초기화','모든 필터를 초기화했어요');
}

// ============================================================
// 🗑️ 진행 이력 휴지통 시스템 (Soft Delete)
// localStorage에 별도 deleted set 보관 → DB 컬럼 없어도 동작
// ============================================================
function _loadDeletedSet() {
  try {
    var raw = JSON.parse(localStorage.getItem('hiveoil_deleted_history') || '{}');
    // 마이그레이션: v7 키 형식 (raw:<rawDate>) → v8 형식 (raw:<bizId>:<type>:<qty>:<rawDate>)으로 자동 변환
    // 기존 단순 raw: 키는 그대로 두면 매칭 안 되니 historyData를 보고 변환 가능한 것만 변환
    return raw;
  } catch(e) { return {}; }
}
function _saveDeletedSet(obj) {
  try { localStorage.setItem('hiveoil_deleted_history', JSON.stringify(obj)); } catch(e) {}
}
function _historyKey(h) {
  // 매칭 키: dbId가 있으면 dbId 사용 (DB PK라 unique)
  // dbId가 없으면 bizId + type + rawDate 조합 (같은 시각 다른 거래도 구분)
  if (h.dbId) return 'db:' + h.dbId;
  if (h.rawDate) {
    return 'raw:' + (h.bizId || 'NA') + ':' + (h.type || 'NA') + ':' + (h.qty || 0) + ':' + h.rawDate;
  }
  return null; // 식별 불가 — 삭제 키 생성 불가
}

// 보조 키 — DB polling으로 row가 재로드되어 dbId가 생겨도 매칭되도록
function _historyAuxKey(h) {
  if (!h.rawDate) return null;
  return 'aux:' + (h.bizId || 'NA') + ':' + (h.type || 'NA') + ':' + (h.qty || 0) + ':' + h.rawDate;
}

// loadHistoryFromDB 후 호출 — localStorage의 deleted 정보를 historyData에 머지
function applyDeletedSetToHistory() {
  var deletedSet = _loadDeletedSet();
  if (Object.keys(deletedSet).length === 0) return;
  var matched = 0;
  historyData.forEach(function(h) {
    var key = _historyKey(h);
    var auxKey = _historyAuxKey(h);
    // 두 가지 키 모두 검사 (dbId 매칭 실패 시 보조키 fallback)
    if (key && deletedSet[key]) {
      h.deleted_at = deletedSet[key];
      matched++;
    } else if (auxKey && deletedSet[auxKey]) {
      h.deleted_at = deletedSet[auxKey];
      matched++;
      // dbId가 새로 생긴 경우 — 다음을 위해 dbId 키도 등록
      if (h.dbId) {
        deletedSet['db:' + h.dbId] = deletedSet[auxKey];
        _saveDeletedSet(deletedSet);
      }
    }
  });
  if (matched > 0) console.log('🗑️ 휴지통 마킹 복원: ' + matched + '개');
}

// ============================================================
// 💰 이력 단가 수정 — 관리자 전용
// ============================================================
function editHistoryUnitPrice(dbId) {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용','이력 단가 수정은 관리자만 가능해요'); return; }
  var h = historyData.find(function(x){ return String(x.dbId) === String(dbId); });
  if (!h) { showToast('t1','⚠️ 이력을 찾지 못했어요',''); return; }

  var currentUnitPrice = h.unitPrice || _extractUnitPrice(h) || 0;
  var qty = h.qty || 0;
  var currentAmount = parseInt(String(h.amount || '0').replace(/[^0-9]/g, '')) || 0;

  // 기존 모달 제거
  var existing = document.getElementById('editPriceModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'editPriceModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';

  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:440px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.25);overflow:hidden;">' +
      '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 22px;">' +
        '<div style="font-family:var(--font-display);font-size:17px;font-weight:800;">💰 단가 수정</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:3px;">' + (h.biz || '—') + ' · ' + (h.type || '') + '</div>' +
      '</div>' +

      '<div style="padding:20px 22px;">' +
        '<div style="background:#F5F5F5;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:12px;color:#444;line-height:1.7;">' +
          '<div><b>날짜:</b> ' + (h.date || '—') + '</div>' +
          '<div><b>품목:</b> ' + (h.content || '—') + '</div>' +
          '<div><b>수량:</b> <span style="font-family:Menlo,monospace;">' + qty + '캔</span></div>' +
          '<div><b>현재 단가:</b> <span style="font-family:Menlo,monospace;color:var(--green-dark);">' + currentUnitPrice.toLocaleString() + '원</span></div>' +
          '<div><b>현재 금액:</b> <span style="font-family:Menlo,monospace;color:var(--green-dark);">' + currentAmount.toLocaleString() + '원</span></div>' +
        '</div>' +

        '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">새 단가 (캔당 원)</label>' +
        '<input id="newUnitPriceInput" type="number" min="0" step="100" value="' + currentUnitPrice + '" placeholder="예: 41000" style="width:100%;padding:11px 14px;border:1.5px solid #DDD;border-radius:8px;font-size:15px;font-family:Menlo,monospace;box-sizing:border-box;font-weight:700;text-align:right;" oninput="_recalcPriceModal()">' +

        '<div id="newAmountPreview" style="margin-top:12px;padding:10px 14px;background:#E8F5E9;border-radius:8px;font-size:13px;color:var(--green-dark);font-weight:700;text-align:center;">' +
          '새 금액: <span id="newAmountDisplay" style="font-size:16px;">' + currentAmount.toLocaleString() + '원</span>' +
        '</div>' +
        '<div id="priceDiffDisplay" style="margin-top:6px;text-align:center;font-size:11px;color:var(--gray);">변경 없음</div>' +

        '<div style="margin-top:8px;font-size:10px;color:#888;text-align:center;">💡 빠른 조정: ' +
          '<button onclick="_quickAdjustPrice(-2000)" style="background:#FFEBEE;color:#C0392B;border:none;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font-body);margin:0 2px;">-2,000</button>' +
          '<button onclick="_quickAdjustPrice(-1000)" style="background:#FFEBEE;color:#C0392B;border:none;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font-body);margin:0 2px;">-1,000</button>' +
          '<button onclick="_quickAdjustPrice(1000)" style="background:#E8F5E9;color:#2E7D32;border:none;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font-body);margin:0 2px;">+1,000</button>' +
          '<button onclick="_quickAdjustPrice(2000)" style="background:#E8F5E9;color:#2E7D32;border:none;border-radius:5px;padding:3px 8px;font-size:10px;font-weight:700;cursor:pointer;font-family:var(--font-body);margin:0 2px;">+2,000</button>' +
        '</div>' +

        '<div style="display:flex;gap:8px;margin-top:18px;">' +
          '<button onclick="document.getElementById(\'editPriceModal\').remove()" style="flex:1;background:#F5F5F5;color:#444;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
          '<button onclick="saveHistoryUnitPrice(\'' + dbId + '\', ' + qty + ')" style="flex:2;background:var(--green-main);color:#fff;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;font-family:var(--font-body);">💾 저장</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  // 보관할 정보
  window._editPriceModalState = { dbId: dbId, qty: qty, originalUnitPrice: currentUnitPrice, originalAmount: currentAmount };

  setTimeout(function(){
    var input = document.getElementById('newUnitPriceInput');
    if (input) { input.focus(); input.select(); }
  }, 100);
}

// 단가 입력 시 금액 실시간 계산
function _recalcPriceModal() {
  var state = window._editPriceModalState;
  if (!state) return;
  var input = document.getElementById('newUnitPriceInput');
  if (!input) return;
  var newPrice = parseInt(input.value) || 0;
  var newAmount = newPrice * state.qty;
  var disp = document.getElementById('newAmountDisplay');
  if (disp) disp.textContent = newAmount.toLocaleString() + '원';

  var diff = newAmount - state.originalAmount;
  var diffEl = document.getElementById('priceDiffDisplay');
  if (diffEl) {
    if (diff === 0) {
      diffEl.textContent = '변경 없음';
      diffEl.style.color = 'var(--gray)';
    } else if (diff > 0) {
      diffEl.textContent = '↑ +' + diff.toLocaleString() + '원 (단가 +' + (newPrice - state.originalUnitPrice).toLocaleString() + '원)';
      diffEl.style.color = '#2E7D32';
    } else {
      diffEl.textContent = '↓ ' + diff.toLocaleString() + '원 (단가 ' + (newPrice - state.originalUnitPrice).toLocaleString() + '원)';
      diffEl.style.color = '#C0392B';
    }
  }
}

// 빠른 단가 조정
function _quickAdjustPrice(delta) {
  var input = document.getElementById('newUnitPriceInput');
  if (!input) return;
  var current = parseInt(input.value) || 0;
  input.value = Math.max(0, current + delta);
  _recalcPriceModal();
}

// 단가 저장
async function saveHistoryUnitPrice(dbId, qty) {
  var input = document.getElementById('newUnitPriceInput');
  if (!input) return;
  var newPrice = parseInt(input.value) || 0;
  if (newPrice < 0) { showToast('t1','⚠️ 단가는 0 이상',''); return; }

  var newAmount = newPrice * qty;
  var newAmountStr = newAmount.toLocaleString() + '원';

  // 메모리 업데이트
  var h = historyData.find(function(x){ return String(x.dbId) === String(dbId); });
  if (!h) { showToast('t1','⚠️ 이력 못 찾음',''); return; }
  h.unitPrice = newPrice;
  h.amount = newAmountStr;
  saveHistory();

  // DB 업데이트
  try {
    var res = await db.from('history').update({
      unit_price: newPrice,
      amount: newAmountStr
    }).eq('id', dbId);
    if (res.error) {
      // unit_price 컬럼 없으면 amount만 업데이트
      if (/unit_price/i.test(res.error.message || '')) {
        console.warn('unit_price 컬럼 없음 — amount만 업데이트');
        var res2 = await db.from('history').update({ amount: newAmountStr }).eq('id', dbId);
        if (res2.error) throw res2.error;
        showToast('t1','💾 금액 변경됨', newAmountStr + ' (단가 컬럼 추가 권장)');
      } else {
        throw res.error;
      }
    } else {
      showToast('t1','💾 단가 변경됨', '단가 ' + newPrice.toLocaleString() + '원 / 금액 ' + newAmountStr);
    }
  } catch(e) {
    console.warn('단가 DB 업데이트 실패:', e.message);
    showToast('t1','⚠️ DB 동기화 실패', '로컬엔 반영됨. 새로고침 시 원복될 수 있어요.');
  }

  document.getElementById('editPriceModal').remove();
  renderHistory && renderHistory(_currentHistTab);
  updateDashboard && updateDashboard();
  renderBilling && renderBilling();
}

// ============================================================
// 🗑️ 이력 휴지통
// ============================================================
function softDeleteHistory(idOrKey) {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용','삭제는 관리자만 가능해요'); return; }
  console.log('[softDeleteHistory] idOrKey=', idOrKey, ' (type:', typeof idOrKey, ')');

  // 매칭되는 항목 찾기 (dbId 또는 rawDate 우선)
  var idx = historyData.findIndex(function(h) {
    if (h.dbId && String(h.dbId) === String(idOrKey)) return true;
    if (h.rawDate && String(h.rawDate) === String(idOrKey)) return true;
    return false;
  });
  // 매칭 실패 시 인덱스로 fallback (단, 위험하므로 경고)
  if (idx < 0) {
    var nIdx = parseInt(idOrKey);
    if (!isNaN(nIdx) && nIdx >= 0 && nIdx < historyData.length) {
      console.warn('⚠️ softDeleteHistory: 인덱스 fallback 사용 idx=' + nIdx + ' (불안정 가능)');
      idx = nIdx;
    }
  }
  if (idx < 0) { showToast('t1','⚠️ 항목을 찾지 못했어요',''); return; }

  var h = historyData[idx];
  console.log('[softDeleteHistory] 매칭됨:', h.biz, '·', h.type, '·', h.content, '· dbId=', h.dbId, '· rawDate=', h.rawDate);

  if (!confirm('이 이력을 휴지통으로 이동할까요?\n\n' + (h.biz || '') + ' · ' + (h.content || '') + '\n\n휴지통에서 30일간 복구 가능해요.')) return;

  // 이미 정산 완료된 거래는 경고
  if (h.status === 'done' && h.type === '식용유발주') {
    if (!confirm('⚠️ 이미 납품 완료된 거래입니다. 정산에서 제외되니 정말 삭제하시겠어요?')) return;
  }

  var deletedAt = new Date().toISOString();
  h.deleted_at = deletedAt;
  h.deleted_by = 'admin';
  saveHistory();

  // 🔑 localStorage 휴지통 셋에 영구 보관 (DB 폴링 후에도 유지)
  var deletedSet = _loadDeletedSet();
  var key = _historyKey(h);
  var auxKey = _historyAuxKey(h);
  console.log('[softDeleteHistory] 저장 키:', key, 'aux:', auxKey);
  if (key) deletedSet[key] = deletedAt;
  if (auxKey) deletedSet[auxKey] = deletedAt; // 보조키도 함께 저장 (polling 후 dbId 변화 대응)
  if (key || auxKey) {
    _saveDeletedSet(deletedSet);
  } else {
    console.warn('⚠️ _historyKey 생성 실패 — 다음 polling에서 복원 안 될 수 있음');
  }

  // DB에도 동기화 시도 (컬럼 있으면 update, 없으면 row 삭제 fallback)
  if (h.dbId) {
    try {
      db.from('history').update({ deleted_at: deletedAt }).eq('id', h.dbId).then(function(res) {
        if (res.error) {
          var msg = res.error.message || '';
          if (msg.indexOf('deleted_at') >= 0 || /column .* does not exist/i.test(msg)) {
            console.warn('💡 history 테이블에 deleted_at 컬럼이 없어요 — DB row 삭제 fallback 사용');
            console.warn('💡 권장 SQL: ALTER TABLE history ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;');
            // DB row 직접 삭제 (localStorage 휴지통은 보존되어 복구 가능)
            db.from('history').delete().eq('id', h.dbId).then(function(res2){
              if (res2.error) console.warn('DB row 삭제 실패:', res2.error.message);
              else console.log('✅ DB row 삭제 (localStorage 휴지통에 보존):', h.biz);
            });
          } else {
            console.warn('history 휴지통 동기화 실패:', msg);
          }
        } else {
          console.log('✅ history 휴지통 DB 동기화:', h.biz);
        }
      });
    } catch(e) { console.warn('휴지통 동기화 예외:', e); }
  }

  showToast('t1','🗑️ 휴지통으로 이동','30일 안에 복구할 수 있어요');
  renderHistory(_currentHistTab);
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  updateHqRealStats && updateHqRealStats();
  renderDeliveryPanel && renderDeliveryPanel();
  renderOwnerDash && renderOwnerDash();
  renderEsgPanel && renderEsgPanel();
  renderBilling && renderBilling();
  updateTrashCount();
}

// 휴지통 카운트 갱신
function updateTrashCount() {
  var trashItems = historyData.filter(function(h) { return h.deleted_at; });
  var countEl = document.getElementById('histTrashCount');
  if (countEl) {
    if (trashItems.length > 0) {
      countEl.textContent = trashItems.length;
      countEl.style.display = 'inline-block';
    } else {
      countEl.style.display = 'none';
    }
  }
}

// 30일 지난 휴지통 항목 영구 삭제 자동 정리
function cleanupExpiredTrash() {
  var now = Date.now();
  var thirtyDays = 30 * 24 * 60 * 60 * 1000;
  var changed = false;
  for (var i = historyData.length - 1; i >= 0; i--) {
    var h = historyData[i];
    if (h.deleted_at) {
      var deletedTime = new Date(h.deleted_at).getTime();
      if (now - deletedTime > thirtyDays) {
        // 30일 지남 → 영구 삭제
        if (h.dbId) {
          try { db.from('history').delete().eq('id', h.dbId).then(function(){}); } catch(e) {}
        }
        historyData.splice(i, 1);
        changed = true;
      }
    }
  }
  if (changed) {
    saveHistory();
    console.log('🧹 30일 지난 휴지통 항목 영구 삭제 완료');
  }
}

// 휴지통 패널 표시
// ============================================================
// 🧹 긴급 정리 함수 — 콘솔에서 직접 호출 또는 버튼으로
// ============================================================
// 사용법 (브라우저 콘솔 F12):
//   purgeHistoryByBiz('진미통닭')         — 특정 업체 이력 모두 DB에서 영구 삭제
//   purgeHistoryByBiz('진미통닭', '식용유발주')  — 특정 업체+타입만
//   purgeAllHistory()                      — 전체 history DB 영구 삭제 (위험!)
async function purgeHistoryByBiz(bizName, typeFilter) {
  if (!isAdminMode) {
    var pwd = prompt('관리자 비밀번호를 입력해주세요:');
    if (pwd !== 'hive2026') { alert('비밀번호가 틀렸어요'); return; }
  }
  if (!bizName) { alert('업체명을 입력해주세요'); return; }

  // historyData에서 매칭
  var targets = historyData.filter(function(h) {
    if (h.biz !== bizName) return false;
    if (typeFilter && h.type !== typeFilter) return false;
    return true;
  });
  if (targets.length === 0) { alert('"' + bizName + '" 관련 이력이 없어요'); return; }

  if (!confirm('"' + bizName + '" 이력 ' + targets.length + '건을 DB에서 영구 삭제할까요?\n\n⚠️ 복구할 수 없어요!')) return;
  if (!confirm('정말 ' + targets.length + '건을 영구 삭제하시겠어요?\n\n마지막 확인입니다.')) return;

  var dbDeleted = 0, localDeleted = 0;
  // DB 일괄 삭제
  for (var i = 0; i < targets.length; i++) {
    var h = targets[i];
    if (h.dbId) {
      try {
        var res = await db.from('history').delete().eq('id', h.dbId);
        if (!res.error) dbDeleted++;
      } catch(e) {}
    }
  }
  // localStorage에서도 제거
  for (var j = historyData.length - 1; j >= 0; j--) {
    var hh = historyData[j];
    if (hh.biz === bizName && (!typeFilter || hh.type === typeFilter)) {
      historyData.splice(j, 1);
      localDeleted++;
    }
  }
  saveHistory();
  // localStorage 휴지통 셋도 정리
  var ds = _loadDeletedSet();
  Object.keys(ds).forEach(function(k){ if (k.indexOf(bizName) >= 0) delete ds[k]; });
  _saveDeletedSet(ds);

  alert('✅ 정리 완료!\nDB ' + dbDeleted + '건 + 로컬 ' + localDeleted + '건 삭제');
  // 모든 화면 갱신
  renderHistory && renderHistory(_currentHistTab);
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  updateHqRealStats && updateHqRealStats();
  renderDeliveryPanel && renderDeliveryPanel();
  renderOwnerDash && renderOwnerDash();
  renderEsgPanel && renderEsgPanel();
  renderBilling && renderBilling();
  updateTrashCount && updateTrashCount();
}

// 전체 history 영구 삭제 (위험! 테스트 데이터 초기화용)
async function purgeAllHistory() {
  if (!isAdminMode) { alert('관리자만 가능'); return; }
  if (!confirm('⚠️ 전체 진행 이력을 DB에서 영구 삭제할까요?\n\n현재 ' + historyData.length + '건')) return;
  if (!confirm('정말 전체를 영구 삭제하시겠어요?\n\n복구 불가능합니다!')) return;
  var pwd = prompt('확인을 위해 "DELETE ALL" 을 입력해주세요:');
  if (pwd !== 'DELETE ALL') { alert('취소됨'); return; }

  try {
    // 모든 dbId 목록 가져와서 일괄 삭제
    var dbIds = historyData.filter(function(h){ return h.dbId; }).map(function(h){ return h.dbId; });
    for (var i = 0; i < dbIds.length; i++) {
      try { await db.from('history').delete().eq('id', dbIds[i]); } catch(e) {}
    }
    historyData.length = 0;
    saveHistory();
    _saveDeletedSet({});
    alert('✅ 전체 진행 이력 삭제 완료');
    renderHistory && renderHistory(_currentHistTab);
    updateDashboard && updateDashboard();
    updateOrderMonthStats && updateOrderMonthStats();
    updateHqRealStats && updateHqRealStats();
    renderDeliveryPanel && renderDeliveryPanel();
    renderOwnerDash && renderOwnerDash();
    renderEsgPanel && renderEsgPanel();
    renderBilling && renderBilling();
    updateTrashCount && updateTrashCount();
  } catch(e) {
    alert('삭제 중 오류: ' + e.message);
  }
}

// 진행 이력 패널 헤더에 띄울 정리 도구 — 업체별 즉시 영구 삭제
function showHistoryPurgeDialog() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }

  // historyData에서 업체 목록 추출
  var bizSet = {};
  historyData.forEach(function(h) {
    if (h.biz) bizSet[h.biz] = (bizSet[h.biz] || 0) + 1;
  });
  var bizArr = Object.keys(bizSet).sort(function(a,b){ return bizSet[b] - bizSet[a]; });

  var modalId = 'historyPurgeModal';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();

  var html = '<div id="' + modalId + '" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;">'
    + '<div style="background:linear-gradient(135deg,#C0392B,#992D22);color:#fff;padding:16px 20px;display:flex;justify-content:space-between;align-items:center;">'
    + '<div><div style="font-family:var(--font-display);font-size:16px;font-weight:800;">🧹 데이터 정리 도구</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.75);margin-top:2px;">업체별 이력을 DB에서 영구 삭제합니다 (휴지통 안 거침)</div></div>'
    + '<button onclick="document.getElementById(\'' + modalId + '\').remove()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;width:30px;height:30px;font-size:14px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="flex:1;overflow-y:auto;padding:14px 20px;">'
    + '<div style="font-size:11px;color:#C0392B;background:#FFF5F5;border:1px solid #FFCDD2;border-radius:8px;padding:9px 12px;margin-bottom:14px;">⚠️ <b>주의:</b> 이 작업은 DB에서 영구 삭제하며 휴지통도 안 거칩니다. 테스트 데이터 정리용으로만 사용하세요.</div>';

  if (bizArr.length === 0) {
    html += '<div style="text-align:center;padding:40px;color:#999;">정리할 이력이 없어요</div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      + '<thead><tr style="background:#F5F5F5;">'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">업체명</th>'
      + '<th style="padding:8px;text-align:center;font-size:11px;color:#666;">이력 건수</th>'
      + '<th style="padding:8px;text-align:right;font-size:11px;color:#666;">처리</th>'
      + '</tr></thead><tbody>';
    bizArr.forEach(function(bn) {
      var safe = bn.replace(/'/g, "\\'");
      html += '<tr style="border-bottom:1px solid #EEE;">'
        + '<td style="padding:9px 8px;font-weight:700;">' + bn + '</td>'
        + '<td style="padding:9px 8px;text-align:center;color:#666;">' + bizSet[bn] + '건</td>'
        + '<td style="padding:9px 8px;text-align:right;">'
        + '<button onclick="purgeHistoryByBiz(\'' + safe + '\').then(()=>showHistoryPurgeDialog())" style="background:#FFEBEE;color:#C0392B;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🗑️ DB 영구 삭제</button>'
        + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  html += '</div>'
    + '<div style="background:#F8F8F8;padding:10px 20px;border-top:1px solid #EEE;display:flex;justify-content:space-between;align-items:center;">'
    + '<div style="font-size:11px;color:#999;">총 ' + bizArr.length + '개 업체</div>'
    + (historyData.length > 0 ? '<button onclick="purgeAllHistory().then(()=>{var m=document.getElementById(\'' + modalId + '\');if(m)m.remove();})" style="background:#C0392B;color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🚨 전체 이력 영구 삭제</button>' : '')
    + '</div>'
    + '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);
}


function showHistoryTrash() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  cleanupExpiredTrash(); // 표시 전 만료 정리

  var trashItems = historyData.filter(function(h) { return h.deleted_at; });
  trashItems.sort(function(a,b) {
    return new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime();
  });

  // 모달 생성
  var modalId = 'historyTrashModal';
  var existing = document.getElementById(modalId);
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = modalId;
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  var html = '<div style="background:#fff;border-radius:14px;max-width:780px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;">'
    + '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">'
    + '<div><div style="font-family:var(--font-display);font-size:18px;font-weight:800;">🗑️ 진행 이력 휴지통</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">30일 안에 복구 가능 · 그 후 자동 영구 삭제</div></div>'
    + '<button onclick="closeHistoryTrash()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;width:32px;height:32px;font-size:16px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="flex:1;overflow-y:auto;padding:16px 24px;">';

  if (trashItems.length === 0) {
    html += '<div style="text-align:center;padding:60px 20px;color:#999;"><div style="font-size:48px;margin-bottom:12px;">🗑️</div><div style="font-size:14px;font-weight:600;">휴지통이 비어있어요</div><div style="font-size:11px;color:#bbb;margin-top:6px;">삭제한 이력이 30일 동안 여기에 보관됩니다</div></div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      + '<thead><tr style="background:#F5F5F5;">'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">삭제일</th>'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">업체</th>'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">내용</th>'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">금액</th>'
      + '<th style="padding:8px;text-align:center;font-size:11px;color:#666;">남은 일수</th>'
      + '<th style="padding:8px;text-align:right;font-size:11px;color:#666;">처리</th>'
      + '</tr></thead><tbody>';
    var now = Date.now();
    var thirtyDays = 30 * 24 * 60 * 60 * 1000;
    trashItems.forEach(function(h) {
      var deletedTime = new Date(h.deleted_at).getTime();
      var remainMs = thirtyDays - (now - deletedTime);
      var remainDays = Math.ceil(remainMs / (24*60*60*1000));
      var remainColor = remainDays <= 3 ? '#C0392B' : remainDays <= 7 ? '#E65100' : '#666';
      var delDate = new Date(h.deleted_at);
      var delDateStr = delDate.getMonth()+1 + '/' + delDate.getDate() + ' ' + String(delDate.getHours()).padStart(2,'0') + ':' + String(delDate.getMinutes()).padStart(2,'0');
      var key = h.dbId || h.rawDate || '';
      html += '<tr style="border-bottom:1px solid #EEE;">'
        + '<td style="padding:9px 8px;color:#888;font-size:11px;">' + delDateStr + '</td>'
        + '<td style="padding:9px 8px;font-weight:700;">' + (h.biz||'—') + '</td>'
        + '<td style="padding:9px 8px;color:#555;">' + (h.content||'—') + '</td>'
        + '<td style="padding:9px 8px;font-weight:600;">' + (h.amount||'—') + '</td>'
        + '<td style="padding:9px 8px;text-align:center;color:' + remainColor + ';font-weight:700;">' + remainDays + '일</td>'
        + '<td style="padding:9px 8px;text-align:right;white-space:nowrap;">'
        + '<button onclick="restoreHistoryItem(\'' + key + '\')" style="background:#E8F5E9;color:#2E7D32;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px;font-family:var(--font-body);">↩️ 복구</button>'
        + '<button onclick="permanentDeleteHistory(\'' + key + '\')" style="background:#FFEBEE;color:#C0392B;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🚫 영구삭제</button>'
        + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  html += '</div>'
    + '<div style="background:#F8F8F8;padding:12px 24px;border-top:1px solid #EEE;display:flex;justify-content:space-between;align-items:center;">'
    + '<div style="font-size:11px;color:#999;">총 ' + trashItems.length + '건 보관 중</div>'
    + (trashItems.length > 0 ? '<button onclick="emptyHistoryTrash()" style="background:#FFF5F5;color:#C0392B;border:1px solid #FFB3B3;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🚫 휴지통 비우기</button>' : '')
    + '</div>'
    + '</div>';

  modal.innerHTML = html;
  document.body.appendChild(modal);
}

function closeHistoryTrash() {
  var modal = document.getElementById('historyTrashModal');
  if (modal) modal.remove();
}

// 항목 복구
function restoreHistoryItem(idOrKey) {
  var idx = historyData.findIndex(function(h) {
    if (h.dbId && String(h.dbId) === String(idOrKey)) return true;
    if (h.rawDate && String(h.rawDate) === String(idOrKey)) return true;
    return false;
  });
  if (idx < 0) { showToast('t1','⚠️ 복구 실패','항목을 찾지 못했어요'); return; }

  var h = historyData[idx];
  delete h.deleted_at;
  delete h.deleted_by;
  saveHistory();

  // 🔑 localStorage 휴지통에서 주 키 + 보조 키 모두 제거
  var deletedSet = _loadDeletedSet();
  var key = _historyKey(h);
  var auxKey = _historyAuxKey(h);
  var changed = false;
  if (key && deletedSet[key]) { delete deletedSet[key]; changed = true; }
  if (auxKey && deletedSet[auxKey]) { delete deletedSet[auxKey]; changed = true; }
  // 안전장치: 같은 row의 다른 dbId 매칭도 정리 (bizId+type+qty+rawDate 조합으로 한번 더 검사)
  if (h.rawDate) {
    var candidate = (h.bizId || 'NA') + ':' + (h.type || 'NA') + ':' + (h.qty || 0) + ':' + h.rawDate;
    Object.keys(deletedSet).forEach(function(k) {
      if (k.indexOf(candidate) >= 0) { delete deletedSet[k]; changed = true; }
    });
  }
  if (changed) _saveDeletedSet(deletedSet);

  // DB에서도 deleted_at NULL로
  if (h.dbId) {
    try {
      db.from('history').update({ deleted_at: null }).eq('id', h.dbId).then(function(res) {
        if (res.error) {
          var msg = res.error.message || '';
          if (/deleted_at|column .* does not exist/i.test(msg)) {
            // 컬럼이 없으면 row가 이미 진짜 삭제된 상태일 수 있음 → 다시 INSERT
            console.warn('💡 deleted_at 컬럼 없음. 복구를 위해 row를 재삽입합니다');
            try {
              var insertRow = historyToDbRow ? historyToDbRow(h) : null;
              if (insertRow) {
                delete insertRow.id;  // 기존 id 빼고 새로 받기
                db.from('history').insert(insertRow).then(function(r2) {
                  if (r2 && r2.data && r2.data[0]) h.dbId = r2.data[0].id;
                });
              }
            } catch(e) { console.warn('재삽입 실패:', e); }
          } else {
            console.warn('복구 DB 동기화 실패:', msg);
          }
        }
      });
    } catch(e) {}
  }

  showToast('t1','✅ 복구 완료', (h.biz || '') + ' · ' + (h.content || '') + ' 가 복구됐어요');
  closeHistoryTrash();
  setTimeout(function(){ showHistoryTrash(); }, 100);
  renderHistory(_currentHistTab);
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  updateHqRealStats && updateHqRealStats();
  renderDeliveryPanel && renderDeliveryPanel();
  renderBilling && renderBilling();
  renderEsgPanel && renderEsgPanel();
}

// 영구 삭제
function permanentDeleteHistory(idOrKey) {
  if (!confirm('이 항목을 영구 삭제할까요?\n\n⚠️ 영구 삭제는 복구할 수 없어요!')) return;

  var idx = historyData.findIndex(function(h) {
    if (h.dbId && String(h.dbId) === String(idOrKey)) return true;
    if (h.rawDate && String(h.rawDate) === String(idOrKey)) return true;
    return false;
  });
  if (idx < 0) { showToast('t1','⚠️ 삭제 실패','항목을 찾지 못했어요'); return; }

  var h = historyData[idx];
  if (h.dbId) {
    try { db.from('history').delete().eq('id', h.dbId).then(function(){}); } catch(e) {}
  }
  // 🔑 localStorage 휴지통에서도 제거
  var deletedSet = _loadDeletedSet();
  var key = _historyKey(h);
  if (key && deletedSet[key]) {
    delete deletedSet[key];
    _saveDeletedSet(deletedSet);
  }
  historyData.splice(idx, 1);
  saveHistory();

  showToast('t1','🚫 영구 삭제 완료',(h.biz || '') + ' 항목이 영구 삭제됐어요');
  closeHistoryTrash();
  setTimeout(function(){ showHistoryTrash(); }, 100);
  updateTrashCount();
  updateDashboard && updateDashboard();
}

// 휴지통 전체 비우기
function emptyHistoryTrash() {
  var trashItems = historyData.filter(function(h) { return h.deleted_at; });
  if (trashItems.length === 0) return;
  if (!confirm('휴지통의 모든 항목 ' + trashItems.length + '건을 영구 삭제할까요?\n\n⚠️ 복구할 수 없습니다!')) return;
  if (!confirm('정말 ' + trashItems.length + '건을 모두 영구 삭제하시겠어요?\n마지막 확인입니다.')) return;

  // DB에서 일괄 삭제
  trashItems.forEach(function(h) {
    if (h.dbId) {
      try { db.from('history').delete().eq('id', h.dbId).then(function(){}); } catch(e) {}
    }
  });
  // localStorage 휴지통 비우기
  _saveDeletedSet({});
  // 로컬에서 제거
  for (var i = historyData.length - 1; i >= 0; i--) {
    if (historyData[i].deleted_at) historyData.splice(i, 1);
  }
  saveHistory();

  showToast('t1','🚫 휴지통 비움','모든 휴지통 항목이 영구 삭제됐어요');
  closeHistoryTrash();
  updateTrashCount();
  updateDashboard && updateDashboard();
}

// ===== MODALS =====
function openCollectModal(biz) {
  if (!biz) return;
  currentBiz = biz;
  document.getElementById('modal-biz-name').textContent = biz.name;
  document.getElementById('modal-waste').textContent = biz.wasteOil + '캔';
  document.getElementById('collectModal').classList.add('show');
}
function openOrderModal(biz) {
  if (!biz) return;
  currentBiz = biz;
  document.getElementById('modal-order-biz').textContent = biz.name;
  document.getElementById('modal-order-stock').textContent = biz.newOil + '/' + biz.maxNew + '캔';
  document.getElementById('orderModal').classList.add('show');
}
function closeModal(id) { document.getElementById(id).classList.remove('show'); }
function selectVol(el) { document.querySelectorAll('.volume-opt').forEach(v => v.classList.remove('selected')); el.classList.add('selected'); }

function changeCollectCans(delta) {
  const el = document.getElementById('collectCansInput');
  if (!el) return;
  el.value = Math.max(1, Math.min(50, parseInt(el.value||1) + delta));
  updateCollectCalc();
}

function updateCollectCalc() {
  const cans   = parseInt(document.getElementById('collectCansInput')?.value) || 1;
  const price  = cans * PRICES.waste.can.price;
  const kg     = (cans * PRICES.waste.can.kg).toFixed(1);
  const esg    = Math.round(cans * PRICES.waste.can.kg * PRICES.esgRate);
  const priceEl = document.getElementById('collectPrice');
  const kgEl    = document.getElementById('collectKg');
  const esgEl   = document.getElementById('collectEsg');
  if (priceEl) priceEl.textContent = price.toLocaleString() + '원';
  // 🆕 업주는 캔풀, 그 외 kg
  if (kgEl) {
    if (isOwnerView()) {
      kgEl.textContent = cans + '캔';
    } else {
      kgEl.textContent = kg + 'kg';
    }
  }
  if (esgEl)   esgEl.textContent   = '+' + esg.toLocaleString() + 'pts';
}

function submitCollect() { closeModal('collectModal'); showToast('t1','♻️ 수거 신청 완료!', (currentBiz?currentBiz.name:'') + ' — 내일 오전 수거 예정'); }
function submitOrder() { closeModal('orderModal'); showToast('t1','📦 발주 완료!','발주 접수됨. 익일 배송 예정'); }
function submitMainOrder() {
  const qty      = parseInt(document.getElementById('qtyInput')?.value) || 1;
  const sel      = document.getElementById('oilType');
  const oilKeys  = Object.keys(PRICES.oils);
  const key      = oilKeys[sel ? sel.selectedIndex : 0] || 'soy';
  const oilName  = PRICES.oils[key].label;
  const unitPrice= PRICES.oils[key].price;
  const sel2    = document.getElementById('orderBizSelect');
  const selBiz  = businesses.find(b => String(b.id) === String(sel2?.value));
  const bizName = selBiz ? selBiz.name : (document.getElementById('orderBizName')?.value || '식용유니버스');
  const bizCode = document.getElementById('orderBizCode')?.value || '';
  if (!selBiz && businesses.length > 0) {
    showToast('t1','⚠️ 업체를 선택해주세요','업체 선택 후 발주해주세요'); return;
  }
  const reqDate  = document.getElementById('orderReqDate')?.value || '';

  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');

  const item = {
    date: dateStr,
    rawDate: now.toISOString(),
    biz: bizName + (bizCode ? ' (' + bizCode + ')' : ''),
    bizId: null,
    type: '식용유발주',
    content: oilName + ' ' + qty + '캔 발주' + (reqDate ? ' · 희망일 ' + reqDate : ''),
    qty: qty,
    unitPrice: unitPrice,  // 🆕 단가 명시
    amount: (qty * unitPrice).toLocaleString() + '원',
    method: '수동',
    status: 'pending',
  };

  historyData.unshift(item);
  saveHistory();
  saveHistoryToDB(item);
  updateDashboard();
  renderHistory();

  renderOrderPendingList();
  showToast('t1','📦 발주 접수 완료!', oilName + ' ' + qty + '캔 · ' + (qty * unitPrice).toLocaleString() + '원 — 익일 배송 예정');
  // 🆕 탄소저감 기부 적립 (0.1% × 매출 캡)
  try {
    if (selBiz) {
      var totalAmt = qty * unitPrice;
      var rec = accrueDonation(selBiz.id, totalAmt, 'purchase');
      if (rec && !rec.capped && rec.amount > 0) {
        console.log('[기부 적립] ' + selBiz.name + ' +' + rec.amount + '원');
      }
    }
  } catch(e) { console.warn('기부 적립 실패:', e.message); }
  // 🆕 알림 — 관리자 + 업주 양쪽
  try {
    addNotif({
      type: 'order',
      target: 'admin',
      title: '📦 신규 발주 접수',
      body: bizName + ' — ' + oilName + ' ' + qty + '캔 (' + (qty * unitPrice).toLocaleString() + '원)',
      bizId: selBiz ? selBiz.id : null,
      link: 'history'
    });
    if (selBiz) {
      addNotif({
        type: 'order',
        target: 'owner_' + selBiz.id,
        title: '✅ 발주 접수 완료',
        body: oilName + ' ' + qty + '캔 — 익일 배송 예정',
        bizId: selBiz.id,
        link: 'history'
      });
    }
  } catch(e) { console.warn('발주 알림 실패:', e.message); }
}

// ===== ORDER =====
function changeQty(d) { const i = document.getElementById('qtyInput'); i.value = Math.max(1, Math.min(50, parseInt(i.value)+d)); calcOrderPrice(); }
function calcOrderPrice() {
  const qInput = document.getElementById('qtyInput');
  if (!qInput) return;
  const q = parseInt(qInput.value)||1;
  const sel = document.getElementById('oilType');
  const oilKeys = Object.keys(PRICES.oils);
  const selIdx  = sel ? sel.selectedIndex : 0;
  const key     = oilKeys[selIdx] || 'soy';
  const unitPrice = PRICES.oils[key].price;
  const sqEl = document.getElementById('summary-qty');
  const stEl = document.getElementById('summary-total');
  const suEl = document.getElementById('summary-unit');
  if (sqEl) sqEl.textContent = q + '캔';
  if (stEl) stEl.textContent = (q * unitPrice).toLocaleString() + '원';
  if (suEl) suEl.innerHTML = unitPrice.toLocaleString() + '원 <span style="font-size:10px;color:#666">VAT포함</span>';
}
function updateOrderQty(v) { document.getElementById('orderQtyLabel').textContent=`${v}캔 / ${(v*50000).toLocaleString()}원`; }
let nt=2, wt=1;
function toggleAuto() { document.getElementById('autoToggle').classList.toggle('off'); }
function changeThresh(type, d) {
  if (type==='new') { nt=Math.max(1,Math.min(10,nt+d)); document.getElementById('newOilThresh').textContent=nt+' 캔 이하 시 자동발주'; }
  else { wt=Math.max(1,Math.min(10,wt+d)); document.getElementById('wasteOilThresh').textContent=wt+' 캔 이상 시 자동수거'; }
}

// ===== TOAST =====
function showToast(tId, title, desc) {
  document.getElementById('t1-title').textContent = title;
  document.getElementById('t1-desc').textContent  = desc;
  const t = document.getElementById('toast1');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4500);
}
function showToastDemo() {
  setTimeout(() => showToast('t1','🫙 자동발주 완료!',''), 150);
  setTimeout(() => { document.getElementById('toast2').classList.add('show'); setTimeout(() => document.getElementById('toast2').classList.remove('show'), 4500); }, 800);
}

document.addEventListener('click', e => { if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('show'); });

// 초기 알림 — 관리자/운반자 로그인 상태에서만 표시
setTimeout(() => {
  if (!isAdminMode && !isDriverMode) return;
  const waitBiz = businesses.filter(b => shouldAutoCollect(b));
  if (waitBiz.length > 0) {
    document.getElementById('t2-desc').textContent = waitBiz[0].name + ' — 폐유 ' + waitBiz[0].wasteOil + '캔 수거 필요';
    document.getElementById('toast2').classList.add('show');
    setTimeout(() => document.getElementById('toast2').classList.remove('show'), 5000);
  }
}, 2000);

renderWasteTable();
renderHistory();

// ===== OWNER LOGIN =====
// ownerAccounts는 businesses 기반으로 동적 생성
function buildOwnerAccounts() {
  const overrides = JSON.parse(localStorage.getItem('hiveoil_biz_pw') || '{}');
  const accounts  = {};
  businesses.forEach((b, idx) => {
    const seq  = idx + 1;
    const code = 'WJ-' + String(seq).padStart(3,'0');
    const phone = (b.phone || '').replace(/[^0-9]/g, '');
    // 기본 비밀번호: 전화번호 뒷 4자리 (없으면 관리자가 설정한 값)
    const defPw = phone.length >= 4 ? phone.slice(-4) : '';
    const pw    = overrides[String(b.id)] || defPw;
    accounts[code] = { pw, bizId: b.id, name: b.name, seq };
  });
  return accounts;
}
// 업체 ID → WJ 코드 변환
function getBizCode(bizId) {
  const idx = businesses.findIndex(b => String(b.id) === String(bizId));
  return idx >= 0 ? 'WJ-' + String(idx + 1).padStart(3,'0') : '—';
}

var ownerLoggedIn = false;
var ownerBizId = null;
var isAdminMode = false;
var isDriverMode = false;
var pendingBizData = (function(){ try { return JSON.parse(localStorage.getItem('hiveoil_pending_biz') || '[]') || []; } catch(e) { return []; } })();
var ownerNewVal = 2, ownerWasteVal = 4;
const alertStates = { 1:true, 2:false, 3:false };

function ownerLogin() { doOwnerLogin(); }
function ownerLogout() { doLogout(); }

// 로그인 필요 패널 진입 헬퍼
function requireLoginThen(panelId) {
  if (ownerLoggedIn || isAdminMode || isDriverMode) {
    showPanel(panelId, null);
  } else {
    showPanel('owner-login', null);
    showToast('t1','🔒 로그인 필요','업주 로그인 후 이용 가능합니다');
  }
}
// ============================================================
// 품목 관련 UI 함수들
// ============================================================

// 업체 등록 폼 - 품목 행 초기화
function initRegProductRows() {
  var container = document.getElementById('regProductRows');
  if (!container) return;
  container.innerHTML = '';
  addRegProductRow();
}

// 품목 행 추가
function addRegProductRow() {
  var container = document.getElementById('regProductRows');
  if (!container) return;
  var idx = container.children.length;
  var row = document.createElement('div');
  row.className = 'reg-product-row';
  row.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--green-pale);border-radius:10px;padding:10px 12px;margin-bottom:8px;';

  // 품목 select 옵션 생성
  var optHtml = '';
  var typeLabels = { soy:'🫘 대두유', canola:'🌿 카놀라유', corn:'🌽 옥수수유' };
  var grouped = {};
  Object.entries(PRICES.products || {}).forEach(function(e) {
    var k = e[0], p = e[1];
    if (!grouped[p.type]) grouped[p.type] = [];
    grouped[p.type].push([k, p]);
  });
  ['soy','canola','corn'].forEach(function(type) {
    if (!grouped[type]) return;
    optHtml += '<optgroup label="' + typeLabels[type] + '">';
    grouped[type].forEach(function(e) {
      optHtml += '<option value="' + e[0] + '">' + e[1].label + ' (' + (e[1].price||0).toLocaleString() + '원)</option>';
    });
    optHtml += '</optgroup>';
  });

  var rowId = 'regProdRow_' + idx;
  row.id = rowId;
  row.innerHTML = '<select class="form-select reg-prod-select" style="flex:2;font-size:12px;" onchange="document.getElementById(\'' + rowId + '\').dataset.key=this.value;">' + optHtml + '</select>'
    + '<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">'
    + '<div style="font-size:10px;color:var(--gray);white-space:nowrap;">초기 재고</div>'
    + '<input type="number" class="reg-prod-qty form-input" value="5" min="0" max="50" style="width:60px;font-family:var(--font-display);font-size:15px;font-weight:800;text-align:center;padding:5px;">'
    + '<div style="font-size:10px;color:var(--gray);">캔</div>'
    + '</div>'
    + (idx > 0 ? '<button type="button" onclick="this.parentElement.remove()" style="background:none;border:none;color:#aaa;font-size:16px;cursor:pointer;padding:0 4px;">✕</button>' : '');
  container.appendChild(row);
}

// QR 패널 - 품목별 입력 렌더
var qrProductVals = {}; // { productKey: qty }
function renderQRProductInputs(biz) {
  var container = document.getElementById('qrProductInputs');
  if (!container) return;
  var products = getBizProducts(biz);
  qrProductVals = {};
  products.forEach(function(p) { qrProductVals[p.key] = p.qty || 0; });

  container.innerHTML = products.map(function(p) {
    var info = getProductInfo(p.key);
    var typeColor = { soy:'var(--green-dark)', canola:'#33691E', corn:'#E65100', sun:'#F57F17' }[info.type] || 'var(--green-dark)';
    var typeBg = { soy:'var(--green-pale)', canola:'#F1F8E9', corn:'#FFF3E0', sun:'#FFFDE7' }[info.type] || 'var(--green-pale)';
    var typeBorder = { soy:'var(--green-light)', canola:'#C5E1A5', corn:'#FFCC80', sun:'#FFF59D' }[info.type] || 'var(--green-light)';
    var typeIcon = { soy:'🫘', canola:'🌿', corn:'🌽', sun:'🌻' }[info.type] || '🫙';
    var k2 = p.key;
    // 🔧 v69 fix: div → button (모바일 터치 호환), inline 인라인 스타일 + tap-highlight 제거
    var btnStyle = 'width:50px;height:50px;border-radius:12px;font-size:26px;font-weight:800;background:#fff;border:1.5px solid ' + typeBorder + ';color:' + typeColor + ';cursor:pointer;display:flex;align-items:center;justify-content:center;font-family:var(--font-body);-webkit-tap-highlight-color:transparent;user-select:none;touch-action:manipulation;';
    return '<div style="background:' + typeBg + ';border-radius:var(--radius-sm);padding:18px 16px;border:1.5px solid ' + typeBorder + ';">'
      + '<div style="font-size:14px;color:' + typeColor + ';font-weight:800;margin-bottom:10px;text-align:center;">' + typeIcon + ' ' + info.label + '</div>'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:14px;">'
      + '<button type="button" onclick="changeQRProductStock(\'' + k2 + '\',-1)" style="' + btnStyle + '">−</button>'
      + '<input id="qrProd_' + k2 + '" type="number" min="0" max="99"'
      + ' style="font-family:var(--font-display);font-size:54px;font-weight:800;color:' + typeColor + ';letter-spacing:-0.04em;width:90px;text-align:center;border:none;background:transparent;outline:none;-moz-appearance:textfield;"'
      + ' value="' + (p.qty || 0) + '"'
      + ' oninput="(function(el,k){qrProductVals[k]=Math.max(0,Math.min(99,parseInt(el.value)||0));el.value=qrProductVals[k];})(this,\'' + k2 + '\')"'
      + ' onfocus="this.select()">'
      + '<button type="button" onclick="changeQRProductStock(\'' + k2 + '\',1)" style="' + btnStyle + '">+</button>'
      + '</div>'
      + '<div style="font-size:12px;color:' + typeColor + ';text-align:center;margin-top:6px;">캔 · 탭해서 직접 입력</div>'
      + '</div>';
  }).join('');

  // 추가발주 품목 select 채우기
  var extraSel = document.getElementById('qrExtraProduct');
  if (extraSel) {
    var typeLabels2 = { soy:'🫘 대두유', canola:'🌿 카놀라유', corn:'🌽 옥수수유' };
    var grouped2 = {};
    Object.entries(PRICES.products || {}).forEach(function(e) {
      var k = e[0], p = e[1];
      if (!grouped2[p.type]) grouped2[p.type] = [];
      grouped2[p.type].push([k, p]);
    });
    var POINT_EXCLUDED_PROD = ['soy_ottogi', 'soy_haepyo'];
    var selHtml = '';
    ['soy','canola','corn'].forEach(function(type) {
      if (!grouped2[type]) return;
      selHtml += '<optgroup label="' + typeLabels2[type] + '">';
      grouped2[type].forEach(function(e) {
        var pk = e[0], pinfo = e[1];
        var price = (typeof getProductUnitPrice === 'function') ? getProductUnitPrice(pk) : (pinfo.price || 0);
        var priceStr = price > 0 ? ' (' + price.toLocaleString() + '원/캔)' : '';
        var excludeLabel = POINT_EXCLUDED_PROD.indexOf(pk) !== -1 ? ' [적립제외]' : '';
        selHtml += '<option value="' + pk + '">' + pinfo.label + priceStr + excludeLabel + '</option>';
      });
      selHtml += '</optgroup>';
    });
    extraSel.innerHTML = selHtml;
    // 업체 첫 품목 기본 선택
    if (products.length > 0) extraSel.value = products[0].key;
  }
}

function changeQRProductStock(key, delta) {
  qrProductVals[key] = Math.max(0, Math.min(99, (qrProductVals[key] || 0) + delta));
  var el = document.getElementById('qrProd_' + key);
  if (el) el.value = qrProductVals[key];
}

// 발주 패널 - 품목 select 채우기
function populateDelivProductSelect(biz) {
  var sel = document.getElementById('delivBizSelect'); // 기존 업체 select는 유지
  var prodSel = document.getElementById('delivProductSelect');
  if (!prodSel || !biz) return;
  var products = getBizProducts(biz);
  var typeLabels = { soy:'🫘', canola:'🌿', corn:'🌽' };
  prodSel.innerHTML = products.map(function(p) {
    var info = getProductInfo(p.key);
    var price = getProductUnitPrice(p.key);
    return '<option value="' + p.key + '">' + (typeLabels[info.type]||'🫙') + ' ' + info.label + ' (' + price.toLocaleString() + '원/캔)</option>';
  }).join('');
  if (products.length > 0) prodSel.value = products[0].key;
  updateDelivPreview();
}



function changeOwnerStock(type, delta) {
  if (type === 'new') {
    ownerNewVal = Math.max(0, Math.min(20, ownerNewVal + delta));
  } else {
    ownerWasteVal = Math.max(0, Math.min(30, ownerWasteVal + delta));
  }
  updateOwnerUI();
}

function updateOwnerUI() {
  document.getElementById('ownerNewOilVal').textContent   = ownerNewVal;
  document.getElementById('ownerWasteOilVal').textContent = ownerWasteVal;
  // 자동계산 업데이트
  const wEl = document.getElementById('wasteKgInput');
  const nEl = document.getElementById('newOilLInput');
  if (wEl) wEl.value = ownerWasteVal;
  if (nEl) nEl.value = ownerNewVal;
  calcWastePrice();

  // 🔧 fix v65: 업체별 임계값 사용
  var b = businesses.find(function(x){ return String(x.id) === String(ownerBizId); });
  var orderThreshold = b ? getAutoOrderThreshold(b) : 2;
  var collectThreshold = b ? getAutoCollectThreshold(b) : 2;
  
  const newAlert = document.getElementById('ownerNewOilAlert');
  if (ownerNewVal <= orderThreshold) {
    newAlert.style.background = '#FFEBEE';
    newAlert.style.color      = 'var(--red-accent)';
    newAlert.textContent      = '⚠️ 재고 부족 (' + orderThreshold + '캔 이하) — 자동발주 대기';
  } else if (ownerNewVal <= orderThreshold + 2) {
    newAlert.style.background = '#FFF8E1';
    newAlert.style.color      = '#E65100';
    newAlert.textContent      = '🟡 재고 주의 — 곧 부족해질 수 있어요';
  } else {
    newAlert.style.background = '#E8F5E9';
    newAlert.style.color      = '#2E7D32';
    newAlert.textContent      = '✅ 재고 충분 (' + orderThreshold + '캔 초과)';
  }

  const wasteAlert = document.getElementById('ownerWasteAlert');
  if (ownerWasteVal === 0) {
    wasteAlert.style.background = '#F5F6F8';
    wasteAlert.style.color      = 'var(--gray)';
    wasteAlert.textContent      = '— 폐유 없음';
  } else if (ownerWasteVal >= collectThreshold) {
    wasteAlert.style.background = '#FFD700';
    wasteAlert.style.color      = '#7A5000';
    wasteAlert.textContent      = '🚨 수거 가능 (' + collectThreshold + '캔 이상) — ' + ownerWasteVal + '캔 보유';
  } else {
    wasteAlert.style.background = '#FFF3E0';
    wasteAlert.style.color      = '#D4621A';
    wasteAlert.textContent      = '♻️ ' + ownerWasteVal + '캔 보유 (수거 ' + collectThreshold + '캔 이상부터)';
  }
}

function ownerSaveStock() {
  const b = businesses.find(b => String(b.id) === String(ownerBizId));
  if (!b) { showToast('t1','⚠️ 오류','업체 정보를 찾을 수 없어요. 다시 로그인해주세요'); return; }
  const now = new Date();
  const timeStr = `오늘 ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;

  b.newOil   = ownerNewVal;
  b.wasteOil = ownerWasteVal;

  // 자동 계산 업데이트
  const wKgEl = document.getElementById('wasteKgInput');
  const nKgEl = document.getElementById('newOilLInput');
  if (wKgEl) wKgEl.value = ownerWasteVal;
  if (nKgEl) nKgEl.value = ownerNewVal;
  calcWastePrice();
  b.lastUpdate = timeStr;

  // localStorage + DB 저장
  saveBusinesses();
  updateBizStockInDB(b.id, b.newOil, b.wasteOil, b.lastUpdate);

  // 자동발주 체크
  checkAutoOrder(b);

  // 지도 즉시 갱신
  refreshMapMarkers();
  updateDashboard();

  document.getElementById('ownerSaveTime').textContent   = timeStr;
  // 최근 이력 + 월간 통계 렌더링
  renderOwnerRecentHistory();
  renderOwnerMonthlyStats();
  document.getElementById('ownerLastUpdate').textContent = '방금 전';
  showToast('t1','💾 저장 완료!', b.name + ' — 새유 ' + b.newOil + '캔 / 폐유 ' + b.wasteOil + '캔 지도에 반영됐어요');
  // 🆕 임계값 도달 시 알림 (관리자에게 통보)
  try {
    if (shouldAutoOrder(b)) {
      addNotif({
        type: 'low_stock',
        target: 'admin',
        title: '⚠️ 재고 부족',
        body: b.name + ' — 식용유 ' + b.newOil + '캔 (트리거 ' + getAutoOrderThreshold(b) + '캔 이하)',
        bizId: b.id,
        link: 'order'
      });
    }
    if (shouldAutoCollect(b)) {
      addNotif({
        type: 'collect',
        target: 'admin',
        title: '♻️ 폐유 수거 필요',
        body: b.name + ' — 폐유 ' + b.wasteOil + '캔 (트리거 ' + getAutoCollectThreshold(b) + '캔 이상)',
        bizId: b.id,
        link: 'waste'
      });
    }
  } catch(e) { console.warn('재고 알림 실패:', e.message); }
}

function ownerRequestCollect() {
  if (ownerWasteVal === 0) {
    showToast('t1','⚠️ 폐유가 없어요','1캔 이상 있을 때 신청 가능합니다');
    return;
  }
  const b = businesses.find(b => String(b.id) === String(ownerBizId));
  if (!b) return;
  
  // 🔧 fix v65: 임계값 미달 시 안내 (수동 신청은 가능)
  var collectThreshold = getAutoCollectThreshold(b);
  if (ownerWasteVal < collectThreshold && b.autoCollect !== false) {
    var go = confirm('현재 폐유 ' + ownerWasteVal + '캔으로 자동수거 기준(' + collectThreshold + '캔 이상)에 미달합니다.\n\n수동으로 수거를 신청하시겠습니까?');
    if (!go) return;
  }

  // 현재 업주 화면 값으로 재고 업데이트 후 신청
  b.wasteOil = ownerWasteVal;
  saveBusinesses();
  updateBizStockInDB(b.id, b.newOil, b.wasteOil, b.lastUpdate);

  // 수거 신청 이력 기록 (업주 본인 신청은 권한 체크 우회 → 방문일 선택 모달 직접 표시)
  doRequestCollect(ownerBizId);
  renderOwnerMonthlyStats();

  // 지도 즉시 갱신
  refreshMapMarkers();
  renderWasteTable();
}

// ===== ALERT SUBSCRIPTION =====
function toggleAlert(num) {
  alertStates[num] = !alertStates[num];
  const card   = document.getElementById('alertCard' + num);
  const labels = { 1:'새식용유 입고', 2:'폐유 수거 완료', 3:'자동발주 처리' };
  if (alertStates[num]) {
    card.style.border     = '2px solid var(--green-main)';
    card.style.background = 'var(--green-pale)';
    card.querySelector('div:last-child').style.color = 'var(--green-dark)';
    card.querySelector('div:last-child').textContent = '✅ 신청됨';
    showToast('t1','🔔 알림 신청됨', labels[num] + ' 알림을 카카오톡으로 받습니다');
  } else {
    card.style.border     = '2px solid var(--gray-light)';
    card.style.background = 'var(--white)';
    card.querySelector('div:last-child').style.color = 'var(--gray)';
    card.querySelector('div:last-child').textContent = '+ 신청하기';
  }
}

function subscribeAlert(bizId) {
  const biz = businesses.find(b => b.id === bizId);
  showToast('t1','🔔 알림 신청됨', (biz ? biz.name : '') + ' 재입고 알림이 등록됐어요');
  const el = document.getElementById('sub-' + bizId);
  if (el) { el.textContent = '✅ 신청됨'; el.style.color = 'var(--green-dark)'; el.style.background = 'var(--green-pale)'; }
}

// ===== HQ DASHBOARD =====
// HQ 데이터는 businesses 배열에서 실시간 계산

function renderHqAlerts() {
  const alertEl = document.getElementById('hqAlertList');
  if (!alertEl) return;
  const wasteBiz = businesses.filter(b => shouldAutoCollect(b));
  const lowBiz   = businesses.filter(b => shouldAutoOrder(b));
  const alerts   = [
    ...wasteBiz.map(b => ({ type:'waste', b })),
    ...lowBiz.map(b => ({ type:'low', b })),
  ].slice(0, 5);
  if (alerts.length === 0) {
    alertEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">관리가 필요한 업체가 없어요 ✅</div>';
    return;
  }
  alertEl.innerHTML = alerts.map(({type, b}) => type === 'waste'
    ? `<div style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:#FFF3E0;border-radius:9px;border-left:3px solid #FF8C00;margin-bottom:6px;">
        <div style="font-size:16px;">🗑️</div>
        <div style="flex:1;"><div style="font-size:12px;font-weight:700;">${b.name}</div>
        <div style="font-size:10px;color:#D4621A;">폐유 ${b.wasteOil}캔 — 수거 필요</div></div>
        <button class="btn btn-danger" style="padding:4px 9px;font-size:10px;" onclick="openCollectModal(businesses.find(x=>x.id===${b.id}))">수거</button>
      </div>`
    : `<div style="display:flex;align-items:center;gap:10px;padding:9px 11px;background:#FFEBEE;border-radius:9px;border-left:3px solid var(--red-accent);margin-bottom:6px;">
        <div style="font-size:16px;">⚠️</div>
        <div style="flex:1;"><div style="font-size:12px;font-weight:700;">${b.name}</div>
        <div style="font-size:10px;color:var(--red-accent);">새식용유 ${getBizTotalNewOil(b)}캔 — 재고 위험</div></div>
        <button class="btn btn-primary" style="padding:4px 9px;font-size:10px;" onclick="showPanel('order',null)">발주</button>
      </div>`
  ).join('');
}

function renderHqTable(filter='all') {
  let data = businesses;
  if (filter==='danger') data = data.filter(b => shouldAutoOrder(b));
  if (filter==='waste')  data = data.filter(b => shouldAutoCollect(b));
  const tbody = document.getElementById('hqTableBody');
  if (!tbody) return;
  if (data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--gray);">등록된 업체가 없어요. 업체 등록 탭에서 추가해주세요.</td></tr>';
    return;
  }
  tbody.innerHTML = data.map(b => {
    const isLow   = shouldAutoOrder(b);
    const isWaste = shouldAutoCollect(b);
    const newColor = isLow ? 'color:var(--red-accent);font-weight:800' : 'color:var(--green-dark);font-weight:700';
    const wstColor = b.wasteOil >= 5 ? 'color:#7A5000;font-weight:800' : isWaste ? 'color:#D4621A;font-weight:700' : 'color:var(--gray)';
    const esgPts   = Math.round(b.wasteOil * PRICES.waste.can.kg * PRICES.esgRate);
    const wasteKg  = (b.wasteOil * PRICES.waste.can.kg).toFixed(1);
    const status   = isLow ? 'danger' : isWaste ? 'waste' : 'ok';
    const statusBadge = status==='danger'
      ? '<span class="status-pill status-pending">재고위험</span>'
      : status==='waste'
        ? '<span class="status-pill status-inprogress">폐유대기</span>'
        : '<span class="status-pill status-done">정상</span>';
    // 이번달 수거 이력
    const monthCollect = historyData.filter(h => !h.deleted_at && h.bizId === b.id && h.type === '폐유수거').length;
    return `<tr>
      <td><strong style="font-size:12px">${b.name}</strong></td>
      <td style="color:var(--gray)">${b.type}</td>
      <td><span style="${newColor}">${getBizTotalNewOil(b)}캔</span></td>
      <td><span style="${wstColor}">${b.wasteOil}캔 (${wasteKg}kg)</span></td>
      <td style="font-weight:600">${monthCollect}건</td>
      <td style="font-family:var(--font-display);font-weight:700;color:var(--green-dark)">${esgPts.toLocaleString()}</td>
      <td>${statusBadge}</td>
    </tr>`;
  }).join('');
}

function hqFilter(type) {
  ['hqFilter1','hqFilter2','hqFilter3'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.background='#333'; el.style.color='#aaa'; }
  });
  const activeMap = { all:'hqFilter1', danger:'hqFilter2', waste:'hqFilter3' };
  const active = document.getElementById(activeMap[type]);
  if (active) { active.style.background='var(--green-main)'; active.style.color='#0D0D0D'; }
  renderHqTable(type);
}

function initHqBars() {
  const vals = [980,1120,1280,1310,1390,1440];
  const max  = Math.max(...vals);
  vals.forEach((v,i) => {
    const el = document.getElementById('bar'+(i+1));
    if (el) el.style.height = Math.round((v/max)*80) + 'px';
  });
}

// ===== 배출량 자동 계산 =====
function calcWastePrice() {
  const cans  = parseFloat(document.getElementById('wasteKgInput')?.value) || 0; // 캔 수
  const kg    = cans * PRICES.waste.can.kg; // 실제 kg (16.5 * 캔수)
  const price = Math.round(cans * PRICES.waste.can.price);
  const oilCans = parseFloat(document.getElementById('newOilLInput')?.value) || 0;
  const totalKg  = kg + (oilCans * PRICES.waste.can.kg); // 폐유+식용유 모두 16.5kg/캔
  const carbon = (totalKg * PRICES.carbonRate).toFixed(1);
  const esg    = Math.round(kg * PRICES.esgRate);
  const priceEl  = document.getElementById('calcPrice');
  const carbonEl = document.getElementById('calcCarbon');
  const co2El    = document.getElementById('calcCO2');
  const esgEl    = document.getElementById('calcESG');
  if (priceEl)  priceEl.textContent  = price.toLocaleString() + '원';
  if (carbonEl) carbonEl.textContent = ((cans + oilCans) * PRICES.waste.can.kg).toFixed(1) + ' kg';
  if (co2El)    co2El.textContent    = carbon + ' kg';
  if (esgEl)    esgEl.textContent    = '+' + esg.toLocaleString() + ' pts';
}

function saveWeightRecord() {
  if (!isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음','관리자 또는 운반자 로그인 후 이용 가능합니다'); return; }
  const kg   = document.getElementById('wasteKgInput')?.value || '0';
  const date = document.getElementById('wasteDate')?.value;
  const n = new Date();
  const today = date ? date.replaceAll('-','.') : n.getFullYear()+'.'+String(n.getMonth()+1).padStart(2,'0')+'.'+String(n.getDate()).padStart(2,'0');
  const price = parseFloat(kg) <= 40 ? '10,000원' : parseFloat(kg) <= 80 ? '11,000원' : '12,000원';
  const list  = document.getElementById('weightRecordList');
  if (list) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--gray-light);font-size:11px;';
    row.innerHTML = `<span style="color:var(--gray)">${today}</span><span style="font-weight:700">폐유 <strong style="color:var(--green-dark)">${kg} kg</strong></span><span style="color:var(--green-dark);font-weight:700">${price}</span><span style="font-size:9px;background:#FFF8E1;color:#E65100;padding:2px 7px;border-radius:6px;font-weight:700">대기중</span>`;
    list.prepend(row);
  }
  showToast('t1','⚖️ 실측 기록 저장됨','배출량 ' + kg + 'kg 기록이 저장됐어요');
}

// 시세 로딩: 기본값 표시 → DB에서 최신값 로드
// 1단계: 즉시 기본값으로 표시
document.addEventListener('DOMContentLoaded', function() {
  // 🆕 v71: 전역 에러 핸들러 - 모든 JS 에러를 화면에 표시 (모바일에서 콘솔 못 보니까)
  window.addEventListener('error', function(e) {
    try {
      var existing = document.getElementById('globalErrorBox');
      if (existing) existing.remove();
      var box = document.createElement('div');
      box.id = 'globalErrorBox';
      box.style.cssText = 'position:fixed;bottom:80px;left:14px;right:14px;background:#FEF2F2;border:2px solid #C0392B;border-radius:10px;padding:12px 16px;z-index:99998;font-size:11px;color:#C0392B;font-family:var(--font-body);box-shadow:0 6px 20px rgba(0,0,0,0.2);max-height:200px;overflow-y:auto;';
      var msg = (e.message || 'Unknown error');
      var src = (e.filename || '') + ':' + (e.lineno || '?');
      box.innerHTML = '⚠️ <strong>JS 에러</strong>: ' + msg + '<br><span style="font-size:10px;opacity:0.7;">' + src + '</span><button onclick="this.parentElement.remove()" style="position:absolute;top:6px;right:6px;background:#C0392B;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;">✕</button>';
      box.style.position = 'fixed';
      document.body.appendChild(box);
      // 12초 후 자동 제거
      setTimeout(function(){ try{ box.remove(); }catch(e){} }, 12000);
    } catch(ee) {}
  });

  // 🆕 v142: Promise rejection 핸들러 (async/await 에러도 화면에 표시)
  window.addEventListener('unhandledrejection', function(e) {
    try {
      var reason = e.reason || {};
      var msg = reason.message || reason.toString() || 'Promise rejected';
      // Supabase 에러는 자주 발생하니 도움이 되는 hint 추가
      var hint = '';
      if (/permission|RLS|policy/i.test(msg))    hint = ' (RLS 정책 또는 권한 문제)';
      if (/network|fetch|timeout/i.test(msg))     hint = ' (네트워크 / Supabase 연결 문제)';
      if (/JWT|auth|unauthor/i.test(msg))         hint = ' (인증 토큰 문제)';
      if (/quota|exceed|egress/i.test(msg))       hint = ' (Supabase 사용량 초과)';

      var existing = document.getElementById('globalRejectionBox');
      if (existing) existing.remove();
      var box = document.createElement('div');
      box.id = 'globalRejectionBox';
      box.style.cssText = 'position:fixed;bottom:140px;left:14px;right:14px;background:#FFF8E1;border:2px solid #FFA000;border-radius:10px;padding:12px 16px;z-index:99998;font-size:11px;color:#8B6914;font-family:var(--font-body);box-shadow:0 6px 20px rgba(0,0,0,0.2);max-height:200px;overflow-y:auto;';
      box.innerHTML = '⚠️ <strong>비동기 에러</strong>: ' + msg + hint + '<button onclick="this.parentElement.remove()" style="position:absolute;top:6px;right:6px;background:#FFA000;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;cursor:pointer;">✕</button>';
      document.body.appendChild(box);
      setTimeout(function(){ try{ box.remove(); }catch(e){} }, 15000);
    } catch(ee) {}
  });
  
  try { applyPrices(); } catch(e) { console.error('applyPrices:', e); }
  try { updateNotifBadge(); } catch(e) {}
  setInterval(function() { try { updateNotifBadge(); } catch(e) {} }, 5000);
  try { handleQRScanUrl(); } catch(e) { console.warn('[QR URL] DOMContentLoaded 처리 실패:', e.message); }

  // 🆕 v141: 운반자 계정을 백그라운드 미리 로드 (어떤 기기/세션에서도 즉시 로그인 가능)
  setTimeout(function() {
    try {
      if (typeof loadDriverAccountsFromDB === 'function') {
        loadDriverAccountsFromDB().then(function() {
          console.log('[Boot] 운반자 계정 백그라운드 로드 완료 — ' + (driverAccounts ? driverAccounts.length : 0) + '명');
        }).catch(function(e) {
          console.warn('[Boot] 운반자 계정 로드 실패:', e);
        });
      }
    } catch(e) { console.warn('[Boot] driver bg load 오류:', e); }
  }, 300);
  // 🆕 v123: 본사 세션 복원
  try {
    if (restoreHqSessionIfValid()) {
      console.log('[Franchise HQ] 세션 복원됨 — brandId:', hqBrandId);
      // 본사 자료 로드
      loadFranchiseBrandsFromDB().then(function(){ return loadHqAccountsFromDB(); }).then(function(){
        try { updateNavByMode(); } catch(e) {}
        // 🆕 v133: 사이드바 이름 갱신
        try {
          var brand = getBrandById(hqBrandId);
          if (brand) {
            var sName = document.getElementById('sidebarName');
            var sSub = document.getElementById('sidebarSubtext');
            var sAvatar = document.getElementById('sidebarAvatar');
            if (sName) sName.textContent = brand.name;
            if (sSub) sSub.textContent = '본사';
            if (sAvatar) { sAvatar.textContent = (brand.name[0] || 'H'); sAvatar.style.background = '#FFB300'; sAvatar.style.color = '#0F2419'; }
          }
        } catch(e) {}
      });
    }
  } catch(e) { console.warn('[Franchise HQ] 세션 복원 실패:', e); }

  // 🆕 v131: owner 세션 복원 시 온보딩 체크 (새로고침 안전망)
  setTimeout(function() {
    try {
      if (ownerLoggedIn && ownerBizId && businesses.length > 0) {
        if (checkOwnerOnboardingRequired(ownerBizId)) {
          console.log('[온보딩] 🆕 세션 복원 시 미완료 감지 — 모달 표시');
          showOwnerOnboarding(ownerBizId);
        }
      }
    } catch(e) { console.warn('[온보딩] 세션 복원 체크 실패:', e); }
  }, 1500);
});

// load 이벤트에서도 한 번 더 시도 (DOMContentLoaded에서 못 잡았을 경우 대비)
window.addEventListener('load', function() {
  setTimeout(function() {
    try {
      var hash = window.location.hash || '';
      // 아직 stock URL이 남아있고 패널이 qr이 아니면 다시 시도
      if (hash.startsWith('#stock')) {
        var activePanel = (document.querySelector('.panel.active') || {}).id || '';
        if (activePanel !== 'panel-qr') {
          console.log('[QR URL] load 이벤트 - 재시도');
          handleQRScanUrl();
        }
      }
    } catch(e) {}
  }, 1000);
});

// QR URL 자동 처리 — #stock?biz=<id> 형식 진입 시 업주 모드로 자동 전환
function handleQRScanUrl() {
  var hash = window.location.hash || '';
  if (!hash.startsWith('#stock')) return;
  // ?biz=<id> 추출
  var match = hash.match(/[?&]biz=(\d+)/);
  if (!match) {
    console.warn('[QR URL] biz 파라미터 없음:', hash);
    return;
  }
  var bizId = parseInt(match[1]);
  if (!bizId) return;

  console.log('[QR URL] 🚀 스캔 진입 시작 — bizId:', bizId, ', hash:', hash);
  
  // 화면에 처리 중 표시 (debug용)
  try {
    var dbgEl = document.createElement('div');
    dbgEl.id = 'qrAutoDebug';
    dbgEl.style.cssText = 'position:fixed;top:10px;left:10px;right:10px;background:#FFF3E0;border:2px solid #FF9500;border-radius:10px;padding:12px 16px;z-index:99999;font-size:13px;font-weight:700;color:#E65100;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.2);';
    dbgEl.innerHTML = '🔄 QR 스캔 처리 중... (bizId: ' + bizId + ')';
    document.body.appendChild(dbgEl);
  } catch(e) {}

  // businesses 로드 대기 (최대 15초)
  var attempts = 0;
  var maxAttempts = 75;
  var timer = setInterval(function() {
    attempts++;
    // 🔧 fix: window.businesses 의존 제거 (전역 const businesses 직접 접근)
    var hasBusinesses = (typeof businesses !== 'undefined') && businesses && businesses.length > 0;
    if (!hasBusinesses) {
      var dbg = document.getElementById('qrAutoDebug');
      if (dbg) dbg.innerHTML = '⏳ 업체 데이터 로딩 중... (' + attempts + '/' + maxAttempts + ')<br><span style="font-size:10px;opacity:0.7;">businesses=' + (typeof businesses !== 'undefined' ? businesses.length : 'undefined') + '개</span>';
      if (attempts >= maxAttempts) {
        clearInterval(timer);
        if (dbg) {
          dbg.style.background = '#FEF2F2';
          dbg.style.borderColor = '#C0392B';
          dbg.style.color = '#C0392B';
          dbg.innerHTML = '⚠️ 데이터 로드 실패 — 새로고침 부탁드려요<br><span style="font-size:10px;opacity:0.7;">15초 대기했지만 데이터 못 받음</span>';
        }
      }
      return;
    }
    clearInterval(timer);
    
    var dbg = document.getElementById('qrAutoDebug');
    var biz = businesses.find(function(b) { return String(b.id) === String(bizId); });
    if (!biz) {
      console.warn('[QR URL] 업체 미발견 — bizId:', bizId, '/ 전체 업체:', businesses.length, '개');
      if (dbg) {
        dbg.style.background = '#FEF2F2';
        dbg.style.borderColor = '#C0392B';
        dbg.style.color = '#C0392B';
        dbg.innerHTML = '⚠️ 업체 미발견 (bizId: ' + bizId + ')<br><span style="font-size:10px;opacity:0.7;">QR이 만료되었거나 업체가 삭제됨</span>';
      }
      return;
    }
    console.log('[QR URL] ✅ 업체 발견:', biz.name, '— 업주 모드 진입');
    if (dbg) dbg.innerHTML = '✅ ' + biz.name + ' — 화면 전환 중...';
    
    // 업주 모드로 자동 진입 (전역 변수 + window 둘 다 set)
    window.ownerLoggedIn = true;
    ownerLoggedIn = true;
    window.ownerBizId = biz.id;
    ownerBizId = biz.id;
    window.currentOwnerBizId = biz.id;
    window.qrSelectedBizId = biz.id;
    window.qrNewVal = getBizTotalNewOil(biz);
    window.qrWasteVal = biz.wasteOil || 0;
    
    // 세션 저장 (새로고침해도 유지)
    try { localStorage.setItem('hiveoil_session', JSON.stringify({ type: 'owner', bizId: biz.id, loginId: 'qr-auto' })); } catch(e) {}
    
    // 사이드바 이름 갱신
    try {
      var sName = document.getElementById('sidebarName');
      var sAvatar = document.getElementById('sidebarAvatar');
      if (sName) sName.textContent = biz.name;
      if (sAvatar) { sAvatar.textContent = biz.name[0] || 'O'; sAvatar.style.background = '#FFD43B'; }
    } catch(e) {}
    
    // 사이드바 메뉴 갱신
    try { updateNavByMode && updateNavByMode(); } catch(e) {}

    // 🆕 v131: 첫 로그인이면 온보딩 모달 강제
    try {
      if (checkOwnerOnboardingRequired(biz.id)) {
        console.log('[QR URL] 🆕 첫 로그인 — 온보딩 모달 표시');
        setTimeout(function(){ showOwnerOnboarding(biz.id); }, 600);
      }
    } catch(e) { console.warn('온보딩 체크 실패:', e); }

    // QR 패널로 강제 이동 (history 정리)
    function forceShowQR() {
      try { history.replaceState({ panel: 'qr' }, '', '#qr'); } catch(e) {}
      try { showPanel('qr', null); } catch(e) { console.warn('showPanel 오류:', e); }
      
      // 실제로 panel-qr가 active 됐는지 확인
      var qrPanel = document.getElementById('panel-qr');
      var isActive = qrPanel && qrPanel.classList.contains('active');
      console.log('[QR URL] 🔍 forceShowQR 호출 — panel-qr active:', isActive);
      
      // 미리보기 업데이트
      var previewName = document.getElementById('qrPreviewName');
      if (previewName) previewName.textContent = biz.name;
      var bizLabel = document.getElementById('qrBizLabel');
      if (bizLabel) bizLabel.textContent = biz.name;
      var wasteEl = document.getElementById('qrWasteVal');
      if (wasteEl) wasteEl.value = biz.wasteOil || 0;
      try { renderQRProductInputs(biz); } catch(e) { console.warn(e); }
      var lblEl = document.getElementById('qrLastTime');
      if (lblEl) lblEl.textContent = biz.lastUpdate || '—';
    }
    
    // 즉시 한 번
    forceShowQR();
    // 0.5초 후 한 번 더 (다른 패널 변경 코드 덮어쓰기 대비)
    setTimeout(forceShowQR, 500);
    // 1.5초 후 한 번 더 (확실히)
    setTimeout(function(){
      forceShowQR();
      // 디버그 메시지 제거
      var dbg2 = document.getElementById('qrAutoDebug');
      if (dbg2) {
        dbg2.style.background = '#F0FBF5';
        dbg2.style.borderColor = '#0FA366';
        dbg2.style.color = '#0FA366';
        dbg2.innerHTML = '✅ ' + biz.name + ' 재고 입력 화면';
        setTimeout(function(){ dbg2.remove(); }, 2500);
      }
      try { showToast && showToast('t1','✅ ' + biz.name, '재고를 입력해주세요'); } catch(e) {}
    }, 1500);
  }, 200);
}
// 2단계: DB에서 최신 시세 로드 (Supabase 준비 후)
function loadPricesFromDB() {
  // pointRates 별도 로드 (app_settings 키: hiveoil_point_rates)
  try {
    db.from('app_settings').select('value').eq('key','hiveoil_point_rates').single()
      .then(function(r) {
        if (r.data && r.data.value) {
          try {
            var pr = JSON.parse(r.data.value);
            if (typeof pr.purchase === 'number') PRICES.pointRates.purchase = pr.purchase;
            if (typeof pr.waste === 'number') PRICES.pointRates.waste = pr.waste;
            localStorage.setItem('hiveoil_point_rates', r.data.value);
            // 업주 대시보드 갱신
            try { renderOwnerDash && renderOwnerDash(); } catch(e) {}
          } catch(e) {}
        } else {
          // localStorage 폴백
          var ls = localStorage.getItem('hiveoil_point_rates');
          if (ls) {
            try {
              var pr2 = JSON.parse(ls);
              if (typeof pr2.purchase === 'number') PRICES.pointRates.purchase = pr2.purchase;
              if (typeof pr2.waste === 'number') PRICES.pointRates.waste = pr2.waste;
              try { renderOwnerDash && renderOwnerDash(); } catch(e) {}
            } catch(e) {}
          }
        }
      }).catch(function(){});
  } catch(e) {}

  try {
    db.from('app_settings').select('value').eq('key','hiveoil_prices').single()
      .then(function(r) {
        if (r.data && r.data.value) {
          try {
            var parsed = JSON.parse(r.data.value);
            // DB 값으로 PRICES 덮어쓰기 (localStorage 무시)
            if (parsed.products) Object.keys(parsed.products).forEach(function(k){ if(PRICES.products[k]) PRICES.products[k].price = parsed.products[k].price; });
            if (parsed.oils) Object.keys(parsed.oils).forEach(function(k){ if(PRICES.oils[k]) PRICES.oils[k].price = parsed.oils[k].price; });
            if (parsed.waste && parsed.waste.can) {
              PRICES.waste.can.price = parsed.waste.can.price;
              if (parsed.waste.can.kg) PRICES.waste.can.kg = parsed.waste.can.kg;
            }
            if (parsed.esgRate) PRICES.esgRate = parsed.esgRate;
            localStorage.setItem('hiveoil_prices', r.data.value);
            console.log('[Prices] DB에서 최신 시세 로드 완료, waste:', PRICES.waste.can.price);
          } catch(e) { console.warn('[Prices] 파싱 오류:', e); }
          try { applyPrices(); } catch(e2) { console.warn('[Prices] applyPrices 오류(무시):', e2.message); }
        } else {
          // DB에 없으면 localStorage 사용
          try {
            var saved = localStorage.getItem('hiveoil_prices');
            if (saved) {
              var parsed2 = JSON.parse(saved);
              if (parsed2.products) Object.keys(parsed2.products).forEach(function(k){ if(PRICES.products[k]) PRICES.products[k].price = parsed2.products[k].price; });
              if (parsed2.oils) Object.keys(parsed2.oils).forEach(function(k){ if(PRICES.oils[k]) PRICES.oils[k].price = parsed2.oils[k].price; });
              if (parsed2.waste && parsed2.waste.can) PRICES.waste.can.price = parsed2.waste.can.price;
            }
          } catch(e2) {}
          applyPrices();
        }
      }).catch(function(e) {
        // DB 실패 시 localStorage fallback
        try {
          var saved2 = localStorage.getItem('hiveoil_prices');
          if (saved2) {
            var p3 = JSON.parse(saved2);
            if (p3.products) Object.keys(p3.products).forEach(function(k){ if(PRICES.products[k]) PRICES.products[k].price = p3.products[k].price; });
            if (p3.oils) Object.keys(p3.oils).forEach(function(k){ if(PRICES.oils[k]) PRICES.oils[k].price = p3.oils[k].price; });
          }
        } catch(e3) {}
        applyPrices();
        console.warn('[Prices] DB 로드 실패, localStorage 사용:', e);
      });
  } catch(e) { applyPrices(); }
}
// Supabase 초기화 후 로드 - 300ms / 1.5초 / 4초 3단계 시도 (모바일 느린 연결 대응)
setTimeout(function(){ loadPricesFromDB(); loadNotice && loadNotice(); }, 300);
setTimeout(function(){
  // 1.5초 후 재확인: DB 로드가 됐는지 체크 (localStorage와 비교)
  var cached = localStorage.getItem('hiveoil_prices');
  var cachedPrice = 0;
  try { cachedPrice = JSON.parse(cached).waste.can.price || 0; } catch(e) {}
  // DB 재로드 항상 실행 (캐시 덮어쓰기)
  loadPricesFromDB();
  loadNotice && loadNotice();
}, 1500);
setTimeout(function(){ loadPricesFromDB(); }, 4000);

// 초기 날짜 세팅
(function() {
  const d = document.getElementById('wasteDate');
  if (d) { const n=new Date(); d.value=n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); }
  calcWastePrice();
})();


// ===== ADMIN PRICE MANAGER =====
const DEFAULT_PRICES = JSON.parse(JSON.stringify(PRICES));

async function adminLogin() {
  // 🔐 v105: 잠금 상태 체크
  var lockState = isLoginLocked('admin');
  if (lockState.locked) {
    showToast('t1', '🔒 로그인 잠김', '너무 많이 실패했어요. ' + lockState.remainMin + '분 후 다시 시도해주세요.');
    return;
  }

  // 입력 처리: 아이디 + 비밀번호
  var idEl = document.getElementById('adminIdInput');
  var pwEl = document.getElementById('adminPwInput');
  var inputId = idEl ? idEl.value.trim() : 'admin';
  var inputPw = pwEl ? pwEl.value : '';

  if (!inputPw) { showToast('t1','⚠️ 비밀번호 입력',''); return; }

  // 마이그레이션 자동 실행 (기존 평문 → 해시)
  var creds = await migrateAdminCredentialsIfNeeded();
  if (!creds) creds = await getAdminCredentials();

  // 최초 설정 (creds 없음)
  if (!creds) {
    var strength = validatePasswordStrength(inputPw);
    if (!strength.ok) {
      showToast('t1','⚠️ 비밀번호 약함', strength.msg + '\n첫 로그인 시 비밀번호가 설정됩니다.');
      return;
    }
    var idCheck = validateLoginId(inputId || 'admin');
    if (!idCheck.ok) { showToast('t1','⚠️ 아이디', idCheck.msg); return; }
    var newHash = await sha256Hash(inputPw);
    await saveAdminCredentials({ id: inputId || 'admin', pwHash: newHash, updatedAt: Date.now() });
    pwEl.value = '';
    showToast('t1','✅ 관리자 계정 초기 설정 완료','앞으로 이 아이디·비밀번호로 로그인하세요');
    return;
  }

  // 정상 로그인 시도
  var inputHash = await sha256Hash(inputPw);
  if (inputId !== creds.id || inputHash !== creds.pwHash) {
    var newState = recordLoginFailure('admin');
    var remain = LOGIN_ATTEMPT_MAX - newState.count;
    if (newState.lockUntil && Date.now() < newState.lockUntil) {
      showToast('t1','🔒 로그인 잠김','5회 연속 실패 → 5분 잠금');
    } else {
      showToast('t1','❌ 로그인 실패','아이디 또는 비밀번호가 맞지 않아요 (남은 시도: ' + remain + '회)');
    }
    pwEl.style.borderColor = 'var(--red-accent)';
    setTimeout(function(){ pwEl.style.borderColor = ''; }, 1500);
    return;
  }

  // ✅ 로그인 성공
  clearLoginFailure('admin');
  document.getElementById('adminLoginState').style.display = 'none';
  document.getElementById('adminDashState').style.display  = 'block';
  ownerLoggedIn = false; ownerBizId = null; isDriverMode = false;
  isAdminMode = true;
  updateNavByMode();
  renderAdminPrices();
  loadDriverAccountsFromDB().then(function(){
    migrateDriverAccountsIfNeeded();
    renderDriverAccounts();
    updateDriverPendingBadge();
    setTimeout(function() {
      updateSecurityStatus();
      updateSecuritySideBadge();
    }, 100);
  });
  setSession('admin');
  pwEl.value = '';
  showToast('t1','✅ 관리자 로그인','보안 강화 모드로 로그인되었습니다');
  try { pushSyncAfterLogin && pushSyncAfterLogin(); } catch(e) {}
}

function adminLogout() {
  document.getElementById('adminLoginState').style.display = 'block';
  document.getElementById('adminDashState').style.display  = 'none';
  document.getElementById('adminPwInput').value = '';
  try { localStorage.removeItem('hiveoil_session'); } catch(e) {}
}

function renderAdminPrices() {
  const oilContainer = document.getElementById('oilPriceCards');
  if (!oilContainer) return;

  const typeInfo = {
    soy:    { emoji:'🫘', label:'대두유',     color:'#1B5E20', bg:'#E8F5E9', border:'#A5D6A7', light:'#F7FDF9' },
    canola: { emoji:'🌿', label:'카놀라유',   color:'#33691E', bg:'#F1F8E9', border:'#C5E1A5', light:'#F8FCF2' },
    corn:   { emoji:'🌽', label:'옥수수유',   color:'#E65100', bg:'#FFF3E0', border:'#FFCC80', light:'#FFFDF7' },
    sun:    { emoji:'🌻', label:'해바라기유', color:'#F57F17', bg:'#FFFDE7', border:'#FFF59D', light:'#FFFEF7' },
  };

  const groups = { soy:[], canola:[], corn:[], sun:[] };
  Object.entries(PRICES.products || {}).forEach(function(entry) {
    var k = entry[0], p = entry[1];
    if (groups[p.type]) groups[p.type].push([k, p]);
  });

  var rowsHtml = '';
  ['soy','canola','corn','sun'].forEach(function(type) {
    var prods = groups[type];
    if (!prods || prods.length === 0) return;
    var ti = typeInfo[type];
    var validPrices = prods.filter(function(x){ return x[1].price > 0; }).map(function(x){ return x[1].price; });
    var minPrice = validPrices.length ? Math.min.apply(null, validPrices) : 0;

    var prodCells = '';
    prods.forEach(function(entry) {
      var k = entry[0], p = entry[1];
      prodCells += '<div style="flex:1;min-width:180px;max-width:260px;background:#fff;border-radius:10px;border:1.5px solid ' + ti.border + ';padding:12px 14px;">'
        + '<div style="font-size:12px;font-weight:700;color:' + ti.color + ';margin-bottom:2px;">' + p.label + (p.hideTop ? ' <span style="font-size:9px;color:#888;font-weight:400;">(최상단 미게시)</span>' : '') + '</div>'
        + '<div style="font-size:9px;color:var(--gray);margin-bottom:8px;">' + p.unit + ' · VAT포함</div>'
        + '<div style="display:flex;align-items:center;gap:6px;">'
        + '<input type="number" id="prodPrice_' + k + '" value="' + p.price + '" min="0" step="500"'
        + ' style="flex:1;min-width:0;font-family:var(--font-display);font-size:18px;font-weight:800;text-align:center;border:1.5px solid ' + ti.border + ';border-radius:7px;padding:7px 8px;color:' + ti.color + ';"'
        + ' oninput="previewProductPrice(\'' + k + '\',\'' + type + '\',this.value)">'
        + '<span style="font-size:11px;color:var(--gray);flex-shrink:0;">원</span>'
        + '</div>'
        + (p.hideTop ? '<div style="font-size:9px;color:#888;margin-top:4px;text-align:center;">시세 0원이면 — 표시</div>' : '')
        + '</div>';
    });

    rowsHtml += '<div style="background:' + ti.light + ';border:2px solid ' + ti.border + ';border-radius:14px;padding:14px 18px;margin-bottom:12px;">'
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">'
      + '<span style="font-size:22px;">' + ti.emoji + '</span>'
      + '<div style="flex:1;">'
      + '<div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:' + ti.color + ';">' + ti.label + '</div>'
      + '<div style="font-size:10px;color:' + ti.color + ';opacity:0.7;">topbar 최저가 자동반영</div>'
      + '</div>'
      + '<div style="background:' + ti.color + ';color:#fff;border-radius:8px;padding:4px 12px;font-family:var(--font-display);font-size:13px;font-weight:800;">' + minPrice.toLocaleString('ko-KR') + '원</div>'
      + '</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;">' + prodCells + '</div>'
      + '</div>';
  });

  oilContainer.innerHTML = rowsHtml;

  const wasteContainer = document.getElementById('wastePriceCards');
  if (!wasteContainer) return;
  wasteContainer.innerHTML = '<div style="border:1.5px solid var(--gray-light);border-radius:var(--radius);overflow:hidden;">'
    + '<div style="background:#FFF8F0;padding:11px 16px;display:flex;align-items:center;gap:10px;border-bottom:1px solid #FFD8A8;">'
    + '<span style="font-size:20px;">🗑️</span>'
    + '<div><div style="font-family:var(--font-display);font-size:13px;font-weight:800;">폐식용유 수거</div>'
    + '<div style="font-size:10px;color:var(--gray);">캔 단위 · 1캔 = ' + PRICES.waste.can.kg + 'kg</div></div></div>'
    + '<div style="display:flex;gap:0;background:#fff;">'
    + '<div style="flex:1;padding:13px 16px;border-right:1px solid var(--gray-light);">'
    + '<div style="font-size:11px;color:var(--gray);font-weight:600;margin-bottom:7px;">캔당 수거 단가 (원/캔)</div>'
    + '<div style="display:flex;align-items:center;gap:6px;">'
    + '<input type="number" id="wastePrice_can" value="' + PRICES.waste.can.price + '" min="1000" step="500"'
    + ' style="flex:1;font-family:var(--font-display);font-size:18px;font-weight:800;text-align:center;border:1.5px solid #FFCC80;border-radius:8px;padding:7px;color:#E65100;"'
    + ' oninput="previewWastePrice(\'can\',this.value)">'
    + '<span style="font-size:11px;color:var(--gray);">원</span></div>'
    + '<div style="margin-top:5px;font-size:10px;color:#D4621A;font-weight:700;text-align:center;background:#FFF3E0;padding:3px;border-radius:5px;" id="wastePreview_can">현재: ' + PRICES.waste.can.price.toLocaleString('ko-KR') + '원/캔</div>'
    + '</div>'
    + '<div style="flex:1;padding:13px 16px;">'
    + '<div style="font-size:11px;color:var(--gray);font-weight:600;margin-bottom:7px;">캔 무게 기준 (kg)</div>'
    + '<div style="display:flex;align-items:center;gap:6px;">'
    + '<input type="number" id="wasteKgPerCan" value="' + PRICES.waste.can.kg + '" min="1" step="0.5"'
    + ' style="flex:1;font-family:var(--font-display);font-size:18px;font-weight:800;text-align:center;border:1.5px solid var(--gray-light);border-radius:8px;padding:7px;">'
    + '<span style="font-size:11px;color:var(--gray);">kg</span></div>'
    + '<div style="margin-top:5px;font-size:10px;color:var(--gray);text-align:center;background:var(--cream);padding:3px;border-radius:5px;border:1px solid var(--gray-light);">1캔 = ' + PRICES.waste.can.kg + 'kg 기준</div>'
    + '</div></div>'
    + '<div style="background:#FFF8F0;padding:9px 16px;font-size:11px;color:#D4621A;border-top:1px solid #FFD8A8;">'
    + '💡 예시: 3캔 수거 시 → ' + (PRICES.waste.can.price * 3).toLocaleString('ko-KR') + '원 / ' + (PRICES.waste.can.kg * 3).toFixed(1) + 'kg</div></div>';

  // ESG 적립율 input 채우기
  if (PRICES.pointRates) {
    var purchaseEl = document.getElementById('adminPurchaseRate');
    var wasteEl = document.getElementById('adminWasteRate');
    if (purchaseEl) purchaseEl.value = (PRICES.pointRates.purchase * 100).toFixed(1);
    if (wasteEl) wasteEl.value = (PRICES.pointRates.waste * 100).toFixed(1);
  }

  renderPriceChangeLog();
}

// 🆕 ESG 포인트 적립율 저장
async function savePointRates() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음',''); return; }
  var purchaseEl = document.getElementById('adminPurchaseRate');
  var wasteEl = document.getElementById('adminWasteRate');
  if (!purchaseEl || !wasteEl) return;
  var purchaseRate = parseFloat(purchaseEl.value) / 100;
  var wasteRate = parseFloat(wasteEl.value) / 100;
  if (isNaN(purchaseRate) || purchaseRate < 0 || purchaseRate > 1) { showToast('t1','⚠️ 입력 오류','구매 적립율을 0~100 사이 숫자로 입력해주세요'); return; }
  if (isNaN(wasteRate) || wasteRate < 0 || wasteRate > 1) { showToast('t1','⚠️ 입력 오류','수거 적립율을 0~100 사이 숫자로 입력해주세요'); return; }
  if (!PRICES.pointRates) PRICES.pointRates = {};
  PRICES.pointRates.purchase = purchaseRate;
  PRICES.pointRates.waste = wasteRate;
  // localStorage에 저장
  try { localStorage.setItem('hiveoil_point_rates', JSON.stringify(PRICES.pointRates)); } catch(e) {}
  // DB 동기화 (app_settings)
  try {
    if (typeof db !== 'undefined') {
      await db.from('app_settings').upsert({ key: 'hiveoil_point_rates', value: JSON.stringify(PRICES.pointRates) });
    }
  } catch(e) { console.warn('적립율 DB 저장 실패:', e.message); }
  showToast('t1','✅ 저장 완료','구매 ' + (purchaseRate * 100) + '% / 수거 ' + (wasteRate * 100) + '% 적용됐어요');
  // 업주 대시보드 갱신
  try { renderOwnerDash && renderOwnerDash(); } catch(e) {}
}

// ============================================================
// 🆕 공지사항 시스템
// ============================================================
window._currentNotice = null; // { title, body, active, updatedAt }

// 공지 저장 (관리자만)
async function saveNotice() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음',''); return; }
  var titleEl = document.getElementById('adminNoticeTitle');
  var bodyEl = document.getElementById('adminNoticeBody');
  var activeEl = document.getElementById('adminNoticeActive');
  if (!titleEl || !bodyEl || !activeEl) return;
  var notice = {
    title: titleEl.value.trim(),
    body: bodyEl.value.trim(),
    active: activeEl.checked,
    updatedAt: new Date().toISOString()
  };
  if (notice.active && (!notice.title || !notice.body)) {
    showToast('t1','⚠️ 입력 오류','활성화하려면 제목과 내용을 모두 입력해주세요');
    return;
  }
  window._currentNotice = notice;
  try { localStorage.setItem('hiveoil_notice', JSON.stringify(notice)); } catch(e) {}
  try {
    if (typeof db !== 'undefined') {
      await db.from('app_settings').upsert({ key: 'hiveoil_notice', value: JSON.stringify(notice) });
    }
  } catch(e) { console.warn('공지 DB 저장 실패:', e.message); }
  showToast('t1','✅ 공지 저장 완료', notice.active ? '메인 화면에 노출됩니다' : '비활성화 상태로 저장됐어요');
  applyNoticeToDashboard();
}

// 공지 삭제
async function clearNotice() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음',''); return; }
  if (!confirm('공지사항을 삭제할까요?')) return;
  window._currentNotice = null;
  document.getElementById('adminNoticeTitle').value = '';
  document.getElementById('adminNoticeBody').value = '';
  document.getElementById('adminNoticeActive').checked = false;
  try { localStorage.removeItem('hiveoil_notice'); } catch(e) {}
  try {
    if (typeof db !== 'undefined') {
      await db.from('app_settings').delete().eq('key', 'hiveoil_notice');
    }
  } catch(e) { console.warn('공지 DB 삭제 실패:', e.message); }
  showToast('t1','✅ 공지 삭제 완료','');
  applyNoticeToDashboard();
}

// 공지 로드 (DB → localStorage 폴백)
async function loadNotice() {
  // localStorage 먼저
  try {
    var ls = localStorage.getItem('hiveoil_notice');
    if (ls) {
      window._currentNotice = JSON.parse(ls);
      applyNoticeToDashboard();
      fillAdminNoticeForm();
    }
  } catch(e) {}
  // DB 동기화 — maybeSingle 사용 (없어도 406 에러 안 발생)
  try {
    if (typeof db !== 'undefined') {
      var r = await db.from('app_settings').select('value').eq('key', 'hiveoil_notice').maybeSingle();
      if (r && r.data && r.data.value) {
        try {
          var parsed = JSON.parse(r.data.value);
          window._currentNotice = parsed;
          localStorage.setItem('hiveoil_notice', r.data.value);
          applyNoticeToDashboard();
          fillAdminNoticeForm();
        } catch(e) {}
      }
    }
  } catch(e) { /* 조용히 무시 */ }
}

// 관리자 폼 채우기
function fillAdminNoticeForm() {
  if (!window._currentNotice) return;
  var titleEl = document.getElementById('adminNoticeTitle');
  var bodyEl = document.getElementById('adminNoticeBody');
  var activeEl = document.getElementById('adminNoticeActive');
  if (titleEl) titleEl.value = window._currentNotice.title || '';
  if (bodyEl) bodyEl.value = window._currentNotice.body || '';
  if (activeEl) activeEl.checked = !!window._currentNotice.active;
}

// 메인 대시보드에 공지 적용
function applyNoticeToDashboard() {
  var card = document.getElementById('ownerDashNoticeCard');
  var titleEl = document.getElementById('ownerDashNoticeTitle');
  var bodyEl = document.getElementById('ownerDashNoticeBody');
  if (!card) return;
  var n = window._currentNotice;
  if (!n || !n.active || !n.title) {
    card.style.display = 'none';
    return;
  }
  card.style.display = 'block';
  if (titleEl) titleEl.textContent = n.title;
  if (bodyEl) bodyEl.textContent = n.body || '';
}








function renderPriceChangeLog() {
  const log = document.getElementById('priceChangeLog');
  if (!log) return;
  const entries = JSON.parse(localStorage.getItem('hiveoil_price_log') || '[]');
  if (entries.length === 0) {
    log.innerHTML = '<div style="font-size:11px;color:var(--gray);text-align:center;padding:10px 0;">저장 시 자동 기록돼요</div>';
    return;
  }
  log.innerHTML = entries.map(e => `
    <div style="background:var(--green-pale);border-radius:8px;padding:8px 11px;border-left:3px solid var(--green-main);">
      <div style="font-size:10px;color:var(--gray);margin-bottom:4px;">${e.datetime}</div>
      ${e.changes.map(c => '<div style="font-size:11px;font-weight:700;color:var(--green-dark);margin-top:2px;">✅ ' + c + '</div>').join('')}
    </div>`).join('');
}

function previewProductPrice(key, type, val) {
  const el = document.getElementById('prodPreview_' + key);
  const num = parseInt(val) || 0;
  if (el) el.textContent = num.toLocaleString() + '원';
  // 유종 최고가 실시간 미리보기
  if (PRICES.products && PRICES.products[key]) {
    PRICES.products[key].price = num;
    const prods = Object.values(PRICES.products).filter(p => p.type === type);
    const maxPrice = Math.max(...prods.map(p => p.price));
    const tc = { soy:'tc_soy', canola:'tc_can', corn:'tc_corn' }[type];
    const tcEl = document.getElementById(tc);
    if (tcEl) tcEl.textContent = maxPrice.toLocaleString() + '원';
  }
}

function previewOilPrice(key, val) {
  const el = document.getElementById('oilPreview_' + key);
  const num = parseInt(val) || 0;
  if (el) el.textContent = '변경 후: ' + num.toLocaleString() + '원';
}

function previewWastePrice(key, val) {
  const el = document.getElementById('wastePreview_' + key);
  const num = parseInt(val) || 0;
  if (el) el.textContent = '변경 후: ' + num.toLocaleString() + '원';
}

function adminSavePrices(btn) {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  if (!btn) btn = document.getElementById('adminSaveBtn');

  // ① 버튼 즉시 완료 (가장 먼저)
  if (btn) {
    btn.disabled = true;
    btn.textContent = '✅ 시세 저장 & 전체 반영 완료';
    btn.style.background = '#2E7D32';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.innerHTML = '💾 시세 저장 &amp; 전체 반영';
      btn.style.background = '';
      btn.style.color = '';
      btn.disabled = false;
    }, 2500);
  }

  // ② 변경 감지 + PRICES 업데이트 (제품별)
  const changes = [];
  if (PRICES.products) {
    Object.entries(PRICES.products).forEach(([k, p]) => {
      const el = document.getElementById('prodPrice_' + k);
      if (!el) return;
      const v = parseInt(el.value);
      if (isNaN(v) || v <= 0) return;
      if (p.price !== v) changes.push(p.label + ' ' + p.price.toLocaleString() + '→' + v.toLocaleString() + '원');
      PRICES.products[k].price = v;
    });
    // 유종별 최저가 자동 반영 (topbar/대시보드용) — hideTop 플래그된 품목은 제외
    ['soy','canola','corn','sun'].forEach(type => {
      if (!PRICES.oils[type]) return;
      const prods = Object.values(PRICES.products).filter(p => p.type === type && !p.hideTop && p.price > 0);
      if (prods.length > 0) PRICES.oils[type].price = Math.max(...prods.map(p => p.price));
    });
  }
  const canEl = document.getElementById('wastePrice_can');
  if (canEl) {
    const v = parseInt(canEl.value);
    if (!isNaN(v) && v > 0) {
      if (PRICES.waste.can.price !== v)
        changes.push('폐유 수거 ' + PRICES.waste.can.price.toLocaleString() + '→' + v.toLocaleString() + '원/캔');
      PRICES.waste.can.price = v;
    }
  }
  const kgEl = document.getElementById('wasteKgPerCan');
  if (kgEl) {
    const v = parseFloat(kgEl.value);
    if (!isNaN(v) && v > 0) {
      if (PRICES.waste.can.kg !== v)
        changes.push('캔 기준 ' + PRICES.waste.can.kg + '→' + v + 'kg');
      PRICES.waste.can.kg = v;
    }
  }

  // ③ PRICES localStorage 저장
  localStorage.setItem('hiveoil_prices', JSON.stringify(PRICES));
  // DB에도 저장 (다른 기기 동기화)
  _saveSettingToDB('hiveoil_prices', JSON.stringify(PRICES));

  // ④ 이력 생성
  const now = new Date();
  const ymd = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  const hm  = String(now.getHours()).padStart(2,'0') + ':' + String(now.getMinutes()).padStart(2,'0');
  const iso = now.toISOString();

  const logItems = changes.length > 0 ? changes : (() => {
    const items = [];
    Object.values(PRICES.products || {}).forEach(p => items.push(p.label + ' ' + p.price.toLocaleString() + '원 저장'));
    items.push('폐유 수거 ' + PRICES.waste.can.price.toLocaleString() + '원/캔 저장');
    return items;
  })();

  // [A] 관리자 최근 변경이력
  const plog = JSON.parse(localStorage.getItem('hiveoil_price_log') || '[]');
  plog.unshift({ datetime: ymd + ' ' + hm, changes: logItems });
  if (plog.length > 10) plog.length = 10;
  localStorage.setItem('hiveoil_price_log', JSON.stringify(plog));

  // [B] 가격변동 이력 페이지
  const phist = JSON.parse(localStorage.getItem('hiveoil_price_history') || '[]');
  logItems.forEach(c => phist.unshift({ date: ymd, rawDate: iso, change: c }));
  if (phist.length > 100) phist.length = 100;
  localStorage.setItem('hiveoil_price_history', JSON.stringify(phist));

  // ⑤ 전체 가격 반영
  applyPrices();

  // ⑥ 이력 UI 갱신
  renderPriceChangeLog();
  renderPricePage();
  renderAdminPrices();

  showToast('t1', '💾 시세 저장 완료!',
    changes.length > 0 ? changes.slice(0,2).join(' · ') : '현재 시세가 저장됐어요');
}

// 사업자등록증 이미지 토글
function toggleCertImage(id) {
  var el = document.getElementById('cert_' + id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
function toggleDocImage(elemId) {
  var el = document.getElementById(elemId);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function changeAdminPw() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  const pw = document.getElementById('newAdminPw').value.trim();
  if (!pw || pw.length < 4) { showToast('t1','⚠️ 비밀번호 오류','4자리 이상 입력해주세요'); return; }
  localStorage.setItem('hiveoil_admin_pw', pw);
  document.getElementById('newAdminPw').value = '';
  document.getElementById('adminPwStatus').textContent = '✅ 변경 완료';
  showToast('t1','✅ 관리자 비밀번호 변경','다음 로그인부터 새 비밀번호를 사용하세요');
}
function changeDriverPw() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  const pw = document.getElementById('newDriverPw').value.trim();
  if (!pw || pw.length < 4) { showToast('t1','⚠️ 비밀번호 오류','4자리 이상 입력해주세요'); return; }
  localStorage.setItem('hiveoil_driver_pw', pw);
  _saveSettingToDB('driver_pw', pw); // 백그라운드 DB 저장
  document.getElementById('driverPwStatus') && (document.getElementById('driverPwStatus').textContent = '✅ 변경 완료');
  showToast('t1','✅ 운반자 비밀번호 변경','저장됐어요');
  document.getElementById('newDriverPw').value = '';
  document.getElementById('driverPwStatus').textContent = '✅ 변경 완료';
  showToast('t1','✅ 운반자 비밀번호 변경','다음 로그인부터 새 비밀번호를 사용하세요');
}

function adminResetPrices() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  Object.keys(PRICES.oils).forEach(k => { PRICES.oils[k].price = PRICES_DEFAULT.oils[k].price; });
  Object.keys(PRICES.waste).forEach(k => { PRICES.waste[k].price = PRICES_DEFAULT.waste[k].price; });
  PRICES.esgRate = PRICES_DEFAULT.esgRate;
  PRICES.carbonRate = PRICES_DEFAULT.carbonRate;
  try { localStorage.removeItem('hiveoil_prices'); } catch(e) {}
  applyPrices();
  renderAdminPrices();
  showToast('t1','🔄 초기화 완료','시세가 기본값으로 복원됐어요');
}

// ===== 데이터 초기화 함수 =====
async function adminClearHistory() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  if (!confirm('진행 이력을 전체 삭제할까요? 되돌릴 수 없어요.')) return;
  try {
    // DB 삭제
    const { error } = await db.from('history').delete().neq('id', 0);
    if (error) throw error;
  } catch(e) {
    console.warn('DB 이력 삭제 실패:', e.message);
  }
  // localStorage도 삭제
  historyData.length = 0;
  try { localStorage.removeItem('hiveoil_history'); } catch(e) {}
  updateDashboard();
  updateHqRealStats();
  showToast('t1','🗑️ 이력 삭제 완료','진행 이력이 모두 삭제됐어요');
}

async function adminClearBusinesses() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  if (!confirm('등록 업체를 전체 삭제할까요?\n거래 이력은 보존되며 복구 가능합니다.')) return;
  // 소프트 삭제: 전체 업체를 deletedBusinesses로 이동
  const deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  const now = new Date().toISOString().slice(0,10);
  businesses.forEach(b => {
    b.deleted = true; b.deletedAt = now;
    if (!deletedList.find(d => d.id === b.id)) deletedList.unshift(b);
  });
  localStorage.setItem('hiveoil_deleted_biz', JSON.stringify(deletedList));
  try {
    const { error } = await db.from('businesses').update({ deleted: true, deleted_at: new Date().toISOString() }).neq('id', 0);
    if (error) throw error;
  } catch(e) {
    console.warn('DB 업체 삭제 실패:', e.message);
  }
  businesses.length = 0;
  try { localStorage.removeItem('hiveoil_businesses'); } catch(e) {}
  updateDashboard();
  updateHqRealStats();
  renderRegBizList && renderRegBizList();
  renderDeletedBizList && renderDeletedBizList();
  showToast('t1','🗑️ 업체 삭제 완료','등록 업체가 모두 삭제됐어요 (복구 가능)');
}

async function adminClearAll() {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  // 1단계: 관리자 비밀번호 재확인
  var adminPw = localStorage.getItem('hiveoil_admin_pw') || '';
  var inputPw = prompt('⚠️ 전체 초기화 보안 확인\n\n관리자 비밀번호를 입력하세요:');
  if (!inputPw || inputPw !== adminPw) {
    showToast('t1','❌ 비밀번호 불일치','초기화가 취소됐어요');
    return;
  }
  // 2단계: "초기화" 문자 입력 확인
  var confirm2 = prompt('⚠️ 최종 확인\n\n모든 업체·이력이 삭제됩니다.\n계속하려면 아래에 "초기화"를 입력하세요:');
  if (confirm2 !== '초기화') {
    showToast('t1','❌ 초기화 취소','입력값이 다릅니다. 취소됐어요');
    return;
  }
  showToast('t1','⏳ 초기화 진행 중','잠시 기다려주세요...');
  await adminClearHistory();
  await adminClearBusinesses();
  // localStorage 이력도 초기화
  try { localStorage.removeItem('hiveoil_history'); } catch(e) {}
  showToast('t1','✅ 전체 초기화 완료','업체·이력이 모두 삭제됐어요');
}




// ===== QR 재고 입력 =====
var qrNewVal = 5, qrWasteVal = 0, qrSelectedBizId = null;

function initQRPanel() {
  const sel = document.getElementById('qrBizSelect');
  if (!sel) return;

  // ── 업주 로그인: select 우회, 직접 렌더 ──
  if (ownerLoggedIn && ownerBizId) {
    const wrap = document.getElementById('qrBizSelectWrap');
    if (wrap) wrap.style.display = 'none';
    const emptyMsg = document.getElementById('qrEmptyMsg');
    if (emptyMsg) emptyMsg.style.display = 'none';
    // 업주는 QR 생성 카드 불필요 → 숨기기
    var qrGenCard = document.querySelector('#panel-qr .card');
    if (qrGenCard) qrGenCard.style.display = 'none';

    var biz = businesses.find(function(b){ return String(b.id) === String(ownerBizId); });
    if (!biz) {
      // businesses 아직 없으면 DB 로드 후 재시도 (1회만)
      if (!window._qrRetried) {
        window._qrRetried = true;
        loadBusinessesFromDB().then(function() {
          window._qrRetried = false;
          initQRPanel();
        });
      }
      return;
    }
    window._qrRetried = false;

    // select에도 옵션 추가 (saveQRStock 등 내부에서 sel.value 사용)
    sel.innerHTML = '<option value="' + String(biz.id) + '">' + biz.name + '</option>';
    sel.value = String(biz.id);
    qrSelectedBizId = biz.id;

    // 미리보기 이름 즉시 업데이트
    var previewName = document.getElementById('qrPreviewName');
    if (previewName) previewName.textContent = biz.name;
    var label = document.getElementById('qrBizLabel');
    if (label) label.textContent = biz.name;

    // ① 즉시 로컬 데이터로 먼저 렌더 (빈 화면 방지)
    qrNewVal   = getBizTotalNewOil(biz);
    qrWasteVal = biz.wasteOil || 0;
    renderQRProductInputs(biz);
    var wasteElNow = document.getElementById('qrWasteVal');
    if (wasteElNow) wasteElNow.value = qrWasteVal;
    var timeElNow = document.getElementById('qrLastTime');
    if (timeElNow) timeElNow.textContent = biz.lastUpdate || '—';

    // ② DB에서 최신 재고 로드 후 재갱신
    db.from('businesses').select('new_oil,waste_oil,oil_products,last_update').eq('id', biz.id).single()
      .then(function(r) {
        if (r.data && !r.error) {
          biz.newOil = r.data.new_oil ?? biz.newOil;
          biz.wasteOil = r.data.waste_oil ?? biz.wasteOil;
          if (r.data.oil_products) {
            try { biz.oilProducts = typeof r.data.oil_products === 'string' ? JSON.parse(r.data.oil_products) : r.data.oil_products; } catch(e) {}
          }
          biz.lastUpdate = r.data.last_update || biz.lastUpdate;
          saveBusinesses();
          // DB 값으로 재갱신
          qrNewVal   = getBizTotalNewOil(biz);
          qrWasteVal = biz.wasteOil || 0;
          renderQRProductInputs(biz);
          var wasteEl = document.getElementById('qrWasteVal');
          if (wasteEl) wasteEl.value = qrWasteVal;
          var timeEl = document.getElementById('qrLastTime');
          if (timeEl) timeEl.textContent = biz.lastUpdate || '—';
        }
      })
      .catch(function() { /* 로컬 데이터로 이미 렌더됨 */ });
    return;
  }

  // ── 관리자/운반자: 전체 업체 select ──
  const prev = sel.value;
  sel.innerHTML = '<option value="">— 업체를 선택하세요 —</option>';
  businesses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = String(b.id);
    opt.textContent = b.name + ' (재고 ' + getBizTotalNewOil(b) + '캔)';
    sel.appendChild(opt);
  });
  const wrap2 = document.getElementById('qrBizSelectWrap');
  if (wrap2) wrap2.style.display = '';
  if (prev) sel.value = prev;
  const emptyMsg2 = document.getElementById('qrEmptyMsg');
  if (emptyMsg2) emptyMsg2.style.display = businesses.length === 0 ? 'block' : 'none';
}

function generateQR() {
  const sel = document.getElementById('qrBizSelect');
  if (!sel || !sel.value) return;

  const bizId = parseInt(sel.value);
  const area = document.getElementById('qrCodeArea');
  const emptyMsg = document.getElementById('qrEmptyMsg');

  // businesses 배열에서 찾기 (id 타입 상관없이)
  let biz = businesses.find(b => String(b.id) === String(bizId));

  if (!biz) {
    if (area) area.style.display = 'none';
    if (emptyMsg) emptyMsg.style.display = 'block';
    return;
  }

  // 업체 선택 즉시 로컬 값으로 표시
  qrSelectedBizId = biz.id;
  // DB에서 최신 재고 강제 로드 후 렌더
  db.from('businesses').select('new_oil,waste_oil,oil_products,last_update').eq('id', biz.id).single().then(function(r) {
    if (r.data && !r.error) {
      biz.newOil = r.data.new_oil ?? biz.newOil;
      biz.wasteOil = r.data.waste_oil ?? biz.wasteOil;
      if (r.data.oil_products) {
        try { biz.oilProducts = typeof r.data.oil_products === 'string' ? JSON.parse(r.data.oil_products) : r.data.oil_products; } catch(e) {}
      }
      saveBusinesses();
    }
    qrNewVal   = getBizTotalNewOil(biz);
    qrWasteVal = biz.wasteOil || 0;
    renderQRProductInputs(biz);
    var wasteEl3 = document.getElementById('qrWasteVal');
    if (wasteEl3) wasteEl3.value = qrWasteVal;
  }).catch(function() {
    qrNewVal   = getBizTotalNewOil(biz);
    qrWasteVal = biz.wasteOil || 0;
    renderQRProductInputs(biz);
  });

  if (area)    area.style.display    = 'block';
  if (emptyMsg) emptyMsg.style.display = 'none';

  // 미리보기 업데이트
  const previewName = document.getElementById('qrPreviewName');
  const label       = document.getElementById('qrBizLabel');
  const newEl       = document.getElementById('qrNewVal');
  const wasteEl     = document.getElementById('qrWasteVal');
  const timeEl      = document.getElementById('qrLastTime');
  if (previewName) previewName.textContent = biz.name;
  if (label)       label.textContent       = biz.name;
  if (newEl)       { newEl.value = qrNewVal; }
  if (wasteEl)     { wasteEl.value = qrWasteVal; }
  if (timeEl)      timeEl.textContent      = biz.lastUpdate || '—';

  // QR 코드 생성 — URL fragment 방식으로 변경 (스캔하면 바로 재고입력 화면 오픈)
  // GitHub Pages 기준: https://cocodss7-cell.github.io#stock?biz=<id>&name=<name>
  const baseUrl = (window.location.origin + window.location.pathname).replace(/\/index\.html$/, '/');
  const qrTargetUrl = baseUrl + '#stock?biz=' + biz.id + '&name=' + encodeURIComponent(biz.name);
  const qrData = encodeURIComponent(qrTargetUrl);
  const qrUrl  = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + qrData;
  const qrImg  = document.getElementById('qrCodeImg');
  if (qrImg) qrImg.innerHTML = `<img src="${qrUrl}" width="160" height="160" alt="QR" style="display:block;border-radius:4px;">`;

  // DB에서 최신 재고 가져오기 (연결 됐을 때만, 실패해도 무시)
  if (typeof db !== 'undefined') {
    try {
      db.from('businesses').select('new_oil,waste_oil,last_update').eq('id', biz.id).single()
        .then(({data, error}) => {
          if (!error && data) {
            biz.newOil     = data.new_oil   ?? biz.newOil;
            if (data.oil_products) {
              try { biz.oilProducts = typeof data.oil_products === 'string' ? JSON.parse(data.oil_products) : data.oil_products; }
              catch(e) {}
            }
            biz.wasteOil   = data.waste_oil ?? biz.wasteOil;
            biz.lastUpdate = data.last_update || biz.lastUpdate;
            saveBusinesses();
            qrNewVal   = getBizTotalNewOil(biz);
            qrWasteVal = biz.wasteOil;
            renderQRProductInputs(biz);
            var wasteEl2 = document.getElementById('qrWasteVal');
            if (wasteEl2) wasteEl2.value = qrWasteVal;
            if (timeEl)  timeEl.textContent  = biz.lastUpdate || '—';
          }
        }).catch(() => {});
    } catch(e) {}
  }
}

function changeQRStock(type, delta) {
  if (type === 'waste') {
    qrWasteVal = Math.max(0, Math.min(99, qrWasteVal + delta));
    const el = document.getElementById('qrWasteVal');
    if (el) el.value = qrWasteVal;
  }
}

function saveQRStock() {
  if (!isAdminMode && !isDriverMode && !ownerLoggedIn) { showToast('t1','🔒 권한 없음','로그인 후 이용 가능합니다'); return; }
  // 버튼 먼저 찾기
  const btn = document.getElementById('qrSaveBtn');

  if (!qrSelectedBizId) {
    showToast('t1','⚠️ 업체를 먼저 선택해주세요','');
    if (btn) { btn.disabled = false; btn.innerHTML = '📝 재고 저장'; btn.style.opacity = '1'; btn.style.background = ''; }
    return;
  }
  // 업주는 자기 업체만 저장 가능
  if (ownerLoggedIn && ownerBizId && String(qrSelectedBizId) !== String(ownerBizId)) {
    showToast('t1','🔒 권한 없음','자기 업체만 저장할 수 있어요');
    if (btn) { btn.disabled = false; btn.innerHTML = '📝 재고 저장'; btn.style.opacity = '1'; btn.style.background = ''; }
    return;
  }
  const biz = businesses.find(b => String(b.id) === String(qrSelectedBizId));
  if (!biz) {
    if (btn) { btn.disabled = false; btn.innerHTML = '📝 재고 저장'; btn.style.opacity = '1'; btn.style.background = ''; }
    return;
  }

  // 버튼 비활성화
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.innerHTML = '📝 재고 저장';
    btn.style.opacity = '0.85';
  }

  try {
  // 품목별 재고 최신값 읽기
  var updatedProducts = getBizProducts(biz).map(function(p) {
    var el = document.getElementById('qrProd_' + p.key);
    var qty = el ? Math.max(0, Math.min(99, parseInt(el.value) || 0)) : (qrProductVals[p.key] || 0);
    return { key: p.key, qty: qty };
  });
  qrNewVal = updatedProducts.reduce(function(s, p) { return s + p.qty; }, 0);
  const wasteEl2 = document.getElementById('qrWasteVal');
  if (wasteEl2) qrWasteVal = Math.max(0, Math.min(99, parseInt(wasteEl2.value) || 0));

  const now = new Date();
  const timeStr = now.getHours() + ':' + String(now.getMinutes()).padStart(2,'0');

  biz.newOil   = qrNewVal;
  biz.wasteOil = qrWasteVal;
  biz.oilProducts = updatedProducts;  // 품목별 재고 메모리 업데이트
  biz.lastUpdate = '방금 전 ('+timeStr+')';
  saveBusinesses();
  updateBizStockInDB(biz.id, biz.newOil, biz.wasteOil, biz.lastUpdate, updatedProducts);
  // 수거/발주 패널 즉시 갱신
  updateDashboard && updateDashboard();
  updateTabBadges && updateTabBadges();
  try { renderWasteTable && renderWasteTable(); } catch(e) {}
  try { renderWasteHistList && renderWasteHistList(); } catch(e) {}
  try { checkAutoOrder(biz); } catch(e) {}
  // 재고 저장 후 suppress 초기화 (발주신청 패널 즉시 반영)
  try {
    var supKey = 'hiveoil_suppress_' + biz.id;
    localStorage.removeItem(supKey);
    biz._suppressAutoOrder = 0;
  } catch(e2) {}
  // 발주신청 패널 즉시 갱신
  try { renderDeliveryPanel && renderDeliveryPanel(); } catch(e) {}

  const lastEl = document.getElementById('qrLastTime');
  if (lastEl) lastEl.textContent = biz.lastUpdate;

  // 지도 마커 갱신
  if (kakaoMap && mapInitialized) {
    markers.forEach(m => m.overlay.setMap(null));
    infoWindows.forEach(iw => iw.setMap(null));
    markers = []; infoWindows = [];
    businesses.forEach(b => addMarkerToMap(b));
    renderBizList();
  }

  showToast('t1','✅ 재고 저장 완료!', biz.name + ' — 새식용유 '+qrNewVal+'캔, 폐유 '+qrWasteVal+'캔');
  if (qrNewVal <= 2) showToast('t1','⚡ 자동발주 예약!', biz.name+' — 새식용유 부족, 자동발주 대기 중');
  if (qrWasteVal >= 1) setTimeout(() => showToast('t1','♻️ 수거 알림!', biz.name+' — 폐유 '+qrWasteVal+'캔, 수거 신청 가능'), 1000);

  } catch(err) {
    console.error('saveQRStock 오류:', err);
    showToast('t1','⚠️ 저장 중 오류','다시 시도해주세요: ' + (err.message || ''));
  }

  // 버튼 항상 복구 (성공/실패 무관)
  if (btn) {
    btn.innerHTML = '📝 재고 저장';
    btn.style.background = '#2E7D32';
    btn.style.opacity = '1';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '📝 재고 저장';
      btn.style.background = '';
    }, 2000);
  }
}

function printQR() {
  const qrImg = document.getElementById('qrCodeImg');
  const bizLabel = document.getElementById('qrBizLabel');
  if (!qrImg || !bizLabel) return;
  
  // QR 이미지 src만 추출 (더 큰 사이즈로 재생성)
  var imgEl = qrImg.querySelector('img');
  var qrSrc = imgEl ? imgEl.src.replace(/size=\d+x\d+/, 'size=400x400') : '';
  var bizName = bizLabel.textContent;
  
  // 식용유니버스 진짜 로고 SVG (메인화면과 동일)
  var logoSvg = '<svg width="48" height="48" viewBox="0 0 512 512" style="display:block;border-radius:11px;flex-shrink:0;">' +
    '<defs><linearGradient id="logoBgPrint" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#0D2B1A"/><stop offset="1" stop-color="#1F4D30"/>' +
    '</linearGradient></defs>' +
    '<rect width="512" height="512" rx="115" ry="115" fill="url(#logoBgPrint)"/>' +
    '<circle cx="100" cy="110" r="2.5" fill="#FFFFFF" opacity="0.6"/>' +
    '<circle cx="420" cy="100" r="2" fill="#FFFFFF" opacity="0.5"/>' +
    '<circle cx="430" cy="400" r="2.5" fill="#FFFFFF" opacity="0.6"/>' +
    '<circle cx="90" cy="410" r="2" fill="#FFFFFF" opacity="0.5"/>' +
    '<g transform="translate(256, 256)">' +
    '<circle r="120" fill="#10D67A"/>' +
    '<ellipse cx="-35" cy="-25" rx="40" ry="28" fill="#0D2B1A" opacity="0.4"/>' +
    '<ellipse cx="40" cy="35" rx="28" ry="22" fill="#0D2B1A" opacity="0.4"/>' +
    '<ellipse cx="-15" cy="50" rx="22" ry="14" fill="#0D2B1A" opacity="0.4"/>' +
    '<ellipse cx="55" cy="-30" rx="15" ry="10" fill="#0D2B1A" opacity="0.4"/>' +
    '</g>' +
    '<g transform="translate(256, 256)">' +
    '<ellipse cx="0" cy="0" rx="172" ry="58" fill="none" stroke="#F4D35E" stroke-width="7"/>' +
    '<ellipse cx="0" cy="0" rx="172" ry="58" fill="none" stroke="#F4D35E" stroke-width="7" transform="rotate(60)"/>' +
    '<ellipse cx="0" cy="0" rx="172" ry="58" fill="none" stroke="#F4D35E" stroke-width="7" transform="rotate(-60)"/>' +
    '</g></svg>';
  
  const win = window.open('', '_blank');
  win.document.write(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + bizName + ' — 식용유니버스 QR</title>' +
    '<style>' +
    '* { margin:0; padding:0; box-sizing:border-box; }' +
    'body { font-family:"Pretendard","Apple SD Gothic Neo",sans-serif; background:#F0F4F0; padding:24px 16px; min-height:100vh; }' +
    '.print-controls { max-width:340px; margin:0 auto 16px; display:flex; gap:8px; }' +
    '.print-controls button { flex:1; padding:11px; border:none; border-radius:9px; font-size:13px; font-weight:800; cursor:pointer; font-family:inherit; }' +
    '.print-controls .btn-primary { background:#0FA366; color:#fff; }' +
    '.print-controls .btn-secondary { background:#fff; color:#666; border:1.5px solid #DDD; }' +
    '@media print { .print-controls { display:none !important; } body { background:#fff; padding:0; } .sticker-card { box-shadow:none !important; margin:0 auto !important; page-break-after:avoid; } }' +
    
    // 스티커 카드 — 폭 340 (컴팩트)
    '.sticker-card { max-width:340px; margin:0 auto; background:#fff; border-radius:18px; overflow:hidden; box-shadow:0 8px 28px rgba(0,0,0,0.12); border:2px dashed #0FA366; }' +
    
    // 헤더 — 가로 레이아웃 (로고 + 텍스트 옆으로) — 컴팩트
    '.sticker-header { background:linear-gradient(135deg,#0D2B1A 0%,#1F4D30 50%,#0FA366 100%); color:#fff; padding:14px 18px; display:flex; align-items:center; gap:12px; position:relative; overflow:hidden; }' +
    '.sticker-header::before { content:""; position:absolute; top:-25px; right:-25px; width:90px; height:90px; background:rgba(255,255,255,0.06); border-radius:50%; }' +
    '.brand-info { flex:1; min-width:0; position:relative; z-index:1; }' +
    '.brand-name { font-size:20px; font-weight:900; letter-spacing:-0.04em; line-height:1.1; }' +
    '.brand-name .accent { color:#FFEB3B; }' +
    '.brand-tagline { font-size:9.5px; opacity:0.85; margin-top:2px; letter-spacing:0.02em; }' +
    
    // 업체명 - 컴팩트
    '.biz-name-row { background:#0D0D0D; color:#fff; padding:9px 18px; text-align:center; }' +
    '.biz-label { font-size:9px; color:#10D67A; font-weight:700; letter-spacing:1.5px; margin-bottom:2px; }' +
    '.biz-name { font-size:18px; font-weight:900; letter-spacing:-0.03em; line-height:1.15; }' +
    
    // QR 영역 - 컴팩트
    '.qr-zone { padding:16px 18px 12px; text-align:center; background:#fff; }' +
    '.qr-frame { display:inline-block; padding:10px; background:#fff; border:2.5px solid #0D0D0D; border-radius:12px; position:relative; }' +
    '.qr-corner { position:absolute; width:18px; height:18px; border:2.5px solid #0FA366; }' +
    '.qr-corner.tl { top:-2.5px; left:-2.5px; border-right:none; border-bottom:none; border-radius:6px 0 0 0; }' +
    '.qr-corner.tr { top:-2.5px; right:-2.5px; border-left:none; border-bottom:none; border-radius:0 6px 0 0; }' +
    '.qr-corner.bl { bottom:-2.5px; left:-2.5px; border-right:none; border-top:none; border-radius:0 0 0 6px; }' +
    '.qr-corner.br { bottom:-2.5px; right:-2.5px; border-left:none; border-top:none; border-radius:0 0 6px 0; }' +
    '.qr-frame img { display:block; width:180px; height:180px; }' +
    '.qr-action { margin-top:10px; font-size:13px; font-weight:800; color:#0FA366; letter-spacing:-0.02em; }' +
    
    // 사용 방법 - 컴팩트
    '.usage-section { background:#F8FAF8; padding:13px 18px 16px; border-top:1px dashed #C5E1CC; }' +
    '.usage-title { font-size:11px; font-weight:900; color:#1B5E20; margin-bottom:9px; text-align:center; letter-spacing:-0.01em; }' +
    '.usage-step { display:flex; align-items:flex-start; gap:8px; margin-bottom:6px; }' +
    '.usage-step:last-child { margin-bottom:0; }' +
    '.step-num { flex-shrink:0; width:18px; height:18px; background:#0FA366; color:#fff; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; }' +
    '.step-text { flex:1; font-size:10.5px; color:#333; line-height:1.45; padding-top:1px; }' +
    '.step-text strong { color:#0FA366; font-weight:800; }' +
    
    '</style></head><body>' +
    
    // 인쇄 컨트롤 (인쇄 시 숨김)
    '<div class="print-controls">' +
      '<button class="btn-secondary" onclick="window.close()">✕ 닫기</button>' +
      '<button class="btn-primary" onclick="window.print()">🖨️ 인쇄하기</button>' +
    '</div>' +
    
    // 메인 스티커 — 컴팩트 + 가로 헤더
    '<div class="sticker-card">' +
      // 식용유니버스 브랜드 헤더 (가로형 - 진짜 로고 + 텍스트)
      '<div class="sticker-header">' +
        logoSvg +
        '<div class="brand-info">' +
          '<div class="brand-name">식용유<span class="accent">니버스</span></div>' +
          '<div class="brand-tagline">자원순환의 새로운 우주</div>' +
        '</div>' +
      '</div>' +
      
      // 업체명
      '<div class="biz-name-row">' +
        '<div class="biz-label">QR 재고 입력 전용</div>' +
        '<div class="biz-name">' + bizName + '</div>' +
      '</div>' +
      
      // QR
      '<div class="qr-zone">' +
        '<div class="qr-frame">' +
          '<div class="qr-corner tl"></div>' +
          '<div class="qr-corner tr"></div>' +
          '<div class="qr-corner bl"></div>' +
          '<div class="qr-corner br"></div>' +
          '<img src="' + qrSrc + '" alt="QR Code">' +
        '</div>' +
        '<div class="qr-action">📱 카메라로 스캔하세요</div>' +
      '</div>' +
      
      // 사용 방법
      '<div class="usage-section">' +
        '<div class="usage-title">📖 사용 방법</div>' +
        '<div class="usage-step">' +
          '<div class="step-num">1</div>' +
          '<div class="step-text">QR을 <strong>카메라로 스캔</strong>하면 자동으로 재고 입력 화면 이동</div>' +
        '</div>' +
        '<div class="usage-step">' +
          '<div class="step-num">2</div>' +
          '<div class="step-text">현재 <strong>식용유 재고</strong> · <strong>폐식용유 재고</strong> 입력 후 저장</div>' +
        '</div>' +
        '<div class="usage-step">' +
          '<div class="step-num">3</div>' +
          '<div class="step-text">식용유 추가 필요 시 <strong>추가발주 · 저장</strong> 한 번이면 OK</div>' +
        '</div>' +
        '<div class="usage-step">' +
          '<div class="step-num">4</div>' +
          '<div class="step-text"><strong>자동발주</strong> 및 <strong>폐유 수거</strong>가 진행됩니다</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    
    '</body></html>'
  );
  win.document.close();
}

// ===== 카카오 장소 검색 (JS SDK - file:// + GitHub Pages 모두 지원) =====
function searchKakaoPlace() {
  var query = document.getElementById('kakao_search_input').value.trim();
  if (!query) { showToast('t1','검색어를 입력해주세요',''); return; }
  var resultsEl = document.getElementById('kakaoResults');
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div style="text-align:center;padding:16px;color:#6B7D72;font-size:12px;">검색 중...</div>';

  function doSearch() {
    // 🆕 여러 페이지 결과를 합쳐서 더 많은 결과 표시 (최대 75개 = 5페이지)
    var ps = new kakao.maps.services.Places();
    var allResults = [];
    var pagesLoaded = 0;
    var maxPages = 5;
    var lastPagination = null;
    
    function searchPage(page) {
      ps.keywordSearch(query, function(data, status, pagination) {
        pagesLoaded++;
        if (status === kakao.maps.services.Status.OK && data && data.length > 0) {
          allResults = allResults.concat(data);
        }
        lastPagination = pagination;
        // 다음 페이지 있으면 가져오기
        if (pagination && pagination.hasNextPage && pagesLoaded < maxPages && status === kakao.maps.services.Status.OK) {
          pagination.nextPage();
        } else {
          renderResults();
        }
      }, {
        page: page,
        size: 15
        // location 미지정 → 위치 편향 해제 (전국 검색)
      });
    }
    
    function renderResults() {
      // 중복 제거 (place_name + address_name 기준)
      var seen = {};
      var uniqueResults = [];
      allResults.forEach(function(p) {
        var key = p.place_name + '|' + (p.road_address_name || p.address_name || '');
        if (!seen[key]) {
          seen[key] = true;
          uniqueResults.push(p);
        }
      });
      
      window._kakaoSearchResults = uniqueResults;
      
      if (uniqueResults.length === 0) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:20px;color:#6B7D72;font-size:12px;">검색 결과가 없어요.<br><span style="font-size:10px;opacity:0.7;">더 구체적인 상호명으로 검색해보세요. (예: "소바랑 원주")</span></div>'
          + _renderManualEntryHint(query);
        return;
      }
      
      var html = '';
      // 결과 개수 표시
      html += '<div style="font-size:11px;color:#6B7D72;padding:6px 10px;margin-bottom:6px;background:#F0FBF5;border-radius:7px;">📍 총 ' + uniqueResults.length + '개 결과 · 정확도순</div>';
      
      for (var i = 0; i < uniqueResults.length; i++) {
        var p = uniqueResults[i];
        html += '<div onclick="selectKakaoPlace(' + i + ')" style="background:#fff;border:1.5px solid #DDE8E1;border-radius:11px;padding:12px 14px;cursor:pointer;margin-bottom:6px;transition:all 0.15s;" onmouseover="this.style.borderColor=\'#3D9E6E\';this.style.background=\'#EDF7F1\'" onmouseout="this.style.borderColor=\'#DDE8E1\';this.style.background=\'#fff\'">';
        html += '<div style="display:flex;align-items:center;gap:10px;">';
        html += '<div style="font-size:20px;flex-shrink:0;">🏪</div>';
        html += '<div style="flex:1;min-width:0;">';
        html += '<div style="font-weight:700;font-size:13px;">' + p.place_name + '</div>';
        html += '<div style="font-size:10px;color:#6B7D72;margin-top:2px;">' + (p.road_address_name || p.address_name) + '</div>';
        if (p.phone) html += '<div style="font-size:9px;color:#3D9E6E;margin-top:2px;">📞 ' + p.phone + '</div>';
        html += '</div>';
        html += '<div style="font-size:10px;color:#3D9E6E;font-weight:700;flex-shrink:0;">선택 →</div>';
        html += '</div></div>';
      }
      
      // 🆕 항상 수동 입력 옵션 함께 표시 (찾는 업체가 없을 수 있음)
      html += _renderManualEntryHint(query);
      
      resultsEl.innerHTML = html;
    }
    
    searchPage(1);
  }

  if (window.kakao && kakao.maps && kakao.maps.services) {
    doSearch();
  } else {
    kakao.maps.load(doSearch);
  }
}

// 🆕 검색 결과에 없을 때 수동 입력 안내
function _renderManualEntryHint(query) {
  return '<div style="margin-top:10px;padding:12px 14px;background:linear-gradient(135deg,#FFF8E7,#FFE0B2);border:1.5px solid #FCD34D;border-radius:10px;">'
    + '<div style="font-size:12px;font-weight:800;color:#92400E;margin-bottom:6px;">🤔 찾는 업체가 안 보이세요?</div>'
    + '<div style="font-size:11px;color:#92400E;line-height:1.5;margin-bottom:8px;">카카오 지도에 등록되지 않은 신규 매장은 검색이 안 될 수 있어요.<br>직접 입력해서 등록해주세요. (등록 후 정보 수정에서 주소 변경하면 지도에도 반영돼요)</div>'
    + '<button onclick="openManualBizEntry(\'' + query.replace(/'/g, "\\'") + '\')" style="width:100%;background:#92400E;color:#fff;border:none;border-radius:8px;padding:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font-body);">'
    + '✏️ "' + query + '" 직접 입력하기'
    + '</button>'
    + '</div>';
}

// 🆕 수동 입력 모달 (검색에 없는 업체용)
function openManualBizEntry(prefilledName) {
  var modal = document.createElement('div');
  modal.id = 'manualBizModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;margin:auto;">' +
      '<div style="background:linear-gradient(135deg,#92400E,#FF9500);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;">✏️ 업체 직접 입력</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.85);margin-top:2px;">카카오에 없는 업체를 수동 등록</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'manualBizModal\').remove()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;width:34px;height:34px;font-size:16px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="padding:18px 22px;">' +
        '<div style="background:#FFF8E7;border:1px solid #FCD34D;border-radius:9px;padding:12px 14px;margin-bottom:14px;font-size:11px;color:#92400E;line-height:1.6;">' +
          '💡 <strong>안내</strong>: 입력하신 주소가 자동으로 좌표로 변환되어 지도에 정확히 표시됩니다. 도로명/지번 어떤 형식이든 OK.' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:5px;">🏪 상호명 *</label>' +
          '<input type="text" id="manualBizName" value="' + (prefilledName || '').replace(/"/g,'&quot;') + '" placeholder="예: 소바랑 원주단구점" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:14px;font-weight:700;font-family:var(--font-body);box-sizing:border-box;">' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:5px;">📍 주소 *</label>' +
          '<input type="text" id="manualBizAddr" value="" placeholder="예: 강원특별자치도 원주시 단구로 288-2" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">' +
          '<div style="font-size:10px;color:#888;margin-top:4px;">💡 도로명 주소(예: 단구로 288) 또는 지번(예: 단구동 123-4) 모두 가능</div>' +
        '</div>' +
        '<div id="manualBizGeoStatus" style="display:none;margin-bottom:12px;padding:10px 13px;border-radius:9px;font-size:11px;font-weight:700;"></div>' +
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="document.getElementById(\'manualBizModal\').remove()" style="flex:1;background:#F5F5F5;color:#666;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
          '<button id="manualBizSaveBtn" onclick="confirmManualBizEntry()" style="flex:2;background:linear-gradient(135deg,#92400E,#FF9500);color:#fff;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;font-family:var(--font-body);">✅ 주소 변환 후 적용</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

function confirmManualBizEntry() {
  var name = document.getElementById('manualBizName').value.trim();
  var addr = document.getElementById('manualBizAddr').value.trim();
  var statusEl = document.getElementById('manualBizGeoStatus');
  var saveBtn = document.getElementById('manualBizSaveBtn');
  
  if (!name) { showToast('t1','⚠️ 상호명 필수',''); return; }
  if (!addr) { showToast('t1','⚠️ 주소 필수','지도에 표시할 주소를 입력해주세요'); return; }

  // 변환 중 UI
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.style.background = '#EEF4FF';
    statusEl.style.border = '1px solid #B3D4FC';
    statusEl.style.color = '#185FA5';
    statusEl.innerHTML = '🔄 카카오 지도에서 주소를 좌표로 변환 중...';
  }
  if (saveBtn) saveBtn.disabled = true;

  function applyResult(lat, lng, finalAddr) {
    window._kakaoSearchResults = [{
      place_name: name,
      address_name: finalAddr || addr,
      road_address_name: finalAddr || addr,
      x: lng.toString(),
      y: lat.toString(),
      phone: '',
      _manual: true
    }];
    selectKakaoPlace(0);
    document.getElementById('manualBizModal').remove();
    showToast('t1','✅ 직접 입력 완료', name + ' — 지도 좌표 ' + lat.toFixed(5) + ', ' + lng.toFixed(5));
  }

  function doGeocode() {
    var geocoder = new kakao.maps.services.Geocoder();
    
    // 1차: 주소 검색 (도로명/지번)
    geocoder.addressSearch(addr, function(data, status) {
      if (status === kakao.maps.services.Status.OK && data.length > 0) {
        var lat = parseFloat(data[0].y);
        var lng = parseFloat(data[0].x);
        var finalAddr = (data[0].road_address && data[0].road_address.address_name) || data[0].address_name;
        applyResult(lat, lng, finalAddr);
        return;
      }
      
      // 2차: 키워드 검색 (상호명+주소 같이)
      var ps = new kakao.maps.services.Places();
      ps.keywordSearch(name + ' ' + addr, function(kdata, kstatus) {
        if (kstatus === kakao.maps.services.Status.OK && kdata.length > 0) {
          var p = kdata[0];
          applyResult(parseFloat(p.y), parseFloat(p.x), p.road_address_name || p.address_name);
          return;
        }
        
        // 3차: 주소 키워드만 검색
        ps.keywordSearch(addr, function(adata, astatus) {
          if (astatus === kakao.maps.services.Status.OK && adata.length > 0) {
            var p2 = adata[0];
            applyResult(parseFloat(p2.y), parseFloat(p2.x), p2.road_address_name || p2.address_name);
            return;
          }
          
          // 모두 실패 → 사용자에게 묻기
          if (saveBtn) saveBtn.disabled = false;
          if (statusEl) {
            statusEl.style.background = '#FEF2F2';
            statusEl.style.border = '1px solid #FECACA';
            statusEl.style.color = '#C0392B';
            statusEl.innerHTML = '⚠️ 주소를 좌표로 변환할 수 없어요. 더 정확한 주소를 입력해주세요.<br><span style="font-weight:400;font-size:10px;">예시: "강원특별자치도 원주시 단구로 288" / "원주시 단구동 123-4"</span>';
          }
        });
      });
    });
  }

  if (window.kakao && kakao.maps && kakao.maps.services) {
    doGeocode();
  } else {
    kakao.maps.load(doGeocode);
  }
}


function selectKakaoPlace(idx) {
  const place = window._kakaoSearchResults && window._kakaoSearchResults[idx];
  if (!place) return;

  // hidden 필드에 값 저장
  document.getElementById('reg_name').value  = place.place_name;
  document.getElementById('reg_addr').value  = place.road_address_name || place.address_name;
  document.getElementById('reg_lat').value   = place.y;  // 위도
  document.getElementById('reg_lng').value   = place.x;  // 경도
  document.getElementById('reg_phone').value = place.phone || '';

  // 미리보기 업데이트
  document.getElementById('prev_name').textContent = place.place_name;
  document.getElementById('prev_addr').textContent = place.road_address_name || place.address_name;
  document.getElementById('prev_lat').textContent  = parseFloat(place.y).toFixed(5);
  document.getElementById('prev_lng').textContent  = parseFloat(place.x).toFixed(5);
  document.getElementById('prev_phone').textContent = place.phone || '정보 없음';
  document.getElementById('selectedBizPreview').style.display = 'block';

  // 검색창에 선택된 이름 표시
  document.getElementById('kakao_search_input').value = place.place_name;

  // 결과 목록 닫기
  document.getElementById('kakaoResults').innerHTML = '';

  showToast('t1', '✅ ' + place.place_name + ' 선택됨', place.road_address_name || place.address_name);
}


// ===== 납품 처리 =====
// renderDeliveryPanel은 아래에 정의됨 (중복 제거)

function populateDelivBizSelect() {
  const sel = document.getElementById('delivBizSelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— 업체 선택 —</option>';

  // 업주 로그인 시 자기 업체만
  const bizList = (ownerLoggedIn && ownerBizId)
    ? businesses.filter(b => String(b.id) === String(ownerBizId))
    : businesses;

  bizList.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name + ' (현재 ' + b.newOil + '캔' + (b.auto ? ' · ⚡자동' : '') + ')';
    sel.appendChild(opt);
  });

  // 업주 로그인이면 자기 업체 자동 선택
  if (ownerLoggedIn && ownerBizId) {
    sel.value = ownerBizId;
    onDelivBizChange();
  } else if (current) {
    sel.value = current;
    onDelivBizChange();
  }
}

function onDelivBizChange() {
  const sel = document.getElementById('delivBizSelect');
  const biz = businesses.find(b => String(b.id) === String(sel?.value));
  // 품목 select 업데이트
  populateDelivProductSelect(biz);
  const stockEl   = document.getElementById('delivCurrentStock');
  const previewEl = document.getElementById('delivPreview');
  if (biz) {
    // DB에서 최신 재고 동기화
    db.from('businesses').select('new_oil').eq('id', biz.id).single().then(({data, error}) => {
      if (!error && data) {
        biz.newOil = data.new_oil; // 최신값으로 업데이트
        if (stockEl) {
          stockEl.textContent = getBizTotalNewOil(biz) + '캔';
          stockEl.style.color = biz.newOil <= 2 ? 'var(--red-accent)' : 'var(--green-dark)';
        }
        updateDelivPreview();
        // 드롭다운 텍스트도 갱신
        const opt = sel.querySelector('option[value="' + biz.id + '"]');
        if (opt) opt.textContent = biz.name + ' (현재 ' + biz.newOil + '캔)';
      }
    });
    if (previewEl) previewEl.style.display = 'flex';
    updateDelivPreview();
  } else {
    if (stockEl) { stockEl.textContent = '—'; stockEl.style.color = 'var(--gray)'; }
    if (previewEl) previewEl.style.display = 'none';
  }
}

function changeDelivQty(delta) {
  const el = document.getElementById('delivQty');
  if (!el) return;
  el.value = Math.max(1, Math.min(50, parseInt(el.value||5) + delta));
  updateDelivPreview();
}

function updateDelivPreview() {
  const stockEl = document.getElementById('delivCurrentStock');
  const qty     = parseInt(document.getElementById('delivQty')?.value) || 5;
  const afterEl = document.getElementById('delivAfterStock');
  // 현재 재고는 stockEl 텍스트에서 읽기 (DB 동기화된 최신값)
  const currentStr = stockEl ? stockEl.textContent.replace('캔','').trim() : '0';
  const current = parseInt(currentStr) || 0;
  if (afterEl) {
    const after = current + qty;
    afterEl.textContent = after + '캔';
    afterEl.style.color = after <= 2 ? 'var(--red-accent)' : 'var(--green-dark)';
  }
}

function quickDeliver(bizId) {
  // 자동발주 버튼 클릭 시 해당 업체 선택 + 기본값 5캔
  const sel = document.getElementById('delivBizSelect');
  if (sel) { sel.value = bizId; onDelivBizChange(); }
  const qtyEl = document.getElementById('delivQty');
  if (qtyEl) { qtyEl.value = 5; updateDelivPreview(); }
  // 스크롤 납품 폼으로
  document.getElementById('delivBizSelect')?.scrollIntoView({behavior:'smooth', block:'center'});
}

async function confirmDelivery() {
  if (!isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음','관리자 또는 운반자 로그인 후 이용 가능합니다'); return; }
  // 중복 방지
  const btn = document.querySelector('[onclick="confirmDelivery()"]');
  if (btn) {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = '⏳ 처리 중...';
    btn.style.opacity = '0.6';
  }

  const sel    = document.getElementById('delivBizSelect');
  const biz    = businesses.find(b => String(b.id) === String(sel?.value));
  const qty    = parseInt(document.getElementById('delivQty')?.value) || 5;
  // 품목별 단가 적용
  const prodSel = document.getElementById('delivProductSelect');
  const productKey = prodSel?.value || '';
  const productInfo = productKey ? getProductInfo(productKey) : null;
  const oilKey = productInfo ? productInfo.type : (document.getElementById('delivOilType')?.value || 'soy');
  const oilName = productInfo ? productInfo.label : (PRICES.oils[oilKey]?.label || '식용유');

  if (!biz) {
    showToast('t1','⚠️ 업체를 선택해주세요','');
    if (btn) { btn.disabled = false; btn.textContent = '✅ 납품 확정'; btn.style.opacity = '1'; }
    return;
  }

  // DB에서 최신 재고 읽기
  const dbRes = await db.from('businesses').select('new_oil').eq('id', biz.id).single();
  const realStock = (dbRes.data && !dbRes.error) ? dbRes.data.new_oil : biz.newOil;
  biz.newOil = realStock;
  const prevStock = realStock;
  biz.newOil = prevStock + qty;
  // 품목별 재고도 업데이트
  if (!biz.oilProducts || biz.oilProducts.length === 0) {
    // oilProducts 없으면 초기화
    var prods0 = getBizProducts(biz);
    biz.oilProducts = prods0.map(function(p){ return {key:p.key, qty:p.qty}; });
  }
  if (productKey && biz.oilProducts) {
    var pp = biz.oilProducts.find(function(p){ return p.key === productKey; });
    if (pp) pp.qty = (pp.qty || 0) + qty;
    else biz.oilProducts.push({key: productKey, qty: qty});
  }
  biz.lastUpdate = '방금 납품 완료';
  saveBusinesses();
  await updateBizStockInDB(biz.id, biz.newOil, biz.wasteOil, biz.lastUpdate, biz.oilProducts);

  // 이력 기록
  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  const item = {
    date: dateStr,
    rawDate: now.toISOString(),
    biz: biz.name,
    bizId: biz.id,
    type: '식용유발주',
    content: oilName + ' ' + qty + '캔 납품 완료',
      productKey: productKey || null,
      productName: oilName,
    qty: qty,
    unitPrice: PRICES.oils[oilKey].price,  // 🆕 단가
    amount: (qty * PRICES.oils[oilKey].price).toLocaleString() + '원',
    method: '운반관리자',
    status: 'done',
  };
  historyData.unshift(item);
  saveHistory();
  await saveHistoryToDB(item);

  // 납품 완료 후 해당 업체의 pending 자동발주 이력 → done 처리
  const pendingAuto = historyData.find(h =>
    h.bizId === biz.id && h.type === '식용유발주' && h.status === 'pending'
  );
  if (pendingAuto) {
    pendingAuto.status = 'done';
    saveHistory();
    if (pendingAuto.dbId) {
      db.from('history').update({ status: 'done' }).eq('id', pendingAuto.dbId).then(() => {});
    }
  }

  // 지도 마커 갱신
  if (kakaoMap && mapInitialized) {
    markers.forEach(m => m.overlay.setMap(null));
    infoWindows.forEach(iw => iw.setMap(null));
    markers = []; infoWindows = [];
    businesses.forEach(b => addMarkerToMap(b));
    renderBizList();
  }

  // 이력 데이터 마이그레이션: 유종명 → 실제 품목명
  (function migrateHistoryProductNames() {
    var changed = false;
    var typeToDefault = { '대두유': 'soy_wonju', '카놀라유': 'can_grewell', '옥수수유': 'corn_oilers' };
    historyData.forEach(function(h) {
      if (h.type !== '식용유발주') return;
      // content에 유종명이 포함된 경우 실제 품목명으로 교체
      ['대두유','카놀라유','옥수수유'].forEach(function(typeName) {
        if (h.content && h.content.indexOf(typeName + ' ') === 0) {
          // 해당 업체의 품목 찾기
          var biz = businesses.find(function(b){ return b.id === h.bizId; });
          var prodName = typeName; // 기본값 유지
          if (biz) {
            var prods = getBizProducts(biz);
            var matched = prods.find(function(p){
              return getProductInfo(p.key).type === (typeName === '대두유' ? 'soy' : typeName === '카놀라유' ? 'canola' : 'corn');
            });
            if (matched) prodName = getProductInfo(matched.key).label;
          } else if (typeToDefault[typeName]) {
            prodName = getProductInfo(typeToDefault[typeName]).label;
          }
          if (prodName !== typeName) {
            h.content = h.content.replace(typeName + ' ', prodName + ' ');
            changed = true;
          }
        }
      });
    });
    if (changed) { saveHistory(); console.log('✅ 이력 품목명 마이그레이션 완료'); }
  })();

  updateDashboard();
  updateTabBadges();
  renderDeliveryPanel();
  renderHistory();

  showToast('t1','✅ 납품 완료!', biz.name + ' — ' + oilName + ' ' + qty + '캔 납품 완료');
}

function renderTodayDelivList() {
  const el = document.getElementById('todayDelivList');
  if (!el) return;
  let list = historyData.filter(h =>
    !h.deleted_at &&
    h.type === '식용유발주' && h.status === 'done' && !isAutoAlertOnly(h)
  );
  if (ownerLoggedIn && ownerBizId) {
    list = list.filter(h => String(h.bizId) === String(ownerBizId));
  }
  list = list.sort((a,b) => new Date(b.rawDate||b.date) - new Date(a.rawDate||a.date));
  if (list.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">납품 이력 없음</div>';
    return;
  }
  // 월별 그룹핑
  const groups = {};
  list.forEach(h => {
    const d = h.date || fmtHistDate(h);
    const ym = d.slice(0,7);
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(h);
  });
  el.innerHTML = Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(ym => {
    const items = groups[ym];
    const totalQty = items.reduce((s,h) => s + (h.qty||0), 0);
    const totalAmt = items.reduce((s,h) => {
      const n = parseInt((h.amount||'0').replace(/[^0-9]/g,''));
      return s + (isNaN(n)?0:n);
    }, 0);
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--green-pale);border-radius:10px;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:800;color:var(--green-dark);">${ym.replace('.','-')} 납품</div>
        <div style="font-size:11px;color:var(--green-dark);font-weight:700;">총 ${totalQty}캔 · ${totalAmt.toLocaleString()}원</div>
      </div>
      ${items.map(h => `
      <div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid var(--gray-light);">
        <div style="width:34px;height:34px;background:var(--green-pale);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">🫙</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${h.biz}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:1px;">${h.content}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:800;color:var(--green-dark);">${h.amount}</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px;">${fmtHistDate(h)}</div>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}

// 수거 이력 렌더 (전체, 최신순)
function renderWasteHistList() {
  const el = document.getElementById('wasteHistList');
  if (!el) return;
  let list = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done');
  if (ownerLoggedIn && ownerBizId) {
    list = list.filter(h => String(h.bizId) === String(ownerBizId));
  }
  list = list.sort((a,b) => new Date(b.rawDate||b.date) - new Date(a.rawDate||a.date));
  if (list.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">수거 이력 없음</div>';
    return;
  }
  // 월별 그룹핑
  const groups = {};
  list.forEach(h => {
    const d = h.date || fmtHistDate(h);
    const ym = d.slice(0,7); // "2026.04"
    if (!groups[ym]) groups[ym] = [];
    groups[ym].push(h);
  });
  el.innerHTML = Object.keys(groups).sort((a,b)=>b.localeCompare(a)).map(ym => {
    const items = groups[ym];
    const totalQty = items.reduce((s,h) => s + (h.qty||0), 0);
    const totalAmt = items.reduce((s,h) => {
      const n = parseInt((h.amount||'0').replace(/[^0-9]/g,''));
      return s + (isNaN(n)?0:n);
    }, 0);
    return `<div style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#FFF3E0;border-radius:10px;margin-bottom:8px;">
        <div style="font-size:12px;font-weight:800;color:#D4621A;">${ym.replace('.','-')} 수거</div>
        <div style="font-size:11px;color:#D4621A;font-weight:700;">총 ${totalQty}캔 · ${totalAmt.toLocaleString()}원</div>
      </div>
      ${items.map(h => `
      <div style="display:flex;align-items:center;gap:12px;padding:9px 4px;border-bottom:1px solid var(--gray-light);">
        <div style="width:34px;height:34px;background:#FFF8F0;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">♻️</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${h.biz}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:1px;">${h.content}</div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <div style="font-family:var(--font-display);font-size:13px;font-weight:800;color:#D4621A;">${h.amount}</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px;">${fmtHistDate(h)}</div>
        </div>
      </div>`).join('')}
    </div>`;
  }).join('');
}

// 자동발주 뱃지 업데이트
function updateDeliveryBadge() {
  const autoBiz = businesses.filter(function(b) {
    if (!b.auto) return false;
    return getBizProducts(b).some(function(p){ return (p.qty||0) <= 2; });
  });
  const badge = document.getElementById('sideDeliveryBadge');
  if (badge) {
    badge.textContent = autoBiz.length;
    badge.style.display = autoBiz.length > 0 ? 'inline-block' : 'none';
  }
}


function checkAutoOrder(biz) {
  if (!biz) return;
  if (biz._suppressAutoOrder && Date.now() < biz._suppressAutoOrder) return;
  
  // 🔧 fix v65: 업체별 임계값 사용 (PRICES.thresholds 또는 biz 자체 값)
  var orderThreshold = getAutoOrderThreshold(biz);
  var collectThreshold = getAutoCollectThreshold(biz);
  
  // 🆕 식용유 자동발주 체크 (auto가 false가 아니면 동작)
  if (biz.auto !== false) {
    var prods = getBizProducts(biz);
    var lowProds = prods.filter(function(p){ return (p.qty || 0) <= orderThreshold; });
    if (lowProds.length > 0) {
      var banner = document.getElementById('alertBanner');
      var bannerContent = document.getElementById('alertBannerContent');
      var names = lowProds.map(function(p){ return getProductInfo(p.key).label || '식용유'; }).join(', ');
      if (banner && bannerContent) {
        banner.style.display = 'flex';
        bannerContent.textContent = biz.name + ' — ' + names + ' 재고 부족 (트리거 ' + orderThreshold + '캔 이하)';
        setTimeout(function(){ banner.style.display = 'none'; }, 5000);
      }
      showToast('t1', '⚡ 재고 부족!', biz.name + ' — ' + names + ' ' + orderThreshold + '캔 이하 자동발주 대기');
      
      // 발주 신청 패널 갱신
      var activeId = (document.querySelector('.panel.active') || {}).id || '';
      if (activeId === 'panel-order') renderDeliveryPanel && renderDeliveryPanel();
    }
  }
  
  // 🆕 폐유 자동수거 체크 (autoCollect가 false가 아니면 동작)
  if (biz.autoCollect !== false) {
    if ((biz.wasteOil || 0) >= collectThreshold) {
      var wbanner = document.getElementById('alertBanner');
      var wbannerContent = document.getElementById('alertBannerContent');
      if (wbanner && wbannerContent) {
        wbanner.style.background = '#FFF3E0';
        wbanner.style.display = 'flex';
        wbannerContent.textContent = biz.name + ' — 폐유 ' + biz.wasteOil + '캔 (트리거 ' + collectThreshold + '캔 이상) 수거 대기';
        setTimeout(function(){ wbanner.style.display = 'none'; }, 5000);
      }
      showToast('t1', '♻️ 폐유 수거 가능!', biz.name + ' — ' + collectThreshold + '캔 이상 자동수거 대기');
    }
  }
  
  updateDashboard && updateDashboard();
}

// ===== 업체 등록 =====
var nextBizId = 1;

// ===== 승인 대기 큐 =====
function savePendingBiz() {
  try {
    // localStorage 용량 폭주 방지 — 큰 base64 이미지는 제외하고 메타만 저장
    var slim = pendingBizData.map(function(p) {
      var copy = {};
      for (var k in p) {
        if (!p.hasOwnProperty(k)) continue;
        // 1KB 이상 base64 이미지는 제외 (DB에서 다시 받아옴)
        if (typeof p[k] === 'string' && p[k].length > 1024 && /^data:/.test(p[k])) {
          copy[k] = '__OMITTED_LARGE__';  // 표시만 남김
        } else {
          copy[k] = p[k];
        }
      }
      return copy;
    });
    localStorage.setItem('hiveoil_pending_biz', JSON.stringify(slim));
  } catch(e) {
    console.warn('pending_biz localStorage 저장 실패 — 무시 가능 (DB에서 다시 로드됨):', e.message);
    // quota 초과 시 — pending_biz 키만 비우고 다른 키는 유지
    try { localStorage.removeItem('hiveoil_pending_biz'); } catch(e2) {}
  }
}

function checkPrivacyAndRegister() {
  const privacy = document.getElementById('privacyAgree');
  const terms   = document.getElementById('termsAgree');
  const iscc    = document.getElementById('isccAgree');
  if (privacy && !privacy.checked) {
    showToast('t1','⚠️ 개인정보 동의 필요','개인정보 수집·이용에 동의해주세요.');
    privacy.focus();
    return;
  }
  if (terms && !terms.checked) {
    showToast('t1','⚠️ 이용약관 동의 필요','이용약관에 동의해주세요.');
    terms.focus();
    return;
  }
  if (iscc && !iscc.checked) {
    showToast('t1','⚠️ ISCC 동의 필요','ISCC EU 인증 자료 제공에 동의해주세요.');
    iscc.focus();
    return;
  }
  // 대표자 서명 필수
  if (!_regSigHasContent) {
    showToast('t1','⚠️ 대표자 서명 필요','✍️ 서명 영역에 서명을 입력해주세요.');
    var sigCanvas = document.getElementById('regSignatureCanvas');
    if (sigCanvas) sigCanvas.scrollIntoView({behavior:'smooth', block:'center'});
    return;
  }
  registerBizAndFeedback();
}

async function registerBizAndFeedback() {
  // 🛡️ 중복 클릭 가드 — 즉시 차단 (버튼 상태 바뀌기 전)
  if (window._signupSubmitting) {
    // ⏰ 30초 이상 잠금이 풀리지 않으면 자동 해제 (좀비 락 방지)
    if (window._signupSubmitStartTime && (Date.now() - window._signupSubmitStartTime > 30000)) {
      console.warn('[신청락] 30초 좀비 락 자동 해제');
      window._signupSubmitting = false;
      window._signupSubmitStartTime = null;
    } else {
      showToast('t1','⏳ 처리 중','신청이 이미 진행 중이에요. 잠시만 기다려주세요\n(계속 안 되면 화면을 새로고침해 주세요)');
      return;
    }
  }
  window._signupSubmitting = true;
  window._signupSubmitStartTime = Date.now();

  var btn = document.getElementById('regCompleteBtn');
  var nameEl = document.getElementById('reg_name');
  var bizName = nameEl ? nameEl.value.trim() : '';
  var phoneEl = document.getElementById('reg_phone') || document.getElementById('reg_phone_input');
  var bizPhone = phoneEl ? (phoneEl.value || '').trim() : '';

  // 버튼 처리중 상태
  if (btn) {
    btn.textContent = '⏳ 신청 중...';
    btn.disabled = true;
    btn.style.background = '#888';
  }

  // 🔍 DB 중복 검증 — 같은 업체명 + 전화번호가 이미 pending에 있으면 차단
  // (관리자 모드는 검증 스킵 — 직접 등록이라 의도적 중복 가능)
  if (!isAdminMode && bizName) {
    try {
      var dupQuery = db.from('pending_biz').select('id, name, status').eq('name', bizName);
      if (bizPhone) dupQuery = dupQuery.eq('phone', bizPhone);
      var dupRes = await dupQuery.limit(1);
      if (dupRes.data && dupRes.data.length > 0) {
        var existing = dupRes.data[0];
        // 이미 신청된 상태 (pending 또는 approved)
        window._signupSubmitting = false;
        if (btn) {
          btn.textContent = '⚠️ 이미 신청됨';
          btn.style.background = '#E65100';
          setTimeout(function() {
            btn.innerHTML = '✅ 업체 등록 신청';
            btn.style.background = '';
            btn.disabled = false;
          }, 4000);
        }
        showToast('t1','⚠️ 이미 신청된 업체입니다',
          bizName + ' — 담당자가 곧 연락드릴게요. 같은 업체로 다시 신청하실 필요 없어요.');
        return;
      }
    } catch(e) {
      console.warn('[중복검증] 실패 — 신청은 진행:', e.message);
      // 검증 실패 시에도 신청은 진행 (네트워크 에러로 정상 사용자 막히지 않게)
    }
  }

  // 관리자 모드면 즉시 등록 (기존과 동일)
  if (isAdminMode) {
    registerBiz();
    if (btn) {
      btn.textContent = '✅ 등록 완료!';
      btn.style.background = '#2E7D32';
      setTimeout(function() {
        btn.innerHTML = '✅ 업체 등록 완료';
        btn.style.background = '';
        btn.disabled = false;
      }, 2500);
    }
    window._signupSubmitting = false;
    return;
  }

  // 업주 모드 — 신청 후 감사 화면으로 전환
  // window._pendingSignupResult를 registerBiz()가 채우도록 약속

  // 🛡️ v96 사전 검증 — registerBiz 호출 전에 막음 (타임아웃 자동 성공 우회 방지)
  var preName = (document.getElementById('reg_name') || {value:''}).value.trim();
  var preAddr = (document.getElementById('reg_addr') || {value:''}).value.trim();
  var preLat = parseFloat((document.getElementById('reg_lat') || {value:''}).value);
  var preLng = parseFloat((document.getElementById('reg_lng') || {value:''}).value);
  var preLoginId = (document.getElementById('reg_login_id') || {value:''}).value.trim();
  var preLoginPw = (document.getElementById('reg_login_pw') || {value:''}).value.trim();

  function _failPreCheck(msg) {
    console.warn('[가입 사전검증 실패]', msg);
    window._signupSubmitting = false;
    window._signupSubmitStartTime = null;
    if (btn) {
      btn.innerHTML = '✅ 업체 등록 신청';
      btn.disabled = false;
      btn.style.background = '';
    }
    showToast('t1', '⚠️ ' + msg, '입력하신 후 다시 신청해주세요');
  }

  if (!preLoginId) { _failPreCheck('아이디를 입력해주세요'); return; }
  if (!preLoginPw || preLoginPw.length < 4) { _failPreCheck('비밀번호를 4자리 이상 입력해주세요'); return; }
  if (!preName) { _failPreCheck('업체를 검색해서 선택해주세요'); return; }
  if (!preAddr) { _failPreCheck('업체 주소가 없어요. 업체를 다시 검색해주세요'); return; }
  if (isNaN(preLat) || isNaN(preLng)) { _failPreCheck('업체 좌표가 없어요. 카카오 검색으로 자동 입력해주세요'); return; }

  window._pendingSignupResult = null;
  window._pendingSignupBizName = bizName;
  registerBiz();  // 내부에서 비동기 promise 시작

  // 신청 promise 결과를 기다린 후 감사 화면 띄움 (최대 8초)
  var waitStart = Date.now();
  function _checkResult() {
    var r = window._pendingSignupResult;
    if (r) {
      // 결과 도착
      window._signupSubmitting = false;
      if (r.ok) {
        showSignupThankYou(window._pendingSignupBizName);
      } else {
        // 실패한 경우 - 폼 유지 + 알림
        if (btn) {
          btn.textContent = '⚠️ 다시 시도';
          btn.style.background = '#C0392B';
          btn.disabled = false;
          setTimeout(function() {
            btn.innerHTML = '✅ 업체 등록 신청';
            btn.style.background = '';
          }, 4000);
        }
        showToast('t1','⚠️ 신청 실패', r.message || '잠시 후 다시 시도해주세요');
      }
      window._pendingSignupResult = null;
      return;
    }
    if (Date.now() - waitStart > 8000) {
      // 타임아웃 — 응답 없으면 실패로 간주 (실제로 갔는지 모르므로 사용자에게 명확히 알림)
      console.warn('신청 응답 8초 타임아웃');
      window._signupSubmitting = false;
      if (btn) {
        btn.textContent = '⚠️ 다시 시도';
        btn.style.background = '#C0392B';
        btn.disabled = false;
        setTimeout(function() {
          btn.innerHTML = '✅ 업체 등록 신청';
          btn.style.background = '';
        }, 4000);
      }
      showToast('t1','⚠️ 응답 지연', '네트워크가 느려요. 잠시 후 다시 시도해주세요. (이미 신청됐다면 중복 안 돼요)');
      return;
    }
    setTimeout(_checkResult, 200);
  }
  setTimeout(_checkResult, 300);
}

// 신청 완료 감사 화면 표시
function showSignupThankYou(bizName) {
  var formArea = document.getElementById('signupFormArea');
  var thankYou = document.getElementById('signupThankYou');
  var nameEl = document.getElementById('thankYouBizName');
  if (formArea) formArea.style.display = 'none';
  if (thankYou) {
    if (nameEl) nameEl.textContent = bizName || '신청서';
    thankYou.style.display = 'block';
    // 부드럽게 위로 스크롤
    try {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch(e) { window.scrollTo(0, 0); }
  }
}

// 감사 화면 닫기 + 폼 초기화 + 대시보드로
function closeThankYouAndReset() {
  var formArea = document.getElementById('signupFormArea');
  var thankYou = document.getElementById('signupThankYou');
  if (thankYou) thankYou.style.display = 'none';
  if (formArea) formArea.style.display = 'block';
  // 대시보드로 이동
  if (typeof showPanel === 'function') {
    showPanel('owner-dash');
  }
}

function registerBiz() {
  const name     = document.getElementById('reg_name').value.trim();
  const type     = document.getElementById('reg_type').value;
  const owner    = document.getElementById('reg_owner').value.trim();
  const phone    = document.getElementById('reg_phone').value.trim() || (document.getElementById('reg_phone_input')||{value:''}).value.trim();
  const addr     = document.getElementById('reg_addr').value.trim();
  const lat      = parseFloat(document.getElementById('reg_lat').value);
  const lng      = parseFloat(document.getElementById('reg_lng').value);
  // 품목별 재고 수집
  const regProducts = [];
  document.querySelectorAll('.reg-product-row').forEach(function(row) {
    var sel = row.querySelector('.reg-prod-select');
    var key = sel ? sel.value : row.dataset.key;  // select value 직접 읽기
    var qty = parseInt(row.querySelector('.reg-prod-qty').value) || 0;
    if (key && qty >= 0) regProducts.push({ key: key, qty: qty });
  });
  const newOil = regProducts.reduce(function(s, p) { return s + p.qty; }, 0) || parseInt(document.getElementById('reg_newOil_fallback')?.value) || 0;
  const wasteOil = parseInt(document.getElementById('reg_wasteOil').value) || 0;
  const autoOn   = !!document.getElementById('regAutoCheckbox')?.checked;
  const autoQty  = parseInt(document.getElementById('reg_autoQty')?.value) || 5;
  // 🆕 자동 임계값
  const autoOrderThreshold   = parseInt(document.getElementById('reg_autoTrigger')?.value) || 2;
  const collectOn            = !!document.getElementById('regCollectCheckbox')?.checked;
  const autoCollectThreshold = parseInt(document.getElementById('reg_collectTrigger')?.value) || 2;
  const oiltype = regProducts.length > 0 ? (getProductInfo(regProducts[0].key).type === 'canola' ? '카놀라유' : getProductInfo(regProducts[0].key).type === 'corn' ? '옥수수유' : '대두유') : '대두유';
  const loginId  = (document.getElementById('reg_login_id') || {value:''}).value.trim();
  const loginPw  = (document.getElementById('reg_login_pw') || {value:''}).value.trim();

  // 업주가 신청할 때 ID/PW 필수
  if (!isAdminMode) {
    if (!loginId) { 
      showToast('t1','⚠️ 아이디 필요','로그인 아이디를 입력해주세요'); 
      window._pendingSignupResult = { ok: false, message: '로그인 아이디를 입력해주세요' };
      return; 
    }
    if (!loginPw || loginPw.length < 4) { 
      showToast('t1','⚠️ 비밀번호 필요','비밀번호를 4자리 이상 입력해주세요'); 
      window._pendingSignupResult = { ok: false, message: '비밀번호를 4자리 이상 입력해주세요' };
      return; 
    }
  }

  if (!name) { 
    showToast('t1','⚠️ 업체를 검색해서 선택해주세요','위 검색창에서 상호명으로 검색하세요'); 
    window._pendingSignupResult = { ok: false, message: '업체를 검색해서 선택해주세요' };
    return; 
  }
  if (!addr) { 
    showToast('t1','⚠️ 업체를 검색해서 선택해주세요','위 검색창에서 상호명으로 검색하세요'); 
    window._pendingSignupResult = { ok: false, message: '주소가 없어요. 업체를 다시 검색해주세요' };
    return; 
  }
  if (isNaN(lat) || isNaN(lng)) { 
    showToast('t1','⚠️ 업체를 검색해서 선택해주세요','카카오 검색으로 좌표를 자동 입력해주세요'); 
    window._pendingSignupResult = { ok: false, message: '좌표가 없어요. 카카오 검색으로 자동 입력해주세요' };
    return; 
  }

  // 🆕 v130: 프랜차이즈 가맹점 정보 수집
  var tenantTypeRadio = document.querySelector('input[name="reg_tenant_type"]:checked');
  var tenantType = tenantTypeRadio ? tenantTypeRadio.value : 'individual';
  var franchiseBrandId = null;
  var storeCode = null;
  if (tenantType === 'franchise_store') {
    franchiseBrandId = (document.getElementById('reg_brand_id') || {value:''}).value.trim();
    storeCode = (document.getElementById('reg_store_code') || {value:''}).value.trim();
    if (!franchiseBrandId) {
      showToast('t1','⚠️ 브랜드 선택','소속 브랜드를 선택해주세요');
      window._pendingSignupResult = { ok: false, message: '소속 브랜드를 선택해주세요' };
      return;
    }
  }

  // 희망배송요일/휴무일 수집
  var deliveryDays = Array.from(document.querySelectorAll('.day-btn.selected')).map(function(b){ return b.dataset.day; });
  var closedDays = Array.from(document.querySelectorAll('.closed-btn.selected')).map(function(b){ return b.dataset.day; });
  const bizData = { name, type, owner, phone, addr, lat, lng, newOil, wasteOil, oiltype, auto: autoOn, autoQty,
    autoOrderThreshold,
    autoCollect: collectOn,
    autoCollectThreshold,
    oilProducts: regProducts.length > 0 ? regProducts : null,
    deliveryDays: deliveryDays.length > 0 ? deliveryDays : null,
    closedDays: closedDays.length > 0 ? closedDays : null,
    // 🆕 v130: 프랜차이즈 정보
    tenantType: tenantType,
    franchiseBrandId: franchiseBrandId,
    storeCode: storeCode };

  // 관리자: 즉시 등록 / 업주: 승인 대기 큐
  if (isAdminMode) {
    const newBiz = { id: nextBizId++, ...bizData, maxNew: 10, lastUpdate: '방금 등록' };
    saveBizToDB(newBiz).then(() => {
      businesses.push(newBiz);
      saveBusinesses();
      renderRegBizList();
      updateDashboard();
      updateTabBadges();
      if (kakaoMap && mapInitialized) addMarker(newBiz);
    });
    showToast('t1','✅ 업체 등록 완료!', name + ' — 지도에 핀이 추가됐어요');
  } else {
    // 승인 대기 큐 — Supabase에 저장
    const now = new Date();
    const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
    // 동의 정보 수집
    var isccAgreedVal = !!(document.getElementById('isccAgree') && document.getElementById('isccAgree').checked);
    var marketingAgreedVal = !!(document.getElementById('marketingAgree') && document.getElementById('marketingAgree').checked);
    var ownerSigDataUrl = (typeof getRegSignatureDataUrl === 'function') ? getRegSignatureDataUrl() : null;
    const pendingRow = {
      id: Date.now(),
      name, type, owner, phone, addr, lat, lng,
      new_oil: newOil,
      oil_products: regProducts.length > 0 ? JSON.stringify(regProducts) : null, waste_oil: wasteOil,
      oil_type: oiltype, auto: autoOn,
      auto_order_threshold: autoOrderThreshold,
      auto_collect: collectOn,
      auto_collect_threshold: autoCollectThreshold,
      status: 'pending', request_date: dateStr,
      cert_image: regCertBase64 || null,
      login_id: loginId || null,
      login_pw: loginPw || null,
      delivery_days: deliveryDays.length > 0 ? JSON.stringify(deliveryDays) : null,
      closed_days: closedDays.length > 0 ? JSON.stringify(closedDays) : null,
      bank_image: window.regBankBase64 || null,
      iscc_agreed: isccAgreedVal,
      marketing_agreed: marketingAgreedVal,
      owner_signature: ownerSigDataUrl,
      // 🆕 v130: 프랜차이즈 정보
      tenant_type: tenantType,
      franchise_brand_id: franchiseBrandId,
      store_code: storeCode
    };
    // Supabase에 저장 (관리자가 다른 기기에서도 볼 수 있도록)
    // 새 컬럼(iscc_agreed, marketing_agreed)이 DB에 없을 수 있으니 실패 시 빼고 재시도
    function _insertPendingBiz(row) {
      // 진단 로그 - 모바일에서 어떤 데이터가 INSERT 되는지 확인
      try {
        var payloadSize = JSON.stringify(row).length;
        console.log('🚀 [pending_biz INSERT 시도]', {
          name: row.name, type: row.type, owner: row.owner, phone: row.phone,
          has_business_license: !!row.business_license,
          has_bank_image: !!row.bank_image,
          has_owner_signature: !!row.owner_signature,
          payload_size_kb: Math.round(payloadSize / 1024) + 'KB',
          fields: Object.keys(row).join(', ')
        });
        // 너무 크면 경고 (Supabase는 row 사이즈 제한 있음)
        if (payloadSize > 5 * 1024 * 1024) {
          console.warn('⚠️ payload가 5MB를 초과합니다. 이미지 압축 필요!');
        }
      } catch(e) {}
      // 어떤 컬럼이 없든 에러 메시지에서 자동 추출해서 제거 후 재시도
      function _extractMissingCol(msg) {
        if (!msg) return null;
        // PostgREST 에러: "Could not find the 'COLUMN' column of"
        var m1 = msg.match(/Could not find the ['"]([^'"]+)['"] column/);
        if (m1) return m1[1];
        // PostgreSQL 에러: column "COLUMN" of relation "TABLE" does not exist
        var m2 = msg.match(/column ['"]([^'"]+)['"]/i);
        if (m2) return m2[1];
        // PostgreSQL 에러2: column COLUMN does not exist
        var m3 = msg.match(/column (\w+) does not exist/i);
        if (m3) return m3[1];
        return null;
      }

      var removedCols = [];
      function _attempt(payload, depth) {
        if (depth > 30) {
          // 무한루프 방지
          return Promise.resolve({ error: { message: '재시도 한도 초과 (제거된 컬럼: ' + removedCols.join(', ') + ')' } });
        }
        return db.from('pending_biz').insert(payload).then(function(res){
          if (!res.error) {
            console.log('✅ pending_biz DB 저장 성공:', payload.name, '(시도 횟수:', depth+1, ')');
            // 🚨 핵심 컬럼이 빠진 채 성공했으면 — 경고 + 관리자에게 표시
            var critical = ['login_id', 'login_pw'];
            var missingCritical = removedCols.filter(function(c){ return critical.indexOf(c) >= 0; });
            if (missingCritical.length > 0) {
              console.error('🚨 [심각] 핵심 컬럼이 누락된 채 저장됨:', missingCritical.join(', '));
              console.error('🚨 사용자가 입력한 ID/PW가 손실됐어요!');
              // 화면 상단에 빨간 경고 배너 표시 (관리자만)
              try {
                var warn = document.getElementById('criticalDbWarning');
                if (!warn) {
                  warn = document.createElement('div');
                  warn.id = 'criticalDbWarning';
                  warn.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#C0392B;color:#fff;padding:14px 20px;z-index:99999;font-size:13px;font-weight:700;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.2);';
                  warn.innerHTML = '🚨 DB 컬럼 누락! 회원가입 ID/PW가 저장되지 않습니다. <button onclick="this.parentElement.remove()" style="margin-left:10px;background:#fff;color:#C0392B;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;">닫기</button><br><span style="font-size:11px;font-weight:400;opacity:0.9;">Supabase SQL Editor에서 다음 실행 필요: ALTER TABLE pending_biz ADD COLUMN IF NOT EXISTS login_id TEXT; ALTER TABLE pending_biz ADD COLUMN IF NOT EXISTS login_pw TEXT;</span>';
                  document.body.appendChild(warn);
                }
              } catch(e) {}
            }
            if (removedCols.length > 0) {
              console.warn('💡 다음 컬럼이 pending_biz 테이블에 없어서 제외했어요:', removedCols.join(', '));
              console.warn('💡 SQL로 추가 권장: ' + removedCols.map(function(c){
                return 'ALTER TABLE pending_biz ADD COLUMN IF NOT EXISTS ' + c + ' ' + (c.indexOf('agreed') >= 0 ? 'BOOLEAN' : 'TEXT') + ';';
              }).join('\n'));
            }
            return res;
          }
          var msg = res.error.message || '';
          console.log('🔴 pending_biz INSERT 시도', depth+1, '실패:', msg);
          var missingCol = _extractMissingCol(msg);
          if (missingCol) {
            // payload에 그 키가 있든 없든 강제로 제거 (방어적)
            console.warn('🟡 pending_biz: "' + missingCol + '" 컬럼 없음 — 제외 후 재시도');
            removedCols.push(missingCol);
            var fallback = Object.assign({}, payload);
            delete fallback[missingCol];
            return _attempt(fallback, depth + 1);
          }
          // 컬럼 추출 실패 또는 다른 에러 → 로컬 백업
          console.warn('pending_biz DB 저장 실패 (컬럼 추출 불가), 로컬 백업:', msg);
          pendingBizData.unshift(Object.assign({}, row, { requestDate: dateStr }));
          savePendingBiz();
          return res;
        });
      }
      return _attempt(row, 0);
    }

    // payload 사이즈 사전 검증 — 너무 크면 사용자에게 안내
    try {
      var _ps = JSON.stringify(pendingRow).length;
      var _psMB = (_ps / 1024 / 1024).toFixed(2);
      console.log('📦 [회원가입] 최종 payload 사이즈:', _psMB + 'MB');
      if (_ps > 4 * 1024 * 1024) {
        // 4MB 넘으면 경고
        var go = confirm('⚠️ 첨부 파일 용량이 너무 큽니다 (' + _psMB + 'MB)\n\n' +
                         '신청이 실패할 수 있어요. 그래도 진행하시겠어요?\n\n' +
                         '권장: 사진을 다시 찍거나 갤러리에서 작은 파일을 선택해주세요.');
        if (!go) {
          window._pendingSignupResult = { ok: false, message: '용량 초과로 취소됨' };
          if (document.getElementById('regCompleteBtn')) {
            var b = document.getElementById('regCompleteBtn');
            b.textContent = '✅ 업체 등록 신청';
            b.disabled = false;
            b.style.background = '';
          }
          return;
        }
      }
    } catch(e) {}

    // INSERT 결과에 따라 명확한 토스트 + 알림
    _insertPendingBiz(pendingRow).then(function(res) {
      if (res && !res.error) {
        showToast('t1','✅ 등록 신청 완료!', name + ' — 관리자에게 전달됐어요. 승인 후 서비스가 시작돼요.');
        window._pendingSignupResult = { ok: true };
        // 🆕 관리자에게 알림
        try {
          addNotif({
            type: 'register',
            target: 'admin',
            title: '🆕 신규 회원가입 신청',
            body: name + ' (' + (type || '업종 미지정') + ') 가입 승인 대기',
            link: 'admin'
          });
        } catch(e) { console.warn('회원가입 알림 실패:', e.message); }
      } else {
        var emsg = (res && res.error && res.error.message) || '알 수 없는 오류';
        showToast('t1','⚠️ DB 저장 실패 — 로컬 백업됨', '관리자에게 직접 알려주세요. 사유: ' + emsg.slice(0, 80));
        console.error('🔴 [pending_biz INSERT 실패]', res && res.error);
        // ⚠️ 모바일에서 토스트 안 보일 수 있으므로 명확한 alert도 추가
        try {
          alert('⚠️ 신청이 정상 처리되지 않았어요.\n\n' +
                '인터넷이 잠깐 끊긴 것 같습니다. 아래 정보를 확인해주세요:\n\n' +
                '· 사유: ' + emsg.slice(0, 100) + '\n\n' +
                '잠시 후 다시 시도하시거나,\n담당자에게 직접 연락 부탁드립니다.\n📞 033-XXX-XXXX');
        } catch(e) {}
        window._pendingSignupResult = { ok: false, message: emsg };
      }
    }).catch(function(e) {
      showToast('t1','⚠️ 네트워크 오류', '인터넷 연결을 확인하고 다시 시도해주세요.');
      console.error('🔴 [pending_biz 예외]', e);
      try {
        alert('⚠️ 인터넷 연결 오류\n\n신청을 처리할 수 없어요.\nWi-Fi나 모바일 데이터 연결을 확인하고 다시 시도해주세요.\n\n계속 안 되면 담당자에게 직접 연락 부탁드립니다.\n📞 033-XXX-XXXX');
      } catch(ex) {}
      window._pendingSignupResult = { ok: false, message: '네트워크 오류 — 인터넷 연결을 확인해주세요' };
    });
  }
  clearRegForm();
}


// ============================================================
// 운반자 계정 관리
// ============================================================
var driverAccounts = JSON.parse(localStorage.getItem('hiveoil_drivers') || '[]');
function saveDriverAccounts() { try { localStorage.setItem('hiveoil_drivers', JSON.stringify(driverAccounts)); } catch(e) {} }

// 운반자 계정 로드 from DB
async function loadDriverAccountsFromDB() {
  if (!db || typeof db.from !== 'function') return;
  try {
    var r = await db.from('app_settings').select('value').eq('key','driver_accounts').single();
    if (r.data && r.data.value) {
      driverAccounts = JSON.parse(r.data.value);
      saveDriverAccounts();
    }
  } catch(e) {}
}

function updateDriverPendingBadge() {
  var badge = document.getElementById('driverPendingBadge');
  if (!badge) return;
  var pending = driverAccounts.filter(function(d){ return !d.approved; }).length;
  badge.style.display = pending > 0 ? 'inline-block' : 'none';
  badge.textContent = '승인대기 ' + pending + '명';
}

function saveDriverAccountsToDB() {
  _saveSettingToDB('driver_accounts', JSON.stringify(driverAccounts));
}

// 운반자 로그인 확인 (🔐 v105: 해시 기반)
async function checkDriverLogin(id, pw) {
  if (!id || !pw) return null;
  // 마이그레이션 확인
  await migrateDriverAccountsIfNeeded();
  var inputHash = await sha256Hash(pw);
  var found = driverAccounts.find(function(d){
    if (d.id !== id) return false;
    if (d.approved === false) return false;
    if (d.active === false) return false;
    return d.pwHash === inputHash;
  });
  return found || null;
}

// 운반자 회원가입 신청 (로그인 화면에서)
function submitDriverJoin() {
  var id  = (document.getElementById('driverJoinId')  || {value:''}).value.trim();
  var pw  = (document.getElementById('driverJoinPw')  || {value:''}).value.trim();
  var name= (document.getElementById('driverJoinName')|| {value:''}).value.trim();
  var phone=(document.getElementById('driverJoinPhone')|| {value:''}).value.trim();
  if (!id || !pw || !name) { showToast('t1','⚠️ 필수 입력','아이디·비밀번호·이름을 모두 입력해주세요'); return; }
  if (pw.length < 4) { showToast('t1','⚠️','비밀번호는 4자리 이상이어야 해요'); return; }
  var dup = driverAccounts.find(function(d){ return d.id === id; });
  if (dup) { showToast('t1','⚠️ 중복 아이디','이미 사용 중인 아이디예요'); return; }
  var newDriver = { id:id, pw:pw, name:name, phone:phone||'', approved:false, joinDate: new Date().toISOString().slice(0,10) };
  // DB에서 최신 목록 먼저 읽어온 후 추가 (다기기 덮어쓰기 방지)
  loadDriverAccountsFromDB().then(function() {
    var dup2 = driverAccounts.find(function(d){ return d.id === id; });
    if (dup2) { showToast('t1','⚠️ 중복 아이디','이미 사용 중인 아이디예요'); return; }
    driverAccounts.push(newDriver);
    saveDriverAccounts();
    saveDriverAccountsToDB();
    updateDriverPendingBadge();
    showToast('t1','✅ 신청 완료!','관리자 승인 후 로그인할 수 있어요');
    ['driverJoinId','driverJoinPw','driverJoinName','driverJoinPhone'].forEach(function(eid){ var el=document.getElementById(eid); if(el) el.value=''; });
    toggleDriverJoinForm(false);
  });
  return; // 아래 폼 초기화 코드를 스킵 (위에서 처리)
  // 폼 초기화
  ['driverJoinId','driverJoinPw','driverJoinName','driverJoinPhone'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  toggleDriverJoinForm(false);
}

function approveDriver(id) {
  var d = driverAccounts.find(function(x){ return x.id === id; });
  if (!d) return;
  d.approved = true;
  saveDriverAccounts();
  saveDriverAccountsToDB();
  renderDriverAccounts();
  showToast('t1','✅ 승인 완료',d.name + ' 운반자 계정이 활성화됐어요');
}

function deleteDriver(id) {
  if (!confirm('이 운반자 계정을 삭제할까요?')) return;
  driverAccounts = driverAccounts.filter(function(d){ return d.id !== id; });
  saveDriverAccounts();
  saveDriverAccountsToDB();
  renderDriverAccounts();
  showToast('t1','🗑️ 삭제 완료','운반자 계정이 삭제됐어요');
}

// ============================================================
// 🆕 드라이버 주간 일정 (월~일)
// ============================================================
window._scheduleWeekOffset = 0;  // 0: 이번 주, -1: 이전 주, +1: 다음 주
window._scheduleNotes = JSON.parse(localStorage.getItem('hiveoil_schedule_notes') || '{}'); // { '2026-W18-mon-driver1': '메모' }

function changeScheduleWeek(delta) {
  if (typeof window._scheduleWeekOffset !== 'number') window._scheduleWeekOffset = 0;
  if (delta === 0) window._scheduleWeekOffset = 0;
  else window._scheduleWeekOffset += delta;
  renderDriverSchedule();
}

// 드라이버 select 채우기
function populateScheduleDriverSelect() {
  var sel = document.getElementById('scheduleDriverSelect');
  if (!sel) return;
  // 드라이버 계정 목록 (driver_accounts 테이블) — pending_biz와 별도
  // 우선 historyData에서 drivers 가져오기 (간단히)
  var drivers = JSON.parse(localStorage.getItem('hiveoil_drivers') || '[]');
  var html = '<option value="">전체 드라이버</option>';
  drivers.forEach(function(d) {
    if (d.status === 'approved' || !d.status) {
      html += '<option value="' + d.id + '">🚛 ' + (d.name || d.login_id) + '</option>';
    }
  });
  // 운반자가 1명도 없으면 기본
  if (drivers.length === 0) {
    html += '<option value="default">🚛 기본 드라이버</option>';
  }
  sel.innerHTML = html;
}

// 주의 시작일(월요일) 계산 (offset 적용)
function _getWeekStart(offset) {
  var d = new Date();
  d.setDate(d.getDate() + (offset || 0) * 7);
  var day = d.getDay(); // 0=일, 1=월
  var mondayOffset = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + mondayOffset);
  d.setHours(0,0,0,0);
  return d;
}

function _formatDateYMD(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function _formatDateShort(d) {
  return (d.getMonth()+1) + '/' + d.getDate();
}
function _isoWeekKey(d) {
  // 간단히 YYYY-Wxx 형식
  var year = d.getFullYear();
  var firstDay = new Date(year, 0, 1);
  var weekNum = Math.ceil((((d - firstDay) / 86400000) + firstDay.getDay() + 1) / 7);
  return year + '-W' + String(weekNum).padStart(2,'0');
}

function renderDriverSchedule() {
  // 🛡️ 안전 초기화 (호출 시점에 전역이 아직 안 잡혔을 수 있음)
  if (typeof window._scheduleWeekOffset !== 'number') window._scheduleWeekOffset = 0;
  if (!window._scheduleNotes || typeof window._scheduleNotes !== 'object') {
    try { window._scheduleNotes = JSON.parse(localStorage.getItem('hiveoil_schedule_notes') || '{}') || {}; }
    catch(e) { window._scheduleNotes = {}; }
  }

  populateScheduleDriverSelect();

  var grid = document.getElementById('driverScheduleGrid');
  var rangeEl = document.getElementById('scheduleWeekRange');
  var summaryEl = document.getElementById('scheduleSummary');
  if (!grid) return;

  var weekStart = _getWeekStart(window._scheduleWeekOffset);
  var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  var weekKey = _isoWeekKey(weekStart);

  if (rangeEl) {
    var label = window._scheduleWeekOffset === 0 ? '이번 주' : (window._scheduleWeekOffset < 0 ? Math.abs(window._scheduleWeekOffset) + '주 전' : window._scheduleWeekOffset + '주 후');
    rangeEl.innerHTML = '📅 <span style="color:var(--green-main);">' + _formatDateShort(weekStart) + '</span> (월) ~ <span style="color:var(--green-main);">' + _formatDateShort(weekEnd) + '</span> (일) · <span style="background:var(--green-pale);color:var(--green-dark);padding:2px 8px;border-radius:6px;font-size:11.5px;margin-left:5px;">' + label + '</span>';
  }

  var driverFilter = (document.getElementById('scheduleDriverSelect') || {}).value || '';
  var dayLabels = ['월', '화', '수', '목', '금', '토', '일'];
  var dayShortLabels = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  // 🆕 v144: 차분한 톤다운 색상 팔레트
  var dayColors = ['#3F51B5', '#2E7D32', '#F57C00', '#7B1FA2', '#C62828', '#0288D1', '#D81B60'];

  // 주간 일정 데이터: pending 상태 이력만 (방문 예정 + 아직 완료 안 됨)
  var weekHistories = (historyData || []).filter(function(h) {
    if (!h.visitDate || h.deleted_at) return false;
    if (h.status !== 'pending') return false;
    var vd = new Date(h.visitDate);
    return vd >= weekStart && vd <= new Date(weekEnd.getTime() + 86399999);
  });

  // 요일별 그룹핑
  var byDay = {};
  for (var i = 0; i < 7; i++) byDay[i] = [];
  weekHistories.forEach(function(h) {
    var vd = new Date(h.visitDate);
    var dayIdx = vd.getDay();
    dayIdx = dayIdx === 0 ? 6 : dayIdx - 1; // 월=0, 일=6
    byDay[dayIdx].push(h);
  });

  // 🆕 v144: 주간 요약 KPI
  var totalVisits = weekHistories.length;
  var totalCollect = weekHistories.filter(function(h){ return h.type === '폐유수거'; }).length;
  var totalDeliver = weekHistories.filter(function(h){ return h.type === '식용유발주'; }).length;
  var busyDays = Object.keys(byDay).filter(function(k){ return byDay[k].length > 0; }).length;

  if (summaryEl) {
    var _kpi = function(label, value, sub, color, bg) {
      return '<div style="background:' + bg + ';border-radius:12px;padding:14px 18px;border-left:4px solid ' + color + ';box-shadow:var(--shadow);">'
        + '<div style="font-size:11px;color:#555;font-weight:700;letter-spacing:-0.01em;">' + label + '</div>'
        + '<div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:' + color + ';margin-top:4px;">' + value + '</div>'
        + '<div style="font-size:10.5px;color:var(--gray);margin-top:2px;">' + sub + '</div>'
        + '</div>';
    };
    summaryEl.innerHTML = ''
      + _kpi('🗓️ 총 방문', totalVisits + '건', busyDays + '일 분산', 'var(--green-dark)', '#fff')
      + _kpi('♻️ 폐유 수거', totalCollect + '건', totalVisits ? Math.round(totalCollect/totalVisits*100) + '%' : '0%', '#D4621A', '#FFF8F0')
      + _kpi('📦 식용유 발주', totalDeliver + '건', totalVisits ? Math.round(totalDeliver/totalVisits*100) + '%' : '0%', '#185FA5', '#EEF4FF')
      + _kpi('📭 빈 요일', (7 - busyDays) + '일', busyDays + '/7 운영', '#888', '#FAFAFA');
  }

  // 그리드 컨테이너 스타일 - PC 7열, 모바일 세로
  grid.style.cssText = 'display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:14px;';
  // 모바일에서는 미디어쿼리로 1열 처리 (style 태그에 정의)
  grid.className = 'driver-schedule-grid';

  var html = '';
  var todayYMD = _formatDateYMD(new Date());

  for (var d = 0; d < 7; d++) {
    var date = new Date(weekStart); date.setDate(weekStart.getDate() + d);
    var dateYMD = _formatDateYMD(date);
    var items = byDay[d];
    var notesKey = weekKey + '-' + dayLabels[d] + '-' + (driverFilter || 'all');
    var memo = window._scheduleNotes[notesKey] || '';
    var isToday = todayYMD === dateYMD;
    var dayColor = dayColors[d];

    // 카드 시작
    html += '<div style="background:#fff;border-radius:12px;box-shadow:var(--shadow);overflow:hidden;border:' + (isToday ? '2px solid ' + dayColor : '1px solid var(--gray-light)') + ';display:flex;flex-direction:column;min-height:280px;">';

    // 요일 헤더 (컴팩트)
    html += '<div style="background:' + dayColor + ';color:#fff;padding:11px 14px;">';
    html += '<div style="display:flex;align-items:center;justify-content:space-between;">';
    html += '<div>';
    html += '<div style="font-family:var(--font-display);font-size:15px;font-weight:800;line-height:1;">' + dayLabels[d];
    if (isToday) html += '<span style="background:rgba(255,255,255,0.3);border-radius:4px;padding:1px 5px;font-size:8.5px;font-weight:800;margin-left:5px;vertical-align:middle;">TODAY</span>';
    html += '</div>';
    html += '<div style="font-size:10.5px;opacity:0.85;margin-top:3px;font-weight:600;">' + _formatDateShort(date).replace('20', '\'') + '</div>';
    html += '</div>';
    html += '<div style="background:rgba(0,0,0,0.18);border-radius:11px;padding:3px 9px;font-size:11px;font-weight:800;line-height:1;">' + items.length + '</div>';
    html += '</div>';
    html += '</div>';

    // 일정 카드들 (컴팩트)
    html += '<div style="flex:1;padding:10px;display:flex;flex-direction:column;gap:7px;min-height:0;">';
    if (items.length === 0) {
      html += '<div style="text-align:center;font-size:11px;color:#BBB;padding:24px 8px;background:#FAFAFA;border-radius:8px;border:1px dashed #E0E0E0;flex:1;display:flex;align-items:center;justify-content:center;">방문 일정 없음</div>';
    } else {
      items.forEach(function(h) {
        var typeIcon = h.type === '폐유수거' ? '♻️' : '📦';
        var typeColor = h.type === '폐유수거' ? '#D4621A' : '#185FA5';
        var typeBg = h.type === '폐유수거' ? '#FFF8F0' : '#EEF4FF';
        var prodLabel = h.productName || (h.type === '폐유수거' ? '폐유' : '식용유');
        var bizShort = (h.biz || '업체');
        if (bizShort.length > 9) bizShort = bizShort.slice(0, 9) + '…';
        html += '<div style="background:' + typeBg + ';border-radius:7px;padding:9px 10px;border-left:3px solid ' + typeColor + ';">';
        html += '<div style="font-size:12px;font-weight:800;color:#333;line-height:1.3;" title="' + (h.biz || '') + '">' + typeIcon + ' ' + bizShort + '</div>';
        html += '<div style="font-size:10.5px;color:' + typeColor + ';font-weight:700;margin-top:4px;line-height:1.2;">' + prodLabel + ' ' + (h.qty || 0) + '캔</div>';
        if (h.amount) html += '<div style="font-size:10px;color:#666;font-weight:600;margin-top:2px;line-height:1.2;">' + h.amount + '</div>';
        html += '</div>';
      });
    }
    html += '</div>';

    // 메모 토글 영역
    var memoSafe = memo.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    var hasMemo = !!memo;
    html += '<div style="border-top:1px dashed var(--gray-light);padding:8px 10px;background:#FAFBF9;">';
    if (hasMemo) {
      // 메모 있음 → 텍스트 표시 + 수정 가능
      html += '<div style="display:flex;align-items:flex-start;gap:6px;">';
      html += '<div style="font-size:11px;flex-shrink:0;margin-top:1px;">📝</div>';
      html += '<input type="text" value="' + memoSafe + '" placeholder="메모"';
      html += ' onchange="saveScheduleNote(\'' + notesKey + '\', this.value); renderDriverSchedule();"';
      html += ' style="flex:1;min-width:0;padding:5px 7px;border:1px solid #DDD;border-radius:6px;font-size:11px;font-family:var(--font-body);background:#fff;">';
      html += '</div>';
    } else {
      // 메모 없음 → [+ 메모] 버튼
      html += '<button onclick="(function(b){var inp=document.createElement(\'input\');inp.type=\'text\';inp.placeholder=\'메모\';inp.style.cssText=\'width:100%;padding:5px 7px;border:1px solid #DDD;border-radius:6px;font-size:11px;font-family:var(--font-body);background:#fff;\';inp.onchange=function(){saveScheduleNote(\'' + notesKey + '\',this.value);renderDriverSchedule();};b.replaceWith(inp);inp.focus();})(this)" style="width:100%;background:transparent;border:1px dashed #CCC;border-radius:6px;padding:6px;font-size:11px;color:#888;cursor:pointer;font-family:inherit;">+ 메모 추가</button>';
    }
    html += '</div>';

    html += '</div>';
  }

  grid.innerHTML = html;
}

function saveScheduleNote(key, value) {
  if (!window._scheduleNotes || typeof window._scheduleNotes !== 'object') window._scheduleNotes = {};
  window._scheduleNotes[key] = value;
  try { localStorage.setItem('hiveoil_schedule_notes', JSON.stringify(window._scheduleNotes)); } catch(e) {}
}

function renderDriverAccounts() {
  var el = document.getElementById('driverAccountsList');
  if (!el) return;
  if (driverAccounts.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">등록된 드라이버가 없어요</div>';
    return;
  }
  el.innerHTML = driverAccounts.map(function(d) {
    var isActive = d.active !== false;
    var isApproved = d.approved;
    var statusBadge, statusColor;
    if (!isApproved) { statusBadge = '⏳ 대기'; statusColor = '#FFF3E0;color:#D4621A'; }
    else if (!isActive) { statusBadge = '🔒 비활성'; statusColor = '#FFEBEE;color:#C62828'; }
    else { statusBadge = '✅ 활성'; statusColor = 'var(--green-pale);color:var(--green-dark)'; }

    var actions = '';
    if (!isApproved) {
      actions += '<button data-id="' + d.id + '" onclick="approveDriver(this.dataset.id)" style="background:var(--green-main);border:none;border-radius:6px;padding:5px 10px;font-size:11px;font-weight:700;cursor:pointer;color:#fff;font-family:var(--font-body);">승인</button>';
    } else {
      actions += '<button data-id="' + d.id + '" onclick="adminResetDriverPw(this.dataset.id)" title="비밀번호 리셋" style="background:#FFF3E0;border:1px solid #FFB74D;border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;color:#E65100;font-family:var(--font-body);font-weight:700;">🔑 PW</button>';
      actions += '<button data-id="' + d.id + '" onclick="adminToggleDriverActive(this.dataset.id)" title="' + (isActive?'비활성화':'활성화') + '" style="background:' + (isActive?'#E3F2FD':'#E8F5E9') + ';border:1px solid ' + (isActive?'#90CAF9':'#A5D6A7') + ';border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;color:' + (isActive?'#1565C0':'#2E7D32') + ';font-family:var(--font-body);font-weight:700;">' + (isActive?'🔒':'✅') + '</button>';
    }
    actions += '<button data-id="' + d.id + '" onclick="adminDeleteDriver(this.dataset.id)" title="삭제" style="background:#FFEBEE;border:1px solid #FFCDD2;border-radius:6px;padding:5px 8px;font-size:11px;cursor:pointer;color:var(--red-accent);font-family:var(--font-body);font-weight:700;">🗑️</button>';

    return '<div style="display:flex;align-items:center;gap:8px;padding:11px 13px;background:var(--white);border-radius:10px;margin-bottom:7px;border:1px solid var(--gray-light);' + (!isActive ? 'opacity:0.65;' : '') + '">'
      + '<div style="width:34px;height:34px;background:' + (isApproved && isActive ? '#185FA5' : '#999') + ';border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">🚛</div>'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:13px;font-weight:700;color:#0F2419;">' + escapeHtmlSafe(d.name) + ' <span style="font-size:10.5px;color:var(--gray);font-weight:500;">@' + escapeHtmlSafe(d.id) + '</span></div>'
      + '<div style="font-size:10.5px;color:var(--gray);margin-top:1px;">' + (escapeHtmlSafe(d.phone)||'전화 없음') + ' · 가입 ' + (d.joinDate||'?') + '</div>'
      + '</div>'
      + '<span style="background:' + statusColor + ';border-radius:6px;padding:3px 8px;font-size:10px;font-weight:700;white-space:nowrap;">' + statusBadge + '</span>'
      + '<div style="display:flex;gap:4px;flex-shrink:0;">' + actions + '</div>'
      + '</div>';
  }).join('');
}

// HTML 안전 인코딩 (드라이버명 등에 특수문자 대비)
function escapeHtmlSafe(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
  });
}

function toggleDriverJoinForm(show) {
  var f = document.getElementById('driverJoinForm');
  var b = document.getElementById('driverJoinToggle');
  if (!f) return;
  var isShow = show !== undefined ? show : f.style.display === 'none';
  f.style.display = isShow ? 'block' : 'none';
  if (b) b.textContent = isShow ? '✕ 닫기' : '+ 운반자 신청';
}

function approvePendingBiz(id) {
  // 🆕 v132: 관리자 OR (본사 + 자기 브랜드 신청)
  if (!isAdminMode && !hqLoggedIn && !window._tempAdminForApproval) {
    showToast('t1','🔒 권한 없음','관리자 또는 본사 로그인 후 이용 가능합니다');
    return;
  }
  const idx = pendingBizData.findIndex(p => p.id === id);
  if (idx === -1) return;
  const p = pendingBizData[idx];
  // 본사 권한 체크 — 자기 브랜드 신청인지 확인
  if (hqLoggedIn && !isAdminMode) {
    if (p.tenant_type !== 'franchise_store' || p.franchise_brand_id !== hqBrandId) {
      showToast('t1','🔒 권한 없음','다른 브랜드 신청은 승인할 수 없습니다');
      return;
    }
  }
  // 🛡️ 안전한 JSON.parse 헬퍼
  function _safeParse(val, fallback) {
    if (val === null || val === undefined) return fallback;
    if (typeof val !== 'string') return val;
    try { return JSON.parse(val); } catch(e) {
      console.warn('JSON.parse 실패, 원본 반환:', val.substring(0, 50), e.message);
      return fallback;
    }
  }
  const newBiz = { id: nextBizId++, name: p.name, type: p.type, owner: p.owner, phone: p.phone,
    addr: p.addr, lat: p.lat, lng: p.lng,
    newOil: p.new_oil !== undefined ? p.new_oil : (p.newOil || 5), maxNew: 10,
    wasteOil: p.new_oil !== undefined ? p.waste_oil : (p.wasteOil || 0),
    oiltype: p.oil_type || p.oiltype || '대두유',
    auto: p.auto, lastUpdate: '방금 승인됨',
    oilProducts: _safeParse(p.oil_products, null),
    // 로그인 계정 정보를 업체 객체에 포함 → DB에 함께 저장
    loginId: p.login_id || null,
    loginPw: p.login_pw || (p.phone ? p.phone.replace(/[^0-9]/g,'').slice(-4) : null),
    // 📎 서류 (사업자등록증·통장사본) 같이 이관
    business_license: p.cert_image || null,
    bank_image: p.bank_image || null,
    // ✍️ 회원가입 시 등록한 서명 이관
    owner_signature: p.owner_signature || null,
    deliveryDays: _safeParse(p.delivery_days, null),
    closedDays: _safeParse(p.closed_days, null),
    approved: true,
    // 🌍 ISCC EU 동의 정보
    iscc_agreed: p.iscc_agreed === true,
    marketing_agreed: p.marketing_agreed === true,
    // 🆕 v130: 프랜차이즈 정보 이관
    tenantType: p.tenant_type || 'individual',
    franchiseBrandId: p.franchise_brand_id || null,
    storeCode: p.store_code || null,
  };
  saveBizToDB(newBiz).then((ok) => {
    if (!ok) {
      // 🔴 DB 저장 실패 → pending 유지하고 사용자에게 알림
      showToast('t1','❌ DB 저장 실패!','업체가 DB에 저장되지 못했어요. 콘솔(F12)에서 자세한 사유를 확인하고, Supabase 컬럼/RLS 정책을 점검해주세요.');
      console.error('🔴 [승인 실패] saveBizToDB가 false 반환 — pending_biz는 유지됨');
      // nextBizId도 롤백
      nextBizId = newBiz.id;
      return;
    }
    // ✅ DB 저장 성공
    businesses.push(newBiz);
    saveBusinesses();
    // localStorage에도 보조 저장 (같은 기기에서 빠른 접근용)
    if (newBiz.loginId && newBiz.loginPw) {
      const customAccounts = JSON.parse(localStorage.getItem('hiveoil_custom_accounts') || '{}');
      customAccounts[newBiz.loginId] = { pw: newBiz.loginPw, bizId: newBiz.id, name: newBiz.name };
      localStorage.setItem('hiveoil_custom_accounts', JSON.stringify(customAccounts));
    }
    // Supabase pending_biz에서도 삭제
    db.from('pending_biz').delete().eq('id', id).then(() => {});
    pendingBizData.splice(idx, 1);
    savePendingBiz();
    renderRegBizList();
    renderPendingBizList();
    updateRegisterBadge();
    updateDashboard();
    updateTabBadges();
    if (kakaoMap && mapInitialized) addMarker(newBiz);
    showToast('t1','✅ 승인 완료!', newBiz.name + ' — 등록된 업체 목록에 추가됐어요');
    // DB에서 한 번 더 동기화 (다른 기기에서도 즉시 반영되도록)
    setTimeout(function() { loadBusinessesFromDB && loadBusinessesFromDB(); }, 600);
  });
}

function rejectPendingBiz(id) {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  if (!confirm('이 업체 신청을 반려할까요?')) return;
  // Supabase에서도 삭제
  db.from('pending_biz').delete().eq('id', id).then(() => {});
  pendingBizData = pendingBizData.filter(p => p.id !== id);
  savePendingBiz();
  renderPendingBizList();
  updateRegisterBadge();
  showToast('t1','❌ 반려됨','신청이 반려 처리됐어요');
}

// Supabase에서 pending_biz 로드
async function loadPendingBizFromDB() {
  if (!db || typeof db.from !== 'function') {
    _updateDbgPanel('DB 객체 없음', '—', 'Supabase client 미초기화');
    return;
  }
  try {
    // select * 사용 — 컬럼 누락에 안전
    const { data, error } = await db.from('pending_biz').select('*').order('created_at', { ascending: false }).limit(50);
    if (error) throw error;

    pendingBizData = data || [];
    savePendingBiz();
    renderPendingBizList();
    updateRegisterBadge();
    _updateDbgPanel(_now(), pendingBizData.length + '건', '없음');
  } catch(e) {
    var emsg = e.message || '';
    console.warn('pending_biz 로드 실패:', emsg);
    if (/timeout|canceling statement/i.test(emsg)) {
      _updateDbgPanel(_now(), '—', '⏱️ DB 응답 지연 — 큰 이미지가 있을 수 있어요');
    } else {
      _updateDbgPanel(_now(), '—', '❌ ' + emsg);
    }
    renderPendingBizList();
  }
}

// ─── 디버그 패널 헬퍼 ───
function _now() {
  var d = new Date();
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0') + ':' + String(d.getSeconds()).padStart(2,'0');
}
function _updateDbgPanel(time, count, err) {
  var t = document.getElementById('dbgLastPoll');
  var c = document.getElementById('dbgPendingCount');
  var e = document.getElementById('dbgLastError');
  if (t) t.textContent = time;
  if (c) c.textContent = count;
  if (e) {
    e.textContent = err;
    e.style.color = (err === '없음') ? '#A5D6A7' : '#FFB74D';
  }
}

// 🔄 즉시 새로고침 버튼
function manualPollPendingBiz() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  showToast('t1','🔄 새로고침 중...','DB에서 최신 신청 가져오는 중');
  loadPendingBizFromDB().then(function() {
    showToast('t1','✅ 새로고침 완료', pendingBizData.length + '건의 대기 신청이 있어요');
  });
}

// 🔄 앱 전체 캐시 삭제 + 강제 새로고침 (Service Worker / HTTP 캐시 모두)
function forceRefreshApp() {
  if (!confirm('앱의 모든 캐시를 삭제하고 최신 버전으로 새로고침합니다. 계속할까요?\n\n(저장된 데이터는 유지됩니다)')) return;
  showToast('t1','🔄 캐시 삭제 중...','잠시만요');

  var p = Promise.resolve();
  // 1. Service Worker 모두 해제
  if ('serviceWorker' in navigator) {
    p = p.then(function() {
      return navigator.serviceWorker.getRegistrations().then(function(regs) {
        return Promise.all(regs.map(function(r) { return r.unregister(); }));
      });
    });
  }
  // 2. Cache Storage 모두 삭제
  if ('caches' in window) {
    p = p.then(function() {
      return caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
      });
    });
  }
  // 3. 강제 새로고침 (캐시 우회)
  p.then(function() {
    setTimeout(function() {
      // ?_v= 파라미터를 붙여서 HTTP 캐시도 우회
      var url = window.location.href.split('?')[0] + '?_v=' + Date.now();
      window.location.replace(url);
    }, 500);
  }).catch(function(e) {
    console.error('캐시 삭제 실패:', e);
    window.location.reload(true);
  });
}

// 🧹 oilProducts의 잘못된 키 자동 정리 (oils 키 → products 키 변환)
window.fixBizProductKeys = async function() {
  if (!isAdminMode) { alert('관리자 모드 필요'); return; }
  var oilsToProductKey = { soy: 'soy_wonju', canola: 'can_grewell', corn: 'corn_oilers' };
  var fixed = [];
  for (var i = 0; i < businesses.length; i++) {
    var biz = businesses[i];
    if (!biz.oilProducts || biz.oilProducts.length === 0) continue;
    var changed = false;
    var newProds = biz.oilProducts.map(function(p){
      if (oilsToProductKey[p.key]) {
        changed = true;
        return { key: oilsToProductKey[p.key], qty: p.qty || 0 };
      }
      // products 사전에 없는 알 수 없는 키는 제외
      if (!PRICES.products || !PRICES.products[p.key]) {
        console.warn('[' + biz.name + '] 알 수 없는 품목 키 제거:', p.key);
        changed = true;
        return null;
      }
      return p;
    }).filter(function(p){ return p !== null; });

    // 같은 key가 여러 개면 합산
    var merged = {};
    newProds.forEach(function(p){
      if (!merged[p.key]) merged[p.key] = { key: p.key, qty: 0 };
      merged[p.key].qty += (p.qty || 0);
    });
    var finalProds = Object.values(merged);

    if (changed || finalProds.length !== biz.oilProducts.length) {
      biz.oilProducts = finalProds;
      biz.newOil = finalProds.reduce(function(s,p){ return s + (p.qty||0); }, 0);
      fixed.push({ name: biz.name, id: biz.id, prods: finalProds });
      // DB 동기화
      try { await updateBizStockInDB(biz.id, biz.newOil, biz.wasteOil, '품목 키 정리', biz.oilProducts); } catch(e) {}
    }
  }

  if (fixed.length === 0) {
    alert('✅ 정리할 업체 없음 (모든 품목 키가 정상입니다)');
    return;
  }
  saveBusinesses();
  console.log('🔧 정리된 업체:', fixed);
  alert('✅ ' + fixed.length + '개 업체의 품목 키 정리 완료\n\n새로고침합니다.');
  location.reload();
};

// 🧹 옛 pending 이력 정리 — 일괄처리 모달이 잘못된 데이터를 가져오는 문제 해결용
window.purgeStalePendingHistory = async function() {
  if (!isAdminMode) { alert('관리자 모드 필요'); return; }
  var nowMs = Date.now();
  var threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  var stale = historyData.filter(function(h) {
    if (h.deleted_at) return false;
    if (h.status !== 'pending') return false;
    if (!h.rawDate) return false;
    var t = new Date(h.rawDate).getTime();
    return !isNaN(t) && (nowMs - t > threeDaysMs);
  });

  if (stale.length === 0) {
    alert('✅ 3일 이상된 pending 이력 없음');
    return;
  }

  console.log('🔍 3일 이상 된 pending 이력:', stale.length, '건');
  stale.forEach(function(h, idx) {
    console.log((idx+1) + '. ' + h.biz + ' / ' + h.type + ' / ' + h.qty + '캔 / ' + h.rawDate);
  });

  if (!confirm('3일 이상 된 pending 이력 ' + stale.length + '건을 영구 삭제할까요?\n\n콘솔에 상세 목록이 출력됐어요.\n실제 처리되지 않은 옛 신청들이 일괄처리 모달에 잘못 표시되는 것을 방지합니다.')) return;

  var ok = 0, fail = 0;
  for (var i = 0; i < stale.length; i++) {
    var h = stale[i];
    if (!h.dbId) continue;
    try {
      var r = await db.from('history').delete().eq('id', h.dbId);
      if (r.error) { fail++; console.warn('삭제 실패:', h.dbId, r.error.message); }
      else {
        ok++;
        // 메모리에서도 제거
        var idx = historyData.findIndex(function(x){ return String(x.dbId) === String(h.dbId); });
        if (idx >= 0) historyData.splice(idx, 1);
      }
    } catch(e) { fail++; }
  }
  saveHistory();
  alert('✅ 정리 완료: 삭제 ' + ok + '건, 실패 ' + fail + '건\n\n새로고침합니다.');
  location.reload();
};

// 🧹 중복 이력 정리 — 같은 업체 + 같은 type + 같은 qty + 1분 이내 INSERT 중복 제거
window.purgeDuplicateHistory = async function() {
  if (!isAdminMode) { alert('관리자 모드 필요'); return; }

  // 메모리에서 중복 후보 찾기
  var candidates = {};
  historyData.forEach(function(h) {
    if (!h.dbId || !h.bizId) return;
    if (h.deleted_at) return;
    var key = h.bizId + ':' + h.type + ':' + (h.qty || 0);
    if (!candidates[key]) candidates[key] = [];
    candidates[key].push(h);
  });

  var dupGroups = [];
  Object.keys(candidates).forEach(function(k) {
    var arr = candidates[k];
    if (arr.length < 2) return;
    // rawDate 기준으로 정렬
    arr.sort(function(a,b){ return new Date(a.rawDate) - new Date(b.rawDate); });
    // 5분 이내 인접한 것들끼리 그룹핑
    for (var i = 1; i < arr.length; i++) {
      var diffMs = Math.abs(new Date(arr[i].rawDate) - new Date(arr[i-1].rawDate));
      if (diffMs < 5 * 60 * 1000) { // 5분 이내
        dupGroups.push({ keep: arr[i-1], remove: arr[i] });
      }
    }
  });

  if (dupGroups.length === 0) {
    alert('✅ 중복 이력 없음');
    return;
  }

  console.log('🔍 중복 이력 후보:', dupGroups.length, '건');
  dupGroups.forEach(function(g, idx) {
    console.log((idx+1) + '. ' + g.keep.biz + ' / ' + g.keep.type + ' / ' + g.keep.qty + '캔');
    console.log('   유지: dbId=' + g.keep.dbId + ', ' + g.keep.rawDate);
    console.log('   삭제: dbId=' + g.remove.dbId + ', ' + g.remove.rawDate);
  });

  if (!confirm('중복 이력 ' + dupGroups.length + '건을 삭제할까요?\n\n각 그룹에서 먼저 들어온 것만 유지하고 나머지는 영구 삭제합니다.\n\n콘솔에 상세 목록이 출력됐어요.')) return;

  var ok = 0, fail = 0;
  for (var i = 0; i < dupGroups.length; i++) {
    var rmId = dupGroups[i].remove.dbId;
    try {
      var r = await db.from('history').delete().eq('id', rmId);
      if (r.error) { fail++; console.warn('삭제 실패:', rmId, r.error.message); }
      else { ok++; }
    } catch(e) { fail++; }
  }
  alert('✅ 정리 완료: 삭제 ' + ok + '건, 실패 ' + fail + '건\n\n새로고침합니다.');
  location.reload();
};

// 🧹 localStorage 업체 캐시 정리 (DB 기준으로 다시 로드)
window.refreshBusinessesCache = async function() {
  if (!confirm('localStorage의 업체 캐시를 비우고 DB에서 다시 로드합니다.\n진행할까요?')) return;
  localStorage.removeItem('hiveoil_businesses');
  businesses.length = 0;
  await loadBusinessesFromDB();
  // 모든 패널 재렌더
  renderRegBizList && renderRegBizList();
  renderEsgPanel && renderEsgPanel();
  updateDashboard && updateDashboard();
  updateHqRealStats && updateHqRealStats();
  showToast('t1','✅ 캐시 새로고침 완료', businesses.length + '개 업체 (DB 기준)');
};

// 🧹 테스트 데이터 정리 — 콘솔에서 호출
window.purgeTestBusinesses = async function() {
  if (!confirm('"테스트" 또는 "🧪" 들어간 업체를 모두 DB에서 영구 삭제할까요?')) return;
  var targets = businesses.filter(function(b) {
    return /테스트|🧪/.test(b.name || '') || b.type === '테스트';
  });
  console.log('🧹 정리 대상:', targets.length + '개', targets.map(function(b){return b.name;}));
  if (targets.length === 0) { alert('정리할 테스트 업체 없음'); return; }
  for (var i = 0; i < targets.length; i++) {
    try {
      await db.from('businesses').delete().eq('id', targets[i].id);
      // 메모리에서도 제거
      var idx = businesses.findIndex(function(b){return b.id === targets[i].id;});
      if (idx >= 0) businesses.splice(idx, 1);
    } catch(e) { console.warn('삭제 실패:', targets[i].name, e); }
  }
  saveBusinesses();
  // pending_biz 테이블에서도 정리
  try {
    var pres = await db.from('pending_biz').select('id, name').or('name.ilike.%테스트%,name.ilike.%🧪%');
    if (pres.data) {
      for (var j = 0; j < pres.data.length; j++) {
        await db.from('pending_biz').delete().eq('id', pres.data[j].id);
      }
      console.log('🧹 pending_biz 정리:', pres.data.length + '건');
    }
  } catch(e) {}
  alert('✅ 테스트 업체 ' + targets.length + '개 정리 완료. 새로고침합니다.');
  location.reload();
};

// 🩺 localStorage 진단
window.diagnoseLocalStorage = function() {
  var total = 0;
  var sizes = {};
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    var v = localStorage.getItem(k) || '';
    sizes[k] = v.length;
    total += v.length;
  }
  var sorted = Object.entries(sizes).sort(function(a,b){return b[1]-a[1];});
  console.log('📦 localStorage 사용 현황:');
  console.table(Object.fromEntries(sorted.map(function(e){return [e[0], (e[1]/1024).toFixed(0) + 'KB'];})));
  console.log('💾 총 용량: ' + (total/1024/1024).toFixed(2) + 'MB / 5MB');
  if (total > 4 * 1024 * 1024) {
    console.warn('⚠️ 4MB 초과 — 용량 부족 위험. clearLargeLocalStorage() 호출로 정리 가능');
  }
  return { total: total, sizes: sizes };
};

// 🧹 큰 항목 정리
window.clearLargeLocalStorage = function() {
  if (!confirm('큰 localStorage 항목들을 정리할까요?\n(pending_biz, history 캐시 등 — DB에서 다시 로드됨)')) return;
  var removed = [];
  ['hiveoil_pending_biz', 'hiveoil_history', 'hiveoil_deleted_history'].forEach(function(k) {
    if (localStorage.getItem(k)) {
      removed.push(k);
      localStorage.removeItem(k);
    }
  });
  alert('✅ 정리 완료: ' + removed.join(', ') + '\n\n페이지를 새로고침합니다.');
  location.reload();
};

// 🆕 v65: 자동발주/수거 임계값 진단 도구
// 🆕 v72: 패널 진단 도구 — 어떤 패널이 안 보이는지 실시간 분석
window.diagnosePanels = function() {
  var panelIds = ['price','admin','register','esg','support','esg-school','esg-franchise','apply','history','dashboard','map','waste','order','schedule','owner-history'];
  console.log('=== 패널 진단 ===');
  console.log('현재 활성:', (document.querySelector('.panel.active') || {}).id || '❌ 없음');
  console.log('isAdminMode:', typeof isAdminMode !== 'undefined' ? isAdminMode : 'undefined');
  console.log('ownerLoggedIn:', typeof ownerLoggedIn !== 'undefined' ? ownerLoggedIn : 'undefined');
  console.log('--- 패널별 상태 ---');
  panelIds.forEach(function(id) {
    var el = document.getElementById('panel-' + id);
    if (!el) {
      console.log('  ' + id + ': ❌ DOM에 없음');
      return;
    }
    var hasContent = el.children.length > 0 && el.innerHTML.trim().length > 50;
    var isActive = el.classList.contains('active');
    var rect = el.getBoundingClientRect();
    console.log('  ' + id + ':' + (isActive ? ' ✅ active' : ' ⏸ inactive') 
      + (hasContent ? ' · 컨텐츠 ' + el.innerHTML.length + 'char' : ' · ⚠️ 빈 컨텐츠')
      + ' · ' + Math.round(rect.width) + 'x' + Math.round(rect.height));
  });
  console.log('--- showPanel 직접 호출 테스트 ---');
  try {
    showPanel('price');
    setTimeout(function() {
      var p = document.getElementById('panel-price');
      var content = document.getElementById('pricePageContent');
      console.log('panel-price active:', p && p.classList.contains('active'));
      console.log('pricePageContent 내용 길이:', content ? content.innerHTML.length : 'null');
      if (content && content.innerHTML.length === 0) {
        console.log('⚠️ pricePageContent가 비어있음 — renderPricePage 직접 실행');
        try { renderPricePage(); console.log('✅ renderPricePage 직접 호출 성공'); }
        catch(e) { console.error('❌ renderPricePage 에러:', e); }
      }
    }, 200);
  } catch(e) { console.error('showPanel 에러:', e); }
};

window.diagnoseThresholds = function() {
  var rows = businesses.map(function(b) {
    return {
      이름: b.name,
      식용유: getBizTotalNewOil(b) + '캔',
      폐유: (b.wasteOil || 0) + '캔',
      자동발주: b.auto !== false ? 'ON' : 'OFF',
      발주트리거: getAutoOrderThreshold(b) + '캔이하',
      자동수거: b.autoCollect !== false ? 'ON' : 'OFF',
      수거트리거: getAutoCollectThreshold(b) + '캔이상',
      발주발동: shouldAutoOrder(b) ? '✅' : '—',
      수거발동: shouldAutoCollect(b) ? '✅' : '—',
    };
  });
  console.table(rows);
  return rows;
};

// 🆕 v65/v102: 모든 업체에 임계값 기본값 채우기 (구 데이터 마이그레이션)
// ⚠️ auto/autoCollect는 명시적 false인 경우 절대 건드리지 않음 (사장님이 OFF한 것 보존)
window.fixThresholds = function(orderTh, collectTh) {
  orderTh = orderTh || 2;
  collectTh = collectTh || 2;
  var fixed = 0;
  businesses.forEach(function(b) {
    var changed = false;
    if (typeof b.autoOrderThreshold !== 'number') { b.autoOrderThreshold = orderTh; changed = true; }
    if (typeof b.autoCollectThreshold !== 'number') { b.autoCollectThreshold = collectTh; changed = true; }
    // 🛡️ v102: 명시적 false는 절대 변경 안 함, null/undefined만 기본 true로
    if (b.auto !== true && b.auto !== false) { b.auto = true; changed = true; }
    if (b.autoCollect !== true && b.autoCollect !== false) { b.autoCollect = true; changed = true; }
    if (changed) {
      fixed++;
      // DB 동기화
      try {
        if (typeof db !== 'undefined') {
          db.from('businesses').update({
            auto: b.auto,
            auto_collect: b.autoCollect,
            auto_order_threshold: b.autoOrderThreshold,
            auto_collect_threshold: b.autoCollectThreshold,
          }).eq('id', b.id).then(function() {});
        }
      } catch(e) {}
    }
  });
  saveBusinesses();
  console.log('✅ ' + fixed + '개 업체 기본값 적용 (자동발주 ' + orderTh + '캔이하 / 자동수거 ' + collectTh + '캔이상)');
  alert('✅ ' + fixed + '개 업체에 기본값을 적용했어요\n\n※ 이미 사장님이 OFF한 업체는 그대로 보존됩니다.\n\n새로고침 후 확인해주세요.');
};

// 🧪 테스트 INSERT — RLS / 컬럼 / 권한 진단용
function testPendingInsert() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  if (!confirm('테스트용 가짜 업체 신청을 DB에 INSERT해서 동작을 확인합니다. 진행할까요?\n(성공하면 승인 대기 목록에 "🧪 테스트업체"가 떠요)')) return;
  var testRow = {
    id: Date.now(),
    name: '🧪 테스트업체 ' + new Date().toLocaleTimeString('ko-KR'),
    type: '테스트',
    owner: '테스트',
    phone: '010-0000-0000',
    addr: '강원도 원주시 (테스트 주소)',
    lat: 37.3450,
    lng: 127.9280,
    new_oil: 5,
    waste_oil: 0,
    oil_type: '대두유',
    auto: true,
    status: 'pending',
    request_date: new Date().toISOString().slice(0,10).replaceAll('-','.'),
    cert_image: null,
    bank_image: null,
    login_id: null,
    login_pw: null
  };
  console.log('🧪 테스트 INSERT 시작:', testRow);
  showToast('t1','🧪 테스트 INSERT 중...','잠시만요');
  db.from('pending_biz').insert(testRow).then(function(res) {
    if (res.error) {
      var emsg = res.error.message || '알 수 없는 오류';
      console.error('🔴 테스트 INSERT 실패:', res.error);
      showToast('t1','❌ INSERT 실패!','사유: ' + emsg.slice(0, 100));
      _updateDbgPanel(_now(), pendingBizData.length + '건', '❌ INSERT 실패: ' + emsg);
      // 자주 나오는 케이스 안내
      if (emsg.indexOf('row-level security') >= 0 || emsg.indexOf('RLS') >= 0 || emsg.indexOf('policy') >= 0) {
        setTimeout(function() {
          alert('🔒 RLS(Row Level Security) 차단입니다!\n\nSupabase 콘솔에서 pending_biz 테이블의 RLS 정책을 확인해주세요:\n\n1. Authentication → Policies → pending_biz 선택\n2. INSERT 정책에 anon 역할 허용 또는 RLS 끄기\n\n또는 SQL Editor에서:\nALTER TABLE pending_biz DISABLE ROW LEVEL SECURITY;');
        }, 500);
      } else if (emsg.indexOf('does not exist') >= 0) {
        alert('💡 컬럼이 없습니다.\n\n에러 메시지에 표시된 컬럼을 Supabase에서 추가해주세요.');
      }
    } else {
      console.log('✅ 테스트 INSERT 성공:', res.data);
      showToast('t1','✅ 테스트 INSERT 성공!','승인 대기 목록을 새로고침합니다');
      // 즉시 목록 갱신
      loadPendingBizFromDB();
    }
  }).catch(function(e) {
    console.error('🔴 테스트 INSERT 예외:', e);
    showToast('t1','❌ 네트워크 오류', e.message || '연결 실패');
  });
}

function renderPendingBizList() {
  if (typeof pendingBizData === 'undefined') return;
  const section = document.getElementById('pendingBizSection');
  const list    = document.getElementById('pendingBizList');
  const count   = document.getElementById('pendingCount');
  if (!section || !list) return;

  // HTML escape 헬퍼
  function _h(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/`/g, '&#96;');
  }

  // 🆕 v132: 일반 사업자 신청만 — 프랜차이즈는 [프랜차이즈 관리]에서 처리
  var individualPending = pendingBizData.filter(function(p) {
    return p.tenant_type !== 'franchise_store';
  });

  // 관리자면 항상 섹션 표시 (디버그 패널 보이게)
  section.style.display = isAdminMode ? '' : 'none';
  if (count) count.textContent = individualPending.length;

  // 🚀 idempotency 체크: 같은 데이터면 재렌더 스킵 (깜빡임 방지)
  var sig = individualPending.map(function(p){ return (p.id || '') + ':' + (p.name || ''); }).join('|');
  if (window._lastPendingRenderSig === sig && list.children.length > 0) {
    return;
  }
  window._lastPendingRenderSig = sig;

  if (individualPending.length === 0) {
    // 프랜차이즈 신청은 따로 있다는 안내
    var frPendingCount = pendingBizData.filter(function(p){ return p.tenant_type === 'franchise_store'; }).length;
    var hint = frPendingCount > 0
      ? '<div style="margin-top:8px;font-size:11.5px;color:var(--green-dark);background:var(--green-pale);padding:8px 12px;border-radius:8px;">🏪 프랜차이즈 가맹점 신청 ' + frPendingCount + '건은 <b>[🏪 프랜차이즈 관리]</b> 메뉴에서 처리해주세요</div>'
      : '';
    list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:13px;background:var(--white);border-radius:var(--radius);box-shadow:var(--shadow);">✅ 승인 대기 중인 일반 사업자가 없어요' + hint + '</div>';
    return;
  }
  list.innerHTML = individualPending.map(p => {
    const dateStr = p.request_date || p.requestDate || (p.created_at ? p.created_at.slice(0,10) : '—');
    const hasCert = p.cert_image && p.cert_image.length > 0;
    const hasLoginInfo = p.login_id || p.login_pw;
    return `
    <div style="background:var(--white);border-radius:var(--radius);padding:16px 18px;box-shadow:var(--shadow);border-left:4px solid #E65100;">
      <div style="display:flex;align-items:flex-start;gap:14px;">
        <div style="width:38px;height:38px;background:#FFF3E0;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">🏪</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:14px;font-weight:800;color:var(--black);">${_h(p.name)}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:2px;">${_h(p.type)} · ${_h(p.addr)}</div>
          <div style="font-size:10px;color:var(--gray);margin-top:2px;">담당자: ${_h(p.owner)||'—'} · ${_h(p.phone)||'—'} · 신청일 ${_h(dateStr)}</div>
          ${hasLoginInfo
            ? `<div style="font-size:11px;color:#185FA5;margin-top:4px;background:#EEF4FF;border:1px solid #B3D4FC;border-radius:6px;padding:5px 9px;display:inline-block;">🔐 신청한 로그인 정보 — ID: <b style="font-family:Menlo,monospace;">${_h(p.login_id) || '—'}</b> · PW: <b style="font-family:Menlo,monospace;">${_h(p.login_pw) || '—'}</b></div>`
            : `<div style="font-size:11px;color:#C0392B;margin-top:4px;background:#FFF5F5;border:1px solid #FFCDD2;border-radius:6px;padding:5px 9px;display:inline-block;">⚠️ 로그인 정보 누락 — DB 컬럼 확인 필요</div>`
          }
          ${p.delivery_days ? '<div style="font-size:10px;color:#1565C0;margin-top:2px;">📅 희망배송: ' + (function(){try{return JSON.parse(p.delivery_days).map(function(d){return {mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d]||d;}).join('/');}catch(e){return p.delivery_days;}})() + '</div>' : ''}
          ${p.closed_days ? '<div style="font-size:10px;color:var(--red-accent);margin-top:1px;">🚫 휴무: ' + (function(){try{return JSON.parse(p.closed_days).map(function(d){return {mon:'월',tue:'화',wed:'수',thu:'목',fri:'금',sat:'토',sun:'일'}[d]||d;}).join('/');}catch(e){return p.closed_days;}})() + '</div>' : ''}
          ${(function(){
            // 🆕 v130: 프랜차이즈 가맹점 뱃지
            if (p.tenant_type !== 'franchise_store' || !p.franchise_brand_id) return '';
            var brand = (typeof franchiseBrands !== 'undefined' && franchiseBrands.find) ? franchiseBrands.find(function(b){return b.id === p.franchise_brand_id;}) : null;
            return '<div style="margin-top:6px;padding:6px 10px;background:linear-gradient(135deg,#0F2419,#1F4D30);color:#FFEB3B;border-radius:7px;font-size:11px;font-weight:800;display:inline-block;letter-spacing:-0.01em;">🏪 프랜차이즈 가맹점: ' + escapeHtml(brand ? brand.name : '(브랜드 미확인)') + (p.store_code ? ' · #' + escapeHtml(p.store_code) : '') + '</div>';
          })()}
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;">
            ${hasCert ? `<button onclick="toggleDocImage('cert_${p.id}')" style="background:#EEF4FF;border:none;border-radius:6px;padding:4px 10px;font-size:11px;color:#185FA5;cursor:pointer;font-family:var(--font-body);">📄 사업자등록증</button>` : '<span style="font-size:10px;color:#aaa;">📄 사업자 미첨부</span>'}
            ${p.bank_image ? `<button onclick="toggleDocImage('bank_${p.id}')" style="background:#FFF3E0;border:none;border-radius:6px;padding:4px 10px;font-size:11px;color:#E65100;cursor:pointer;font-family:var(--font-body);">🏦 통장사본</button>` : '<span style="font-size:10px;color:#aaa;">🏦 통장 미첨부</span>'}
          </div>
          ${hasCert ? `<div id="cert_${p.id}" style="display:none;margin-top:8px;">${p.cert_image && p.cert_image.startsWith('data:application/pdf') ? '<a href="'+p.cert_image+'" target="_blank" style="display:inline-block;background:#EEF4FF;color:#185FA5;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;">📄 PDF 열기</a>' : '<img src="'+p.cert_image+'" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--gray-light);cursor:pointer;" onclick="window.open(\''+p.cert_image+'\',\'_blank\')">'}</div>` : ''}
          ${p.bank_image ? `<div id="bank_${p.id}" style="display:none;margin-top:8px;">${p.bank_image.startsWith('data:application/pdf') ? '<a href="'+p.bank_image+'" target="_blank" style="display:inline-block;background:#FFF3E0;color:#E65100;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;">📄 PDF 열기</a>' : '<img src="'+p.bank_image+'" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--gray-light);cursor:pointer;" onclick="window.open(\''+p.bank_image+'\',\'_blank\')">'}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
          <button onclick="approvePendingBiz(${p.id})" style="background:var(--green-main);border:none;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:800;color:#0D0D0D;cursor:pointer;">✅ 승인</button>
          <button onclick="rejectPendingBiz(${p.id})" style="background:#FFF5F5;border:1.5px solid #FFB3B3;border-radius:8px;padding:7px 14px;font-size:12px;font-weight:700;color:#C0392B;cursor:pointer;">❌ 반려</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function updateRegisterBadge() {
  // 사이드바 업체 등록 뱃지 업데이트
  if (!pendingBizData || typeof pendingBizData === 'undefined') return;
  // 🆕 v132: 일반 사업자만 카운트 (프랜차이즈 신청은 [프랜차이즈 관리]에서)
  const pending = pendingBizData.filter(function(p){ return p.tenant_type !== 'franchise_store'; }).length;
  const navItems = document.querySelectorAll('.admin-only');
  // 등록 메뉴 찾아서 배지 업데이트
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.textContent.includes('업체 등록')) {
      let badge = item.querySelector('.pending-badge');
      if (pending > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-badge pending-badge';
          badge.style.cssText = 'background:#E65100;margin-left:auto;';
          item.appendChild(badge);
        }
        badge.textContent = pending;
        badge.style.display = '';
      } else if (badge) {
        badge.style.display = 'none';
      }
    }
  });
}

// 사업자등록증 업로드 핸들러 — 활성 버전은 라인 ~16171 (event, type 시그니처)
var regCertBase64 = null;
// (예전 단일 input 버전은 제거됨 — 중복 정의 방지)

// 회원가입 자동발주 체크박스 변경
function onRegAutoChange() {
  var cb = document.getElementById('regAutoCheckbox');
  var statusEl = document.getElementById('regAutoStatus');
  var qtyRow = document.getElementById('regAutoQtyRow');
  if (!cb) return;
  if (cb.checked) {
    if (statusEl) { statusEl.textContent = '[ON]'; statusEl.style.color = '#3D9E6E'; }
    if (qtyRow) qtyRow.style.opacity = '1';
  } else {
    if (statusEl) { statusEl.textContent = '[OFF]'; statusEl.style.color = '#999'; }
    if (qtyRow) qtyRow.style.opacity = '0.4';
  }
}

// 🆕 회원가입 자동수거 체크박스 변경
function onRegCollectChange() {
  var cb = document.getElementById('regCollectCheckbox');
  var statusEl = document.getElementById('regCollectStatus');
  var qtyRow = document.getElementById('regCollectQtyRow');
  if (!cb) return;
  if (cb.checked) {
    if (statusEl) { statusEl.textContent = '[ON]'; statusEl.style.color = '#FF9500'; }
    if (qtyRow) qtyRow.style.opacity = '1';
  } else {
    if (statusEl) { statusEl.textContent = '[OFF]'; statusEl.style.color = '#999'; }
    if (qtyRow) qtyRow.style.opacity = '0.4';
  }
}

function clearRegForm() {
  ['reg_name','reg_owner','reg_phone','reg_addr','reg_lat','reg_lng'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const phoneInput = document.getElementById('reg_phone_input');
  if (phoneInput) phoneInput.value = '';
  const loginId = document.getElementById('reg_login_id');
  if (loginId) loginId.value = '';
  const loginPw = document.getElementById('reg_login_pw');
  if (loginPw) loginPw.value = '';
  const searchInput = document.getElementById('kakao_search_input');
  if (searchInput) searchInput.value = '';
  const results = document.getElementById('kakaoResults');
  if (results) results.innerHTML = '';
  const preview = document.getElementById('selectedBizPreview');
  if (preview) preview.style.display = 'none';
  const certPreview = document.getElementById('reg_cert_preview');
  if (certPreview) certPreview.style.display = 'none';
  const certName = document.getElementById('reg_cert_name');
  if (certName) certName.textContent = '파일 선택 (JPG/PNG/PDF)';
  const certInput = document.getElementById('reg_biz_cert');
  if (certInput) certInput.value = '';
  regCertBase64 = null;
  window.regBankBase64 = null;
  var aq = document.getElementById('reg_autoQty'); if (aq) aq.value = '5';
  var atr = document.getElementById('reg_autoTrigger'); if (atr) atr.value = '2';
  var ctr = document.getElementById('reg_collectTrigger'); if (ctr) ctr.value = '2';
  // 자동발주 체크박스 ON 상태로 초기화
  var regAutoCb = document.getElementById('regAutoCheckbox');
  if (regAutoCb) {
    regAutoCb.checked = true;
    onRegAutoChange();
  }
  // 자동수거 체크박스 ON 상태로 초기화
  var regCollectCb = document.getElementById('regCollectCheckbox');
  if (regCollectCb) {
    regCollectCb.checked = true;
    onRegCollectChange();
  }
  initRegProductRows();
  document.getElementById('reg_wasteOil').value = '0';
  initRegProductRows();
  // 동의 체크박스 초기화
  ['privacyAgree','termsAgree','isccAgree','marketingAgree'].forEach(function(cid){
    var c = document.getElementById(cid);
    if (c) c.checked = false;
  });
  // 서명 초기화
  try { clearRegSignature(); } catch(e) {}
}

function renderRegBizList() {
  const activeBiz = businesses.filter(b => !b.deleted);
  const container = document.getElementById('regBizList');
  const countEl   = document.getElementById('regCount');
  if (countEl) countEl.textContent = activeBiz.length;
  // 휴지통 카운트 갱신
  updateBizTrashCount && updateBizTrashCount();
  if (!container) return;

  // 🚀 idempotency 체크 — 같은 데이터면 스킵 (체크박스 풀림 방지 + 깜빡임 방지)
  var bizSig = activeBiz.map(function(b){
    return b.id + ':' + (b.name||'') + ':' + getBizTotalNewOil(b) + ':' + (b.wasteOil||0);
  }).join('|');
  // 선택 상태도 시그니처에 포함
  var selSig = Object.keys(window._bizSelectedSet || {}).sort().join(',');
  var fullSig = bizSig + '#' + selSig;
  if (window._lastBizListSig === fullSig && container.children.length > 0) {
    return;
  }
  window._lastBizListSig = fullSig;

  if (activeBiz.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:13px;background:var(--white);border-radius:var(--radius);box-shadow:var(--shadow);">📭 등록된 업체가 없어요. 위 양식을 작성하고 등록해주세요!</div>';
    updateBizBulkBar && updateBizBulkBar();
    return;
  }
  window._bizSelectedSet = window._bizSelectedSet || {};
  container.innerHTML = activeBiz.map(b => {
    var checked = window._bizSelectedSet[b.id] ? 'checked' : '';
    return `
    <div style="background:var(--white);border-radius:var(--radius-sm);padding:11px 12px;box-shadow:var(--shadow);">
      <div style="display:flex;align-items:center;gap:9px;">
        <input type="checkbox" class="biz-row-chk" data-bizid="${b.id}" ${checked} onchange="onBizRowCheck(this)" style="cursor:pointer;width:15px;height:15px;flex-shrink:0;">
        <div style="width:34px;height:34px;background:${getBizTotalNewOil(b)<=2?'var(--red-accent)':b.wasteOil>=5?'#FF8C00':'var(--green-main)'};border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">🏪</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:800;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.name} ${b.iscc_agreed===true ? '<span style="font-size:9px;background:#E8F5E9;color:#2E7D32;padding:1px 5px;border-radius:4px;font-weight:700;margin-left:4px;">🌍 ISCC ✓</span>' : '<span style="font-size:9px;background:#FFF3E0;color:#E65100;padding:1px 5px;border-radius:4px;font-weight:700;margin-left:4px;">⚠️ ISCC 미동의</span>'}</div>
          <div style="font-size:10px;color:var(--gray);margin-top:1px;">${b.type}</div>
        </div>
        <div style="display:flex;gap:5px;align-items:center;flex-shrink:0;">
          <span style="font-size:11px;background:var(--green-pale);color:var(--green-dark);padding:3px 8px;border-radius:5px;font-weight:700;white-space:nowrap;">새유 ${getBizTotalNewOil(b)}캔</span>
          <span style="font-size:11px;background:#FFF8F0;color:#D4621A;padding:3px 8px;border-radius:5px;font-weight:700;white-space:nowrap;">폐유 ${b.wasteOil}캔</span>
          <button onclick="toggleBizDetail(${b.id})" style="background:var(--cream);border:1px solid var(--gray-light);border-radius:7px;padding:5px 8px;cursor:pointer;font-size:11px;color:var(--gray);white-space:nowrap;">···</button>
        </div>
      </div>
      <div id="bizDetail_${b.id}" style="display:none;margin-top:9px;padding-top:9px;border-top:1px solid var(--gray-light);">
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <span style="font-size:10px;color:var(--gray);">${getBizProductSummary(b)}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:7px;flex-wrap:wrap;align-items:center;">
          <button onclick="editAutoQty(${b.id})" style="font-size:11px;padding:5px 10px;border-radius:6px;font-weight:700;border:none;cursor:pointer;${b.auto?'background:#E8F5E9;color:#2E7D32;':'background:#f5f5f5;color:#999;'}">${b.auto?'⚡자동 '+(b.autoQty||5)+'캔':'수동발주'}</button>
          <button onclick="showBizCredentials(${b.id})" style="background:#EEF4FF;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:#185FA5;white-space:nowrap;">🔑 ID/PW</button>
          <button onclick="manageBizProducts(${b.id})" style="background:#F0FBF5;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:var(--green-dark);white-space:nowrap;font-weight:700;">🫙 식용유 관리</button>
          <button onclick="editBizInfo(${b.id})" style="background:#FFF8E7;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:#92400E;white-space:nowrap;font-weight:700;">✏️ 정보 수정</button>
          ${b.business_license ? `<button onclick="toggleDocImage('biz_cert_${b.id}')" style="background:#EEF4FF;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:#185FA5;white-space:nowrap;">📄 사업자등록증</button>` : '<span style="font-size:10px;color:#bbb;">📄 사업자 미첨부</span>'}
          ${b.bank_image ? `<button onclick="toggleDocImage('biz_bank_${b.id}')" style="background:#FFF3E0;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:#E65100;white-space:nowrap;">🏦 통장사본</button>` : '<span style="font-size:10px;color:#bbb;">🏦 통장 미첨부</span>'}
          ${b.owner_signature ? `<button onclick="toggleDocImage('biz_sig_${b.id}')" style="background:#F0FBF5;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:var(--green-dark);white-space:nowrap;">✍️ 서명</button>` : '<span style="font-size:10px;color:#bbb;">✍️ 서명 미등록</span>'}
          <button onclick="deleteBiz(${b.id})" style="background:#FEF2F2;border:none;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:11px;color:var(--red-accent);">삭제</button>
        </div>
        ${b.business_license ? `<div id="biz_cert_${b.id}" style="display:none;margin-top:8px;">${b.business_license.startsWith('data:application/pdf') ? '<a href="'+b.business_license+'" target="_blank" style="display:inline-block;background:#EEF4FF;color:#185FA5;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;">📄 PDF 열기</a>' : '<img src="'+b.business_license+'" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--gray-light);cursor:pointer;" onclick="window.open(\''+b.business_license+'\',\'_blank\')">'}</div>` : ''}
        ${b.bank_image ? `<div id="biz_bank_${b.id}" style="display:none;margin-top:8px;">${b.bank_image.startsWith('data:application/pdf') ? '<a href="'+b.bank_image+'" target="_blank" style="display:inline-block;background:#FFF3E0;color:#E65100;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;text-decoration:none;">📄 PDF 열기</a>' : '<img src="'+b.bank_image+'" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--gray-light);cursor:pointer;" onclick="window.open(\''+b.bank_image+'\',\'_blank\')">'}</div>` : ''}
        ${b.owner_signature ? `<div id="biz_sig_${b.id}" style="display:none;margin-top:8px;background:#fff;border:1px solid var(--gray-light);border-radius:8px;padding:12px;text-align:center;"><div style="font-size:11px;color:var(--gray);margin-bottom:6px;">등록된 업주 서명</div><img src="${b.owner_signature}" style="max-width:240px;max-height:90px;"></div>` : ''}
      </div>
    </div>
  `;}).join('');
  updateBizBulkBar && updateBizBulkBar();
}

function deleteBiz(id) {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  const idx = businesses.findIndex(b => b.id === id);
  if (idx === -1) return;
  if (!confirm('업체를 삭제할까요?\n거래 이력은 보존되며 복구 가능합니다.')) return;
  const biz = businesses[idx];
  const name = biz.name;

  // 소프트 삭제: deleted 플래그 세우고 deletedAt 기록
  biz.deleted = true;
  biz.deletedAt = new Date().toISOString().slice(0,10);
  softDeleteBizInDB(biz.id);

  // 활성 목록에서만 제거 (데이터는 deletedBusinesses에 보관)
  businesses.splice(idx, 1);
  const deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  deletedList.unshift(biz);
  localStorage.setItem('hiveoil_deleted_biz', JSON.stringify(deletedList));

  saveBusinesses();
  renderRegBizList();
  renderDeletedBizList();
  updateDashboardStats();
  updateDashboard();
  showToast('t1','🗑️ 업체 삭제됨', name + ' — 복구 가능');
  markers.forEach(({overlay}) => overlay.setMap(null));
  infoWindows.forEach(iw => iw.setMap(null));
  markers = []; infoWindows = [];
  if (kakaoMap) renderBizList();
}

// ============================================================
// 🗑️ 업체 일괄 삭제 시스템
// ============================================================
window._bizSelectedSet = window._bizSelectedSet || {};

function onBizRowCheck(chk) {
  var bizId = chk.getAttribute('data-bizid');
  if (!bizId) return;
  if (chk.checked) {
    window._bizSelectedSet[bizId] = true;
  } else {
    delete window._bizSelectedSet[bizId];
  }
  updateBizBulkBar();
}

function toggleBizSelectAll(chk) {
  var activeBiz = businesses.filter(b => !b.deleted);
  if (chk.checked) {
    activeBiz.forEach(function(b) { window._bizSelectedSet[b.id] = true; });
  } else {
    activeBiz.forEach(function(b) { delete window._bizSelectedSet[b.id]; });
  }
  document.querySelectorAll('.biz-row-chk').forEach(function(c) { c.checked = chk.checked; });
  updateBizBulkBar();
}

function clearBizSelection() {
  window._bizSelectedSet = {};
  document.querySelectorAll('.biz-row-chk').forEach(function(c) { c.checked = false; });
  var allChk = document.getElementById('bizSelectAllChk');
  if (allChk) allChk.checked = false;
  updateBizBulkBar();
}

function updateBizBulkBar() {
  var bar = document.getElementById('bizBulkActionBar');
  if (!bar) return;
  if (!isAdminMode) { bar.style.display = 'none'; return; }
  var count = Object.keys(window._bizSelectedSet || {}).length;
  if (count > 0) {
    bar.style.display = 'flex';
  } else {
    bar.style.display = 'none';
  }
  var cntEl = document.getElementById('bizSelectedCount');
  if (cntEl) cntEl.textContent = count;
}

async function bulkDeleteSelectedBiz() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  var ids = Object.keys(window._bizSelectedSet || {});
  if (ids.length === 0) { showToast('t1','⚠️ 선택된 업체 없음',''); return; }

  var names = ids.map(function(id) {
    var b = businesses.find(function(x){ return String(x.id) === String(id); });
    return b ? b.name : id;
  }).slice(0, 5).join(', ') + (ids.length > 5 ? ' 외 ' + (ids.length-5) + '곳' : '');

  if (!confirm(ids.length + '개 업체를 휴지통으로 이동할까요?\n\n' + names + '\n\n거래 이력은 보존되며 30일 안에 복구 가능해요.')) return;
  if (!confirm('정말 ' + ids.length + '개 업체를 모두 휴지통으로 이동하시겠어요?\n\n마지막 확인입니다.')) return;

  var deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  var successCount = 0;

  for (var i = 0; i < ids.length; i++) {
    var id = ids[i];
    var idx = businesses.findIndex(function(b) { return String(b.id) === String(id); });
    if (idx < 0) continue;
    var biz = businesses[idx];
    biz.deleted = true;
    biz.deletedAt = new Date().toISOString().slice(0,10);
    try { softDeleteBizInDB(biz.id); } catch(e) {}
    businesses.splice(idx, 1);
    deletedList.unshift(biz);
    successCount++;
  }
  localStorage.setItem('hiveoil_deleted_biz', JSON.stringify(deletedList));
  saveBusinesses();
  window._bizSelectedSet = {};

  showToast('t1','🗑️ 일괄 휴지통 이동', successCount + '개 업체 이동 완료');
  renderRegBizList();
  renderDeletedBizList && renderDeletedBizList();
  updateDashboardStats && updateDashboardStats();
  updateDashboard && updateDashboard();
  updateBizTrashCount();
  // 지도 갱신
  markers.forEach(function(o){ if (o.overlay) o.overlay.setMap(null); });
  infoWindows.forEach(function(iw){ iw.setMap(null); });
  markers = []; infoWindows = [];
  if (kakaoMap) renderBizList && renderBizList();
}

// 업체 휴지통 카운트
function updateBizTrashCount() {
  var deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  var el = document.getElementById('bizTrashCount');
  if (el) {
    if (deletedList.length > 0) {
      el.textContent = deletedList.length;
      el.style.display = 'inline-block';
    } else {
      el.style.display = 'none';
    }
  }
}

// 업체 휴지통 모달
function showBizTrashModal() {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  var deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  // 30일 지난 항목 자동 제거
  var thirtyDaysAgo = new Date(Date.now() - 30*24*60*60*1000).toISOString().slice(0,10);
  var beforeCount = deletedList.length;
  deletedList = deletedList.filter(function(b) {
    return !b.deletedAt || b.deletedAt > thirtyDaysAgo;
  });
  if (deletedList.length !== beforeCount) {
    localStorage.setItem('hiveoil_deleted_biz', JSON.stringify(deletedList));
  }

  var existing = document.getElementById('bizTrashModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'bizTrashModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  var html = '<div style="background:#fff;border-radius:14px;max-width:680px;width:100%;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;">'
    + '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">'
    + '<div><div style="font-family:var(--font-display);font-size:18px;font-weight:800;">🗑️ 업체 휴지통</div>'
    + '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">30일 안에 복구 가능 · 거래 이력 보존됨</div></div>'
    + '<button onclick="document.getElementById(\'bizTrashModal\').remove()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;width:32px;height:32px;font-size:16px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="flex:1;overflow-y:auto;padding:16px 24px;">';

  if (deletedList.length === 0) {
    html += '<div style="text-align:center;padding:60px 20px;color:#999;"><div style="font-size:48px;margin-bottom:12px;">🗑️</div><div style="font-size:14px;font-weight:600;">휴지통이 비어있어요</div></div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
      + '<thead><tr style="background:#F5F5F5;">'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">업체명</th>'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">유형</th>'
      + '<th style="padding:8px;text-align:left;font-size:11px;color:#666;">삭제일</th>'
      + '<th style="padding:8px;text-align:center;font-size:11px;color:#666;">남은 일수</th>'
      + '<th style="padding:8px;text-align:right;font-size:11px;color:#666;">처리</th>'
      + '</tr></thead><tbody>';
    var now = Date.now();
    var thirtyDays = 30 * 24 * 60 * 60 * 1000;
    deletedList.forEach(function(b) {
      var delDate = b.deletedAt ? new Date(b.deletedAt) : new Date();
      var remainMs = thirtyDays - (now - delDate.getTime());
      var remainDays = Math.max(0, Math.ceil(remainMs / (24*60*60*1000)));
      var remainColor = remainDays <= 3 ? '#C0392B' : remainDays <= 7 ? '#E65100' : '#666';
      html += '<tr style="border-bottom:1px solid #EEE;">'
        + '<td style="padding:9px 8px;font-weight:700;">' + (b.name || '—') + '</td>'
        + '<td style="padding:9px 8px;color:#666;">' + (b.type || '—') + '</td>'
        + '<td style="padding:9px 8px;color:#888;font-size:11px;">' + (b.deletedAt || '—') + '</td>'
        + '<td style="padding:9px 8px;text-align:center;color:' + remainColor + ';font-weight:700;">' + remainDays + '일</td>'
        + '<td style="padding:9px 8px;text-align:right;white-space:nowrap;">'
        + '<button onclick="restoreBiz(' + b.id + ');document.getElementById(\'bizTrashModal\').remove();setTimeout(showBizTrashModal,100);" style="background:#E8F5E9;color:#2E7D32;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px;font-family:var(--font-body);">↩️ 복구</button>'
        + '<button onclick="permanentDeleteBiz(' + b.id + ')" style="background:#FFEBEE;color:#C0392B;border:none;border-radius:5px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🚫 영구삭제</button>'
        + '</td></tr>';
    });
    html += '</tbody></table>';
  }

  html += '</div>'
    + '<div style="background:#F8F8F8;padding:12px 24px;border-top:1px solid #EEE;display:flex;justify-content:space-between;align-items:center;">'
    + '<div style="font-size:11px;color:#999;">총 ' + deletedList.length + '곳 보관 중</div>'
    + (deletedList.length > 0 ? '<button onclick="emptyBizTrash()" style="background:#FFF5F5;color:#C0392B;border:1px solid #FFB3B3;border-radius:6px;padding:7px 14px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">🚫 휴지통 비우기</button>' : '')
    + '</div>'
    + '</div>';

  modal.innerHTML = html;
  document.body.appendChild(modal);
}

function permanentDeleteBiz(id) {
  if (!confirm('이 업체를 영구 삭제할까요?\n\n⚠️ 복구할 수 없어요!')) return;
  var deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  var idx = deletedList.findIndex(function(b){ return b.id === id; });
  if (idx < 0) return;
  var name = deletedList[idx].name;
  // DB에서도 영구 삭제 시도
  try {
    db.from('businesses').delete().eq('id', id).then(function(){});
  } catch(e) {}
  deletedList.splice(idx, 1);
  localStorage.setItem('hiveoil_deleted_biz', JSON.stringify(deletedList));
  showToast('t1','🚫 영구 삭제 완료', name);
  document.getElementById('bizTrashModal').remove();
  setTimeout(showBizTrashModal, 100);
  updateBizTrashCount();
}

function emptyBizTrash() {
  var deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  if (deletedList.length === 0) return;
  if (!confirm('휴지통의 ' + deletedList.length + '곳을 모두 영구 삭제할까요?\n\n⚠️ 복구할 수 없어요!')) return;
  if (!confirm('정말 모두 영구 삭제하시겠어요?\n\n마지막 확인입니다.')) return;
  // DB에서 일괄 영구 삭제
  deletedList.forEach(function(b) {
    try { db.from('businesses').delete().eq('id', b.id).then(function(){}); } catch(e) {}
  });
  localStorage.setItem('hiveoil_deleted_biz', '[]');
  showToast('t1','🚫 휴지통 비움', deletedList.length + '곳 영구 삭제');
  document.getElementById('bizTrashModal').remove();
  updateBizTrashCount();
}

// ============================================================
// 📊 엑셀 백업 시스템 (SheetJS)
// ============================================================
function _ensureXLSX() {
  if (typeof XLSX === 'undefined') {
    showToast('t1','⚠️ 엑셀 라이브러리 로드 실패','잠시 후 다시 시도해주세요');
    return false;
  }
  return true;
}

function _todayStamp() {
  var d = new Date();
  return d.getFullYear() + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0') + '_' + String(d.getHours()).padStart(2,'0') + String(d.getMinutes()).padStart(2,'0');
}

// 업체 목록만 엑셀
function exportBusinessesExcel() {
  if (!_ensureXLSX()) return;
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }

  var rows = businesses.filter(function(b){ return !b.deleted; }).map(function(b) {
    return {
      '업체ID': b.id,
      '업체명': b.name || '',
      '유형': b.type || '',
      '대표자': b.owner || '',
      '전화번호': b.phone || '',
      '주소': b.addr || '',
      '위도': b.lat || '',
      '경도': b.lng || '',
      '새식용유 재고(캔)': getBizTotalNewOil ? getBizTotalNewOil(b) : (b.newOil || 0),
      '폐식용유 대기(캔)': b.wasteOil || 0,
      '자동발주': b.auto ? 'ON' : 'OFF',
      '자동발주 수량': b.autoQty || 0,
      'ISCC 동의': b.iscc_agreed ? '✓' : '미동의',
      '마케팅 동의': b.marketing_agreed ? '✓' : '미동의',
      '품목 정보': b.oilProducts ? JSON.stringify(b.oilProducts) : '',
      '등록일': b.regDate || ''
    };
  });

  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:8},{wch:20},{wch:10},{wch:10},{wch:14},{wch:30},{wch:11},{wch:11},{wch:14},{wch:14},{wch:10},{wch:12},{wch:10},{wch:11},{wch:30},{wch:12}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '업체목록');
  XLSX.writeFile(wb, '식용유니버스_업체목록_' + _todayStamp() + '.xlsx');
  showToast('t1','📥 업체 엑셀 다운로드', rows.length + '개 업체');
}

// 진행 이력만 엑셀
function exportHistoryExcel() {
  if (!_ensureXLSX()) return;
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }

  var rows = historyData.filter(function(h){ return !h.deleted_at; }).map(function(h) {
    return {
      '날짜': h.date || '',
      '업체명': h.biz || '',
      '구분': h.type || '',
      '내용': h.content || '',
      '수량(캔)': h.qty || 0,
      '금액': h.amount || '',
      '처리방식': h.method || '',
      '상태': h.status || '',
      '품목코드': h.productKey || '',
      '품목명': h.productName || '',
      '납품예정일': h.visitLabel || h.visitDate || '',
      'DB ID': h.dbId || ''
    };
  });

  var ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:14},{wch:20},{wch:11},{wch:30},{wch:9},{wch:13},{wch:11},{wch:9},{wch:11},{wch:14},{wch:14},{wch:8}];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '진행이력');
  XLSX.writeFile(wb, '식용유니버스_진행이력_' + _todayStamp() + '.xlsx');
  showToast('t1','📥 이력 엑셀 다운로드', rows.length + '건');
}

// 전체 백업 — 모든 시트 한 파일에
function exportFullBackupExcel() {
  if (!_ensureXLSX()) return;
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }

  if (!confirm('전체 데이터를 엑셀로 백업할까요?\n\n포함:\n· 업체 목록\n· 진행 이력\n· 정산 내역\n· 가격 변동\n· 휴지통 (업체·이력)\n\n파일이 좀 클 수 있어요.')) return;

  var wb = XLSX.utils.book_new();
  var stamp = _todayStamp();

  // 시트 1: 업체 목록
  var bizRows = businesses.filter(function(b){return !b.deleted;}).map(function(b) {
    return {
      'ID': b.id, '업체명': b.name || '', '유형': b.type || '',
      '대표자': b.owner || '', '전화': b.phone || '', '주소': b.addr || '',
      '위도': b.lat || '', '경도': b.lng || '',
      '새식용유(캔)': getBizTotalNewOil ? getBizTotalNewOil(b) : (b.newOil || 0),
      '폐식용유(캔)': b.wasteOil || 0,
      '자동발주': b.auto ? 'ON' : 'OFF', '자동수량': b.autoQty || 0,
      'ISCC동의': b.iscc_agreed ? '✓' : '×',
      '마케팅동의': b.marketing_agreed ? '✓' : '×',
      '품목': b.oilProducts ? JSON.stringify(b.oilProducts) : '',
      '등록일': b.regDate || ''
    };
  });
  if (bizRows.length > 0) {
    var ws1 = XLSX.utils.json_to_sheet(bizRows);
    ws1['!cols'] = [{wch:6},{wch:20},{wch:10},{wch:10},{wch:14},{wch:30},{wch:11},{wch:11},{wch:12},{wch:12},{wch:9},{wch:9},{wch:9},{wch:11},{wch:30},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws1, '업체목록');
  }

  // 시트 2: 진행 이력
  var histRows = historyData.filter(function(h){return !h.deleted_at;}).map(function(h) {
    return {
      '날짜': h.date || '', '업체': h.biz || '', '구분': h.type || '',
      '내용': h.content || '', '수량': h.qty || 0, '금액': h.amount || '',
      '처리방식': h.method || '', '상태': h.status || '',
      '품목코드': h.productKey || '', '품목명': h.productName || '',
      '납품예정': h.visitLabel || h.visitDate || '', 'DBID': h.dbId || ''
    };
  });
  if (histRows.length > 0) {
    var ws2 = XLSX.utils.json_to_sheet(histRows);
    ws2['!cols'] = [{wch:14},{wch:20},{wch:11},{wch:28},{wch:8},{wch:13},{wch:11},{wch:9},{wch:11},{wch:14},{wch:14},{wch:8}];
    XLSX.utils.book_append_sheet(wb, ws2, '진행이력');
  }

  // 시트 3: 정산 내역 (현재 기준 월별 자동 집계)
  try {
    var billingRows = [];
    var yearMonths = {};
    historyData.forEach(function(h) {
      if (h.deleted_at) return;
      if (!h.rawDate || h.status !== 'done') return;
      var d = new Date(h.rawDate);
      var ym = d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0');
      yearMonths[ym] = true;
    });
    Object.keys(yearMonths).sort().forEach(function(ym) {
      var bizStat = {};
      var parts = ym.split('.');
      var yr = parseInt(parts[0]), mo = parseInt(parts[1]);
      historyData.forEach(function(h) {
        if (h.deleted_at || !h.rawDate || h.status !== 'done') return;
        var d = new Date(h.rawDate);
        if (d.getFullYear() !== yr || d.getMonth()+1 !== mo) return;
        if (!bizStat[h.bizId]) {
          var biz = businesses.find(function(x){ return x.id === h.bizId; });
          bizStat[h.bizId] = { name: biz ? biz.name : '?', type: biz ? biz.type : '', dQty:0, dAmt:0, wQty:0, wAmt:0 };
        }
        var amt = parseInt((h.amount||'0').replace(/[^0-9]/g,'')) || 0;
        if (h.type === '식용유발주') { bizStat[h.bizId].dQty += h.qty||0; bizStat[h.bizId].dAmt += amt; }
        if (h.type === '폐유수거')   { bizStat[h.bizId].wQty += h.qty||0; bizStat[h.bizId].wAmt += amt; }
      });
      Object.keys(bizStat).forEach(function(bid) {
        var s = bizStat[bid];
        billingRows.push({
          '월': ym, '업체': s.name, '유형': s.type,
          '납품 수량(캔)': s.dQty, '납품 금액': s.dAmt,
          '수거 수량(캔)': s.wQty, '수거 금액': s.wAmt,
          '정산 청구액': s.dAmt - s.wAmt
        });
      });
    });
    if (billingRows.length > 0) {
      var ws3 = XLSX.utils.json_to_sheet(billingRows);
      ws3['!cols'] = [{wch:9},{wch:20},{wch:10},{wch:13},{wch:13},{wch:13},{wch:13},{wch:14}];
      XLSX.utils.book_append_sheet(wb, ws3, '정산내역');
    }
  } catch(e) { console.warn('정산 시트 생성 실패:', e); }

  // 시트 4: 가격 변동 이력
  try {
    var priceHist = JSON.parse(localStorage.getItem('hiveoil_price_history') || '[]');
    if (priceHist.length > 0) {
      var priceRows = priceHist.map(function(p) {
        return {
          '날짜': p.date || '', '품목': p.product || '',
          '이전 가격': p.before || '', '변경 가격': p.after || '',
          '변경자': p.by || ''
        };
      });
      var ws4 = XLSX.utils.json_to_sheet(priceRows);
      ws4['!cols'] = [{wch:14},{wch:14},{wch:12},{wch:12},{wch:12}];
      XLSX.utils.book_append_sheet(wb, ws4, '가격변동');
    }
  } catch(e) {}

  // 시트 5: 휴지통 — 업체
  var bizTrashRows = (JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]')).map(function(b) {
    return {
      'ID': b.id, '업체명': b.name || '', '유형': b.type || '',
      '대표자': b.owner || '', '전화': b.phone || '', '주소': b.addr || '',
      '삭제일': b.deletedAt || ''
    };
  });
  if (bizTrashRows.length > 0) {
    var ws5 = XLSX.utils.json_to_sheet(bizTrashRows);
    ws5['!cols'] = [{wch:6},{wch:20},{wch:10},{wch:10},{wch:14},{wch:30},{wch:12}];
    XLSX.utils.book_append_sheet(wb, ws5, '휴지통_업체');
  }

  // 시트 6: 휴지통 — 이력
  var histTrashRows = historyData.filter(function(h){ return h.deleted_at; }).map(function(h) {
    return {
      '날짜': h.date || '', '업체': h.biz || '', '구분': h.type || '',
      '내용': h.content || '', '수량': h.qty || 0, '금액': h.amount || '',
      '삭제일시': h.deleted_at || ''
    };
  });
  if (histTrashRows.length > 0) {
    var ws6 = XLSX.utils.json_to_sheet(histTrashRows);
    ws6['!cols'] = [{wch:14},{wch:20},{wch:11},{wch:28},{wch:8},{wch:13},{wch:20}];
    XLSX.utils.book_append_sheet(wb, ws6, '휴지통_이력');
  }

  // 시트 7: 메타정보
  var metaRows = [
    {'항목': '백업 시각', '값': new Date().toLocaleString('ko-KR')},
    {'항목': '빌드 버전', '값': window.APP_BUILD || ''},
    {'항목': '활성 업체 수', '값': bizRows.length},
    {'항목': '진행 이력 건수', '값': histRows.length},
    {'항목': '정산 행 수', '값': (typeof billingRows !== 'undefined') ? billingRows.length : 0},
    {'항목': '휴지통 업체', '값': bizTrashRows.length},
    {'항목': '휴지통 이력', '값': histTrashRows.length}
  ];
  var wsMeta = XLSX.utils.json_to_sheet(metaRows);
  wsMeta['!cols'] = [{wch:18},{wch:30}];
  XLSX.utils.book_append_sheet(wb, wsMeta, '백업정보');

  XLSX.writeFile(wb, '식용유니버스_전체백업_' + stamp + '.xlsx');
  showToast('t1','📊 전체 백업 완료', '엑셀 파일이 다운로드됐어요');
}

function restoreBiz(id) {
  if (!isAdminMode) return;
  const deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  const idx = deletedList.findIndex(b => b.id === id);
  if (idx === -1) return;
  const biz = deletedList[idx];
  delete biz.deleted;
  delete biz.deletedAt;
  businesses.push(biz);
  deletedList.splice(idx, 1);
  localStorage.setItem('hiveoil_deleted_biz', JSON.stringify(deletedList));
  restoreBizInDB(biz.id);
  saveBusinesses();
  renderRegBizList();
  renderDeletedBizList();
  updateDashboard();
  showToast('t1','✅ 업체 복구됨', biz.name + ' — 목록에 다시 추가됐어요');
}

function renderDeletedBizList() {
  const section = document.getElementById('deletedBizSection');
  if (!section) return;
  const deletedList = JSON.parse(localStorage.getItem('hiveoil_deleted_biz') || '[]');
  if (deletedList.length === 0) { section.style.display = 'none'; return; }
  section.style.display = '';
  const listEl = document.getElementById('deletedBizList');
  if (!listEl) return;
  listEl.innerHTML = deletedList.map(b => `
    <div style="background:var(--white);border-radius:var(--radius-sm);padding:11px 14px;box-shadow:var(--shadow);display:flex;align-items:center;gap:10px;border-left:3px solid #aaa;">
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;color:#888;">${b.name} <span style="font-size:10px;color:#bbb;">(삭제: ${b.deletedAt || '—'})</span></div>
        <div style="font-size:10px;color:#bbb;margin-top:1px;">${b.type || ''} · ${(b.addr||'').substring(0,25)}</div>
      </div>
      <button onclick="restoreBiz(${b.id})" style="background:#E8F5E9;border:none;border-radius:7px;padding:5px 12px;font-size:11px;font-weight:700;color:#2E7D32;cursor:pointer;white-space:nowrap;">↩ 복구</button>
    </div>
  `).join('');
}

function addMarker(biz) {
  if (kakaoMap) addMarkerToMap(biz);
}

function updateDashboardStats() {
  const statEl = document.querySelector('.stat-card.green .stat-value');
  if (statEl) statEl.textContent = businesses.length;
}

// 초기 등록 목록 렌더링
renderRegBizList();


// ===== 모바일 하단 탭 =====
const TAB_PANELS = ['dashboard','map','waste','qr'];

function showPanelMobile(id, tabEl) {
  // 탭 활성화
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  if (tabEl) tabEl.classList.add('active');
  // 패널 전환
  showPanel(id, null, true);
}

// 탭바 동기화는 showPanel 내부에서 직접 처리

// 뱃지 업데이트 함수
function updateTabBadges() {
  const wasteCount  = businesses.filter(b => shouldAutoCollect(b)).length;
  const alertCount  = businesses.filter(b => shouldAutoOrder(b) || shouldAutoCollect(b)).length;

  // 하단 탭 뱃지
  const wBadge = document.getElementById('tabBadgeWaste');
  if (wBadge) { wBadge.textContent = wasteCount; wBadge.style.display = wasteCount > 0 ? 'block' : 'none'; }
  const mapBadge = document.getElementById('tabBadgeMap');
  if (mapBadge) { mapBadge.textContent = alertCount; mapBadge.style.display = alertCount > 0 ? 'block' : 'none'; }

  // 납품 뱃지
  updateDeliveryBadge();
  // 사이드바 뱃지
  const sideWaste = document.getElementById('sideWasteBadge');
  if (sideWaste) { sideWaste.textContent = wasteCount; sideWaste.style.display = wasteCount > 0 ? 'inline-block' : 'none'; }
  const sideMap = document.getElementById('sideMapBadge');
  if (sideMap) { sideMap.textContent = alertCount; sideMap.style.display = alertCount > 0 ? 'inline-block' : 'none'; }
}

// 초기 뱃지 세팅
setTimeout(updateTabBadges, 500);


// ===== ESG 패널 렌더 =====
// ISCC 미동의 업체는 포인트 적립 제외
function isIsccAgreed(bizId) {
  if (!bizId) return false;
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  return biz && biz.iscc_agreed === true;
}

// ============================================================
// 🌿 ESG 포인트 이력 렌더 (필터링 + 요약)
// ============================================================
function renderEsgPointHistory() {
  // 관리자만 차감 버튼 노출
  var deductBtn = document.getElementById('esgDeductBtn');
  if (deductBtn) deductBtn.style.display = (typeof isAdminMode !== 'undefined' && isAdminMode) ? 'inline-block' : 'none';

  // 업체 셀렉트 채우기 (한 번만)
  var bizSel = document.getElementById('esgPointBizFilter');
  if (bizSel && bizSel.options.length <= 1) {
    var sortedBizs = businesses.slice().sort(function(a,b){
      return (a.name || '').localeCompare(b.name || '');
    });
    sortedBizs.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name;
      bizSel.appendChild(opt);
    });
  }

  var fromDateEl = document.getElementById('esgPointFromDate');
  var toDateEl = document.getElementById('esgPointToDate');
  var bizFilterEl = document.getElementById('esgPointBizFilter');
  var kindFilterEl = document.getElementById('esgPointKindFilter');
  var listEl = document.getElementById('esgPointHistoryList');
  if (!listEl) return;

  var fromDate = fromDateEl ? fromDateEl.value : '';
  var toDate = toDateEl ? toDateEl.value : '';
  var bizFilter = bizFilterEl ? bizFilterEl.value : '';
  var kindFilter = kindFilterEl ? kindFilterEl.value : '';

  // 업주 모드 → 본인 업체만
  var isOwner = (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn) && (typeof ownerBizId !== 'undefined' && ownerBizId);
  if (isOwner) bizFilter = String(ownerBizId);

  // 필터링
  var filtered = historyData.filter(function(h) {
    if (h.deleted_at) return false;
    if (h.status !== 'done') return false;
    var hasEarned = (h.earnedPoints || 0) > 0;
    var hasUsed = (h.usedPoints || 0) > 0;
    if (!hasEarned && !hasUsed) return false;

    if (kindFilter === 'earned' && !hasEarned) return false;
    if (kindFilter === 'used' && !hasUsed) return false;

    if (bizFilter && String(h.bizId) !== String(bizFilter)) return false;

    if (fromDate || toDate) {
      var d = h.rawDate ? new Date(h.rawDate) : null;
      if (!d || isNaN(d)) return false;
      if (fromDate && d < new Date(fromDate + 'T00:00:00')) return false;
      if (toDate && d > new Date(toDate + 'T23:59:59')) return false;
    }
    return true;
  });

  // 시간순 정렬 (최신이 위)
  filtered.sort(function(a,b){ return new Date(b.rawDate) - new Date(a.rawDate); });

  // 요약 합계
  var earnedSum = 0, usedSum = 0;
  filtered.forEach(function(h) {
    earnedSum += (h.earnedPoints || 0);
    usedSum += (h.usedPoints || 0);
  });
  var balance = earnedSum - usedSum;

  var setText = function(id, v){ var el = document.getElementById(id); if (el) el.textContent = v; };
  setText('esgPointEarnedSum', earnedSum.toLocaleString() + ' pt');
  setText('esgPointUsedSum', usedSum.toLocaleString() + ' pt');
  setText('esgPointBalance', balance.toLocaleString() + ' pt');

  // 리스트
  if (filtered.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:12px;">📭 조건에 맞는 포인트 이력이 없어요</div>';
    return;
  }

  // 렌더 (최신순)
  var html = filtered.map(function(h) {
    var d = new Date(h.rawDate);
    var dateStr = d.getFullYear() + '.' + ('0'+(d.getMonth()+1)).slice(-2) + '.' + ('0'+d.getDate()).slice(-2);
    var timeStr = ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2);
    var earned = h.earnedPoints || 0;
    var used = h.usedPoints || 0;
    var biz = businesses.find(function(b){ return String(b.id) === String(h.bizId); });
    var bizName = biz ? biz.name : (h.biz || '—');

    // 타입별 표시
    var typeIcon, typeLabel, subInfo;
    if (h.type === 'point_deduct') {
      typeIcon = '💸';
      typeLabel = '포인트 차감';
      subInfo = (h.content || '관리자 수동 차감');
    } else if (h.type === '식용유발주') {
      typeIcon = '📦';
      typeLabel = '식용유 납품';
      var amt1 = parseInt((h.amount || '0').toString().replace(/[^0-9]/g,'')) || 0;
      subInfo = (h.qty||0) + '캔 · ' + amt1.toLocaleString() + '원';
    } else if (h.type === '폐유수거') {
      typeIcon = '♻️';
      typeLabel = '폐유 수거';
      var amt2 = parseInt((h.amount || '0').toString().replace(/[^0-9]/g,'')) || 0;
      subInfo = (h.qty||0) + '캔 · ' + amt2.toLocaleString() + '원';
    } else {
      typeIcon = '📌';
      typeLabel = h.type || '기타';
      subInfo = h.content || '';
    }

    // 관리자만 차감 항목 취소 가능
    var canCancel = (typeof isAdminMode !== 'undefined' && isAdminMode) && h.type === 'point_deduct';
    var cancelBtn = canCancel
      ? '<button onclick="cancelPointDeduct(\'' + (h.dbId || h.id) + '\')" title="이 차감 취소" style="margin-top:4px;padding:3px 8px;font-size:9px;font-weight:700;background:#FFF;border:1px solid #FFCDD2;color:#C62828;border-radius:6px;cursor:pointer;">↩ 취소</button>'
      : '';

    return '<div style="display:flex;align-items:center;gap:12px;padding:12px 4px;border-bottom:1px solid #EEE;' + (h.type === 'point_deduct' ? 'background:#FFF8F0;' : '') + '">'
      + '<div style="font-size:18px;flex-shrink:0;">' + typeIcon + '</div>'
      + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:700;font-size:13px;">' + bizName + '</div>'
        + '<div style="font-size:11px;color:var(--gray);margin-top:2px;">' + typeLabel + ' · ' + subInfo + '</div>'
        + '<div style="font-size:10px;color:#999;margin-top:1px;">' + dateStr + ' ' + timeStr + '</div>'
      + '</div>'
      + '<div style="text-align:right;flex-shrink:0;">'
        + (earned > 0 ? '<div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--green-dark);">+' + earned.toLocaleString() + ' pt</div>' : '')
        + (used > 0 ? '<div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:#FF6B00;">-' + used.toLocaleString() + ' pt</div>' : '')
        + cancelBtn
      + '</div>'
    + '</div>';
  }).join('');

  listEl.innerHTML = html;
}

// 필터 초기화
function resetEsgPointFilters() {
  var ids = ['esgPointFromDate','esgPointToDate','esgPointBizFilter','esgPointKindFilter'];
  ids.forEach(function(id){ var el = document.getElementById(id); if (el) el.value = ''; });
  renderEsgPointHistory();
}

// ============================================================
// 💸 포인트 차감 모달 (관리자 전용)
// ============================================================
function showDeductPointsModal() {
  if (typeof isAdminMode === 'undefined' || !isAdminMode) {
    showToast('t1','🔒 관리자 전용', '관리자 모드에서만 사용 가능');
    return;
  }

  var existing = document.getElementById('deductPointsModal');
  if (existing) existing.remove();

  // 잔액이 있는 업체만 셀렉트 (잔액 0인 업체 차감해봐야 음수로 갈 뿐)
  var bizListWithBalance = businesses.filter(function(b){ return !b.deleted; }).map(function(b){
    var bal = (typeof getBizPointBalance === 'function') ? getBizPointBalance(b.id) : 0;
    return { biz: b, balance: bal };
  }).sort(function(a,b){ return b.balance - a.balance; });

  var bizOptions = bizListWithBalance.map(function(item){
    var opt = '<option value="' + item.biz.id + '" data-balance="' + item.balance + '">'
      + item.biz.name + ' (잔액 ' + item.balance.toLocaleString() + ' pt)'
      + '</option>';
    return opt;
  }).join('');

  var modal = document.createElement('div');
  modal.id = 'deductPointsModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.style.zIndex = '10000';
  modal.style.padding = '20px';

  modal.innerHTML = ''
    + '<div style="background:#fff;border-radius:14px;width:100%;max-width:480px;max-height:90vh;overflow-y:auto;">'
      + '<div style="background:linear-gradient(135deg,#FF6B00,#E55A00);color:#fff;padding:18px 22px;border-radius:14px 14px 0 0;display:flex;align-items:center;justify-content:space-between;">'
        + '<div>'
          + '<div style="font-family:var(--font-display);font-size:17px;font-weight:800;">💸 포인트 차감</div>'
          + '<div style="font-size:11px;color:rgba(255,255,255,0.85);margin-top:2px;">관리자 직접 차감 — 이력에 자동 기록됩니다</div>'
        + '</div>'
        + '<button onclick="document.getElementById(\'deductPointsModal\').remove()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;width:32px;height:32px;font-size:15px;cursor:pointer;">✕</button>'
      + '</div>'
      + '<div style="padding:20px 22px;">'
        + '<div style="margin-bottom:14px;">'
          + '<div style="font-size:11px;font-weight:700;color:#666;margin-bottom:5px;">🏪 대상 업체</div>'
          + '<select id="deductBizSelect" onchange="updateDeductBalanceDisplay()" style="width:100%;padding:11px;border:1.5px solid #DDE8E1;border-radius:8px;font-size:13px;font-family:var(--font-body);background:#fff;box-sizing:border-box;">'
            + '<option value="">선택해주세요</option>'
            + bizOptions
          + '</select>'
          + '<div id="deductBalanceDisplay" style="font-size:11px;color:#1565C0;margin-top:6px;font-weight:600;display:none;"></div>'
        + '</div>'
        + '<div style="margin-bottom:14px;">'
          + '<div style="font-size:11px;font-weight:700;color:#666;margin-bottom:5px;">💸 차감 포인트</div>'
          + '<input type="number" id="deductAmount" min="1" placeholder="차감할 포인트 (예: 5000)" style="width:100%;padding:11px;border:1.5px solid #DDE8E1;border-radius:8px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">'
          + '<div style="font-size:10px;color:var(--gray);margin-top:4px;">잔액 한도 내에서만 차감 가능합니다</div>'
        + '</div>'
        + '<div style="margin-bottom:14px;">'
          + '<div style="font-size:11px;font-weight:700;color:#666;margin-bottom:5px;">📝 차감 사유 <span style="color:#C62828;">*</span></div>'
          + '<input type="text" id="deductReason" placeholder="예: 현금 환급 / 식용유 결제 사용 / 상품권 교환" style="width:100%;padding:11px;border:1.5px solid #DDE8E1;border-radius:8px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">'
          + '<div style="font-size:10px;color:var(--gray);margin-top:4px;">사유는 이력에 기록됩니다 — 필수 입력</div>'
        + '</div>'
        + '<div style="display:flex;gap:8px;margin-top:18px;">'
          + '<button onclick="document.getElementById(\'deductPointsModal\').remove()" style="flex:1;background:#F5F5F5;color:#666;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>'
          + '<button onclick="executeDeductPoints()" style="flex:2;background:linear-gradient(135deg,#FF6B00,#E55A00);color:#fff;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">💸 차감 실행</button>'
        + '</div>'
      + '</div>'
    + '</div>';

  document.body.appendChild(modal);
}

// 셀렉트 변경 시 잔액 표시 갱신
function updateDeductBalanceDisplay() {
  var sel = document.getElementById('deductBizSelect');
  var disp = document.getElementById('deductBalanceDisplay');
  if (!sel || !disp) return;
  if (!sel.value) { disp.style.display = 'none'; return; }
  var balance = parseInt(sel.options[sel.selectedIndex].getAttribute('data-balance')) || 0;
  disp.style.display = 'block';
  disp.innerHTML = '💰 현재 잔액: <strong>' + balance.toLocaleString() + ' pt</strong>';
  disp.style.color = balance > 0 ? '#1565C0' : '#999';
}

// 차감 실행
async function executeDeductPoints() {
  var sel = document.getElementById('deductBizSelect');
  var amtEl = document.getElementById('deductAmount');
  var reasonEl = document.getElementById('deductReason');

  if (!sel || !sel.value) { showToast('t1','⚠️ 입력 오류', '업체를 선택해주세요'); return; }
  var bizId = sel.value;
  var amount = parseInt(amtEl ? amtEl.value : 0) || 0;
  if (amount <= 0) { showToast('t1','⚠️ 입력 오류', '차감 포인트를 0보다 크게 입력해주세요'); return; }
  var reason = (reasonEl ? reasonEl.value : '').trim();
  if (!reason) { showToast('t1','⚠️ 입력 오류', '차감 사유를 입력해주세요'); return; }

  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) { showToast('t1','⚠️ 업체 없음',''); return; }

  var balance = getBizPointBalance(bizId);
  if (amount > balance) {
    showToast('t1','⚠️ 잔액 부족', biz.name + ' 잔액 ' + balance.toLocaleString() + 'pt');
    return;
  }

  if (!confirm(biz.name + '의 포인트 ' + amount.toLocaleString() + 'pt를 차감하시겠습니까?\n\n사유: ' + reason + '\n\n이력에 기록되며, 관리자가 직접 취소하지 않으면 영구적입니다.')) {
    return;
  }

  // history insert
  var now = new Date();
  var record = {
    bizId: biz.id,
    biz: biz.name,
    type: 'point_deduct',
    content: reason,
    qty: 0,
    amount: '0원',
    method: '관리자',
    status: 'done',
    rawDate: now.toISOString(),
    date: now.getFullYear() + '.' + ('0'+(now.getMonth()+1)).slice(-2) + '.' + ('0'+now.getDate()).slice(-2),
    earnedPoints: 0,
    usedPoints: amount,
  };

  // DB에 직접 insert (saveHistoryToDB 사용)
  try {
    if (typeof db !== 'undefined') {
      var payload = {
        biz_id: biz.id,
        biz_name: biz.name,
        type: 'point_deduct',
        content: reason,
        qty: 0,
        amount: '0원',
        method: '관리자',
        status: 'done',
        earned_points: 0,
        used_points: amount,
      };
      var res = await db.from('history').insert([payload]).select('id').single();
      if (res.error) {
        if (/earned_points|used_points/i.test(res.error.message || '')) {
          showToast('t1','⚠️ DB 컬럼 누락','SQL 실행 필요: ALTER TABLE history ADD COLUMN earned_points INT, ADD COLUMN used_points INT;');
          return;
        }
        throw res.error;
      }
      if (res.data && res.data.id) record.dbId = res.data.id;
    }
  } catch(e) {
    console.warn('차감 DB 저장 실패:', e.message);
    showToast('t1','⚠️ DB 저장 실패', e.message || '');
    return;
  }

  // 메모리에도 추가
  historyData.unshift(record);
  saveHistory && saveHistory();

  showToast('t1','✅ 차감 완료', biz.name + ' -' + amount.toLocaleString() + 'pt');
  document.getElementById('deductPointsModal').remove();

  // 화면 갱신
  renderEsgPointHistory();
  if (typeof renderEsgPanel === 'function') renderEsgPanel();
}

// 차감 취소 (관리자만, 차감 이력 → soft delete)
async function cancelPointDeduct(dbId) {
  if (typeof isAdminMode === 'undefined' || !isAdminMode) return;
  if (!dbId) { showToast('t1','⚠️ ID 없음','복구 불가'); return; }
  if (!confirm('이 차감 기록을 취소하시겠습니까?\n\n포인트가 다시 환급되며, 이력에서 제거됩니다.')) return;

  // 메모리에서 찾기
  var item = historyData.find(function(h){ return String(h.dbId) === String(dbId) || String(h.id) === String(dbId); });
  if (!item) { showToast('t1','⚠️ 기록 없음',''); return; }

  // soft delete (deleted_at)
  item.deleted_at = new Date().toISOString();

  try {
    if (typeof db !== 'undefined') {
      // deleted_at 컬럼이 있으면 그걸로, 없으면 바로 delete
      var res = await db.from('history').update({ deleted_at: new Date().toISOString() }).eq('id', dbId);
      if (res.error && /deleted_at/i.test(res.error.message || '')) {
        // 컬럼 없으면 hard delete
        await db.from('history').delete().eq('id', dbId);
        // 메모리에서도 제거
        var idx = historyData.findIndex(function(h){ return String(h.dbId) === String(dbId); });
        if (idx >= 0) historyData.splice(idx, 1);
      }
    }
  } catch(e) { console.warn('차감 취소 실패:', e.message); }

  saveHistory && saveHistory();
  showToast('t1','✅ 차감 취소', '포인트가 복구됐습니다');
  renderEsgPointHistory();
  if (typeof renderEsgPanel === 'function') renderEsgPanel();
}

function renderEsgPanel() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();

  // 🆕 v70: 업주 모드일 때는 본인 업체 데이터만 사용
  var isOwnerMode = (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn) 
                  && (typeof ownerBizId !== 'undefined' && ownerBizId);
  var historyScope = historyData;
  if (isOwnerMode) {
    historyScope = historyData.filter(function(h) { return String(h.bizId) === String(ownerBizId); });
  }

  // 전체 누적 — 폐유수거만 + ISCC 동의 업체만 (kg/CO2 표시용)
  const allWasteDone = historyScope.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done' && isIsccAgreed(h.bizId));
  const totalWasteCans = allWasteDone.reduce((s,h) => s+(h.qty||0), 0);

  // 🌿 새 공식: history.earnedPoints - usedPoints 합산 (잔액 기준)
  // 발주 + 수거 모두 포함, ISCC 미동의는 calcEarnedPoints에서 0 처리됨
  var totalEarnedAll = 0, totalUsedAll = 0;
  historyScope.forEach(function(h) {
    if (h.deleted_at) return;
    totalEarnedAll += (h.earnedPoints || 0);
    totalUsedAll += (h.usedPoints || 0);
  });
  const totalPts = totalEarnedAll - totalUsedAll;  // 잔액

  // 등급 (잔액 기준이 아니라 누적 적립 기준이 더 자연스러움)
  const tier = totalEarnedAll >= 50000 ? '🥇 골드' : totalEarnedAll >= 10000 ? '🥈 실버' : totalEarnedAll >= 1000 ? '🥉 브론즈' : '🌱 새싹';

  // 이번달 — 날짜 파싱 안전하게
  const monthWaste = allWasteDone.filter(h => {
    return isSameMonth(h, thisYear, thisMonth);
  });
  const monthWasteCans = monthWaste.reduce((s,h) => s+(h.qty||0), 0);
  // 이번달 적립 포인트 (새 공식)
  var monthPts = 0;
  historyScope.forEach(function(h) {
    if (h.deleted_at || h.status !== 'done') return;
    if (!isSameMonth(h, thisYear, thisMonth)) return;
    monthPts += (h.earnedPoints || 0);
  });
  const monthCo2 = (monthWasteCans * PRICES.waste.can.kg * PRICES.carbonRate).toFixed(1);

  // ISCC 미동의 업체 수량(참고용)
  const allWasteDoneIncludingNonAgreed = historyScope.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done');
  const nonAgreedCans = allWasteDoneIncludingNonAgreed.reduce((s,h) => s+(h.qty||0), 0) - totalWasteCans;

  const set = (id, v) => { const el = document.getElementById(id); if(el) el.innerHTML = v; };
  set('esg_total_pts',        totalPts.toLocaleString());
  set('esg_tier_badge',       tier);
  set('esg_month_waste_cans', monthWasteCans);
  set('esg_month_pts',        monthPts.toLocaleString());
  set('esg_month_co2',        monthCo2);
  
  // 🆕 v70: 업주 모드일 때 헤더 라벨 변경
  var headerLabelEl = document.querySelector('.esg-strip > div > div:first-child');
  if (headerLabelEl) {
    if (isOwnerMode) {
      var bizName = '';
      try {
        var b = businesses.find(function(x){ return String(x.id) === String(ownerBizId); });
        if (b) bizName = b.name;
      } catch(e) {}
      headerLabelEl.textContent = bizName + ' — 누적 ESG 포인트';
    } else {
      headerLabelEl.textContent = '원주 누적 ESG 포인트';
    }
  }

  // ISCC 미동의 안내 (참고용 — 적립에서 제외된 양 표시)
  var nonAgreedNoticeEl = document.getElementById('esgNonAgreedNotice');
  if (nonAgreedNoticeEl) {
    if (nonAgreedCans > 0) {
      nonAgreedNoticeEl.style.display = 'block';
      nonAgreedNoticeEl.innerHTML = '⚠️ ISCC 미동의 업체 폐유 ' + nonAgreedCans + '캔은 포인트 적립에서 제외됐어요';
    } else {
      nonAgreedNoticeEl.style.display = 'none';
    }
  }

  // 🆕 월간 CO2 절감 랭킹 계산 (ISCC 동의 여부 무관 — 참여 독려용)
  try {
    var rankingEl = document.getElementById('esgMonthlyRanking');
    if (rankingEl) {
      // 이번달 모든 폐유수거 done 이력 (ISCC 미동의 포함)
      var monthAllWaste = allWasteDoneIncludingNonAgreed.filter(function(h){
        return isSameMonth(h, thisYear, thisMonth);
      });
      // 업체별 합산
      var bizCo2 = {};
      monthAllWaste.forEach(function(h) {
        if (!h.bizId) return;
        var bizName = h.biz || '업체' + h.bizId;
        if (!bizCo2[h.bizId]) bizCo2[h.bizId] = { name: bizName, cans: 0, co2: 0 };
        bizCo2[h.bizId].cans += (h.qty || 0);
        bizCo2[h.bizId].co2 += (h.qty || 0) * PRICES.waste.can.kg * PRICES.carbonRate;
      });
      var sorted = Object.values(bizCo2).sort(function(a,b){ return b.co2 - a.co2; });
      
      if (sorted.length === 0) {
        rankingEl.innerHTML = '<div style="text-align:center;padding:18px;color:#888;font-size:12px;">이번 달 폐유 수거 이력이 아직 없어요</div>';
      } else {
        var medals = ['🥇', '🥈', '🥉'];
        var medalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
        var html = '';
        sorted.slice(0, 10).forEach(function(b, idx) {
          var medal = idx < 3 ? medals[idx] : (idx + 1) + '위';
          var bgColor = idx < 3 ? medalColors[idx] : '#fff';
          var textColor = idx < 3 ? '#fff' : '#333';
          html += '<div style="background:' + (idx < 3 ? bgColor : '#fff') + ';border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;border:1.5px solid ' + (idx < 3 ? bgColor : '#E5E5E5') + ';box-shadow:' + (idx < 3 ? '0 3px 10px rgba(0,0,0,0.1)' : 'none') + ';">';
          html += '<div style="font-size:' + (idx < 3 ? 28 : 18) + 'px;flex-shrink:0;width:40px;text-align:center;font-weight:800;color:' + textColor + ';">' + medal + '</div>';
          html += '<div style="flex:1;min-width:0;">';
          html += '<div style="font-size:14px;font-weight:800;color:' + textColor + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + b.name + '</div>';
          html += '<div style="font-size:11px;color:' + (idx < 3 ? 'rgba(255,255,255,0.85)' : '#888') + ';margin-top:2px;">' + b.cans + '캔 수거 · ' + (b.cans * PRICES.waste.can.kg).toFixed(1) + 'kg</div>';
          html += '</div>';
          html += '<div style="text-align:right;flex-shrink:0;">';
          html += '<div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:' + (idx < 3 ? '#fff' : '#0FA366') + ';">' + b.co2.toFixed(1) + '</div>';
          html += '<div style="font-size:9px;color:' + (idx < 3 ? 'rgba(255,255,255,0.85)' : '#888') + ';">kg CO₂</div>';
          html += '</div>';
          html += '</div>';
        });
        rankingEl.innerHTML = html;
      }
    }
  } catch(e) { console.warn('월간 랭킹 계산 오류:', e); }

  // 적립 이력 — 🌿 v100: esgHistoryBody 카드는 v99에서 제거됨
  // 메인 적립 이력은 esgPointHistoryList (renderEsgPointHistory)에서 처리
  // 이 함수는 안전한 no-op로 두어 다른 호출자가 깨지지 않게 유지
  const esgBody = document.getElementById('esgHistoryBody');
  if (!esgBody) return; // 컨테이너 없으면 그대로 종료 (정상)

  // 🆕 v70: 업주 로그인 시 본인 업체만 필터링
  var historyFiltered = allWasteDoneIncludingNonAgreed;
  if (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn && typeof ownerBizId !== 'undefined' && ownerBizId) {
    historyFiltered = allWasteDoneIncludingNonAgreed.filter(function(h) {
      return String(h.bizId) === String(ownerBizId);
    });
  }

  const allDone = [...historyFiltered]
    .sort((a,b) => new Date(b.rawDate||b.date.replaceAll('.','-')) - new Date(a.rawDate||a.date.replaceAll('.','-')))
    .slice(0, 50);

  if (allDone.length === 0) {
    esgBody.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray);font-size:12px;">아직 적립 이력이 없어요</div>';
    return;
  }

  // 누적 잔액 계산 (최신순) — 🌿 v98: 새 공식 (earnedPoints/usedPoints 기반)으로 통일
  // 🆕 업주 모드면 본인 업체 누적, 관리자/드라이버면 전체 누적
  var bizPts;
  if (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn && typeof ownerBizId !== 'undefined' && ownerBizId) {
    bizPts = (typeof getBizPointBalance === 'function') ? getBizPointBalance(ownerBizId) : 0;
  } else {
    bizPts = (typeof getTotalPointBalance === 'function') ? getTotalPointBalance() : totalPts;
  }
  let running = bizPts;
  esgBody.innerHTML = `<table class="history-table">
    <thead><tr><th>날짜</th><th>업체</th><th>적립 사유</th><th style="color:var(--green-main)">포인트</th><th>잔액</th></tr></thead>
    <tbody>
      ${allDone.map(h => {
        const isAgreed = isIsccAgreed(h.bizId);
        const pts = h.earnedPoints || 0;  // 새 공식 (calcEarnedPoints에서 이미 계산됨)
        const bal = running;
        if (pts > 0) running -= pts;
        const qtyKg = ((h.qty||0)*PRICES.waste.can.kg).toFixed(1);
        const label = `폐유 ${h.qty||0}캔 수거 (${qtyKg}kg)`;
        const ptsCell = pts > 0
          ? `<td style="color:var(--green-main);font-weight:700">+${pts.toLocaleString()} pts</td>`
          : (isAgreed
              ? `<td style="color:#aaa;font-weight:600">— <span style="font-size:9px;background:#FFF3E0;color:#E65100;padding:1px 5px;border-radius:4px;margin-left:3px;">미적립</span></td>`
              : `<td style="color:#aaa;font-weight:600">— <span style="font-size:9px;background:#FFF3E0;color:#E65100;padding:1px 5px;border-radius:4px;margin-left:3px;">ISCC 미동의</span></td>`);
        const balCell = `<td style="font-weight:600">${bal.toLocaleString()} pts</td>`;
        return `<tr>
          <td>${h.date}</td>
          <td><strong>${h.biz}</strong></td>
          <td>${label}</td>
          ${ptsCell}
          ${balCell}
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  // 업체별 ESG 현황 (관리자용)
  var bizTableCard = document.getElementById('esgBizTableCard');
  var bizTableBody = document.getElementById('esgBizTableBody');
  if (isAdminMode && bizTableCard && bizTableBody) {
    bizTableCard.style.display = 'block';
    var canKg = PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5;
    var carbonRate = PRICES.carbonRate || 0.7;

    // 🛡️ 활성 업체만 (deleted 제외)
    var activeBiz = businesses.filter(function(b){ return !b.deleted; });
    var rows = activeBiz.map(function(b) {
      // 폐유수거 데이터 (캔/kg/CO2 표시용)
      var wasteList = historyData.filter(function(h){
        if (h.deleted_at) return false;
        return h.bizId === b.id && h.type === '폐유수거' && h.status === 'done';
      });
      var totalCans = wasteList.reduce(function(s,h){ return s+(h.qty||0); }, 0);

      // 🌿 ESG 포인트는 새 공식 (금액 × 5%) — 발주 + 수거 모두 합산
      // 잔액 = 적립 - 차감 (실제 사용 가능한 포인트)
      var balance = (typeof getBizPointBalance === 'function') ? getBizPointBalance(b.id) : 0;
      var totalEarned = 0;
      historyData.forEach(function(h){
        if (h.deleted_at) return;
        if (String(h.bizId) !== String(b.id)) return;
        totalEarned += (h.earnedPoints || 0);
      });

      // 🛡️ 거래 이력이 전혀 없는 업체는 표에서 제외
      if (totalCans === 0 && totalEarned === 0) return null;

      var totalKg = (totalCans * canKg).toFixed(1);
      var co2 = (parseFloat(totalKg) * carbonRate).toFixed(1);
      var agreed = b.iscc_agreed === true;
      var ptsDisplay = agreed
        ? balance.toLocaleString() + ' pts<div style="font-size:9px;color:var(--gray);font-weight:500;margin-top:2px;">누적 ' + totalEarned.toLocaleString() + 'pt</div>'
        : '<span style="color:#999;font-size:10px;">⚠️ ISCC 미동의</span>';
      var isccBtn = agreed
        ? '<button onclick="generateIsccDeclaration(businesses.find(function(x){return String(x.id)===String(' + b.id + ');}))" style="background:#1565C0;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">📋 ISCC</button>'
        : '<span style="font-size:10px;color:#bbb;">발행 불가</span>';
      return '<tr style="border-bottom:1px solid var(--gray-light);' + (agreed ? '' : 'background:#FAFAFA;opacity:0.7;') + '">'
        + '<td style="padding:10px 14px;font-weight:700;">' + b.name + (agreed ? '' : ' <span style="font-size:9px;color:#E65100;">(ISCC 미동의)</span>') + '</td>'
        + '<td style="padding:10px 14px;text-align:center;color:var(--green-dark);font-weight:700;">' + totalCans + '캔</td>'
        + '<td style="padding:10px 14px;text-align:center;">' + totalKg + ' kg</td>'
        + '<td style="padding:10px 14px;text-align:center;color:#2E7D32;font-weight:600;">' + co2 + ' kg</td>'
        + '<td style="padding:10px 14px;text-align:center;color:#1565C0;font-weight:700;">' + ptsDisplay + '</td>'
        + '<td style="padding:10px 14px;text-align:center;"><button onclick="generateEsgReport(' + b.id + ')" style="background:#1F4D30;color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;">📄 인증서</button></td>'
        + '<td style="padding:10px 14px;text-align:center;">' + isccBtn + '</td>'
        + '</tr>';
    }).filter(function(r){ return r !== null; });

    if (rows.length === 0) {
      bizTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px 20px;color:var(--gray);font-size:13px;">📊 폐유 수거 이력이 있는 업체가 없어요<br><span style="font-size:11px;color:#bbb;margin-top:4px;display:inline-block;">수거가 완료되면 이 표에 자동으로 표시됩니다</span></td></tr>';
    } else {
      bizTableBody.innerHTML = rows.join('');
    }
  } else if (bizTableCard) {
    bizTableCard.style.display = 'none';
  }
}
// 가격변동 이력 저장소 (localStorage)
function loadPriceHistory() {
  try { return JSON.parse(localStorage.getItem('hiveoil_price_history') || '[]'); } catch(e) { return []; }
}
function savePriceHistory(list) {
  try { localStorage.setItem('hiveoil_price_history', JSON.stringify(list)); } catch(e) {}
}

// 가격 저장 시 변동 이력 자동 기록 (adminSavePrices에서 호출)
function recordPriceChange(changes) {
  if (!changes || changes.length === 0) return;
  const list = loadPriceHistory();
  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  changes.forEach(c => {
    list.unshift({ date: dateStr, rawDate: now.toISOString(), change: c });
  });
  savePriceHistory(list.slice(0, 100)); // 최대 100건 보관
}

function renderPricePage() {
  const container = document.getElementById('pricePageContent');
  if (!container) return;
  const emojis = { soy:'🫘', canola:'🌿', corn:'🌽', sun:'🌻' };
  const priceHistory = loadPriceHistory();

  container.innerHTML = `
    <!-- 현재 시세 -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header" style="background:#0D0D0D;">
        <div class="card-title" style="color:var(--white);">💹 현재 시세</div>
        <div style="font-size:10px;color:#555;">관리자가 변경 시 즉시 반영</div>
      </div>
      <div style="padding:16px 20px;">
        <div id="priceCurrentCards" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;">
          ${Object.entries(PRICES.oils).map(([k,v]) => `
            <div style="text-align:center;padding:14px 10px;background:var(--green-pale);border-radius:12px;border:2px solid var(--green-light);">
              <div style="font-size:22px;margin-bottom:6px;">${emojis[k]||'🫙'}</div>
              <div style="font-size:11px;color:var(--gray);margin-bottom:4px;">${v.label} 18L</div>
              <div style="font-family:var(--font-display);font-weight:800;font-size:20px;color:var(--green-dark);">${v.price > 0 ? v.price.toLocaleString()+'원' : '—'}</div>
              <div style="font-size:9px;color:var(--green-dark);opacity:0.7;margin-top:2px;">${v.price > 0 ? 'VAT 포함' : '시세 미정'}</div>
            </div>`).join('')}
          <div style="text-align:center;padding:14px 10px;background:#FFF8F0;border-radius:12px;border:2px solid #FFD8A8;">
            <div style="font-size:22px;margin-bottom:6px;">🗑️</div>
            <div style="font-size:11px;color:var(--gray);margin-bottom:4px;">폐유 수거</div>
            <div style="font-family:var(--font-display);font-weight:800;font-size:20px;color:#D4621A;">${PRICES.waste.can.price.toLocaleString()}원</div>
            <div style="font-size:9px;color:var(--gray);margin-top:2px;">/캔</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 유종별 가격변동 추이 -->
    <div class="card" style="margin-bottom:16px;">
      <div class="card-header">
        <div class="card-title">📈 유종별 가격변동 이력</div>
        <div style="font-size:10px;color:var(--gray);">관리자 변경 시점만 기록</div>
      </div>
      <div style="padding:0;">
        ${priceHistory.length === 0 ? `
          <div style="text-align:center;padding:32px;color:var(--gray);">
            <div style="font-size:32px;margin-bottom:8px;">📋</div>
            <div style="font-size:13px;font-weight:600;">아직 가격 변동 이력이 없어요</div>
            <div style="font-size:11px;margin-top:4px;">관리자 페이지에서 시세를 변경하면 자동으로 기록돼요</div>
          </div>` :
          priceHistory.map(h => {
            // 유종 색상
            const isWaste = h.change.includes('폐유');
            const isSoy = h.change.includes('대두유');
            const isCanola = h.change.includes('카놀라유');
            const isCorn = h.change.includes('옥수수유');
            const color = isWaste ? '#D4621A' : isSoy ? '#2E7D32' : isCanola ? '#388E3C' : isCorn ? '#558B2F' : 'var(--gray)';
            const emoji = isWaste ? '🗑️' : isSoy ? '🫘' : isCanola ? '🌿' : isCorn ? '🌽' : '💹';
            return `
            <div style="display:flex;align-items:center;gap:14px;padding:13px 20px;border-bottom:1px solid var(--gray-light);">
              <div style="width:36px;height:36px;background:var(--cream);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">${emoji}</div>
              <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:700;color:${color};">${h.change}</div>
                <div style="font-size:10px;color:var(--gray);margin-top:2px;">${h.date}</div>
              </div>
              <div style="font-size:10px;color:var(--gray);background:var(--cream);padding:3px 9px;border-radius:6px;flex-shrink:0;">변경완료</div>
            </div>`;
          }).join('')
        }
      </div>
    </div>
  `;
}

function renderPriceView() {
  const container = document.getElementById('priceViewContent');
  if (!container) return;
  const priceHistory = loadPriceHistory();
  const typeInfo = {
    soy:    { emoji:'🫘', label:'대두유',     color:'#1B5E20', bg:'#E8F5E9', border:'#A5D6A7' },
    canola: { emoji:'🌿', label:'카놀라유',   color:'#33691E', bg:'#F1F8E9', border:'#C5E1A5' },
    corn:   { emoji:'🌽', label:'옥수수유',   color:'#E65100', bg:'#FFF3E0', border:'#FFCC80' },
    sun:    { emoji:'🌻', label:'해바라기유', color:'#F57F17', bg:'#FFFDE7', border:'#FFF59D' },
  };

  // 유종별 그룹화
  const groups = { soy:[], canola:[], corn:[], sun:[] };
  Object.entries(PRICES.products || {}).forEach(([k, p]) => { if (groups[p.type]) groups[p.type].push([k, p]); });

  container.innerHTML = `
    <!-- 유종별 최저가 요약 - auto-fit으로 해바라기유 추가 대응 -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin-bottom:20px;">
      ${Object.entries(PRICES.oils).map(([k,v]) => {
        const ti = typeInfo[k] || { emoji:'🫙', label:v.label, color:'#666', bg:'#F5F5F5', border:'#DDD' };
        return `<div style="text-align:center;padding:16px 10px;background:${ti.bg};border-radius:14px;border:2px solid ${ti.border};">
          <div style="font-size:22px;margin-bottom:4px;">${ti.emoji}</div>
          <div style="font-size:10px;color:${ti.color};font-weight:700;margin-bottom:4px;">${v.label} 최저가</div>
          <div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:${ti.color};">${v.price > 0 ? v.price.toLocaleString()+'원' : '—'}</div>
          <div style="font-size:9px;color:${ti.color};opacity:0.7;margin-top:2px;">18L · VAT포함</div>
        </div>`;
      }).join('')}
    </div>

    <!-- 폐유 수거 단가 -->
    <div style="background:#FFF8F0;border-radius:14px;padding:14px 18px;margin-bottom:20px;border:2px solid #FFD8A8;display:flex;align-items:center;gap:12px;">
      <span style="font-size:28px;">🗑️</span>
      <div>
        <div style="font-size:11px;color:#E65100;font-weight:700;">폐식용유 수거 단가</div>
        <div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:#D4621A;">${PRICES.waste.can.price.toLocaleString()}원<span style="font-size:12px;font-weight:400;color:var(--gray);"> /캔</span></div>
      </div>
    </div>

    <!-- 제품별 세부 시세 -->
    ${Object.entries(groups).map(([type, prods]) => {
      if (!prods.length) return '';
      const ti = typeInfo[type];
      return `<div style="background:var(--white);border-radius:14px;border:1.5px solid ${ti.border};overflow:hidden;margin-bottom:14px;">
        <div style="background:${ti.bg};padding:12px 16px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:18px;">${ti.emoji}</span>
          <div style="font-family:var(--font-display);font-size:13px;font-weight:800;color:${ti.color};">${ti.label} 제품별 시세</div>
        </div>
        ${prods.map(([, p]) => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid ${ti.border}33;">
          <div>
            <div style="font-size:13px;font-weight:700;">${p.label}</div>
            <div style="font-size:10px;color:var(--gray);">${p.unit} · VAT포함</div>
          </div>
          <div style="font-family:var(--font-display);font-size:17px;font-weight:800;color:${ti.color};">${p.price.toLocaleString()}원</div>
        </div>`).join('')}
      </div>`;
    }).join('')}

    <!-- 가격 변동 이력 -->
    <div style="background:var(--white);border-radius:14px;border:1.5px solid var(--gray-light);overflow:hidden;margin-bottom:14px;">
      <div style="padding:14px 16px;border-bottom:1px solid var(--gray-light);display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">📋</span>
        <div style="font-family:var(--font-display);font-size:13px;font-weight:800;">최근 시세 변동 이력</div>
      </div>
      <div style="padding:0;">
        ${priceHistory.length === 0 ?
          '<div style="text-align:center;padding:28px;color:var(--gray);font-size:12px;">📋 아직 변동 이력이 없어요</div>' :
          priceHistory.slice(0,15).map(h => {
            const isWaste = h.change.includes('폐유');
            const color = isWaste ? '#D4621A' : 'var(--green-dark)';
            const emoji = isWaste ? '🗑️' : h.change.includes('카놀라') ? '🌿' : h.change.includes('옥수수') ? '🌽' : '🫘';
            return `<div style="display:flex;align-items:center;gap:12px;padding:11px 16px;border-bottom:1px solid var(--gray-light)88;">
              <span style="font-size:16px;flex-shrink:0;">${emoji}</span>
              <div style="flex:1;min-width:0;">
                <div style="font-size:12px;font-weight:700;color:${color};">${h.change}</div>
                <div style="font-size:10px;color:var(--gray);margin-top:1px;">${h.date}</div>
              </div>
            </div>`;
          }).join('')
        }
      </div>
    </div>
  `;
}

// ===== 소비자 뷰 렌더링 =====
function renderConsumerView() {
  const today = new Date();
  const dateStr = today.getFullYear() + '.' + String(today.getMonth()+1).padStart(2,'0') + '.' + String(today.getDate()).padStart(2,'0');
  const emojis = { soy:'🫘', canola:'🌿', corn:'🌽' };

  // 날짜
  const dateEl = document.getElementById('consumerPriceDate');
  if (dateEl) dateEl.textContent = dateStr + ' 기준';

  // 식용유 시세
  const oilEl = document.getElementById('consumerOilPrices');
  if (oilEl) {
    oilEl.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px;">
        ${Object.entries(PRICES.oils).map(([k,v]) => `
          <div style="text-align:center;background:var(--green-pale);border-radius:10px;padding:12px 8px;border:1.5px solid var(--green-light);">
            <div style="font-size:22px;margin-bottom:4px">${emojis[k]||'🫙'}</div>
            <div style="font-size:10px;color:var(--gray);margin-bottom:3px">${v.label} 18L</div>
            <div style="font-family:var(--font-display);font-size:18px;font-weight:800;color:var(--green-dark);">${v.price.toLocaleString()}원</div>
            <div style="font-size:9px;color:var(--green-dark);opacity:0.7">VAT포함</div>
          </div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--gray);text-align:center;background:var(--cream);padding:8px;border-radius:8px;">
        💡 시세는 매주 업데이트돼요. 대량 주문 시 별도 문의해주세요.
      </div>`;
  }

  // 폐유 수거 안내
  const wasteEl = document.getElementById('consumerWasteInfo');
  if (wasteEl) {
    wasteEl.innerHTML = `
      <div style="text-align:center;background:#FFF8F0;border-radius:12px;padding:16px;border:1.5px solid #FFD8A8;margin-bottom:12px;">
        <div style="font-size:28px;margin-bottom:6px;">🗑️</div>
        <div style="font-family:var(--font-display);font-size:26px;font-weight:800;color:#D4621A;letter-spacing:-0.04em;">${PRICES.waste.can.price.toLocaleString()}원 / 캔</div>
        <div style="font-size:11px;color:var(--gray);margin-top:4px;">1캔 = ${PRICES.waste.can.kg}kg 기준</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;font-size:12px;color:var(--gray);">
        <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--green-main);font-size:16px;">✓</span> 당일 또는 익일 수거</div>
        <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--green-main);font-size:16px;">✓</span> 폐유 종류 무관 (식물성·동물성)</div>
        <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--green-main);font-size:16px;">✓</span> ESG 포인트 적립 — 식자재 구매 전환 가능</div>
        <div style="display:flex;gap:8px;align-items:center;"><span style="color:var(--green-main);font-size:16px;">✓</span> 원주시 전 지역 수거 가능</div>
      </div>`;
  }

  // 업체 목록
  const bizCountEl = document.getElementById('consumerBizCount');
  const bizListEl  = document.getElementById('consumerBizList');
  if (bizCountEl) bizCountEl.textContent = businesses.length + '개 업체';
  if (bizListEl) {
    if (businesses.length === 0) {
      bizListEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">등록된 업체가 없어요</div>';
    } else {
      bizListEl.innerHTML = businesses.map(b => `
        <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--gray-light);">
          <div style="width:36px;height:36px;background:var(--green-pale);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏪</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;letter-spacing:-0.01em;">${b.name}</div>
            <div style="font-size:10px;color:var(--gray);margin-top:1px;">${b.type} · ${b.addr || '원주시'}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:10px;font-weight:700;color:${b.newOil<=2?'var(--red-accent)':'var(--green-dark)'};">
              ${b.newOil<=2?'⚠️ 재고부족':'✅ 재고있음'}
            </div>
            <div style="font-size:9px;color:var(--gray);margin-top:2px;">🕐 ${b.lastUpdate||'—'}</div>
          </div>
        </div>`).join('');
    }
  }
}


// ===== 대시보드 동적 업데이트 =====
function updateDashboard() {
  // applyPrices()는 여기서 호출하지 않음 — 무한루프 방지
  // (applyPrices → updateDashboard → applyPrices 순환 차단)

  // ① 등록 업체 수 — businesses 배열 실시간
  const bizCount = document.getElementById('db_biz_count');
  if (bizCount) bizCount.innerHTML = businesses.length +
    '<span style="font-size:14px;font-weight:500"> 곳</span>';

  // ② 이번달 식용유 납품 — done 이력
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();

  const oilDoneRaw = historyData.filter(h => { if(h.deleted_at) return false;
    if (h.type !== '식용유발주' || h.status !== 'done') return false;
    return isSameMonth(h, thisYear, thisMonth);
  });
  const oilDone = dedupeHistoryDone(oilDoneRaw); // 🔧 중복 제거
  const oilCans = oilDone.reduce((s,h) => s + (h.qty||0), 0);
  const oilEl  = document.getElementById('db_oil_delivery');
  const oilSub = document.getElementById('db_oil_sub');
  if (oilEl) oilEl.innerHTML = oilCans + '<span style="font-size:14px;font-weight:500"> 캔</span>';
  if (oilSub) oilSub.textContent = oilDone.length > 0
    ? '이번 달 ' + oilDone.length + '건 납품 완료'
    : businesses.length > 0
      ? '현재 재고 합계 ' + businesses.reduce((s,b)=>s+(b.newOil||0),0) + '캔'
      : '이번 달 납품 이력 없음';

  // ③ 이번달 폐유 수거 — done 이력
  const wasteDone = historyData.filter(h => { if(h.deleted_at) return false;
    if (h.type !== '폐유수거' || h.status !== 'done') return false;
    return isSameMonth(h, thisYear, thisMonth);
  });
  const wasteCans = wasteDone.reduce((s,h) => s + (h.qty||0), 0);
  const wasteEl  = document.getElementById('db_waste_total');
  const wasteSub = document.getElementById('db_waste_sub');
  if (wasteEl) wasteEl.innerHTML = wasteCans + '<span style="font-size:14px;font-weight:500"> 캔</span>';
  if (wasteSub) wasteSub.textContent = wasteDone.length > 0
    ? '이번 달 ' + wasteDone.length + '건 수거 완료'
    : businesses.length > 0
      ? '수거 대기 ' + businesses.reduce((s,b)=>s+(b.wasteOil||0),0) + '캔'
      : '이번 달 수거 이력 없음';

  // ④ CO2 절감 — 폐유수거 done 누적만
  const allWasteDoneCans = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done').reduce((s,h)=>s+(h.qty||0),0);
  const co2Cans = allWasteDoneCans > 0
    ? allWasteDoneCans
    : businesses.reduce((s,b)=>s+(b.wasteOil||0),0);
  const co2 = Math.round(co2Cans * PRICES.waste.can.kg * PRICES.carbonRate);
  const co2El = document.getElementById('db_co2');
  if (co2El) co2El.innerHTML = co2.toLocaleString() + '<span style="font-size:14px;font-weight:500"> kg</span>';

  // ⑤ ESG 포인트 — 폐유수거만 (식용유 납품 pts 제거) + ISCC 동의 업체만
  const isccAgreedCans = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done' && isIsccAgreed(h.bizId)).reduce((s,h)=>s+(h.qty||0),0);
  const totalEsg = Math.round(isccAgreedCans * PRICES.waste.can.kg * PRICES.esgRate);
  const esgEl = document.getElementById('db_esg_pts');
  if (esgEl) esgEl.textContent = totalEsg.toLocaleString();

  // ⑥ 알림 배너
  const lowBiz   = businesses.filter(b => shouldAutoOrder(b));
  const wasteBiz = businesses.filter(b => shouldAutoCollect(b));
  const banner   = document.getElementById('alertBanner');
  const bannerContent = document.getElementById('alertBannerContent');
  if (banner) {
    const msgs = [
      ...lowBiz.map(b => b.name + ' 재고 ' + b.newOil + '캔 — 자동발주 필요'),
      ...wasteBiz.map(b => b.name + ' 폐유 ' + b.wasteOil + '캔 — 수거 필요'),
    ];
    banner.style.display = msgs.length > 0 ? 'flex' : 'none';
    if (bannerContent) bannerContent.textContent = msgs.join(' / ');
  }

  // 🆕 탄소저감 기부 위젯 갱신
  try {
    var dMonth = document.getElementById('hqDonationMonth');
    var dBiz = document.getElementById('hqDonationBiz');
    var dTotal = document.getElementById('hqDonationTotal');
    if (dMonth) dMonth.textContent = getCurrentMonthDonations().toLocaleString() + '원';
    if (dBiz) dBiz.textContent = getCurrentMonthParticipants() + '개';
    if (dTotal) dTotal.textContent = getTotalDonations().toLocaleString() + '원';
  } catch(e) {}

  renderDbRecentList();
}

function renderDbRecentList() {
  const el = document.getElementById('dbRecentList');
  if (!el) return;
  // 🗑️ 휴지통 항목 제외 + 자동발주 알림(pending) 같은 노이즈 제외
  const visible = historyData.filter(h => !h.deleted_at && !isAutoAlertOnly(h));
  if (visible.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">등록된 이력이 없어요</div>';
    return;
  }
  const recent = visible.slice(0, 5);
  const colors = { pending:'var(--red-accent)', inprogress:'#4A90E2', done:'var(--green-main)' };
  const labels = { pending:'대기중', inprogress:'진행중', done:'완료' };
  el.innerHTML = recent.map(h => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-light);">
      <div style="width:8px;height:8px;border-radius:50%;background:${colors[h.status]||'#ccc'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;letter-spacing:-0.01em;">${h.biz}</div>
        <div style="font-size:10px;color:var(--gray);margin-top:1px;">${h.content} · ${h.date}</div>
      </div>
      <div style="font-size:10px;font-weight:700;color:${colors[h.status]||'#ccc'};flex-shrink:0;">${labels[h.status]||''}</div>
    </div>`).join('');

  // 🆕 v126: 프랜차이즈 KPI 갱신
  try { updateDashboardFranchiseKpi(); } catch(e) { console.warn('updateDashboardFranchiseKpi:', e); }
}

// 🆕 v126: 관리자 대시보드 프랜차이즈 KPI
function updateDashboardFranchiseKpi() {
  // 브랜드 데이터가 아직 없으면 로드 후 다시 호출
  if (franchiseBrands.length === 0) {
    loadFranchiseBrandsFromDB().then(function(){
      // 한 번만 로드 후 다시 호출 (재귀 방지)
      if (franchiseBrands.length > 0) _renderDashboardFranchiseKpi();
      else _renderDashboardFranchiseKpi();  // 빈 상태로 표시
    });
    return;
  }
  _renderDashboardFranchiseKpi();
}

function _renderDashboardFranchiseKpi() {
  var el = function(id){ return document.getElementById(id); };
  var stores = businesses.filter(function(b){ return b.tenantType === 'franchise_store' && b.franchiseBrandId; });
  var activeStores = stores.filter(function(b){ return b.approved !== false; });
  var activeBrands = franchiseBrands.filter(function(b){ return b.status === 'active'; });

  var nowMonth = new Date().toISOString().slice(0,7);
  var monthHist = historyData.filter(function(h){
    var sid = String(h.bizId);
    var isMyStore = stores.some(function(s){ return String(s.id) === sid; });
    return isMyStore && (h.rawDate||'').startsWith(nowMonth);
  });
  var monthOrders = monthHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; }).length;
  var monthWaste = monthHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(s,h){ return s + (h.qty||0); }, 0);
  var monthCO2 = Math.round(monthWaste * 16.5 * 0.7);
  var totalNewOil = stores.reduce(function(s,b){ return s + (b.newOil || 0); }, 0);
  var totalWaste = stores.reduce(function(s,b){ return s + (b.wasteOil || 0); }, 0);

  if (el('dbFrBrandCount'))      el('dbFrBrandCount').textContent = franchiseBrands.length;
  if (el('dbFrBrandSub'))        el('dbFrBrandSub').textContent = '활성 ' + activeBrands.length + '개';
  if (el('dbFrStoreCount'))      el('dbFrStoreCount').textContent = stores.length;
  if (el('dbFrStoreSub'))        el('dbFrStoreSub').textContent = '활성 ' + activeStores.length + '개';
  if (el('dbFrTotalNewOil'))     el('dbFrTotalNewOil').textContent = totalNewOil;
  if (el('dbFrTotalWaste'))      el('dbFrTotalWaste').textContent = totalWaste;
  if (el('dbFrTotalWasteSub'))   el('dbFrTotalWasteSub').textContent = '캔 · ' + Math.round(totalWaste * 16.5) + 'kg';
  if (el('dbFrMonthOrders'))     el('dbFrMonthOrders').textContent = monthOrders;
  if (el('dbFrMonthCO2'))        el('dbFrMonthCO2').textContent = monthCO2;
}

// showPanel에 dashboard 진입 시 업데이트


// ===== SUPABASE DB 연결 =====
const SUPABASE_URL = 'https://ucryeuylztknvoggidix.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVjcnlldXlsenRrbnZvZ2dpZGl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MzYzMDgsImV4cCI6MjA5MDUxMjMwOH0.yx-jOKTkeRSh5JIMP0JClMEBJGY16mbQ6uw4Eb_PVyw';
var db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Realtime 구독 — 관리자에게 실시간 알림 ──────────────
function initRealtime() {
  // 기존 채널 정리 (중복 구독 방지)
  try { db.removeAllChannels(); } catch(e) {}

  // app_settings 실시간 감지 (시세/비밀번호 변경)
  db.channel('hiveoil_settings')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'app_settings' }, function(payload) {
      var row = payload.new;
      if (!row) return;
      if (row.key === 'hiveoil_prices' && row.value) {
        try {
          var parsed = JSON.parse(row.value);
          if (parsed.products) Object.keys(parsed.products).forEach(function(k){ if(PRICES.products[k]) PRICES.products[k].price = parsed.products[k].price; });
          if (parsed.oils) Object.keys(parsed.oils).forEach(function(k){ if(PRICES.oils[k]) PRICES.oils[k].price = parsed.oils[k].price; });
          if (parsed.waste && parsed.waste.can) PRICES.waste.can.price = parsed.waste.can.price;
          localStorage.setItem('hiveoil_prices', row.value);
          applyPrices();
          console.log('[Realtime] 시세 업데이트:', row.value.substring(0,50));
        } catch(e) {}
      } else if (row.key === 'admin_pw') {
        localStorage.setItem('hiveoil_admin_pw', row.value);
      } else if (row.key === 'driver_pw') {
        localStorage.setItem('hiveoil_driver_pw', row.value);
      }
    })
    .subscribe(function(status) { console.log('[Realtime] settings 구독:', status); });

  // pending_biz 실시간 감지 (업체 등록 신청 + 승인/반려)
  db.channel('pending_biz_changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pending_biz' }, payload => {
      if (!isAdminMode) return;
      // 새 신청 들어오면 목록 갱신 + 알림
      const newRow = payload.new;
      const already = pendingBizData.find(p => String(p.id) === String(newRow.id));
      if (!already) {
        pendingBizData.unshift(newRow);
        savePendingBiz();
        renderPendingBizList();
        updateRegisterBadge();
        showToast('t1', '🆕 업체 등록 신청!', (newRow.name || '신규 업체') + ' — 승인 대기 중');
      }
    })
    // 다른 기기/관리자가 승인·반려한 경우 즉시 목록에서 제거
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'pending_biz' }, payload => {
      const oldRow = payload.old;
      if (!oldRow) return;
      const idx = pendingBizData.findIndex(p => String(p.id) === String(oldRow.id));
      if (idx !== -1) {
        pendingBizData.splice(idx, 1);
        savePendingBiz();
        if (isAdminMode) {
          renderPendingBizList();
          updateRegisterBadge();
        }
      }
      // businesses 테이블도 즉시 재로드 (승인된 경우 새 업체가 추가됐을 것)
      setTimeout(function() { loadBusinessesFromDB && loadBusinessesFromDB(); }, 500);
    })
    .subscribe(function(status) { console.log('[Realtime] pending_biz 구독:', status); });

  // businesses 실시간 - 모든 기기에서 재고 변경 즉시 반영 (INSERT/UPDATE/DELETE)
  db.channel('hiveoil_businesses')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, function(payload) {
      var updated = payload.new || payload.old;
      if (!updated) return;
      console.log('[Realtime] businesses 변경:', payload.eventType, updated.id, '| waste_oil:', updated.waste_oil, '| new_oil:', updated.new_oil);

      if (payload.eventType === 'UPDATE') {
        var biz = businesses.find(function(b){ return String(b.id) === String(updated.id); });
        if (biz) {
          // payload에 일부 컬럼만 들어있을 수 있어서 (REPLICA IDENTITY 따라) — 명시적으로 체크
          if (updated.new_oil !== undefined && updated.new_oil !== null) biz.newOil = updated.new_oil;
          if (updated.waste_oil !== undefined && updated.waste_oil !== null) biz.wasteOil = updated.waste_oil;
          if (updated.last_update) biz.lastUpdate = updated.last_update;
          if (updated.oil_products) {
            try {
              var newProds = typeof updated.oil_products === 'string' ? JSON.parse(updated.oil_products) : updated.oil_products;
              if (newProds && newProds.length > 0) biz.oilProducts = newProds;
            } catch(e) {}
          }
          // 🚀 wasteOil이 0이 됐을 때 등 핵심 변화는 DB에서 한 번 더 fetch (정확성 보장)
          db.from('businesses').select('*').eq('id', updated.id).single().then(function(res){
            if (res.data) {
              biz.newOil     = res.data.new_oil   !== null && res.data.new_oil   !== undefined ? res.data.new_oil   : biz.newOil;
              biz.wasteOil   = res.data.waste_oil !== null && res.data.waste_oil !== undefined ? res.data.waste_oil : biz.wasteOil;
              if (res.data.oil_products) {
                try {
                  var p2 = typeof res.data.oil_products === 'string' ? JSON.parse(res.data.oil_products) : res.data.oil_products;
                  if (p2 && p2.length > 0) biz.oilProducts = p2;
                } catch(e) {}
              }
              saveBusinesses();
              // 다시 한 번 렌더 (정확한 값으로)
              refreshMapMarkers && refreshMapMarkers();
              updateDashboard && updateDashboard();
              renderDeliveryPanel && renderDeliveryPanel();
              renderWasteTable && renderWasteTable();
              renderWasteHistList && renderWasteHistList();
              renderOwnerDash && renderOwnerDash();
              updateTabBadges && updateTabBadges();
            }
          }).catch(function(e){ console.warn('업체 재fetch 실패:', e); });

          saveBusinesses();
          setTimeout(function() {
            refreshMapMarkers && refreshMapMarkers();
            updateDashboard && updateDashboard();
            renderDeliveryPanel && renderDeliveryPanel();
            renderWasteTable && renderWasteTable();
            renderWasteHistList && renderWasteHistList();
            renderOwnerDash && renderOwnerDash();
            updateTabBadges && updateTabBadges();
            // 업주 로그인 시 본인 업체 재고 갱신
            if (ownerLoggedIn && ownerBizId && String(updated.id) === String(ownerBizId)) {
              ownerNewVal   = getBizTotalNewOil(biz);
              ownerWasteVal = biz.wasteOil || 0;
              var qrPanel = document.getElementById('panel-qr');
              if (qrPanel && qrPanel.classList.contains('active')) {
                initQRPanel && initQRPanel();
              }
            }
          }, 100);
        } else {
          // 메모리에 없으면 전체 재로드
          setTimeout(function() { loadBusinessesFromDB && loadBusinessesFromDB(); }, 300);
        }
      } else {
        setTimeout(function() { loadBusinessesFromDB && loadBusinessesFromDB(); }, 500);
      }
    })
    .subscribe(function(status) {
      console.log('[Realtime] businesses 구독 상태:', status);
    });

  // history 실시간 감지 (모든 사용자 — PC/폰 양방향)
  db.channel('hiveoil_history_v2')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'history' }, function(payload) {
      console.log('[Realtime] history INSERT:', payload.new);
      // 새 이력 직접 추가 (DB 재로드 없이 즉시 반영)
      var row = payload.new;
      if (row) {
        var exists = historyData.find(function(h){ return String(h.dbId) === String(row.id); });
        if (!exists) {
          historyData.unshift({
            date: row.created_at ? row.created_at.slice(0,10).replaceAll('-','.') : '',
            rawDate: row.created_at,
            biz: row.biz_name, bizId: row.biz_id,
            type: row.type, content: row.content,
            qty: row.qty || 0, amount: row.amount || '',
            unitPrice: row.unit_price || null,  // 🆕 단가
            method: row.method || '수동', status: row.status || 'pending',
            productKey: row.product_key || '', productName: row.product_name || '',
            dbId: row.id,
          });
          saveHistory();
        }
        // 🚀 폐유수거 done / 식용유발주 done이면 해당 업체 재고 즉시 재fetch (중복 신청 방지)
        if (row.biz_id && (row.status === 'done' || row.type === '폐유수거')) {
          db.from('businesses').select('id, new_oil, waste_oil, oil_products').eq('id', row.biz_id).single().then(function(r){
            if (r.data) {
              var biz = businesses.find(function(b){ return String(b.id) === String(row.biz_id); });
              if (biz) {
                if (r.data.new_oil   !== null && r.data.new_oil   !== undefined) biz.newOil   = r.data.new_oil;
                if (r.data.waste_oil !== null && r.data.waste_oil !== undefined) biz.wasteOil = r.data.waste_oil;
                if (r.data.oil_products) {
                  try {
                    var pp = typeof r.data.oil_products === 'string' ? JSON.parse(r.data.oil_products) : r.data.oil_products;
                    if (pp && pp.length > 0) biz.oilProducts = pp;
                  } catch(e) {}
                }
                saveBusinesses();
                renderWasteTable && renderWasteTable();
                renderDeliveryPanel && renderDeliveryPanel();
                updateDashboard && updateDashboard();
                console.log('[Realtime] 업체 재고 동기화:', biz.name, '→ 폐유:', biz.wasteOil);
              }
            }
          }).catch(function(e){});
        }
      }
      renderDeliveryPanel && renderDeliveryPanel();
      renderWasteTable && renderWasteTable();
      renderWasteHistList && renderWasteHistList();
      renderTodayDelivList && renderTodayDelivList();
      updateDashboard && updateDashboard();
      updateOrderMonthStats && updateOrderMonthStats();
      updateHqRealStats && updateHqRealStats();
      updateTabBadges && updateTabBadges();
      // 활성 패널별 추가 갱신
      var activeId = (document.querySelector('.panel.active') || {}).id || '';
      if (activeId === 'panel-history') { try { renderHistory && renderHistory(typeof _currentHistTab !== 'undefined' ? _currentHistTab : 'all'); } catch(e) {} }
      if (activeId === 'panel-billing') { try { renderBilling && renderBilling(); } catch(e) {} }
      if (activeId === 'panel-owner-dash') { try { renderOwnerDash && renderOwnerDash(); } catch(e) {} }
      if (activeId === 'panel-schedule') { try { renderDriverSchedule && renderDriverSchedule(); } catch(e) {} }
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'history' }, function(payload) {
      console.log('[Realtime] history UPDATE');
      var row = payload.new;
      if (row) {
        var h = historyData.find(function(x){ return String(x.dbId) === String(row.id); });
        if (h) { h.status = row.status; h.content = row.content; saveHistory(); }
      }
      renderDeliveryPanel && renderDeliveryPanel();
      renderWasteTable && renderWasteTable();
      renderWasteHistList && renderWasteHistList();
      renderHistory && renderHistory();
      updateDashboard && updateDashboard();
      updateHqRealStats && updateHqRealStats();
      updateTabBadges && updateTabBadges();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'history' }, function(payload) {
      var row = payload.old;
      if (row) {
        var idx = historyData.findIndex(function(x){ return String(x.dbId) === String(row.id); });
        if (idx !== -1) { historyData.splice(idx, 1); saveHistory(); }
      }
      renderDeliveryPanel && renderDeliveryPanel();
    })
    .subscribe(function(status, err) {
      console.log('[Realtime] history 구독 상태:', status, err || '');
      if (status === 'SUBSCRIBED') {
        console.log('✅ history Realtime 연결 성공');
        window._realtimeRetry = 0; // 성공 시 카운터 리셋
        window._realtimeConnected = true;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        window._realtimeConnected = false;
        window._realtimeRetry = (window._realtimeRetry || 0) + 1;
        if (window._realtimeRetry <= 5) {
          console.warn('[Realtime] 재연결 시도', window._realtimeRetry, '/ 5');
          setTimeout(function(){ initRealtime(); }, Math.min(8000 * window._realtimeRetry, 30000));
        } else {
          console.warn('[Realtime] 재연결 포기 - 폴링으로 전환 (8초 주기). Supabase 대시보드에서 Realtime publication 확인 필요!');
          // 사용자에게도 안내
          if (isAdminMode) {
            console.warn('💡 Supabase Dashboard → Database → Replication → 활성화 필요');
          }
        }
      }
    });

  console.log('[Realtime] 구독 시작 — hiveoil_businesses / hiveoil_history / pending_biz');
}

// Realtime 연결 상태 정기 점검 (15초마다)
setInterval(function() {
  if (document.hidden) return;
  if (window._realtimeConnected === false) {
    var retryCnt = window._realtimeRetry || 0;
    // 포기한 상태에서 1분 이상 지났으면 다시 시도
    if (retryCnt >= 5 && (!window._lastRetryAttempt || Date.now() - window._lastRetryAttempt > 60000)) {
      console.log('[Realtime] 1분 경과 — 재시도 카운터 리셋 후 재연결');
      window._realtimeRetry = 0;
      window._lastRetryAttempt = Date.now();
      try { initRealtime(); } catch(e) {}
    }
  }
}, 15000);

// 페이지 로드 후 Realtime 시작
window.addEventListener('load', function() {
  // 로컬스토리지에서 자동⚡ pending 잔재 제거 (신청버튼 흐름으로 전환)
  for (var _i = historyData.length - 1; _i >= 0; _i--) {
    var _h = historyData[_i];
    if (_h.type === '식용유발주' && _h.status === 'pending' && _h.method === '자동⚡') {
      historyData.splice(_i, 1);
    }
  }
  saveHistory();
  setTimeout(function() { initRealtime(); }, 2000);
  // 로컬에만 있는 이력을 DB에 동기화 (dbId 없는 done 이력)
  setTimeout(function() {
    var localOnly = historyData.filter(function(h) {
      return !h.dbId && h.status === 'done';
    });
    if (localOnly.length > 0) {
      console.log('[Sync] 로컬 전용 이력 DB 동기화:', localOnly.length, '건');
      localOnly.forEach(function(h) { try { saveHistoryToDB(h); } catch(e) {} });
    }
  }, 5000);
  // 8초마다 전체 동기화 폴링
  setInterval(function() {
    if (document.hidden) return;
    if (window._mainPollInflight) return; // 중복 호출 방지
    window._mainPollInflight = true;
    Promise.all([
      loadHistoryFromDB ? loadHistoryFromDB() : Promise.resolve(),
      loadBusinessesFromDB ? loadBusinessesFromDB() : Promise.resolve()
    ]).then(function() {
      var activeId = (document.querySelector('.panel.active') || {}).id || '';
      // 🚀 항상 갱신 — 어떤 패널에서든 보일 수 있는 통계
      updateDashboard && updateDashboard();
      updateHqRealStats && updateHqRealStats();
      updateTabBadges && updateTabBadges();
      // 패널별 갱신
      if (activeId === 'panel-order') {
        var now = Date.now();
        var anySuppressed = businesses.some(function(b){ return b._suppressAutoOrder && b._suppressAutoOrder > now; });
        if (!anySuppressed) renderDeliveryPanel && renderDeliveryPanel();
        try { updateOrderMonthStats && updateOrderMonthStats(); } catch(e) {}
      }
      if (activeId === 'panel-waste') {
        // ⭐ renderWasteTable 안에 KPI(수거 대기/완료) 갱신 코드가 들어 있음
        renderWasteTable && renderWasteTable();
        renderWasteHistList && renderWasteHistList();
      }
      if (activeId === 'panel-history') {
        try { renderHistory && renderHistory(typeof _currentHistTab !== 'undefined' ? _currentHistTab : 'all'); } catch(e) {}
      }
      if (activeId === 'panel-billing') {
        try { renderBilling && renderBilling(); } catch(e) {}
      }
      if (activeId === 'panel-owner-dash') {
        try { renderOwnerDash && renderOwnerDash(); } catch(e) {}
      }
      if (activeId === 'panel-esg' || activeId === 'panel-dashboard') {
        try { renderEsgPanel && renderEsgPanel(); } catch(e) {}
      }
    }).finally(function() {
      window._mainPollInflight = false;
    });
    // pending_biz는 별도 setInterval (아래)에서 처리 — 중복 제거
  }, 8000);

  // 관리자 모드 전용 — pending_biz를 8초마다 폴링 (timeout 누적 방지)
  setInterval(function() {
    if (document.hidden) return;
    if (!isAdminMode) return;
    if (window._pendingPollInflight) return; // 중복 호출 방지
    window._pendingPollInflight = true;
    loadPendingBizFromDB && loadPendingBizFromDB().then(function() {
      updateRegisterBadge && updateRegisterBadge();
    }).finally(function() {
      window._pendingPollInflight = false;
    });
  }, 8000);
});

// 탭 복귀 시 즉시 갱신
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    // 탭 복귀 시 즉시 DB 최신 데이터 로드
    loadBusinessesFromDB && loadBusinessesFromDB();
    loadHistoryFromDB && loadHistoryFromDB().then(function() {
      var activeId2 = (document.querySelector('.panel.active') || {}).id || '';
      if (activeId2 === 'panel-order') {
        var now2 = Date.now();
        var anySup2 = businesses.some(function(b){ return b._suppressAutoOrder && b._suppressAutoOrder > now2; });
        if (!anySup2) renderDeliveryPanel && renderDeliveryPanel();
      }
      renderWasteTable && renderWasteTable();
      renderWasteHistList && renderWasteHistList();
      renderTodayDelivList && renderTodayDelivList();
      updateDashboard && updateDashboard();
    });
    // 관리자 모드면 pending_biz도 즉시 갱신 (모바일에서 신청한 거 PC에서 바로 보이게)
    if (isAdminMode) {
      loadPendingBizFromDB && loadPendingBizFromDB().then(function(){
        updateRegisterBadge && updateRegisterBadge();
      });
    }
    // Realtime 채널 상태 점검 — 끊어졌으면 재연결
    try {
      if (typeof initRealtime === 'function' && (!db._channels || db._channels.length === 0)) {
        console.log('[Realtime] 탭 복귀 후 채널 재연결');
        window._realtimeRetry = 0;
        initRealtime();
      }
    } catch(e) {}
  }
});


// ── 백그라운드 설정 동기화 헬퍼 ──────────────────────────
function _saveSettingToDB(key, value) {
  try {
    db.from('app_settings').upsert([{ key: key, value: value }], { onConflict: 'key' })
      .then(function(r) {
        if (r.error) {
          console.warn('[Settings] upsert 실패, insert 재시도:', r.error.message);
          // fallback: 기존 행 삭제 후 재삽입
          db.from('app_settings').delete().eq('key', key).then(function() {
            db.from('app_settings').insert([{ key: key, value: value }]).then(function(r2) {
              if (r2.error) console.warn('[Settings] insert도 실패:', r2.error.message);
              else console.log('[Settings] insert 성공:', key);
            });
          });
        } else {
          console.log('[Settings] 저장 완료:', key);
        }
      });
  } catch(e) { console.warn('[Settings] 예외:', e); }
}
function _syncAdminPwFromDB() {
  try {
    db.from('app_settings').select('value').eq('key','admin_pw').single().then(function(r) {
      if (r.data && r.data.value) localStorage.setItem('hiveoil_admin_pw', r.data.value);
    });
  } catch(e) {}
}
function _syncDriverPwFromDB() {
  try {
    db.from('app_settings').select('value').eq('key','driver_pw').single().then(function(r) {
      if (r.data && r.data.value) localStorage.setItem('hiveoil_driver_pw', r.data.value);
    });
  } catch(e) {}
}
// 앱 시작 시 즉시 설정 동기화 (시크릿 모드 대응)
// DB에서 항상 최신 시세/비밀번호 로드 (localStorage 덮어쓰기)
function _syncAllSettingsFromDB() {
  db.from('app_settings').select('key,value').then(function(r) {
    if (!r.data) return;
    r.data.forEach(function(row) {
      if (!row.key || !row.value) return;
      if (row.key === 'admin_pw') localStorage.setItem('hiveoil_admin_pw', row.value);
      else if (row.key === 'driver_pw') localStorage.setItem('hiveoil_driver_pw', row.value);
    });
  }).catch(function(e) { console.warn('설정 로드 실패:', e); });
}
setTimeout(function() {
  _syncAllSettingsFromDB();
  loadPricesFromDB(); // 시세는 별도 함수로 로드
}, 300);

// ── DB 접근 권한 게이트 (비인가 접근 차단) ──────────────
// anon key는 공개 가능하지만, 쓰기 작업은 반드시 로그인 상태에서만 허용
function isAuthorizedForWrite() {
  return isAdminMode || isDriverMode || ownerLoggedIn;
}
function isAuthorizedForAdminWrite() {
  return isAdminMode;
}

// DB 쓰기 래퍼 — 권한 없으면 차단
async function dbSafeInsert(table, data) {
  if (!isAuthorizedForWrite()) {
    console.warn('[SECURITY] 비인가 DB 쓰기 시도 차단:', table);
    return { error: { message: '로그인이 필요합니다.' } };
  }
  return await db.from(table).insert(data);
}
async function dbSafeUpdate(table, data, match) {
  if (!isAuthorizedForWrite()) {
    console.warn('[SECURITY] 비인가 DB 수정 시도 차단:', table);
    return { error: { message: '로그인이 필요합니다.' } };
  }
  return await db.from(table).update(data).match(match);
}
async function dbSafeDelete(table, match) {
  if (!isAuthorizedForAdminWrite()) {
    console.warn('[SECURITY] 관리자 권한 필요 — DB 삭제 차단:', table);
    return { error: { message: '관리자 권한이 필요합니다.' } };
  }
  return await db.from(table).delete().match(match);
}
async function dbSafeUpsert(table, data) {
  if (!isAuthorizedForWrite()) {
    console.warn('[SECURITY] 비인가 DB upsert 시도 차단:', table);
    return { error: { message: '로그인이 필요합니다.' } };
  }
  return await db.from(table).upsert(data);
}
// ────────────────────────────────────────────────────────

// ─── 업체 데이터 로드 (DB 우선, 실패 시 localStorage) ───
async function loadBusinessesFromDB() {
  try {
    // 🆕 v126: Egress quota 절감 — base64 이미지(business_license, bank_image, owner_signature)는
    // 별도 lazy fetch로 분리. 1차 로드는 핵심 컬럼만 가져옴.
    var coreCols = 'id, name, type, owner, phone, addr, lat, lng, ' +
      'new_oil, max_new, waste_oil, oil_type, last_update, ' +
      'login_id, login_pw, oil_products, auto_qty, auto, auto_order_threshold, ' +
      'auto_collect, auto_collect_threshold, suppress_auto_order_until, suppress_auto_collect_until, ' +
      'iscc_agreed, marketing_agreed, approved, delivery_days, closed_days, ' +
      'tenant_type, franchise_brand_id, store_code, deleted, deleted_at';
    var res = await db.from('businesses').select(coreCols).order('id');
    if (!res.error) {
      console.log('[Egress 최적화] 핵심 컬럼만 로드 완료 (이미지 제외)');
      return _processBusinessesData(res.data);
    }
    // fallback 1: select * (이전 동작 유지)
    console.warn('select 핵심 컬럼 실패, select * 시도:', res.error.message);
    var res2 = await db.from('businesses').select('*').order('id');
    if (!res2.error) return _processBusinessesData(res2.data);
    // fallback 2: 최소 컬럼만
    console.warn('select * 실패, 최소 컬럼:', res2.error.message);
    var minCols = 'id, name, type, owner, phone, addr, lat, lng, new_oil, waste_oil, login_id, login_pw';
    var res3 = await db.from('businesses').select(minCols).order('id');
    if (res3.error) throw res3.error;
    return _processBusinessesData(res3.data);
  } catch(e) {
    console.warn('businesses 로드 실패:', e.message);
  }
}

// 🆕 v126: 특정 업체의 이미지(사업자등록증, 통장사본, 서명) lazy fetch
async function loadBusinessImagesLazy(bizId) {
  try {
    var res = await db.from('businesses')
      .select('id, business_license, bank_image, owner_signature')
      .eq('id', bizId).single();
    if (res.error) throw res.error;
    var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
    if (biz && res.data) {
      biz.business_license = res.data.business_license;
      biz.bank_image = res.data.bank_image;
      biz.owner_signature = res.data.owner_signature;
    }
    return res.data;
  } catch(e) {
    console.warn('이미지 lazy load 실패:', e.message);
    return null;
  }
}

function _processBusinessesData(data) {
    // DB 데이터로 항상 업데이트 (빈 배열도 반영)
    // suppress 중인 업체 재고 백업 (납품 직후 DB 재로드로 인한 재고 초기화 방지)
    var suppressedStock = {};
    businesses.forEach(function(b) {
      if (b._suppressAutoOrder && Date.now() < b._suppressAutoOrder) {
        suppressedStock[String(b.id)] = {
          newOil: b.newOil,
          wasteOil: b.wasteOil,
          oilProducts: b.oilProducts ? JSON.parse(JSON.stringify(b.oilProducts)) : null,
          _suppressAutoOrder: b._suppressAutoOrder
        };
      }
    });
    // 기존 이미지 캐시도 보존 (lazy load 안 했어도 이전에 fetch한 게 있으면 유지)
    var imgCache = {};
    businesses.forEach(function(b) {
      if (b.business_license || b.bank_image || b.owner_signature) {
        imgCache[String(b.id)] = {
          business_license: b.business_license,
          bank_image: b.bank_image,
          owner_signature: b.owner_signature
        };
      }
    });
    businesses.length = 0;
    if (data && data.length > 0) {
      data.forEach(row => {
        if (row.deleted) return; // 소프트 삭제된 항목 제외
        var biz = dbRowToBiz(row);
        // 납품 직후 suppress 중이면 로컬 재고값 유지 (DB가 구버전일 수 있음)
        var sup = suppressedStock[String(biz.id)];
        if (sup) {
          biz.newOil = sup.newOil;
          biz.wasteOil = sup.wasteOil;
          if (sup.oilProducts) biz.oilProducts = sup.oilProducts;
          biz._suppressAutoOrder = sup._suppessAutoOrder || sup._suppressAutoOrder;
        }
        // 이미지 캐시 복원
        var ic = imgCache[String(biz.id)];
        if (ic) {
          if (ic.business_license) biz.business_license = ic.business_license;
          if (ic.bank_image) biz.bank_image = ic.bank_image;
          if (ic.owner_signature) biz.owner_signature = ic.owner_signature;
        }
        // localStorage에서 suppress 복원 (기기 재로드 후에도 유지)
        try {
          var supKey = 'hiveoil_suppress_' + biz.id;
          var supVal = localStorage.getItem(supKey);
          if (supVal && parseInt(supVal) > Date.now()) {
            biz._suppressAutoOrder = Math.max(biz._suppressAutoOrder || 0, parseInt(supVal));
          }
        } catch(e) {}
        businesses.push(biz);
      });
    }
    saveBusinesses();
    renderBizList && renderBizList();
    updateDashboard && updateDashboard();
    updateHqRealStats && updateHqRealStats();
    updateTabBadges && updateTabBadges();
    renderRegBizList && renderRegBizList();
    // 세션 복원 콜백
    if (window._onBusinessesLoaded) { window._onBusinessesLoaded(); window._onBusinessesLoaded = null; }
    console.log('✅ DB에서 업체', businesses.length, '개 로드');
}

// 이미지 lazy load — 사업자등록증/통장사본 클릭 시
async function lazyLoadBizImage(bizId, type) {
  try {
    var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
    if (!biz) return null;
    // 이미 캐시되어 있으면 그대로
    if (type === 'cert' && biz.business_license) return biz.business_license;
    if (type === 'bank' && biz.bank_image) return biz.bank_image;
    if (type === 'sig' && biz.owner_signature) return biz.owner_signature;
    // DB에서 fetch
    var col = type === 'cert' ? 'business_license' : type === 'bank' ? 'bank_image' : 'owner_signature';
    var res = await db.from('businesses').select(col).eq('id', bizId).single();
    if (res.data && res.data[col]) {
      biz[col === 'business_license' ? 'business_license' : col === 'bank_image' ? 'bank_image' : 'owner_signature'] = res.data[col];
      saveBusinesses();
      return res.data[col];
    }
  } catch(e) { console.warn('이미지 lazy load 실패:', e); }
  return null;
}

// ─── 이력 데이터 로드 ───
async function loadHistoryFromDB() {
  if (window._historyLoadInflight) return; // 중복 호출 방지
  window._historyLoadInflight = true;
  try {
    const { data, error } = await db.from('history').select('*').order('created_at', {ascending: false}).limit(100);
    if (error) throw error;
    historyData.length = 0;
    data.forEach(row => historyData.push(dbRowToHistory(row)));
    // 🗑️ localStorage 휴지통 정보 머지 (DB 컬럼 없어도 동작하도록)
    applyDeletedSetToHistory && applyDeletedSetToHistory();
    saveHistory();
    // 🌿 ESG 포인트 자동 backfill (없는 항목들 채워넣기)
    setTimeout(function() {
      try {
        var needBackfill = historyData.filter(function(h){
          return h.status === 'done' && !h.deleted_at && (!h.earnedPoints || h.earnedPoints === 0);
        });
        if (needBackfill.length > 0) {
          console.log('[ESG] 포인트 미적립 항목', needBackfill.length, '건 — 자동 backfill 시작');
          // 비동기 처리 (UI 막지 않게)
          var done = 0;
          needBackfill.forEach(function(h) {
            backfillPointsIfMissing(h).then(function(){
              done++;
              if (done === needBackfill.length) {
                console.log('[ESG] backfill 완료');
                if (typeof renderEsgPanel === 'function') renderEsgPanel();
              }
            });
          });
        }
      } catch(e) { console.warn('[ESG] backfill 자동 실행 실패:', e.message); }
    }, 1500);

    // 자동⚡ pending은 신청버튼 흐름으로 전환 - 로드 시 제거
    for (var _j = historyData.length - 1; _j >= 0; _j--) {
      if (historyData[_j].type === '식용유발주' && historyData[_j].status === 'pending' && historyData[_j].method === '자동⚡') {
        historyData.splice(_j, 1);
      }
    }
    // 🔄 모든 통계 함수 갱신 (휴지통 반영)
    updateDashboard && updateDashboard();
    updateHqRealStats && updateHqRealStats();
    updateOrderMonthStats && updateOrderMonthStats();
    updateTrashCount && updateTrashCount();
    renderDeliveryPanel && renderDeliveryPanel();
    renderOwnerDash && renderOwnerDash();
    renderEsgPanel && renderEsgPanel();
    // 정산 패널이 열려있으면 갱신
    var billingPanel = document.getElementById('panel-billing');
    if (billingPanel && billingPanel.classList.contains('active')) {
      renderBilling && renderBilling();
    }
    console.log('✅ DB에서 이력', historyData.length, '건 로드 (deleted_at 마킹 ' + historyData.filter(function(h){return h.deleted_at;}).length + '개)');
  } catch(e) {
    console.warn('이력 DB 로드 실패:', e.message);
    updateDashboard && updateDashboard();
    updateHqRealStats && updateHqRealStats();
  } finally {
    window._historyLoadInflight = false;
  }
}

// ─── DB row → 앱 객체 변환 ───
function dbRowToBiz(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type || '기타',
    owner: row.owner || '',
    phone: row.phone || '',
    addr: row.addr || '',
    lat: row.lat || 37.3450,
    lng: row.lng || 127.9280,
    newOil: (row.new_oil !== null && row.new_oil !== undefined) ? Number(row.new_oil) : 5,
    maxNew: row.max_new || 10,
    wasteOil: row.waste_oil || 0,
    oiltype: row.oil_type || '대두유',
    lastUpdate: row.last_update || '—',
    loginId: row.login_id || null,
    loginPw: row.login_pw || null,
    oilProducts: row.oil_products ? (typeof row.oil_products === 'string' ? JSON.parse(row.oil_products) : row.oil_products) : null,
    autoQty: row.auto_qty || 5,
    // 🔧 v102: 자동발주/수거 명시 매핑 — null/undefined도 안전하게 처리
    // 이전: row.auto !== false → null/undefined도 true로 처리 (버그)
    // 이후: 명시적으로 true인 경우만 true (DB에 명확한 값 없으면 OFF로 안전 기본값)
    auto: row.auto === true,                                   // 명시적 true만 ON
    autoOrderThreshold: row.auto_order_threshold || 2,
    autoCollect: row.auto_collect === true,                    // 명시적 true만 ON
    autoCollectThreshold: row.auto_collect_threshold || 2,
    // 🆕 자동알림 일시 무시 (24h dismiss) — 카드의 [취소] 버튼이 채움
    _suppressAutoOrder: row.suppress_auto_order_until ? new Date(row.suppress_auto_order_until).getTime() : null,
    _suppressAutoCollect: row.suppress_auto_collect_until ? new Date(row.suppress_auto_collect_until).getTime() : null,
    // 서류 (사업자등록증 / 통장사본)
    business_license: row.business_license || null,
    bank_image: row.bank_image || null,
    // 업주 서명 (ISCC 인증용)
    owner_signature: row.owner_signature || null,
    // 🌍 ISCC EU 동의 (포인트 적립·자가선언서 발행 가능 여부)
    iscc_agreed: row.iscc_agreed === true,
    marketing_agreed: row.marketing_agreed === true,
    // 승인 상태 (관리자 승인 전/후)
    approved: row.approved !== false, // 기본 true (기존 데이터 호환)
    deliveryDays: row.delivery_days ? (typeof row.delivery_days === 'string' ? JSON.parse(row.delivery_days) : row.delivery_days) : null,
    closedDays: row.closed_days ? (typeof row.closed_days === 'string' ? JSON.parse(row.closed_days) : row.closed_days) : null,
    // 🆕 v119: 프랜차이즈 시스템
    tenantType: row.tenant_type || 'individual',
    franchiseBrandId: row.franchise_brand_id || null,
    storeCode: row.store_code || null,
  };
}

function dbRowToHistory(row) {
  return {
    id: row.id,           // 🆕 DB id (포인트 backfill에 필요)
    date: row.created_at ? row.created_at.slice(0,10).replaceAll('-','.') : '—',
    rawDate: row.created_at,
    biz: row.biz_name || '—',
    bizId: row.biz_id,
    type: row.type || '—',
    content: row.content || '—',
    qty: row.qty || 0,
    amount: row.amount || '0원',
    unitPrice: row.unit_price || null,  // 🆕 단가
    method: row.method || '수동',
    status: row.status || 'pending',
    dbId: row.id,
    productKey: row.product_key || null,
    productName: row.product_name || null,
    visitDate: row.visit_date || null,
    visitLabel: row.visit_label || null,
    actualKg: row.actual_kg || null,
    // 🌿 ESG 포인트
    earnedPoints: row.earned_points || 0,
    usedPoints: row.used_points || 0,
  };
}

// ─── 업체 저장 (DB) ───
async function saveBizToDB(biz) {
  const row = {
    name: biz.name,
    type: biz.type,
    owner: biz.owner || '',
    phone: biz.phone || '',
    deliveryDays: biz.delivery_days ? (typeof biz.delivery_days === 'string' ? JSON.parse(biz.delivery_days) : biz.delivery_days) : null,
    closedDays: biz.closed_days ? (typeof biz.closed_days === 'string' ? JSON.parse(biz.closed_days) : biz.closed_days) : null,
    addr: biz.addr || '',
    lat: biz.lat,
    lng: biz.lng,
    new_oil: biz.newOil,
    max_new: biz.maxNew || 10,
    waste_oil: biz.wasteOil,
    oil_type: biz.oiltype || '대두유',
    auto_order: biz.auto !== false,
    last_update: biz.lastUpdate || '방금 등록',
    login_id: biz.loginId || null,
    login_pw: biz.loginPw || null,
    oil_products: biz.oilProducts ? JSON.stringify(biz.oilProducts) : null,
    auto_qty: biz.autoQty || 5,
    delivery_days: biz.deliveryDays ? JSON.stringify(biz.deliveryDays) : null,
    closed_days: biz.closedDays ? JSON.stringify(biz.closedDays) : null,
    // 📎 서류
    business_license: biz.business_license || null,
    bank_image: biz.bank_image || null,
    // ✍️ 서명
    owner_signature: biz.owner_signature || null,
    // 🌍 ISCC 동의
    iscc_agreed: biz.iscc_agreed === true,
    marketing_agreed: biz.marketing_agreed === true,
    // 🆕 v119: 프랜차이즈 시스템
    tenant_type: biz.tenantType || 'individual',
    franchise_brand_id: biz.franchiseBrandId || null,
    store_code: biz.storeCode || null,
  };
  // 어떤 컬럼이 없든 자동 감지해서 제거 후 재시도
  function _extractMissingColB(msg) {
    if (!msg) return null;
    var m1 = msg.match(/Could not find the ['"]([^'"]+)['"] column/);
    if (m1) return m1[1];
    var m2 = msg.match(/column ['"]([^'"]+)['"]/i);
    if (m2) return m2[1];
    var m3 = msg.match(/column (\w+) does not exist/i);
    if (m3) return m3[1];
    return null;
  }
  var removedCols = [];

  async function _tryInsert(payload, depth) {
    if (depth > 30) throw new Error('재시도 한도 초과 (제거된 컬럼: ' + removedCols.join(', ') + ')');
    var res = await db.from('businesses').insert([payload]).select().single();
    if (res.error) {
      var msg = res.error.message || '';
      console.log('🔴 businesses INSERT 시도', depth+1, '실패:', msg);
      var missingCol = _extractMissingColB(msg);
      if (missingCol) {
        // hasOwnProperty 체크 없이 무조건 제거 (방어적)
        console.warn('🟡 businesses: "' + missingCol + '" 컬럼 없음 — 제외 후 재시도');
        removedCols.push(missingCol);
        var fallback = Object.assign({}, payload);
        delete fallback[missingCol];
        return _tryInsert(fallback, depth + 1);
      }
      throw res.error;
    }
    return res.data;
  }

  try {
    var data = await _tryInsert(row, 0);
    biz.id = data.id;
    if (removedCols.length > 0) {
      console.warn('💡 businesses 테이블에 다음 컬럼이 없어서 제외했어요:', removedCols.join(', '));
    }
    console.log('✅ 업체 DB 저장:', biz.name, '(DB id=' + data.id + ')');
    return true;
  } catch(e) {
    console.error('🔴 업체 DB 저장 최종 실패:', e.message || e, '제거된 컬럼:', removedCols);
    return false;
  }
}

// ─── 업체 재고 업데이트 (DB) ───
async function updateBizStockInDB(bizId, newOil, wasteOil, lastUpdate, oilProducts) {
  try {
    var updateObj = {
      new_oil: newOil,
      waste_oil: wasteOil,
      last_update: lastUpdate,
    };
    if (oilProducts !== undefined && oilProducts !== null) {
      updateObj.oil_products = JSON.stringify(oilProducts);
    }
    const { error } = await db.from('businesses').update(updateObj).eq('id', bizId);
    if (error) throw error;
  } catch(e) {
    console.warn('재고 업데이트 실패:', e.message);
  }
}

// ─── 이력 저장 (DB) ───
async function saveHistoryToDB(item) {
  try {
    // 🌿 done 상태로 저장될 때 포인트 자동 계산
    if (item.status === 'done' && (!item.earnedPoints || item.earnedPoints === 0)) {
      var pts = calcEarnedPoints(item);
      if (pts > 0) item.earnedPoints = pts;
    }

    var payload = {
      biz_id: item.bizId || null,
      biz_name: item.biz,
      type: item.type,
      content: item.content,
      qty: item.qty || 0,
      amount: item.amount || '',
      unit_price: item.unitPrice || _extractUnitPrice(item) || null,  // 🆕 단가
      method: item.method || '수동',
      status: item.status || 'pending',
      product_key: item.productKey || null,
      product_name: item.productName || null,
      visit_date: item.visitDate || null,
      visit_label: item.visitLabel || null,
      actual_kg: item.actualKg || null,
      // 🌿 ESG 포인트
      earned_points: item.earnedPoints || 0,
      used_points: item.usedPoints || 0,
    };
    var res = await db.from('history').insert([payload]).select('id').single();
    if (res.error) {
      // unit_price 컬럼 없으면 빼고 재시도
      if (/unit_price/i.test(res.error.message || '')) {
        console.warn('💡 unit_price 컬럼 없음 — 추가 권장: ALTER TABLE history ADD COLUMN unit_price NUMERIC;');
        delete payload.unit_price;
        res = await db.from('history').insert([payload]).select('id').single();
      }
      // earned/used_points 컬럼 없으면 빼고 재시도
      if (res.error && /earned_points|used_points/i.test(res.error.message || '')) {
        console.warn('💡 ESG 포인트 컬럼 없음 — 추가 권장: ALTER TABLE history ADD COLUMN earned_points INT, ADD COLUMN used_points INT;');
        delete payload.earned_points;
        delete payload.used_points;
        res = await db.from('history').insert([payload]).select('id').single();
      }
      if (res.error) throw res.error;
    }
    if (res.data && res.data.id) item.dbId = res.data.id;
    console.log('[DB] 이력 저장 완료 id:', res.data && res.data.id, item.earnedPoints ? ('+ESG ' + item.earnedPoints + 'pt') : '');
  } catch(e) {
    console.warn('이력 저장 실패:', e.message);
  }
}

// 단가 자동 추출 (unit_price 명시 안 된 경우 amount/qty로 역산)
function _extractUnitPrice(item) {
  if (!item || !item.qty || item.qty === 0) return null;
  var amt = parseInt(String(item.amount || '').replace(/[^0-9]/g, ''));
  if (!amt) return null;
  return Math.round(amt / item.qty);
}

// ─── 업체 삭제 (DB) ───
async function deleteBizFromDB(bizId) {
  try {
    const { error } = await db.from('businesses').delete().eq('id', bizId);
    if (error) throw error;
  } catch(e) {
    console.warn('업체 삭제 실패:', e.message);
  }
}

async function softDeleteBizInDB(bizId) {
  try {
    const { error } = await db.from('businesses').update({ deleted: true, deleted_at: new Date().toISOString() }).eq('id', bizId);
    if (error) throw error;
  } catch(e) {
    console.warn('소프트 삭제 실패 (로컬엔 반영됨):', e.message);
  }
}

async function restoreBizInDB(bizId) {
  try {
    const { error } = await db.from('businesses').update({ deleted: false, deleted_at: null }).eq('id', bizId);
    if (error) throw error;
  } catch(e) {
    console.warn('복구 DB 반영 실패 (로컬엔 반영됨):', e.message);
  }
}

// ─── 앱 시작 시 DB 로드 ───
// 기존 서비스 워커 제거 (캐시 삭제)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    regs.forEach(function(reg) { reg.unregister(); });
  });
  caches.keys().then(function(names) {
    names.forEach(function(name) { caches.delete(name); });
  });
}
window.addEventListener('load', async () => {
  // localStorage로 즉시 1차 렌더
  updateDashboard();

  // DB 최신 데이터 로드 (항상 DB 우선)
  await loadBusinessesFromDB();
  await loadHistoryFromDB();
  renderDeliveryPanel && renderDeliveryPanel();
  renderWasteHistList && renderWasteHistList();

  // 로드 완료 후 전체 UI 업데이트
  updateDashboard();
  updateHqRealStats();   // 본사 대시보드도 함께
  updateTabBadges();
  renderWasteTable();
  renderHistory();
  renderRegBizList();

  // 현재 열린 패널 추가 렌더
  const activePanel = location.hash.replace('#','') || 'dashboard';
  if (activePanel === 'order') renderDeliveryPanel();
  if (activePanel === 'hq') { renderHqTable(); initHqBars(); renderHqAlerts(); updateHqRealStats(); }
  if (activePanel === 'waste') { renderWasteTable(); renderWasteHistList && renderWasteHistList(); }
  if (activePanel === 'schedule') { renderDriverSchedule && renderDriverSchedule(); }
  applyPrices(); // 로드 완료 후 시세 확실히 반영
});



function populateOrderBizSelect() {
  const sel = document.getElementById('orderBizSelect');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="">— 업체 선택 —</option>';
  businesses.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name + ' (' + b.type + ')';
    sel.appendChild(opt);
  });
  if (current) sel.value = current;
}

function onOrderBizChange() {
  const sel  = document.getElementById('orderBizSelect');
  const biz  = businesses.find(b => String(b.id) === String(sel?.value));
  const codeEl = document.getElementById('orderBizCode');
  const nameEl = document.getElementById('orderBizName');
  if (biz) {
    if (codeEl) codeEl.value = 'WJ-' + String(biz.id).padStart(3,'0');
    if (nameEl) nameEl.value = biz.name;
  } else {
    if (codeEl) codeEl.value = '';
    if (nameEl) nameEl.value = '';
  }
}



function toggleWasteSection(type) {
  if (type === 'pending') {
    const panel  = document.getElementById('wastePendingPanel');
    const arrow  = document.getElementById('wasteWaitArrow');
    const isOpen = panel.style.display !== 'none';
    // 다른 패널 닫기
    document.getElementById('wasteDonePanel').style.display = 'none';
    document.getElementById('wasteDoneArrow').textContent = '▼';
    if (isOpen) {
      panel.style.display = 'none';
      arrow.textContent = '▼';
    } else {
      panel.style.display = 'block';
      arrow.textContent = '▲';
      renderWastePendingList();
    }
  } else {
    const panel  = document.getElementById('wasteDonePanel');
    const arrow  = document.getElementById('wasteDoneArrow');
    const isOpen = panel.style.display !== 'none';
    // 다른 패널 닫기
    document.getElementById('wastePendingPanel').style.display = 'none';
    document.getElementById('wasteWaitArrow').textContent = '▼';
    if (isOpen) {
      panel.style.display = 'none';
      arrow.textContent = '▼';
    } else {
      panel.style.display = 'block';
      arrow.textContent = '▲';
      renderWasteDoneList();
    }
  }
}

function renderWastePendingList() {
  const el = document.getElementById('wastePendingList');
  if (!el) return;

  // 업주 로그인 시 자기 업체만
  let bizList = businesses;
  if (ownerLoggedIn && ownerBizId) {
    bizList = businesses.filter(b => String(b.id) === String(ownerBizId));
  }

  // 폐유 임계값 도달 업체 + pending 이력 있는 업체 모두 포함
  const waitBiz = bizList.filter(b => shouldAutoCollect(b));
  const pendingOnly = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'pending' &&
    (!ownerLoggedIn || !ownerBizId || String(h.bizId) === String(ownerBizId)));
  
  // 중복 없이 합치기
  const allBizIds = new Set([
    ...waitBiz.map(b => String(b.id)),
    ...pendingOnly.map(h => String(h.bizId))
  ]);

  if (allBizIds.size === 0) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--gray);font-size:12px;">수거 대기 업체가 없어요</div>';
    return;
  }

  el.innerHTML = Array.from(allBizIds).map(bizId => {
    const b = businesses.find(x => String(x.id) === bizId);
    if (!b) return '';
    const cans  = b.wasteOil || 0;
    const kg    = (cans * PRICES.waste.can.kg).toFixed(1);
    const price = (cans * PRICES.waste.can.price).toLocaleString();
    const hasPending = historyData.some(h => String(h.bizId) === bizId && h.type === '폐유수거' && h.status === 'pending');

    if (hasPending) {
      // 수거 신청됨 → 수거 완료 버튼
      return `
      <div id="wasteRow_${b.id}" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-light);">
        <div style="width:36px;height:36px;background:#E3F2FD;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🚛</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${b.name}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:2px;">${b.type} · <strong style="color:#1565C0;">${cans}캔 (${kg}kg)</strong></div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-right:8px;">
          <div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--green-dark);">${price}원</div>
          <div style="display:inline-block;margin-top:4px;font-size:10px;font-weight:700;color:#1565C0;background:#E3F2FD;padding:2px 8px;border-radius:6px;">🚛 수거 예정</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
          <button id="collectBtn_${b.id}" class="btn" style="padding:6px 14px;font-size:11px;background:#E8F5E9;color:#2E7D32;border:1.5px solid #A5D6A7;white-space:nowrap;font-weight:700;"
            onclick="doCompleteCollect(${b.id})">✅ 수거 완료</button>
          ${(isAdminMode || isDriverMode || (ownerLoggedIn && String(b.id) === String(ownerBizId))) ? `
          <div style="display:flex;gap:4px;">
            ${(isAdminMode || isDriverMode) ? `<button onclick="editWasteQty(${b.id})" style="padding:4px 9px;font-size:10px;font-weight:700;color:#1565C0;background:#E3F2FD;border:1.5px solid #90CAF9;border-radius:8px;cursor:pointer;white-space:nowrap;">✏️ 수정</button>` : ''}
            <button onclick="cancelWasteRequest(${b.id})" style="padding:4px 9px;font-size:10px;font-weight:700;color:var(--red-accent);background:#FFF0F0;border:1.5px solid #FFCDD2;border-radius:8px;cursor:pointer;white-space:nowrap;">✕ 취소</button>
          </div>` : ''}
        </div>
      </div>`;
    } else {
      // 신청 전 → 신청 버튼
      const isUrgent = cans >= 5;
      const canDismiss = isAdminMode || isDriverMode || (ownerLoggedIn && String(b.id) === String(ownerBizId));
      return `
      <div id="wasteRow_${b.id}" style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--gray-light);">
        <div style="width:36px;height:36px;background:${isUrgent ? '#FFEBEE' : '#FFF0F0'};border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🗑️</div>
        <div style="flex:1;min-width:0;">
          <div style="font-weight:700;font-size:13px;">${b.name}</div>
          <div style="font-size:11px;color:var(--gray);margin-top:2px;">${b.type} · <strong style="color:${isUrgent ? 'var(--red-accent)' : '#D4621A'};">${cans}캔 (${kg}kg)</strong></div>
        </div>
        <div style="text-align:right;flex-shrink:0;margin-right:8px;">
          <div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--green-dark);">${price}원</div>
          <div style="display:inline-block;margin-top:4px;font-size:10px;font-weight:700;color:${isUrgent ? 'var(--red-accent)' : '#D4621A'};background:${isUrgent ? '#FFEBEE' : '#FFF8F0'};padding:2px 8px;border-radius:6px;">${isUrgent ? '🔴 긴급' : '⏳ 대기'}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">
          <button id="collectBtn_${b.id}" class="btn btn-danger" style="padding:6px 14px;font-size:11px;white-space:nowrap;font-weight:700;"
            onclick="doRequestCollect(${b.id})">🚛 신청</button>
          ${(isAdminMode || isDriverMode || canDismiss) ? `
          <div style="display:flex;gap:4px;">
            ${(isAdminMode || isDriverMode) ? `<button onclick="editWasteQty(${b.id})" style="padding:4px 9px;font-size:10px;font-weight:700;color:#1565C0;background:#E3F2FD;border:1.5px solid #90CAF9;border-radius:8px;cursor:pointer;white-space:nowrap;">✏️ 수정</button>` : ''}
            ${canDismiss ? `<button onclick="cancelAutoCollect('${b.id}')" title="자동수거 알림 OFF + 목록에서 제거" style="padding:4px 9px;font-size:10px;font-weight:700;color:var(--red-accent);background:#FFF0F0;border:1.5px solid #FFCDD2;border-radius:8px;cursor:pointer;white-space:nowrap;">✕ 취소</button>` : ''}
          </div>` : ''}
        </div>
      </div>`;
    }
  }).join('');
}

function renderWasteDoneList() {
  const el = document.getElementById('wasteDoneList');
  if (!el) return;
  const now = new Date();
  let doneList = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done' && isSameMonth(h, now.getFullYear(), now.getMonth()));
  // 업주 로그인 시 자기 업체만
  if (ownerLoggedIn && ownerBizId) {
    doneList = doneList.filter(h => String(h.bizId) === String(ownerBizId));
  }
  if (doneList.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:16px;color:var(--gray);font-size:12px;">이번 달 완료된 수거가 없어요</div>';
    return;
  }
  el.innerHTML = doneList.map(h => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-light);">
      <div style="width:36px;height:36px;background:var(--green-pale);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">✅</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${h.biz}</div>
        <div style="font-size:11px;color:var(--gray);margin-top:1px;">${h.content} · ${fmtHistDate(h)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--green-dark);">${h.amount}</div>
        <span class="status-pill status-done" style="font-size:9px;">완료</span>
      </div>
    </div>`).join('');
}

// 신청 버튼 클릭 → 즉시 "수거 예정"으로 변경
async function doRequestCollect(bizId) {
  const b = businesses.find(x => String(x.id) === String(bizId));
  if (!b) { showToast('t1','⚠️ 업체 정보 없음', ''); return; }

  // 🛡️ 중복 클릭 방지 — 같은 업체 3초 내 재클릭 차단
  window._lastCollectRequest = window._lastCollectRequest || {};
  var now = Date.now();
  if (window._lastCollectRequest[bizId] && now - window._lastCollectRequest[bizId] < 3000) {
    showToast('t1','⏳ 처리 중', '잠시만 기다려주세요');
    return;
  }
  window._lastCollectRequest[bizId] = now;

  // 🛡️ DB에서 최신 wasteOil 확인 (다른 사용자가 이미 처리했을 수 있음)
  try {
    var res = await db.from('businesses').select('waste_oil').eq('id', bizId).single();
    if (res.data) {
      var dbWaste = res.data.waste_oil || 0;
      // DB값이 메모리값과 다르면 메모리 업데이트
      if (dbWaste !== b.wasteOil) {
        console.log('[수거 신청] DB와 메모리 불일치 감지 — DB값으로 동기화:', b.wasteOil, '→', dbWaste);
        b.wasteOil = dbWaste;
        saveBusinesses();
      }
      if (dbWaste <= 0) {
        showToast('t1','ℹ️ 이미 처리됨', b.name + ' — 폐유가 없어요. 화면을 새로고침합니다.');
        // 화면 즉시 갱신
        renderWasteTable && renderWasteTable();
        renderWasteHistList && renderWasteHistList();
        updateDashboard && updateDashboard();
        return;
      }
    }
  } catch(e) {
    console.warn('수거 신청 시 DB 확인 실패 (메모리값 사용):', e.message);
  }

  if (b.wasteOil <= 0) { showToast('t1','ℹ️ 수거할 폐유가 없어요', ''); return; }
  const already = historyData.some(h => String(h.bizId) === String(bizId) && h.type === '폐유수거' && h.status === 'pending');
  if (already) { showToast('t1','ℹ️ 이미 신청됨', b.name); return; }

  // 방문일 선택 모달 표시
  showCollectDateModal(bizId, b);
}

function showCollectDateModal(bizId, b) {
  // 기존 모달이 있으면 제거
  var existing = document.getElementById('collectDateModal');
  if (existing) existing.remove();

  // 오늘(당일) ~ 7일 후 날짜 생성 — onclick 인라인 문자열 대신 dataset 사용
  var dayNames = ['일','월','화','수','목','금','토'];
  var today = new Date();
  var dateBtns = '';
  for (var i = 0; i <= 7; i++) {
    var d = new Date(today); d.setDate(today.getDate() + i);
    var ymd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var label = (i===0?'⚡ 오늘 ':i===1?'내일 ':i===2?'모레 ':'') + (d.getMonth()+1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')';
    // 🆕 v69: 오늘은 강조 색상 (당일 수거 표시)
    var btnStyle = i === 0 
      ? 'padding:10px 14px;border:2px solid #FF6B35;border-radius:8px;font-size:13px;background:#FFF3E0;cursor:pointer;font-weight:800;color:#D4621A;'
      : 'padding:10px 14px;border:1.5px solid #ccc;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;font-weight:600;';
    dateBtns += '<button class="collect-date-btn" data-bizid="' + String(bizId) + '" data-ymd="' + ymd + '" data-label="' + label.replace(/"/g,'&quot;') + '" style="' + btnStyle + '">' + label + '</button>';
  }
  var wasteKg = (b.wasteOil * (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5)).toFixed(1);
  var html = '<div id="collectDateModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div style="background:#fff;border-radius:16px;padding:24px;max-width:360px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.25);">'
    + '<div style="font-size:16px;font-weight:800;color:var(--green-dark);margin-bottom:4px;">📅 수거 방문일 선택</div>'
    + '<div style="font-size:12px;color:var(--gray);margin-bottom:16px;">' + b.name + ' · 폐유 ' + b.wasteOil + '캔 (' + wasteKg + 'kg)</div>'
    + '<div id="collectDateBtnGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' + dateBtns + '</div>'
    + '<button id="collectDateCancelBtn" style="width:100%;padding:10px;background:#f5f5f5;border:none;border-radius:8px;font-size:13px;cursor:pointer;color:#666;">취소</button>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  // 이벤트 바인딩 (안전한 방식)
  var modalEl = document.getElementById('collectDateModal');
  var btns = modalEl.querySelectorAll('.collect-date-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var bid = this.getAttribute('data-bizid');
      var ymd = this.getAttribute('data-ymd');
      var lbl = this.getAttribute('data-label');
      confirmCollectDate(bid, ymd, lbl);
    });
  });
  // 취소 버튼
  var cancelBtn = document.getElementById('collectDateCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    var m = document.getElementById('collectDateModal');
    if (m) m.remove();
  });
  // 백드롭 클릭 시 닫기
  modalEl.addEventListener('click', function(e) {
    if (e.target === modalEl) modalEl.remove();
  });
}

function confirmCollectDate(bizId, visitDate, visitLabel) {
  document.getElementById('collectDateModal').remove();
  var b = businesses.find(function(x){ return String(x.id) === String(bizId); });
  if (!b) return;

  var now = new Date();
  var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  var wasteKg = (b.wasteOil * (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5)).toFixed(1);
  var item = {
    date: dateStr, rawDate: now.toISOString(),
    biz: b.name, bizId: b.id, type: '폐유수거',
    content: '폐유 ' + b.wasteOil + '캔 수거 신청 · 방문예정: ' + visitLabel,
    qty: b.wasteOil,
    unitPrice: PRICES.waste.can.price,  // 🆕 단가
    amount: (b.wasteOil * PRICES.waste.can.price).toLocaleString() + '원',
    method: '수동', status: 'pending',
    visitDate: visitDate, visitLabel: visitLabel,
  };
  historyData.unshift(item);
  saveHistory();
  try { saveHistoryToDB(item); } catch(e) {}

  // SMS/카카오 알림 (업체 전화번호로 문자앱 열기)
  var phone = (b.phone || '').replace(/[^0-9]/g,'');
  var smsBody = encodeURIComponent('[식용유니버스] ' + b.name + ' 폐유수거 안내 방문예정: ' + visitLabel + ' ' + b.wasteOil + '캔 (' + wasteKg + 'kg) 문의:033-000-0000');
    if (phone) {
    var isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = 'sms:' + phone + (navigator.platform==='iPhone'?'&':'?') + 'body=' + smsBody;
    } else {
      // PC: 알림 토스트 + 클립보드
      var msgText = '[식용유니버스] ' + b.name + ' 방문예정: ' + visitLabel + ' · 폐유 ' + b.wasteOil + '캔';
      navigator.clipboard && navigator.clipboard.writeText(msgText).then(function(){ showToast('t1','📋 문자 내용 복사됨','업주 연락처: ' + (b.phone||'미등록')); }).catch(function(){});
    }
  }

  renderWastePendingList();
  renderWasteTable();
  renderHistory();
  updateDashboard();
  showToast('t1','✅ 수거 신청 완료!', b.name + ' — ' + visitLabel + ' 방문 예정');
  // 🆕 알림 — 관리자 + 업주
  try {
    addNotif({
      type: 'collect',
      target: 'admin',
      title: '♻️ 폐유 수거 신청',
      body: b.name + ' — 폐유 ' + b.wasteOil + '캔 · ' + visitLabel + ' 방문',
      bizId: b.id,
      link: 'waste'
    });
    addNotif({
      type: 'collect',
      target: 'owner_' + b.id,
      title: '✅ 수거 신청 완료',
      body: '폐유 ' + b.wasteOil + '캔 — ' + visitLabel + ' 방문 예정',
      bizId: b.id,
      link: 'history'
    });
  } catch(e) { console.warn('수거 알림 실패:', e.message); }
}

function showCompleteCollectModal(bizId) {
  var b = businesses.find(function(x){ return String(x.id) === String(bizId); });
  if (!b) return;
  var defaultCans = b.wasteOil;
  var defaultKg = (defaultCans * (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5) - 1).toFixed(1);
  var html = '<div id="completeCollectModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div style="background:#fff;border-radius:16px;padding:24px;max-width:340px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.25);">'
    + '<div style="font-size:16px;font-weight:800;color:var(--green-dark);margin-bottom:4px;">✅ 수거 완료 처리</div>'
    + '<div style="font-size:12px;color:var(--gray);margin-bottom:16px;">' + b.name + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
    + '<div><div style="font-size:11px;color:var(--gray);font-weight:600;margin-bottom:4px;">수거 캔 수</div>'
    + '<input id="completeCollectCans" type="number" value="' + defaultCans + '" min="1" max="99" '
    + 'style="width:100%;padding:10px;border:1.5px solid var(--gray-light);border-radius:8px;font-size:16px;font-weight:700;text-align:center;" '
    + 'oninput="var kg=(this.value*(PRICES.waste&&PRICES.waste.can?PRICES.waste.can.kg:16.5)-1).toFixed(1);document.getElementById(&quot;completeCollectKg&quot;).value=kg"></div>'
    + '<div><div style="font-size:11px;color:var(--gray);font-weight:600;margin-bottom:4px;">실제 중량 (kg) <span style="color:#1565C0;font-size:10px;">수기 수정 가능</span></div>'
    + '<input id="completeCollectKg" type="number" step="0.1" value="' + defaultKg + '" min="0" '
    + 'style="width:100%;padding:10px;border:1.5px solid #1565C0;border-radius:8px;font-size:16px;font-weight:700;text-align:center;color:#1565C0;"></div>'
    + '</div>'
    + '<div id="completeCollectAmtPreview" style="background:#F0FBF5;border-radius:8px;padding:10px;text-align:center;font-size:13px;font-weight:700;color:var(--green-dark);margin-bottom:14px;">'
    + '예상 금액: ' + (defaultCans * PRICES.waste.can.price).toLocaleString() + '원'
    + '</div>'
    + '<div style="display:flex;gap:8px;">'
    + '<button onclick="document.getElementById(&quot;completeCollectModal&quot;).remove()" '
    + 'style="flex:1;padding:11px;background:#f5f5f5;border:none;border-radius:8px;font-size:13px;cursor:pointer;color:#666;">취소</button>'
    + '<button onclick="doCompleteCollect(' + bizId + ')" '
    + 'style="flex:2;padding:11px;background:#1F4D30;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:800;cursor:pointer;">✅ 수거 완료 확정</button>'
    + '</div>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
  // kg 변경시 금액 업데이트
  document.getElementById('completeCollectKg').addEventListener('input', function() {
    var cans = parseInt(document.getElementById('completeCollectCans').value) || 0;
    var amt = (cans * PRICES.waste.can.price).toLocaleString();
    document.getElementById('completeCollectAmtPreview').textContent = '예상 금액: ' + amt + '원';
  });
}

function doCompleteCollect(bizId) {
  var cansEl = document.getElementById('completeCollectCans');
  var kgEl = document.getElementById('completeCollectKg');
  var actualCans = parseInt(cansEl ? cansEl.value : 0) || 0;
  var actualKg = parseFloat(kgEl ? kgEl.value : 0) || 0;
  var modal = document.getElementById('completeCollectModal');
  if (modal) modal.remove();
  // 실제 kg를 bizData에 기록
  window._pendingCollectKg = actualKg;
  window._pendingCollectCans = actualCans;
  completeCollect(bizId);
}

// 구버전 호환용 (직접 pending 생성하는 경로)
function _doRequestCollectLegacy(bizId) {
  const b = businesses.find(x => String(x.id) === String(bizId));
  if (!b) return;
  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  const item = {
    date: dateStr, rawDate: now.toISOString(),
    biz: b.name, bizId: b.id, type: '폐유수거',
    content: '폐유 ' + b.wasteOil + '캔 수거 신청',
    qty: b.wasteOil,
    unitPrice: PRICES.waste.can.price,  // 🆕 단가
    amount: (b.wasteOil * PRICES.waste.can.price).toLocaleString() + '원',
    method: '수동', status: 'pending',
  };
  historyData.unshift(item);
  saveHistory();
  try { saveHistoryToDB(item); } catch(e) {}

  renderWastePendingList();
  renderWasteTable();
  // 이력 데이터 마이그레이션: 유종명 → 실제 품목명
  (function migrateHistoryProductNames() {
    var changed = false;
    var typeToDefault = { '대두유': 'soy_wonju', '카놀라유': 'can_grewell', '옥수수유': 'corn_oilers' };
    historyData.forEach(function(h) {
      if (h.type !== '식용유발주') return;
      // content에 유종명이 포함된 경우 실제 품목명으로 교체
      ['대두유','카놀라유','옥수수유'].forEach(function(typeName) {
        if (h.content && h.content.indexOf(typeName + ' ') === 0) {
          // 해당 업체의 품목 찾기
          var biz = businesses.find(function(b){ return b.id === h.bizId; });
          var prodName = typeName; // 기본값 유지
          if (biz) {
            var prods = getBizProducts(biz);
            var matched = prods.find(function(p){
              return getProductInfo(p.key).type === (typeName === '대두유' ? 'soy' : typeName === '카놀라유' ? 'canola' : 'corn');
            });
            if (matched) prodName = getProductInfo(matched.key).label;
          } else if (typeToDefault[typeName]) {
            prodName = getProductInfo(typeToDefault[typeName]).label;
          }
          if (prodName !== typeName) {
            h.content = h.content.replace(typeName + ' ', prodName + ' ');
            changed = true;
          }
        }
      });
    });
    if (changed) { saveHistory(); console.log('✅ 이력 품목명 마이그레이션 완료'); }
  })();

  updateDashboard();
  updateTabBadges();
  showToast('t1','🚛 수거 신청 완료!', b.name + ' — ' + b.wasteOil + '캔');
}

// 수거 완료 버튼 클릭 → 즉시 목록에서 제거
async function doCompleteCollect(bizId) {
  if (!isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음','관리자 또는 운반자 로그인 후 이용 가능합니다'); return; }
  const btn = document.getElementById('collectBtn_' + bizId);
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 처리 중...'; btn.style.opacity = '0.6'; }

  const b = businesses.find(x => String(x.id) === String(bizId));
  if (!b) return;

  const prevWaste = b.wasteOil || 0;

  // pending → done 처리
  const pendingItem = historyData.find(h => String(h.bizId) === String(bizId) && h.type === '폐유수거' && h.status === 'pending');
  if (pendingItem) {
    pendingItem.status = 'done';
    pendingItem.method = '수동';  // 폐유수거 완료는 항상 수동
    pendingItem.content = '폐유 ' + prevWaste + '캔 수거 완료';
    pendingItem.qty = prevWaste;
    pendingItem.amount = (prevWaste * PRICES.waste.can.price).toLocaleString() + '원';
    saveHistory();
    try {
      if (pendingItem.dbId) {
        // 기존 DB 레코드 업데이트
        db.from('history').update({status:'done', content: pendingItem.content, qty: prevWaste, amount: pendingItem.amount}).eq('id', pendingItem.dbId).then(()=>{});
      } else {
        // DB에 없는 pending이면 done 이력 새로 삽입
        saveHistoryToDB(pendingItem);
      }
    } catch(e) {}
  } else {
    // pending 없으면 done 이력 직접 생성
    const now = new Date();
    const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
    const newItem = {
      date: dateStr, rawDate: now.toISOString(),
      biz: b.name, bizId: b.id, type: '폐유수거',
      content: '폐유 ' + actualCans + '캔 수거 완료 (실중량 ' + parseFloat(actualKg).toFixed(1) + 'kg)',
      qty: prevWaste,
      unitPrice: PRICES.waste.can.price,  // 🆕 단가
      amount: (prevWaste * PRICES.waste.can.price).toLocaleString() + '원',
      method: '수동', status: 'done',
    };
    historyData.unshift(newItem);
    saveHistory();
    try { saveHistoryToDB(newItem); } catch(e) {}
  }

  // 폐유 재고 0으로
  b.wasteOil = 0;
  b.lastUpdate = '방금 수거 완료';
  saveBusinesses();
  try { updateBizStockInDB(b.id, b.newOil, 0, b.lastUpdate, b.oilProducts); } catch(e) {}

  // 행 애니메이션 후 제거
  const row = document.getElementById('wasteRow_' + bizId);
  if (row) {
    row.style.transition = 'opacity 0.3s';
    row.style.opacity = '0';
    setTimeout(() => {
      renderWastePendingList();
      renderWasteTable();
      renderWasteHistList && renderWasteHistList();
      updateDashboard();
      updateTabBadges();
    }, 300);
  } else {
    renderWastePendingList();
    renderWasteTable();
    renderWasteHistList && renderWasteHistList();
    updateDashboard();
    updateTabBadges();
  }

  showToast('t1','✅ 수거 완료!', b.name + ' — 폐유 ' + prevWaste + '캔 완료');
}

function requestCollect(bizId) {
  // 업주는 현황만 조회, 수거 신청/완료 불가
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 수거는 담당자가 처리해요','현황만 확인 가능합니다');
    return;
  }
  doRequestCollect(bizId);
}



function completeCollect(bizId) {
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 수거 완료는 담당자가 처리해요','현황만 확인 가능합니다');
    return;
  }
  if (!isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음','관리자 또는 운반자 로그인 후 이용 가능합니다'); return; }
  const b = businesses.find(x => String(x.id) === String(bizId));
  if (!b) return;

  // 처리 중 플래그
  if (b._collectInProgress) return;

  // pending 이력 확인
  const pendingItem = historyData.find(h =>
    String(h.bizId) === String(bizId) && h.type === '폐유수거' && h.status === 'pending'
  );

  // 폐유 0캔이고 pending 이력도 없으면 무시
  if (b.wasteOil <= 0 && !pendingItem) {
    showToast('t1','ℹ️ 수거할 폐유가 없어요', b.name + ' — 폐유 재고 0캔');
    return;
  }
  // 수거 신청(pending) 없이 완료 불가 — 신청 버튼 먼저 눌러야 함
  if (!pendingItem) {
    showToast('t1','⚠️ 수거 신청이 필요해요', b.name + ' — 🚛 수거 신청 버튼을 먼저 눌러주세요');
    document.querySelectorAll('[onclick*="completeCollect(' + bizId + ')"]'). forEach(btn => {
      btn.disabled = false; btn.textContent = '✅ 수거 완료'; btn.style.opacity = '1';
    });
    b._collectInProgress = false;
    return;
  }

  b._collectInProgress = true;

  // 버튼 즉시 비활성화
  document.querySelectorAll(`[onclick*="completeCollect(${bizId})"]`).forEach(btn => {
    btn.disabled = true;
    btn.textContent = '⏳ 처리 중...';
    btn.style.opacity = '0.5';
  });

  const prevWaste = pendingItem?.qty || b.wasteOil;
  // doCompleteCollect에서 입력한 실제 kg/캔 사용
  const actualKg = window._pendingCollectKg || (prevWaste * (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5) - 1);
  const actualCans = window._pendingCollectCans || prevWaste;
  window._pendingCollectKg = null; window._pendingCollectCans = null;

  // pending 이력 → done으로 변경
  if (pendingItem) {
    pendingItem.status = 'done';
    pendingItem.qty = prevWaste;
    pendingItem.content = '폐유 ' + prevWaste + '캔 수거 완료';
    if (pendingItem.dbId) {
      try {
        db.from('history').update({ status: 'done', content: pendingItem.content, qty: prevWaste })
          .eq('id', pendingItem.dbId).then(() => {});
      } catch(e) {}
    }
    saveHistory();
  }

  // 업체 폐유 재고 → 0 초기화
  b.wasteOil = 0;
  b.lastUpdate = '방금 수거 완료';
  saveBusinesses();
  try { updateBizStockInDB(b.id, b.newOil, 0, b.lastUpdate, b.oilProducts); } catch(e) {}

  // 지도 마커 갱신
  if (kakaoMap && mapInitialized) {
    markers.forEach(m => m.overlay.setMap(null));
    infoWindows.forEach(iw => iw.setMap(null));
    markers = []; infoWindows = [];
    businesses.forEach(biz => addMarkerToMap(biz));
    renderBizList();
  }

  renderWasteTable();
  renderWastePendingList();
  // 이력 데이터 마이그레이션: 유종명 → 실제 품목명
  (function migrateHistoryProductNames() {
    var changed = false;
    var typeToDefault = { '대두유': 'soy_wonju', '카놀라유': 'can_grewell', '옥수수유': 'corn_oilers' };
    historyData.forEach(function(h) {
      if (h.type !== '식용유발주') return;
      // content에 유종명이 포함된 경우 실제 품목명으로 교체
      ['대두유','카놀라유','옥수수유'].forEach(function(typeName) {
        if (h.content && h.content.indexOf(typeName + ' ') === 0) {
          // 해당 업체의 품목 찾기
          var biz = businesses.find(function(b){ return b.id === h.bizId; });
          var prodName = typeName; // 기본값 유지
          if (biz) {
            var prods = getBizProducts(biz);
            var matched = prods.find(function(p){
              return getProductInfo(p.key).type === (typeName === '대두유' ? 'soy' : typeName === '카놀라유' ? 'canola' : 'corn');
            });
            if (matched) prodName = getProductInfo(matched.key).label;
          } else if (typeToDefault[typeName]) {
            prodName = getProductInfo(typeToDefault[typeName]).label;
          }
          if (prodName !== typeName) {
            h.content = h.content.replace(typeName + ' ', prodName + ' ');
            changed = true;
          }
        }
      });
    });
    if (changed) { saveHistory(); console.log('✅ 이력 품목명 마이그레이션 완료'); }
  })();

  updateDashboard();
  updateTabBadges();
  b._collectInProgress = false;
  showToast('t1','✅ 수거 완료!', b.name + ' — 폐유 ' + prevWaste + '캔 수거 완료 · 재고 0 초기화');
  // 🆕 탄소저감 기부 적립 (폐유 매입 매출 0.1%)
  try {
    var collectAmt = prevWaste * (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.price : 19000);
    var rec = accrueDonation(b.id, collectAmt, 'waste');
    if (rec && !rec.capped && rec.amount > 0) {
      console.log('[기부 적립] ' + b.name + ' (폐유) +' + rec.amount + '원');
    }
  } catch(e) { console.warn('수거 기부 적립 실패:', e.message); }
  // 🆕 수거 완료 알림 (업주에게)
  try {
    addNotif({
      type: 'collect',
      target: 'owner_' + b.id,
      title: '✅ 폐유 수거 완료',
      body: '폐유 ' + prevWaste + '캔 수거가 완료됐어요',
      bizId: b.id,
      link: 'history'
    });
  } catch(e) {}
}


function completeOrder(idxOrDbId) {
  if (!isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음','관리자 또는 운반자 로그인 후 이용 가능합니다'); return; }
  // dbId 우선, 없으면 인덱스로 찾기
  var item = historyData.find(function(h) { return h.dbId && String(h.dbId) === String(idxOrDbId); });
  if (!item) item = historyData[idxOrDbId];
  if (!item || item.type !== '식용유발주') return;
  if (item.status === 'done') { showToast('t1','ℹ️ 이미 완료됨','중복 처리를 방지했어요'); return; }

  item.status = 'done';

  // 업체 재고 증가
  const biz = businesses.find(b => String(b.id) === String(item.bizId));
  if (biz && item.qty) {
    // 자동발주 일시 차단 (60초) - checkAutoOrder 재실행 방지
    biz._suppressAutoOrder = Date.now() + 60000;

    // 납품 전 재고 캡처 (content에 표시용)
    var beforeQty = 0;
    if (!biz.oilProducts || biz.oilProducts.length === 0) {
      biz.oilProducts = getBizProducts(biz).map(function(p){ return {key:p.key, qty:p.qty}; });
    }
    if (item.productKey && biz.oilProducts) {
      var pp = biz.oilProducts.find(function(p){ return p.key === item.productKey; });
      beforeQty = pp ? (pp.qty || 0) : 0;
      if (pp) {
        pp.qty = beforeQty + item.qty;
      } else {
        biz.oilProducts.push({ key: item.productKey, qty: item.qty });
      }
    } else {
      beforeQty = biz.newOil || 0;
    }
    var afterQty = beforeQty + item.qty;

    // content에 실제 재고 변화 기록
    var prodName = item.productName || (item.productKey ? getProductInfo(item.productKey).label : '식용유');
    var delivLabel = (item.method === '추가발주') ? '추가납품 완료' : '납품 완료';
    item.content = prodName + ' ' + item.qty + '캔 ' + delivLabel;

    // 전체 재고 합산 재계산
    biz.newOil = biz.oilProducts.reduce(function(s,p){ return s+(p.qty||0); }, 0);
    biz.lastUpdate = '방금 납품 완료';
    saveBusinesses();
    updateBizStockInDB(biz.id, biz.newOil, biz.wasteOil, biz.lastUpdate, biz.oilProducts);
    if (kakaoMap && mapInitialized) {
      markers.forEach(m => m.overlay.setMap(null));
      infoWindows.forEach(iw => iw.setMap(null));
      markers = []; infoWindows = [];
      businesses.forEach(b => addMarkerToMap(b));
      renderBizList();
    }
    updateTabBadges();
  }
  // DB 상태 업데이트
  if (item.dbId) {
    db.from('history').update({ status: 'done', content: item.content }).eq('id', item.dbId).then(function(r){
      if (r.error) console.warn('납품완료 처리 실패:', r.error.message);
    });
  } else {
    saveHistoryToDB(item);
  }
  saveHistory();
  renderHistory();
  updateDashboard();
  renderOrderPendingList();
  showToast('t1','✅ 납품 완료 처리!', item.biz + ' — ' + item.content);
  // 🆕 업주에게 납품 완료 알림
  try {
    if (item.bizId) {
      addNotif({
        type: 'order',
        target: 'owner_' + item.bizId,
        title: '✅ 납품 완료',
        body: item.content,
        bizId: item.bizId,
        link: 'history'
      });
    }
  } catch(e) {}
}

function renderOrderPendingList() {
  const el = document.getElementById('orderPendingList');
  if (!el) return;
  let pending = historyData.filter(h => !h.deleted_at && h.type === '식용유발주' && h.status === 'pending');
  // 업주 로그인 시 자기 업체만
  if (ownerLoggedIn && ownerBizId) {
    pending = pending.filter(h => String(h.bizId) === String(ownerBizId));
  }
  if (pending.length === 0) {
    el.innerHTML = '<div style="font-size:11px;color:#555;text-align:center;padding:8px;">대기중인 발주 없음</div>';
    return;
  }
  el.innerHTML = pending.map((h, i) => `
    <div style="background:var(--cream);border-radius:8px;padding:9px 11px;display:flex;align-items:center;gap:8px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:11px;font-weight:700;color:var(--black);">${h.biz}</div>
        <div style="font-size:10px;color:var(--gray);margin-top:1px;">${h.content} · ${h.date}</div>
      </div>
      <div style="font-size:11px;font-weight:800;color:var(--green-main);white-space:nowrap;">${h.amount}</div>
      <button onclick="completeOrder('${h.dbId || historyData.indexOf(h)}')" 
        style="background:var(--green-main);border:none;border-radius:6px;padding:4px 9px;font-size:10px;font-weight:700;color:#000;cursor:pointer;white-space:nowrap;">
        ✅ 완료
      </button>
    </div>`).join('');
}

// 🔧 같은 거래(같은 업체·품목·분 단위 시각)에 done row가 여러 개일 때 1개만 남김
// 신청+완료 이중 기록 데이터의 정산 중복 방지
function dedupeHistoryDone(historyList) {
  if (!historyList || historyList.length === 0) return [];
  // 🗑️ 휴지통 항목은 통계에서 제외
  historyList = historyList.filter(function(h) { return !h.deleted_at; });
  var seen = {};
  var result = [];
  // 정렬: rawDate 오름차순 (먼저 들어온 것 = 신청 row 우선)
  var sorted = historyList.slice().sort(function(a,b) {
    var ta = a.rawDate ? new Date(a.rawDate).getTime() : 0;
    var tb = b.rawDate ? new Date(b.rawDate).getTime() : 0;
    return ta - tb;
  });
  sorted.forEach(function(h) {
    if (h.status !== 'done') { result.push(h); return; }
    // 5분 단위로 묶음 (rawDate 기준)
    var t = h.rawDate ? new Date(h.rawDate).getTime() : 0;
    var bucketKey = h.bizId + '|' + (h.productKey || '') + '|' + (h.qty || 0) + '|' + Math.floor(t / 300000); // 5분 버킷
    if (seen[bucketKey]) {
      // 중복 — 스킵 (단 method='추가발주'는 별도 거래)
      if (h.method === '추가발주') {
        result.push(h);
      }
      return;
    }
    seen[bucketKey] = true;
    result.push(h);
  });
  return result;
}

function updateOrderMonthStats() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();
  let oilH = historyData.filter(h => !h.deleted_at && h.type === '식용유발주' && h.status === 'done' && isSameMonth(h, thisYear, thisMonth));
  // 업주 로그인 시 자기 업체만
  if (ownerLoggedIn && ownerBizId) {
    oilH = oilH.filter(h => String(h.bizId) === String(ownerBizId));
  }
  // 🔧 중복 제거 (이중 기록 데이터 방어)
  oilH = dedupeHistoryDone(oilH);
  const totalCans = oilH.reduce((s,h) => s + (h.qty||0), 0);
  const el  = document.getElementById('orderMonthTotal');
  const sub = document.getElementById('orderMonthSub');
  if (el)  el.innerHTML = oilH.length + ' <span style="font-size:13px;font-weight:500">건</span>';
  if (sub) sub.textContent = oilH.length > 0
    ? '총 ' + totalCans + '캔 납품 완료'
    : '이번 달 납품 이력 없음';
  // 패널 열려있으면 목록도 갱신
  const donePanel = document.getElementById('orderDonePanel');
  if (donePanel && donePanel.style.display !== 'none') renderOrderDoneList();
}


// ===== 이번 달 납품 이력 패널 토글 =====
function toggleOrderDonePanel() {
  const panel  = document.getElementById('orderDonePanel');
  const arrow  = document.getElementById('orderDoneArrow');
  const card   = document.getElementById('orderDoneCard');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (isOpen) {
    panel.style.display = 'none';
    if (arrow) arrow.textContent = '▼';
    if (card)  card.style.borderColor = 'transparent';
  } else {
    panel.style.display = 'block';
    if (arrow) arrow.textContent = '▲';
    if (card)  card.style.borderColor = 'var(--green-main)';
    renderOrderDoneList();
  }
}

function renderOrderDoneList() {
  const el = document.getElementById('orderDoneList');
  if (!el) return;
  const now = new Date();
  let doneList = historyData.filter(h =>
    !h.deleted_at &&
    h.type === '식용유발주' && h.status === 'done'
    && isSameMonth(h, now.getFullYear(), now.getMonth())
    && !isAutoAlertOnly(h)  // 자동발주 알림 제외
  );
  // 업주 로그인 시 자기 업체만
  if (ownerLoggedIn && ownerBizId) {
    doneList = doneList.filter(h => String(h.bizId) === String(ownerBizId));
  }
  // 🔧 중복 제거 (이중 기록 데이터 방어)
  doneList = dedupeHistoryDone(doneList);
  doneList = doneList.sort((a,b) => new Date(b.rawDate||b.date) - new Date(a.rawDate||a.date));

  if (doneList.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">이번 달 납품 완료 이력이 없어요</div>';
    return;
  }
  el.innerHTML = doneList.map(h => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-light);">
      <div style="width:36px;height:36px;background:var(--green-pale);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🫙</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${h.biz}</div>
        <div style="font-size:11px;color:var(--gray);margin-top:1px;">${h.content} · ${fmtHistDate(h)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--green-dark);">${h.amount}</div>
        <span class="status-pill status-done" style="font-size:9px;">완료</span>
      </div>
    </div>`).join('');
}

// 업체별 업주 로그인 ID/PW 관리
const bizPwOverrides = JSON.parse(localStorage.getItem('hiveoil_biz_pw') || '{}');

function saveBizPwOverrides() {
  try { localStorage.setItem('hiveoil_biz_pw', JSON.stringify(bizPwOverrides)); } catch(e) {}
}

function getBizCredentials(bizId) {
  const b = businesses.find(x => x.id === bizId);
  if (!b) return null;
  const code  = getBizCode(bizId);   // 배열 순서 기반 — buildOwnerAccounts와 동일 로직
  const accts = buildOwnerAccounts();
  const pw    = accts[code]?.pw || '';
  if (!pw) return null;  // 비밀번호 미설정 업체는 자격증명 없음
  return { code, pw, name: b.name, phone: b.phone || '—' };
}


function toggleBizDetail(bizId) {
  var el = document.getElementById('bizDetail_' + bizId);
  if (!el) return;
  el.style.display = el.style.display === 'none' || el.style.display === '' ? 'block' : 'none';
}

function editAutoQty(bizId) {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  var b = businesses.find(function(x){ return x.id === bizId; });
  if (!b) return;
  var cur = b.autoQty || 5;
  var input = prompt('[' + b.name + '] 자동발주 수량 설정\n\n현재: ' + cur + '캔\n재고 2캔 이하 시 자동 발주되는 수량을 입력하세요:', cur);
  if (input === null) return;
  var qty = parseInt(input);
  if (isNaN(qty) || qty < 1 || qty > 99) { showToast('t1','⚠️ 오류','1~99 사이 숫자를 입력해주세요'); return; }
  b.autoQty = qty;
  saveBusinesses();
  // DB 업데이트
  db.from('businesses').update({ auto_qty: qty }).eq('id', bizId).then(function(){});
  renderRegBizList();
  showToast('t1','✅ 자동발주 수량 변경', b.name + ' — ' + qty + '캔으로 설정됨');
}

// ============================================================
// 🫙 업체별 지정 식용유 관리 (관리자 전용)
// ============================================================
// ============================================================
// ✏️ 업체 정보 수정 모달 (관리자 전용)
// ============================================================
function editBizInfo(bizId) {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;

  var existing = document.getElementById('editBizInfoModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'editBizInfoModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:560px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;margin:auto;">' +
      '<div style="background:linear-gradient(135deg,#92400E,#FF9500);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;">✏️ 업체 정보 수정</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.85);margin-top:2px;">' + biz.name + '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'editBizInfoModal\').remove()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:8px;width:34px;height:34px;font-size:16px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="padding:18px 22px;max-height:70vh;overflow-y:auto;">' +
        // 기본 정보
        '<div style="margin-bottom:14px;">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:4px;">🏪 상호명</label>' +
          '<input type="text" id="editBizName" value="' + (biz.name || '').replace(/"/g,'&quot;') + '" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:14px;font-weight:700;font-family:var(--font-body);box-sizing:border-box;">' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">' +
          '<div>' +
            '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:4px;">📂 업종</label>' +
            '<input type="text" id="editBizType" value="' + (biz.type || '').replace(/"/g,'&quot;') + '" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:4px;">👤 대표자</label>' +
            '<input type="text" id="editBizOwner" value="' + (biz.owner || '').replace(/"/g,'&quot;') + '" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">' +
          '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;">' +
          '<div>' +
            '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:4px;">📱 대표자 휴대폰</label>' +
            '<input type="tel" id="editBizPhone" value="' + (biz.phone || '').replace(/"/g,'&quot;') + '" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:4px;">⚡ 자동발주 수량 (캔)</label>' +
            '<input type="number" id="editBizAutoQty" min="1" max="50" value="' + (biz.autoQty || 5) + '" style="width:100%;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">' +
          '</div>' +
        '</div>' +
        '<div style="margin-bottom:14px;">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:#666;margin-bottom:4px;">📍 주소</label>' +
          '<div style="display:flex;gap:6px;">' +
            '<input type="text" id="editBizAddr" value="' + (biz.addr || '').replace(/"/g,'&quot;') + '" placeholder="주소 또는 상호명으로 검색" style="flex:1;padding:11px 13px;border:1.5px solid #DDD;border-radius:9px;font-size:13px;font-family:var(--font-body);box-sizing:border-box;">' +
            '<button onclick="searchEditBizAddr()" style="background:#185FA5;color:#fff;border:none;border-radius:9px;padding:0 16px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font-body);white-space:nowrap;">🔍 검색</button>' +
          '</div>' +
          '<div id="editBizAddrResults" style="display:flex;flex-direction:column;gap:5px;margin-top:8px;max-height:180px;overflow-y:auto;"></div>' +
          '<div id="editBizCoords" style="display:flex;align-items:center;gap:6px;margin-top:6px;font-size:10px;color:#888;">' +
            '<span>📌 좌표:</span>' +
            '<span id="editBizLatLngLabel" style="font-family:monospace;color:#185FA5;font-weight:700;">' + (biz.lat ? parseFloat(biz.lat).toFixed(5) : '?') + ', ' + (biz.lng ? parseFloat(biz.lng).toFixed(5) : '?') + '</span>' +
          '</div>' +
          '<input type="hidden" id="editBizLat" value="' + (biz.lat || '') + '">' +
          '<input type="hidden" id="editBizLng" value="' + (biz.lng || '') + '">' +
        '</div>' +
        // 동의 토글들
        '<div style="background:#F8FAFB;border-radius:9px;padding:14px 16px;margin-bottom:14px;">' +
          '<div style="font-size:11px;font-weight:800;color:#444;margin-bottom:10px;">📋 동의/설정 항목</div>' +
          '<div style="display:flex;flex-direction:column;gap:8px;">' +
            '<label style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:8px;padding:11px 13px;cursor:pointer;border:1.5px solid #E5E5E5;">' +
              '<input type="checkbox" id="editBizISCC" ' + (biz.iscc_agreed ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;flex-shrink:0;">' +
              '<div style="flex:1;">' +
                '<div style="font-size:13px;font-weight:700;color:#1B5E20;">🌍 ISCC EU 자가선언 동의</div>' +
                '<div style="font-size:10px;color:#666;margin-top:2px;">동의 시 ESG 포인트 적립 + 인증서 발급 가능</div>' +
              '</div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:8px;padding:11px 13px;cursor:pointer;border:1.5px solid #E5E5E5;">' +
              '<input type="checkbox" id="editBizAuto" ' + (biz.auto !== false ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;flex-shrink:0;">' +
              '<div style="flex:1;">' +
                '<div style="font-size:13px;font-weight:700;color:#185FA5;">⚡ 자동발주 ON</div>' +
                '<div style="font-size:10px;color:#666;margin-top:2px;">재고 부족 시 자동발주 추천 표시</div>' +
              '</div>' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:10px;background:#fff;border-radius:8px;padding:11px 13px;cursor:pointer;border:1.5px solid #E5E5E5;">' +
              '<input type="checkbox" id="editBizAutoCollect" ' + (biz.autoCollect !== false ? 'checked' : '') + ' style="width:18px;height:18px;cursor:pointer;flex-shrink:0;">' +
              '<div style="flex:1;">' +
                '<div style="font-size:13px;font-weight:700;color:#FF9500;">♻️ 자동수거 ON</div>' +
                '<div style="font-size:10px;color:#666;margin-top:2px;">폐유 누적 시 자동수거 요청</div>' +
              '</div>' +
            '</label>' +
          '</div>' +
        '</div>' +
        // 🆕 자동 임계값 설정
        '<div style="background:#F8FAF8;border:1px solid #C5E1CC;border-radius:9px;padding:14px 16px;margin-bottom:14px;">' +
          '<div style="font-size:11px;font-weight:800;color:#1B5E20;margin-bottom:10px;">⚙️ 자동 임계값 설정</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:8px;">' +
            '<div>' +
              '<label style="display:block;font-size:10px;font-weight:700;color:#185FA5;margin-bottom:4px;">📉 자동발주 트리거</label>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<input type="number" id="editBizOrderThreshold" min="1" max="20" value="' + getAutoOrderThreshold(biz) + '" style="flex:1;padding:9px 11px;border:1.5px solid #DDD;border-radius:8px;font-size:13px;font-weight:700;font-family:var(--font-body);box-sizing:border-box;text-align:center;">' +
                '<span style="font-size:10px;color:#666;white-space:nowrap;">캔 이하</span>' +
              '</div>' +
            '</div>' +
            '<div>' +
              '<label style="display:block;font-size:10px;font-weight:700;color:#185FA5;margin-bottom:4px;">📦 발주 수량</label>' +
              '<div style="display:flex;align-items:center;gap:6px;">' +
                '<input type="number" id="editBizAutoQty" min="1" max="50" value="' + (biz.autoQty || 5) + '" style="flex:1;padding:9px 11px;border:1.5px solid #DDD;border-radius:8px;font-size:13px;font-weight:700;font-family:var(--font-body);box-sizing:border-box;text-align:center;">' +
                '<span style="font-size:10px;color:#666;white-space:nowrap;">캔 주문</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<label style="display:block;font-size:10px;font-weight:700;color:#FF9500;margin-bottom:4px;">📈 자동수거 트리거</label>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
              '<input type="number" id="editBizCollectThreshold" min="1" max="20" value="' + getAutoCollectThreshold(biz) + '" style="flex:1;padding:9px 11px;border:1.5px solid #DDD;border-radius:8px;font-size:13px;font-weight:700;font-family:var(--font-body);box-sizing:border-box;text-align:center;">' +
              '<span style="font-size:10px;color:#666;white-space:nowrap;">캔 이상이면 수거 요청</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        // 액션 버튼
        '<div style="display:flex;gap:8px;">' +
          '<button onclick="document.getElementById(\'editBizInfoModal\').remove()" style="flex:1;background:#F5F5F5;color:#666;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
          '<button onclick="saveBizInfo(' + bizId + ')" style="flex:2;background:linear-gradient(135deg,#FF9500,#E65100);color:#fff;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;font-family:var(--font-body);">💾 저장</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
}

// 정보수정 모달 - 주소/장소 검색
function searchEditBizAddr() {
  var input = document.getElementById('editBizAddr');
  var resultsEl = document.getElementById('editBizAddrResults');
  if (!input || !resultsEl) return;
  var query = input.value.trim();
  if (!query) { showToast('t1','검색어를 입력해주세요',''); return; }
  resultsEl.innerHTML = '<div style="text-align:center;padding:10px;color:#888;font-size:11px;">검색 중...</div>';

  function doSearch() {
    var ps = new kakao.maps.services.Places();
    ps.keywordSearch(query, function(data, status) {
      if (status === kakao.maps.services.Status.OK && data.length > 0) {
        window._editBizSearchResults = data;
        var html = '';
        for (var i = 0; i < Math.min(data.length, 8); i++) {
          var p = data[i];
          html += '<div onclick="selectEditBizAddr(' + i + ')" style="background:#fff;border:1px solid #DDE8E1;border-radius:7px;padding:8px 10px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:8px;">';
          html += '<div style="font-size:14px;flex-shrink:0;">📍</div>';
          html += '<div style="flex:1;min-width:0;">';
          html += '<div style="font-weight:700;color:#333;">' + p.place_name + '</div>';
          html += '<div style="font-size:10px;color:#888;margin-top:1px;">' + (p.road_address_name || p.address_name) + '</div>';
          html += '</div>';
          html += '<div style="font-size:10px;color:#185FA5;font-weight:700;flex-shrink:0;">선택</div>';
          html += '</div>';
        }
        resultsEl.innerHTML = html;
      } else {
        // 주소 검색으로 fallback
        var geocoder = new kakao.maps.services.Geocoder();
        geocoder.addressSearch(query, function(addrData, addrStatus) {
          if (addrStatus === kakao.maps.services.Status.OK && addrData.length > 0) {
            window._editBizSearchResults = addrData.map(function(a){
              return {
                place_name: a.address_name,
                road_address_name: a.road_address ? a.road_address.address_name : a.address_name,
                address_name: a.address_name,
                x: a.x, y: a.y
              };
            });
            var html2 = '';
            window._editBizSearchResults.slice(0, 8).forEach(function(p, i) {
              html2 += '<div onclick="selectEditBizAddr(' + i + ')" style="background:#fff;border:1px solid #DDE8E1;border-radius:7px;padding:8px 10px;cursor:pointer;font-size:11px;display:flex;align-items:center;gap:8px;">';
              html2 += '<div style="font-size:14px;flex-shrink:0;">📍</div>';
              html2 += '<div style="flex:1;font-weight:600;color:#333;">' + p.place_name + '</div>';
              html2 += '<div style="font-size:10px;color:#185FA5;font-weight:700;flex-shrink:0;">선택</div>';
              html2 += '</div>';
            });
            resultsEl.innerHTML = html2;
          } else {
            resultsEl.innerHTML = '<div style="text-align:center;padding:10px;color:#C0392B;font-size:11px;">검색 결과가 없어요</div>';
          }
        });
      }
    });
  }

  if (window.kakao && kakao.maps && kakao.maps.services) {
    doSearch();
  } else {
    kakao.maps.load(doSearch);
  }
}

function selectEditBizAddr(idx) {
  var p = window._editBizSearchResults && window._editBizSearchResults[idx];
  if (!p) return;
  document.getElementById('editBizAddr').value = p.road_address_name || p.address_name || p.place_name;
  document.getElementById('editBizLat').value = p.y;
  document.getElementById('editBizLng').value = p.x;
  var label = document.getElementById('editBizLatLngLabel');
  if (label) label.textContent = parseFloat(p.y).toFixed(5) + ', ' + parseFloat(p.x).toFixed(5);
  document.getElementById('editBizAddrResults').innerHTML = '<div style="background:#F0FBF5;border:1px solid #C5E1CC;border-radius:7px;padding:8px 10px;font-size:11px;color:#0FA366;font-weight:700;">✅ 선택 완료 — 저장 시 지도 마커도 갱신됩니다</div>';
}

// 정보 저장
async function saveBizInfo(bizId) {
  if (!isAdminMode) return;
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;

  var nameEl = document.getElementById('editBizName');
  var typeEl = document.getElementById('editBizType');
  var ownerEl = document.getElementById('editBizOwner');
  var phoneEl = document.getElementById('editBizPhone');
  var autoQtyEl = document.getElementById('editBizAutoQty');
  var addrEl = document.getElementById('editBizAddr');
  var latEl = document.getElementById('editBizLat');
  var lngEl = document.getElementById('editBizLng');
  var isccEl = document.getElementById('editBizISCC');
  var autoEl = document.getElementById('editBizAuto');
  // 🆕 임계값 + 자동수거
  var orderThresholdEl = document.getElementById('editBizOrderThreshold');
  var collectThresholdEl = document.getElementById('editBizCollectThreshold');
  var autoCollectEl = document.getElementById('editBizAutoCollect');

  if (!nameEl.value.trim()) { showToast('t1','⚠️ 입력 오류','상호명은 필수입니다'); return; }

  // 메모리 업데이트
  biz.name = nameEl.value.trim();
  biz.type = typeEl.value.trim();
  biz.owner = ownerEl.value.trim();
  biz.phone = phoneEl.value.trim();
  biz.autoQty = parseInt(autoQtyEl.value) || 5;
  biz.addr = addrEl.value.trim();
  biz.iscc_agreed = isccEl.checked;
  biz.auto = autoEl.checked;
  // 🆕 임계값
  if (orderThresholdEl) {
    var ot = parseInt(orderThresholdEl.value);
    biz.autoOrderThreshold = (ot > 0 && ot <= 20) ? ot : 2;
  }
  if (collectThresholdEl) {
    var ct = parseInt(collectThresholdEl.value);
    biz.autoCollectThreshold = (ct > 0 && ct <= 20) ? ct : 2;
  }
  if (autoCollectEl) biz.autoCollect = autoCollectEl.checked;
  // 좌표 업데이트 (변경됐을 때만)
  var newLat = parseFloat((latEl || {}).value);
  var newLng = parseFloat((lngEl || {}).value);
  if (!isNaN(newLat) && !isNaN(newLng)) {
    biz.lat = newLat;
    biz.lng = newLng;
  }

  saveBusinesses();

  // DB 동기화
  try {
    if (typeof db !== 'undefined') {
      var updatePayload = {
        name: biz.name,
        type: biz.type,
        owner: biz.owner,
        phone: biz.phone,
        auto_qty: biz.autoQty,
        addr: biz.addr,
        lat: biz.lat,
        lng: biz.lng,
        iscc_agreed: biz.iscc_agreed,
        auto: biz.auto,
        auto_order_threshold: biz.autoOrderThreshold,
        auto_collect: biz.autoCollect,
        auto_collect_threshold: biz.autoCollectThreshold,
        last_update: new Date().toLocaleString('ko-KR', { hour12: false })
      };
      console.log('[saveBizInfo] DB UPDATE 시도:', biz.id, 'auto=' + biz.auto, 'autoCollect=' + biz.autoCollect);
      var updateRes = await db.from('businesses').update(updatePayload).eq('id', biz.id).select();
      if (updateRes.error) {
        console.error('[saveBizInfo] ❌ DB 저장 실패:', updateRes.error);
        showToast('t1','⚠️ DB 동기화 실패', updateRes.error.message || '컬럼 누락 가능성 — SQL 확인 필요');
      } else if (updateRes.data && updateRes.data.length > 0) {
        var saved = updateRes.data[0];
        console.log('[saveBizInfo] ✅ DB 저장 성공. 서버 응답 auto=' + saved.auto + ', autoCollect=' + saved.auto_collect);
        if (saved.auto !== biz.auto) {
          console.warn('[saveBizInfo] ⚠️ DB의 auto 값이 보낸 값과 다름! 컬럼 타입 문제 가능');
          showToast('t1','⚠️ DB 컬럼 문제', '저장값과 응답값이 다름 — auto 컬럼 점검 필요');
        }
      } else {
        console.warn('[saveBizInfo] ⚠️ UPDATE 응답에 데이터 없음 — RLS 또는 권한 문제 가능');
      }
    }
  } catch(e) {
    console.error('[saveBizInfo] ❌ exception:', e);
    showToast('t1','⚠️ DB 동기화 실패', e.message || '로컬엔 반영됨');
  }

  showToast('t1','✅ 저장 완료', biz.name + ' 정보 업데이트');
  document.getElementById('editBizInfoModal').remove();
  // 화면 갱신
  window._lastBizListSig = null;
  renderRegBizList && renderRegBizList();
  renderDeliveryPanel && renderDeliveryPanel();
  refreshMapMarkers && refreshMapMarkers();
}

function manageBizProducts(bizId) {
  if (!isAdminMode) { showToast('t1','🔒 관리자 전용',''); return; }
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;

  var existing = document.getElementById('mgmtProductsModal');
  if (existing) existing.remove();

  // 현재 업체의 oilProducts 정리 (잘못된 키 자동 제거)
  var oilsToProductKey = { soy: 'soy_wonju', canola: 'can_grewell', corn: 'corn_oilers' };
  var currentProds = (biz.oilProducts || []).map(function(p){
    var key = p.key;
    // oils 키('soy','canola','corn')는 products 키로 변환
    if (oilsToProductKey[key]) key = oilsToProductKey[key];
    return { key: key, qty: p.qty || 0 };
  }).filter(function(p){
    // products 사전에 있는 키만 유효
    return PRICES.products && PRICES.products[p.key];
  });

  var modal = document.createElement('div');
  modal.id = 'mgmtProductsModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;';

  // 카테고리별로 그룹핑된 옵션
  var typeLabels = { soy:'🫘 대두유', canola:'🌿 카놀라유', corn:'🌽 옥수수유' };
  var allProducts = Object.entries(PRICES.products || {}).map(function(e){
    return { key: e[0], label: e[1].label, type: e[1].type, price: e[1].price };
  });

  var renderProductsHtml = function() {
    if (currentProds.length === 0) {
      return '<div style="text-align:center;padding:24px;color:#999;font-size:12px;">📭 지정 식용유가 없어요<br><span style="font-size:10px;color:#bbb;margin-top:4px;display:inline-block;">아래에서 추가해주세요</span></div>';
    }
    return currentProds.map(function(p, idx) {
      var info = allProducts.find(function(x){ return x.key === p.key; }) || { label: p.key, price: 0, type: 'soy' };
      var typeColor = { soy:'#2E7D32', canola:'#558B2F', corn:'#E65100' }[info.type] || '#2E7D32';
      var typeBg = { soy:'#E8F5E9', canola:'#F1F8E9', corn:'#FFF3E0' }[info.type] || '#E8F5E9';
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:' + typeBg + ';border-radius:8px;margin-bottom:6px;">' +
        '<div style="font-size:18px;flex-shrink:0;">🫙</div>' +
        '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;font-weight:700;color:' + typeColor + ';">' + info.label + '</div>' +
          '<div style="font-size:10px;color:#666;margin-top:1px;">' + info.price.toLocaleString() + '원/캔 · 현재 재고 ' + p.qty + '캔</div>' +
        '</div>' +
        '<button onclick="_mgmtRemoveProduct(' + idx + ')" style="background:#fff;color:#C0392B;border:1px solid #FFB3B3;border-radius:5px;width:28px;height:28px;font-size:12px;cursor:pointer;flex-shrink:0;font-weight:700;">✕</button>' +
      '</div>';
    }).join('');
  };

  // 추가 가능한 품목 (현재 등록 안 된 것만)
  var renderAddOptionsHtml = function() {
    var existingKeys = currentProds.map(function(p){ return p.key; });
    var available = allProducts.filter(function(p){ return existingKeys.indexOf(p.key) < 0; });
    if (available.length === 0) {
      return '<div style="text-align:center;padding:14px;color:#999;font-size:11px;">✅ 모든 품목이 추가되어 있어요</div>';
    }
    var grouped = { soy: [], canola: [], corn: [] };
    available.forEach(function(p){ if (grouped[p.type]) grouped[p.type].push(p); });
    var html = '';
    ['soy','canola','corn'].forEach(function(type){
      if (grouped[type].length === 0) return;
      html += '<div style="margin-bottom:8px;">';
      html += '<div style="font-size:10px;font-weight:700;color:#666;margin-bottom:4px;">' + typeLabels[type] + '</div>';
      grouped[type].forEach(function(p){
        html += '<button onclick="_mgmtAddProduct(\'' + p.key + '\')" style="background:#fff;color:#444;border:1px dashed #BBB;border-radius:6px;padding:7px 10px;font-size:11px;cursor:pointer;font-family:var(--font-body);margin:2px 4px 2px 0;">+ ' + p.label + ' (' + p.price.toLocaleString() + '원)</button>';
      });
      html += '</div>';
    });
    return html;
  };

  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:520px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;">' +
      '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;">🫙 지정 식용유 관리</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">' + biz.name + '</div>' +
        '</div>' +
        '<button onclick="document.getElementById(\'mgmtProductsModal\').remove()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;width:34px;height:34px;font-size:16px;cursor:pointer;">✕</button>' +
      '</div>' +
      '<div style="padding:18px 22px;">' +
        '<div style="font-size:11px;font-weight:700;color:#444;margin-bottom:8px;">📋 현재 지정 식용유</div>' +
        '<div id="mgmtCurrentList" style="margin-bottom:14px;">' + renderProductsHtml() + '</div>' +
        '<div style="background:#F8FAFB;border-radius:9px;padding:12px 14px;">' +
          '<div style="font-size:11px;font-weight:700;color:#444;margin-bottom:8px;">➕ 품목 추가</div>' +
          '<div id="mgmtAddOptions">' + renderAddOptionsHtml() + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-top:14px;">' +
          '<button onclick="document.getElementById(\'mgmtProductsModal\').remove()" style="flex:1;background:#F5F5F5;color:#444;border:none;border-radius:9px;padding:11px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
          '<button onclick="_mgmtSaveProducts(' + bizId + ')" style="flex:2;background:var(--green-main);color:#fff;border:none;border-radius:9px;padding:11px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font-body);">💾 저장</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);

  // 모달 상태 보관
  window._mgmtProductsState = { bizId: bizId, products: currentProds, allProducts: allProducts };

  // 다시 렌더 함수 노출
  window._mgmtRefreshUI = function() {
    document.getElementById('mgmtCurrentList').innerHTML = renderProductsHtml();
    document.getElementById('mgmtAddOptions').innerHTML = renderAddOptionsHtml();
  };
}

// 품목 추가
function _mgmtAddProduct(key) {
  var st = window._mgmtProductsState;
  if (!st) return;
  if (st.products.find(function(p){ return p.key === key; })) return;
  st.products.push({ key: key, qty: 0 });
  window._mgmtRefreshUI && window._mgmtRefreshUI();
}

// 품목 제거
function _mgmtRemoveProduct(idx) {
  var st = window._mgmtProductsState;
  if (!st) return;
  var p = st.products[idx];
  if (!p) return;
  if (p.qty > 0) {
    if (!confirm(p.key + ' 재고가 ' + p.qty + '캔 남아있어요. 정말 제거할까요? 재고가 함께 사라집니다.')) return;
  }
  st.products.splice(idx, 1);
  window._mgmtRefreshUI && window._mgmtRefreshUI();
}

// 저장
async function _mgmtSaveProducts(bizId) {
  var st = window._mgmtProductsState;
  if (!st) return;
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;

  // 메모리 업데이트
  biz.oilProducts = st.products.map(function(p){ return { key: p.key, qty: p.qty || 0 }; });
  biz.newOil = biz.oilProducts.reduce(function(s,p){ return s + (p.qty||0); }, 0);
  saveBusinesses();

  // DB 동기화
  try {
    await updateBizStockInDB(biz.id, biz.newOil, biz.wasteOil, '지정식용유 변경', biz.oilProducts);
    showToast('t1','💾 저장 완료', biz.name + ' — 지정 식용유 ' + biz.oilProducts.length + '개');
  } catch(e) {
    console.warn('지정식용유 저장 DB 동기화 실패:', e.message);
    showToast('t1','⚠️ DB 동기화 실패','로컬엔 반영됨. 새로고침 시 원복될 수 있어요.');
  }

  document.getElementById('mgmtProductsModal').remove();
  // 화면 갱신
  window._lastBizListSig = null;  // 강제 재렌더
  renderRegBizList && renderRegBizList();
  renderDeliveryPanel && renderDeliveryPanel();
  refreshMapMarkers && refreshMapMarkers();
  // QR 패널이 활성화되어 있으면 재렌더
  var qrPanel = document.getElementById('panel-qr');
  if (qrPanel && qrPanel.classList.contains('active')) {
    initQRPanel && initQRPanel();
  }
}

function showBizCredentials(bizId) {
  if (!isAdminMode) { showToast('t1','🔒 권한 없음','관리자 로그인 후 이용 가능합니다'); return; }
  var b = businesses.find(function(x){ return x.id === bizId; });
  if (!b) return;
  var loginId = b.loginId || getBizCode(bizId);
  var cred = getBizCredentials(bizId);
  var loginPw = b.loginPw || (cred ? cred.pw : '—');

  // 기존 모달 제거
  var existing = document.getElementById('bizCredModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'bizCredModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';

  var safeName = (b.name || '').replace(/'/g, "\\'");
  modal.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:420px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.25);overflow:hidden;">' +
      '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 22px;">' +
        '<div style="font-family:var(--font-display);font-size:17px;font-weight:800;">🔑 업주 로그인 정보</div>' +
        '<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:3px;">' + b.name + '</div>' +
      '</div>' +

      '<div style="padding:18px 22px;">' +
        '<div style="background:#F5F5F5;border-radius:10px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:#444;line-height:1.7;">' +
          '<div><b>현재 ID:</b> <span style="font-family:Menlo,monospace;color:var(--green-dark);">' + loginId + '</span></div>' +
          '<div><b>현재 PW:</b> <span style="font-family:Menlo,monospace;color:var(--green-dark);">' + loginPw + '</span></div>' +
          '<div style="margin-top:4px;"><b>전화:</b> ' + (b.phone || '—') + '</div>' +
        '</div>' +

        '<div style="font-size:11px;color:#666;margin-bottom:10px;">아래 칸을 비워두면 해당 항목은 변경되지 않아요.</div>' +

        '<div style="margin-bottom:12px;">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">새 아이디 <span style="color:#999;font-weight:400;">(선택)</span></label>' +
          '<input id="credNewId" type="text" placeholder="비워두면 그대로" value="' + loginId + '" style="width:100%;padding:10px 12px;border:1.5px solid #DDD;border-radius:8px;font-size:14px;font-family:var(--font-body);box-sizing:border-box;">' +
        '</div>' +

        '<div style="margin-bottom:18px;">' +
          '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">새 비밀번호 <span style="color:#999;font-weight:400;">(선택)</span></label>' +
          '<input id="credNewPw" type="text" placeholder="비워두면 그대로" style="width:100%;padding:10px 12px;border:1.5px solid #DDD;border-radius:8px;font-size:14px;font-family:var(--font-body);box-sizing:border-box;">' +
        '</div>' +

        '<div style="display:flex;gap:8px;">' +
          '<button onclick="document.getElementById(\'bizCredModal\').remove()" style="flex:1;background:#F5F5F5;color:#444;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
          '<button onclick="saveBizCredentials(' + bizId + ')" style="flex:2;background:var(--green-main);color:#fff;border:none;border-radius:9px;padding:12px;font-size:13px;font-weight:800;cursor:pointer;font-family:var(--font-body);">💾 저장</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(modal);
  setTimeout(function(){
    var pwInput = document.getElementById('credNewPw');
    if (pwInput) pwInput.focus();
  }, 100);
}

// 저장 처리
function saveBizCredentials(bizId) {
  var b = businesses.find(function(x){ return x.id === bizId; });
  if (!b) return;
  var oldLoginId = b.loginId || getBizCode(bizId);
  var oldLoginPw = b.loginPw || '';

  var newIdInput = (document.getElementById('credNewId') || {value:''}).value.trim();
  var newPwInput = (document.getElementById('credNewPw') || {value:''}).value.trim();

  // 빈값이면 그대로 유지
  var finalId = newIdInput || oldLoginId;
  var finalPw = newPwInput || oldLoginPw;

  // 둘 다 변화 없으면 그냥 닫기
  if (finalId === oldLoginId && finalPw === oldLoginPw) {
    document.getElementById('bizCredModal').remove();
    showToast('t1','💡 변경사항 없음','입력값이 기존과 동일해요');
    return;
  }

  // ID 중복 체크
  if (finalId !== oldLoginId) {
    var dup = businesses.find(function(x){ return x.id !== bizId && x.loginId === finalId; });
    if (dup) {
      alert('❌ "' + finalId + '"는 이미 다른 업체("' + dup.name + '")가 사용 중이에요.');
      return;
    }
  }

  // 적용
  var updateData = {};
  var customAccounts = JSON.parse(localStorage.getItem('hiveoil_custom_accounts') || '{}');

  if (finalId !== oldLoginId) {
    delete customAccounts[oldLoginId];
    b.loginId = finalId;
    updateData.login_id = finalId;
  }
  if (finalPw !== oldLoginPw) {
    b.loginPw = finalPw;
    updateData.login_pw = finalPw;
    bizPwOverrides[String(bizId)] = finalPw;
    saveBizPwOverrides();
  }
  customAccounts[finalId] = { pw: finalPw, bizId: bizId, name: b.name };
  localStorage.setItem('hiveoil_custom_accounts', JSON.stringify(customAccounts));
  saveBusinesses();

  // DB 업데이트
  if (Object.keys(updateData).length > 0) {
    db.from('businesses').update(updateData).eq('id', bizId).then(function(res){
      if (res.error) console.warn('DB 업데이트 실패:', res.error.message);
    });
  }

  document.getElementById('bizCredModal').remove();
  var changes = [];
  if (finalId !== oldLoginId) changes.push('ID: ' + finalId);
  if (finalPw !== oldLoginPw) changes.push('PW: ' + finalPw);
  showToast('t1','🔑 로그인 정보 변경됨', b.name + ' — ' + changes.join(', '));
  renderRegBizList && renderRegBizList();
}

// buildOwnerAccounts는 위에서 통합 정의됨



function ownerRequestOrder() {
  const b = businesses.find(b => String(b.id) === String(ownerBizId));
  if (!b) return;
  // 발주 패널로 이동 + 업체 자동 선택
  showPanel('order', null);
  setTimeout(() => {
    populateOrderBizSelect();
    const sel = document.getElementById('orderBizSelect');
    if (sel) { sel.value = String(ownerBizId); onOrderBizChange(); }
  }, 150);
  showToast('t1','🫙 발주 패널로 이동','업체가 자동 선택됐어요');
}



function updateHqRealStats() {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear  = now.getFullYear();

  // 이번달 납품 완료
  const oilDoneRaw = historyData.filter(h =>
    !h.deleted_at &&
    h.type === '식용유발주' && h.status === 'done' &&
    isSameMonth(h, thisYear, thisMonth)
  );
  const oilDone = dedupeHistoryDone(oilDoneRaw); // 🔧 중복 제거
  const oilCans = oilDone.reduce((s,h) => s+(h.qty||0), 0);

  // 이번달 폐유 수거 완료
  const wasteDone = historyData.filter(h =>
    !h.deleted_at &&
    h.type === '폐유수거' && h.status === 'done' &&
    isSameMonth(h, thisYear, thisMonth)
  );
  const wasteCans = wasteDone.reduce((s,h) => s+(h.qty||0), 0);
  const wasteKg   = (wasteCans * PRICES.waste.can.kg).toFixed(0);

  // 전체 누적 폐유 수거 (차트/바이오디젤용)
  const allWasteDone = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done').reduce((s,h) => s+(h.qty||0), 0);
  const allWasteKg   = allWasteDone * PRICES.waste.can.kg;
  const bioL         = (allWasteKg * 0.75).toFixed(0);
  const co2          = Math.round(allWasteKg * PRICES.carbonRate);
  // ESG 포인트는 ISCC 동의 업체만
  const isccAgreedKg = historyData.filter(h => !h.deleted_at && h.type === '폐유수거' && h.status === 'done' && isIsccAgreed(h.bizId)).reduce((s,h) => s+(h.qty||0), 0) * PRICES.waste.can.kg;
  const esgPts       = Math.round(isccAgreedKg * PRICES.esgRate);

  // 현재 폐유 대기량
  const waitWasteKg = (businesses.reduce((s,b)=>s+(b.wasteOil||0),0) * PRICES.waste.can.kg).toFixed(1);

  // KPI 업데이트
  const set = (id, val) => { const el = document.getElementById(id); if(el) el.innerHTML = val; };

  set('hq_biz_count',   businesses.length);
  set('hq_oil_total',   oilCans + '<span style="font-size:12px"> 캔</span>');
  set('hq_oil_sub',     oilDone.length > 0 ? '이번 달 ' + oilDone.length + '건 납품' : '납품 이력 없음');
  set('hq_waste_total', Number(wasteKg).toLocaleString() + '<span style="font-size:12px"> kg</span>');
  set('hq_waste_sub',   wasteDone.length > 0 ? '이번 달 ' + wasteDone.length + '건 수거' : '수거 이력 없음');
  set('hq_co2',         co2.toLocaleString() + '<span style="font-size:12px"> kg</span>');
  set('hq_esg_pts',     esgPts.toLocaleString());
  set('hq_esg_sub',     'pts · ' + businesses.length + '개 업체 합산');

  // 배출량/ESG 리포트
  set('hq_waste_cans',     allWasteDone + '캔 (' + allWasteKg.toFixed(0) + 'kg)');
  set('hq_waste_wait',     waitWasteKg + ' kg');
  set('hq_biodiesel',      bioL + ' L');
  set('hq_esg_co2_report', co2.toLocaleString() + ' kg');
  set('hq_esg_bio_report', bioL + ' L');
  set('hq_esg_biz_report', businesses.length + ' 개');
}

function generateIsccDeclaration(biz, historyId) {
  if (!biz) { showToast('t1','⚠️ 업체 선택 필요','업체를 먼저 선택해주세요'); return; }
  // 🌍 ISCC 미동의 업체는 자가선언서 발행 불가
  if (biz.iscc_agreed !== true) {
    showToast('t1','⛔ ISCC 자가선언서 발행 불가', biz.name + '은(는) 가입 시 ISCC EU 인증 동의를 하지 않은 업체예요. 업주가 동의를 추가해야 발행 가능합니다.');
    return;
  }
  var now = new Date();
  var dateStrEn = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0');
  var dateStrKo = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
  var collectBizName = 'HIVE Co., Ltd. (주식회사 하이브)';
  var collectAddr = 'Wonju-si, Gangwon-do, Republic of Korea';

  // 🌟 v89: historyId 지정 시 — 해당 거래 1건만 처리 (Per-Transaction ISCC)
  // 미지정 시 — 누적 전체 처리 (기존 동작)
  var isPerTransaction = !!historyId;
  var transactionItem = null;
  var wasteList;
  if (isPerTransaction) {
    transactionItem = historyData.find(function(h){
      return (String(h.dbId) === String(historyId) || String(h.id) === String(historyId))
        && h.bizId === biz.id && h.type === '폐유수거' && h.status === 'done' && !h.deleted_at;
    });
    if (!transactionItem) {
      showToast('t1','⚠️ 거래 기록 없음','해당 수거 기록을 찾을 수 없어요');
      return;
    }
    wasteList = [transactionItem];
  } else {
    wasteList = historyData.filter(function(h){ if(h.deleted_at) return false;  return h.bizId === biz.id && h.type === '폐유수거' && h.status === 'done'; });
  }

  var totalCans = wasteList.reduce(function(s,h){ return s+(h.qty||0); }, 0);
  var canKg = (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5);
  var totalKg = (totalCans * canKg).toFixed(1);
  var totalMT = (totalCans * canKg / 1000).toFixed(3); // metric tons

  // 거래 1건 모드 — 거래일 = 해당 거래 일자 / 연간 환산 X
  var collectionDateEn, collectionDateKo, monthsActive, yearlyEstimateMT, certNo;
  if (isPerTransaction) {
    var txDate = new Date(transactionItem.rawDate || now);
    collectionDateEn = txDate.getFullYear() + '-' + String(txDate.getMonth()+1).padStart(2,'0') + '-' + String(txDate.getDate()).padStart(2,'0');
    collectionDateKo = txDate.getFullYear() + '년 ' + (txDate.getMonth()+1) + '월 ' + txDate.getDate() + '일';
    yearlyEstimateMT = totalMT;  // 단일 거래라 연간 환산 의미 없음 — 실제값 그대로
    var txId = transactionItem.dbId || transactionItem.id || Date.now();
    certNo = 'ISCC-UCO-' + biz.id + '-TX' + txId + '-' + collectionDateEn.replace(/-/g,'');
  } else {
    // 누적 모드 (기존 동작) — 연간 환산
    var firstWaste = wasteList.length > 0 ? wasteList[wasteList.length-1] : null;
    monthsActive = 1;
    if (firstWaste && firstWaste.rawDate) {
      var diffMs = now.getTime() - new Date(firstWaste.rawDate).getTime();
      monthsActive = Math.max(1, Math.round(diffMs / (1000*60*60*24*30)));
    }
    yearlyEstimateMT = ((totalCans * canKg / 1000) / monthsActive * 12).toFixed(2);
    certNo = 'ISCC-UCO-' + biz.id + '-' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0');
    collectionDateEn = dateStrEn;
    collectionDateKo = dateStrKo;
  }

  var ownerName = biz.owner || (biz.name + ' Representative');
  var sigImg = (typeof getOwnerSignature === 'function') ? getOwnerSignature(biz.id) : null;
  if (!sigImg && biz.signatureImg) sigImg = biz.signatureImg;

  // 영문 주소 변환 (도로명 한글 → 가능하면 영문, 없으면 한글)
  var addrEn = biz.addr || '';
  // 우편번호 추출 (한국 우편번호 5자리)
  var postcode = '';
  var pcMatch = (biz.addr || '').match(/\d{5}/);
  if (pcMatch) postcode = pcMatch[0];

  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
    + '<title>ISCC EU Self-Declaration — ' + biz.name + '</title>'
    + '<style>'
    + '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Noto+Sans+KR:wght@400;500;700&display=swap");'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{font-family:"Inter","Noto Sans KR",-apple-system,sans-serif;font-size:8.5pt;line-height:1.35;color:#1a1a1a;background:#f5f5f5;padding:20px 0}'
    + '.page{width:210mm;min-height:297mm;background:#fff;margin:0 auto;padding:11mm 13mm;box-shadow:0 4px 24px rgba(0,0,0,0.08);position:relative}'
    + '@page{size:A4;margin:0}'
    + '@media print{body{background:#fff;padding:0}.page{box-shadow:none;margin:0;width:210mm;min-height:297mm;page-break-after:always}.print-btn,.toolbar{display:none !important}}'

    /* TOOLBAR */
    + '.toolbar{position:sticky;top:0;background:#fff;border-bottom:1px solid #e5e5e5;padding:10px 20px;display:flex;gap:10px;align-items:center;z-index:100;max-width:210mm;margin:0 auto 16px}'
    + '.print-btn{background:#0D2B1A;color:#fff;border:none;border-radius:6px;padding:9px 18px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:0.02em}'
    + '.print-btn:hover{background:#1F4D30}'
    + '.print-btn.outline{background:#fff;color:#0D2B1A;border:1.5px solid #0D2B1A}'
    + '.toolbar-meta{margin-left:auto;font-size:11px;color:#666}'

    /* HEADER */
    + '.hdr{border-bottom:2.5px solid #0D2B1A;padding-bottom:8px;margin-bottom:10px;display:grid;grid-template-columns:1fr auto;gap:14px;align-items:flex-end}'
    + '.hdr-title{font-size:14pt;font-weight:800;color:#0D2B1A;line-height:1.15;letter-spacing:-0.02em}'
    + '.hdr-sub{font-size:8pt;color:#444;margin-top:3px;font-weight:400;letter-spacing:0.01em}'
    + '.hdr-ko{font-size:7.5pt;color:#666;margin-top:1px;font-family:"Noto Sans KR",sans-serif}'
    + '.hdr-meta{text-align:right;font-size:7pt;color:#555;line-height:1.5}'
    + '.hdr-meta strong{color:#0D2B1A;font-size:8pt}'
    + '.cert-no{display:inline-block;background:#0D2B1A;color:#fff;padding:2px 8px;border-radius:3px;font-size:7pt;font-weight:600;letter-spacing:0.04em;margin-top:3px}'

    /* SECTIONS */
    + '.sec{margin-bottom:7px}'
    + '.sec-h{font-size:8.5pt;font-weight:700;color:#0D2B1A;text-transform:uppercase;letter-spacing:0.06em;border-left:3px solid #05C46B;padding:1px 0 1px 7px;margin-bottom:5px}'

    /* INFO TABLE */
    + '.info{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid #d4d4d4;border-radius:3px;overflow:hidden}'
    + '.info-cell{padding:4px 8px;border-bottom:1px solid #ececec;border-right:1px solid #ececec;display:flex;flex-direction:column;gap:1px;font-size:8pt}'
    + '.info-cell:nth-last-child(-n+2){border-bottom:none}'
    + '.info-cell:nth-child(2n){border-right:none}'
    + '.info-lbl{font-size:6.8pt;color:#666;font-weight:500;text-transform:uppercase;letter-spacing:0.04em}'
    + '.info-val{font-size:8.5pt;color:#0D0D0D;font-weight:600}'
    + '.info-val .ko{font-size:7pt;color:#666;font-weight:400;font-family:"Noto Sans KR",sans-serif}'

    /* CHECKBOXES */
    + '.cb{display:flex;align-items:flex-start;gap:6px;font-size:7.5pt;line-height:1.4;padding:3px 0}'
    + '.cb-box{display:inline-block;width:9px;height:9px;border:1.2px solid #333;border-radius:1px;flex-shrink:0;margin-top:2px;background:#fff;text-align:center;font-size:8pt;line-height:9px;color:#0D2B1A;font-weight:700}'
    + '.cb-box.checked{background:#0D2B1A;color:#fff}'
    + '.cb sup{font-size:6pt;color:#888}'

    /* DECL INTRO */
    + '.decl-intro{font-size:7.8pt;line-height:1.55;background:#f9f9f9;border-left:3px solid #0D2B1A;padding:6px 9px;margin-bottom:6px;border-radius:0 3px 3px 0}'
    + '.decl-intro .fill{display:inline-block;border-bottom:1.2px solid #0D2B1A;min-width:120px;text-align:center;font-weight:700;color:#0D2B1A;padding:0 6px;font-size:8pt}'

    /* 15 STATEMENTS */
    + '.stmts{display:grid;grid-template-columns:1fr 1fr;gap:3px 11px;font-size:6.5pt;line-height:1.32;color:#222}'
    + '.stmt{padding:1.5px 0;display:flex;gap:4px;align-items:flex-start}'
    + '.stmt-n{font-weight:700;color:#0D2B1A;flex-shrink:0;width:13px;text-align:right}'
    + '.stmt-t{flex:1}'

    /* SIGNATURE */
    + '.sig-grid{display:grid;grid-template-columns:1.1fr 1fr 1.1fr;gap:14px;margin-top:10px;border-top:2px solid #0D2B1A;padding-top:9px}'
    + '.sig-box{}'
    + '.sig-h{font-size:6.8pt;color:#666;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px;font-weight:600}'
    + '.sig-box.sig-img-box{min-height:55px;border-bottom:1px solid #0D2B1A;padding-bottom:3px;display:flex;align-items:flex-end;justify-content:center}'
    + '.sig-img{max-height:50px;max-width:100%}'
    + '.sig-empty{color:#bbb;font-size:7pt;font-style:italic}'
    + '.sig-name{font-size:9pt;font-weight:700;color:#0D0D0D;margin-top:2px}'
    + '.sig-role{font-size:7.5pt;color:#555;margin-top:1px}'
    + '.sig-line{border-bottom:1px solid #0D2B1A;padding-bottom:3px;font-size:9pt;font-weight:700;color:#0D0D0D}'

    /* FOOTNOTES */
    + '.footnotes{margin-top:8px;padding-top:5px;border-top:1px dashed #ccc;font-size:6pt;color:#777;line-height:1.4}'
    + '.footnotes p{margin-bottom:1px}'
    + '.footnotes sup{color:#0D2B1A;font-weight:700}'

    /* BOTTOM BAR */
    + '.bottom-bar{position:absolute;bottom:7mm;left:13mm;right:13mm;border-top:1px solid #ddd;padding-top:4px;display:flex;justify-content:space-between;font-size:6pt;color:#999;letter-spacing:0.02em}'
    + '</style></head><body>'

    + '<div class="toolbar">'
    + '<button class="print-btn" onclick="window.print()">🖨️ Print / Save as PDF</button>'
    + '<button class="print-btn outline" onclick="window.close()">Close</button>'
    + '<div class="toolbar-meta">ISCC EU Self-Declaration · ' + biz.name + '</div>'
    + '</div>'

    + '<div class="page">'

    /* HEADER */
    + '<div class="hdr">'
    + '<div>'
    + '<div class="hdr-title">ISCC EU Self-Declaration</div>'
    + '<div class="hdr-sub">for Points of Origin Generating Used Cooking Oil (UCO)</div>'
    + '<div class="hdr-ko">UCO 원산지 발생 자가 선언서</div>'
    + '</div>'
    + '<div class="hdr-meta">'
    + '<strong>Issued:</strong> ' + dateStrEn + '<br>'
    + (isPerTransaction ? '<strong>Tx Date:</strong> ' + collectionDateEn + '<br>' : '')
    + 'Valid 12 months<br>'
    + '<span class="cert-no">' + certNo + '</span>'
    + '</div>'
    + '</div>'

    /* SECTION 1: POINT OF ORIGIN */
    + '<div class="sec">'
    + '<div class="sec-h">1. Information about the Point of Origin <span style="font-weight:400;font-size:7pt;text-transform:none;color:#666;letter-spacing:0">(hereinafter "Point of Origin" / "We")</span></div>'
    + '<div class="info">'
    + '<div class="info-cell"><div class="info-lbl">Site Name <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 업체명</span></div><div class="info-val">' + biz.name + '</div></div>'
    + '<div class="info-cell"><div class="info-lbl">Phone Number <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 전화</span></div><div class="info-val">' + (biz.phone || '—') + '</div></div>'
    + '<div class="info-cell" style="grid-column:1/3"><div class="info-lbl">Street Address <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 주소</span></div><div class="info-val">' + (addrEn || '—') + '</div></div>'
    + '<div class="info-cell"><div class="info-lbl">Postcode, City <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 우편번호·도시</span></div><div class="info-val">' + (postcode || '—') + ', Wonju</div></div>'
    + '<div class="info-cell"><div class="info-lbl">Country <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 국가</span></div><div class="info-val">Republic of Korea</div></div>'
    + '<div class="info-cell"><div class="info-lbl">Geo-coordinates (Lat, Long) <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 지리좌표</span></div><div class="info-val">' + (biz.lat||0).toFixed(6) + ', ' + (biz.lng||0).toFixed(6) + '</div></div>'
    + '<div class="info-cell"><div class="info-lbl">' + (isPerTransaction ? 'Transaction quantity' : 'Cumulative collected (record)') + ' <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ ' + (isPerTransaction ? '거래 수량' : '누적 수거') + '</span></div><div class="info-val">' + totalCans + ' cans / ' + totalKg + ' kg <span class="ko">(' + totalMT + ' mt)</span></div></div>'
    + '<div class="info-cell"><div class="info-lbl">Max. estimated capacity per year <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 연간 최대 예상 생산량</span></div><div class="info-val">' + yearlyEstimateMT + ' mt</div></div>'
    + '<div class="info-cell"><div class="info-lbl">Max. estimated sustainable capacity per year <span class="ko" style="font-family:Noto Sans KR;text-transform:none">/ 연간 최대 인증 생산량</span></div><div class="info-val">' + yearlyEstimateMT + ' mt</div></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:4px;font-size:7.5pt">'
    + '<div class="cb"><span class="cb-box"></span><span>The UCO produced by the Point of Origin is <strong>5 (five) or more metric tons per month</strong><sup>1</sup> <span class="ko" style="font-family:Noto Sans KR;color:#666">/ 월 5톤 이상</span></span></div>'
    + '<div class="cb"><span class="cb-box"></span><span>The UCO produced is <strong>entirely or partly of animal origin</strong><sup>2</sup> <span class="ko" style="font-family:Noto Sans KR;color:#666">/ 동물성 원료 (일부) 포함</span></span></div>'
    + '</div>'
    + '</div>'

    /* SECTION 2: COLLECTING POINT */
    + '<div class="sec">'
    + '<div class="sec-h">2. Recipient of the UCO (Collecting Point) <span style="font-weight:400;font-size:7pt;text-transform:none;color:#666;letter-spacing:0">/ UCO 수령지</span></div>'
    + '<div class="info" style="grid-template-columns:1fr 1fr 1fr">'
    + '<div class="info-cell"><div class="info-lbl">Company Name</div><div class="info-val">' + collectBizName + '</div></div>'
    + '<div class="info-cell"><div class="info-lbl">Address</div><div class="info-val">' + collectAddr + '</div></div>'
    + '<div class="info-cell" style="border-right:none"><div class="info-lbl">ISCC Reference</div><div class="info-val">HIVE 식용유니버스 — Wonju Beta</div></div>'
    + '</div></div>'

    /* DECLARATION INTRO */
    + '<div class="decl-intro">'
    + 'By signing this self-declaration, I, <span class="fill">' + ownerName + '</span>, acting in my capacity as <span class="fill">Representative</span> and authorised representative of the Point of Origin, hereby declare, confirm and agree to the following on behalf of the Point of Origin:'
    + '</div>'

    /* 15 STATEMENTS — 2 column grid */
    + '<div class="sec">'
    + '<div class="stmts">'
    + '<div class="stmt"><span class="stmt-n">1.</span><span class="stmt-t">We confirm compliance with all legal obligations as well as the relevant ISCC (ISCC System GmbH) requirements (e.g. for quantities delivered under ISCC) including contractual agreements with subcontractors and recipients (Collecting Points), delivery notes / weighbridge tickets.</span></div>'
    + '<div class="stmt"><span class="stmt-n">2.</span><span class="stmt-t">UCO refers to oil and fat of vegetable or animal origin which has been used to cook food for human consumption. Deliveries of UCO covered under this self-declaration consist entirely of UCO and are not mixed with any other oil or fat that doesn\'t comply with the definition of UCO.</span></div>'
    + '<div class="stmt"><span class="stmt-n">3.</span><span class="stmt-t">UCO covered under this self-declaration meets the definition of waste. The UCO is a material that the Point of Origin discards or intends to or is required to discard, and the UCO was not intentionally modified or contaminated to meet this definition.</span></div>'
    + '<div class="stmt"><span class="stmt-n">4.</span><span class="stmt-t">Documentation of UCO quantities delivered is available.</span></div>'
    + '<div class="stmt"><span class="stmt-n">5.</span><span class="stmt-t">Applicable national legislation regarding waste prevention and management (e.g. transport, supervision, etc.) are complied with. If veterinary certificates exist, these are kept together with the commercial documents.</span></div>'
    + '<div class="stmt"><span class="stmt-n">6.</span><span class="stmt-t">The supplied material is exclusively generated by the signing Point of Origin.</span></div>'
    + '<div class="stmt"><span class="stmt-n">7.</span><span class="stmt-t">Auditors from Certification Bodies or from ISCC may, with or without prior notice, verify on-site or by contacting the Company (e.g. via telephone), whether the relevant ISCC EU requirements are complied with and whether the statements made in this self-declaration are correct. Auditors may be accompanied by inspectors.</span></div>'
    + '<div class="stmt"><span class="stmt-n">8.</span><span class="stmt-t">If audits reveal that ISCC requirements are not complied with or declarations are not correct, and the Point of Origin is excluded as supplier of ISCC certified material, ISCC is entitled to publish the exclusion on the ISCC website.</span></div>'
    + '<div class="stmt"><span class="stmt-n">9.</span><span class="stmt-t">This self-declaration or its information may be forwarded for review or further processing by relevant elements of the supply chain, the Certification Body, ISCC, competent authorities or supervisory bodies, or other institutions if legally required, including third parties acting on their behalf.</span></div>'
    + '<div class="stmt"><span class="stmt-n">10.</span><span class="stmt-t">We acknowledge and agree that any information relating to Us that We disclose to other ISCC-certified elements of the supply chain may be further disclosed by those elements to their Certification Bodies and to ISCC.</span></div>'
    + '<div class="stmt"><span class="stmt-n">11.</span><span class="stmt-t">The information herein and referred to in Statement 10 may be forwarded to any database operated by or on behalf of the European Union or its Member States, e.g. the Union Database for Biofuels (UDB), and any Service Provider facilitating data handling.</span></div>'
    + '<div class="stmt"><span class="stmt-n">12.</span><span class="stmt-t">We warrant that We have a valid legal basis, or have obtained consent from the natural persons whose personal data is included in this self-declaration, to include such data and disclose it in accordance with the terms set out herein.</span></div>'
    + '<div class="stmt"><span class="stmt-n">13.</span><span class="stmt-t">We will provide any documentation reasonably required to support the information contained herein to the relevant supply chain element, Certification Body, ISCC, or competent authority immediately upon request. This obligation continues for five (5) years after expiry.</span></div>'
    + '<div class="stmt"><span class="stmt-n">14.</span><span class="stmt-t">All information herein is correct, up to date, complete, fully documented, and a fair representation of actual facts. Documentation must be kept available for five (5) years after expiry of this self-declaration.</span></div>'
    + '<div class="stmt"><span class="stmt-n">15.</span><span class="stmt-t">This self-declaration and any dispute relating to its declarations shall be exclusively governed by the laws of the Federal Republic of Germany, excluding the CISG. Competent courts in Cologne, Germany, shall have exclusive jurisdiction.</span></div>'
    + '</div></div>'

    /* SIGNATURE */
    + '<div class="sig-grid">'
    + '<div class="sig-box">'
    + '<div class="sig-h">Place, Date</div>'
    + '<div class="sig-line">' + (biz.addr ? biz.addr.split(' ').slice(0,2).join(' ') : 'Wonju, KR') + ' · ' + dateStrEn + '</div>'
    + '<div class="sig-role" style="margin-top:6px">' + dateStrKo + '</div>'
    + '</div>'
    + '<div class="sig-box">'
    + '<div class="sig-h">Full Name & Function</div>'
    + '<div class="sig-line">' + ownerName + '</div>'
    + '<div class="sig-role">Authorised Representative <span class="ko" style="font-family:Noto Sans KR;color:#888">/ 권한 있는 대표</span></div>'
    + '</div>'
    + '<div class="sig-box">'
    + '<div class="sig-h">Signature</div>'
    + '<div class="sig-img-box">'
    + (sigImg
        ? '<img class="sig-img" src="' + sigImg + '">'
        : '<span class="sig-empty">(signature required)</span>')
    + '</div>'
    + '<div class="sig-role" style="margin-top:2px">Stamp / 인감</div>'
    + '</div>'
    + '</div>'

    /* FOOTNOTES */
    + '<div class="footnotes">'
    + '<p><sup>1</sup> 5 metric tons of UCO ≈ 5.4 m³ / 5,435 L / 1,436 gallons. <span style="color:#888">5톤 ≈ 5.4m³ / 5,435L / 1,436gal.</span></p>'
    + '<p><sup>2</sup> If marked, UCO is (at least partly) of animal origin (e.g. lard, butter, tallow). If unmarked, the Point of Origin uses exclusively vegetable oil for cooking/frying. Vegetable oil used for cooking meat with unavoidable animal residue is still considered "entirely of vegetable origin".</p>'
    + '</div>'

    /* BOTTOM BAR */
    + '<div class="bottom-bar">'
    + '<span>ISCC EU Version 2.3 (30 September 2025) · © ISCC System GmbH</span>'
    + '<span>Issued via HIVE 식용유니버스 · ' + certNo + '</span>'
    + '</div>'

    + '</div>' // .page
    + '</body></html>';
  var win = window.open('', '_blank');
  if (win) { win.document.write(html); win.document.close(); }
  else { showToast('t1','⚠️ 팝업 차단','브라우저 팝업 허용 후 다시 시도해주세요'); }
}

function buildEsgCertHtml(bizName, wasteCans, wasteKg, co2Kg, bioL, esgPts, dateStr, certNo) {
  var trees = Math.round(parseFloat(co2Kg) / 21); // 나무 1그루 연간 CO2 흡수 약 21kg
  var trees_str = trees > 0 ? trees.toLocaleString() : '0';
  // 영문 날짜
  var d = new Date();
  var monthsEn = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var dateEn = monthsEn[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();

  var style = '<style>'
    + '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700;800&family=Noto+Serif+KR:wght@400;500;700&display=swap");'
    + '*{margin:0;padding:0;box-sizing:border-box}'
    + 'body{background:linear-gradient(135deg,#f7f5f0 0%,#ede8df 100%);font-family:"Inter","Noto Serif KR",sans-serif;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;padding:30px 20px;color:#1a1a1a}'
    + '.cert{background:#fff;width:780px;max-width:100%;position:relative;box-shadow:0 12px 60px rgba(13,43,26,0.18);border-radius:2px}'
    /* 외곽 골드 라인 */
    + '.cert::before{content:"";position:absolute;inset:14px;border:1px solid #C9A961;pointer-events:none;z-index:5}'
    + '.cert::after{content:"";position:absolute;inset:18px;border:1px solid rgba(201,169,97,0.3);pointer-events:none;z-index:4}'
    /* 모서리 장식 */
    + '.corner{position:absolute;width:36px;height:36px;border:2px solid #C9A961;z-index:6}'
    + '.corner.tl{top:24px;left:24px;border-right:none;border-bottom:none}'
    + '.corner.tr{top:24px;right:24px;border-left:none;border-bottom:none}'
    + '.corner.bl{bottom:24px;left:24px;border-right:none;border-top:none}'
    + '.corner.br{bottom:24px;right:24px;border-left:none;border-top:none}'

    /* HEADER */
    + '.cert-header{padding:48px 60px 18px;text-align:center;position:relative}'
    + '.crest{display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#0D2B1A,#1F4D30);margin-bottom:18px;box-shadow:0 4px 16px rgba(13,43,26,0.25);position:relative}'
    + '.crest::after{content:"";position:absolute;inset:-4px;border:1px solid #C9A961;border-radius:50%}'
    + '.crest-icon{font-size:28px;line-height:1;color:#C9A961;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.3))}'
    + '.cert-eyebrow{font-family:"Cormorant Garamond",serif;font-size:11pt;letter-spacing:0.45em;color:#C9A961;text-transform:uppercase;margin-bottom:6px;font-weight:500}'
    + '.cert-title{font-family:"Cormorant Garamond",serif;font-size:42pt;font-weight:600;color:#0D2B1A;letter-spacing:-0.01em;line-height:1.05;margin-bottom:4px}'
    + '.cert-title-em{font-style:italic;color:#C9A961;font-weight:500}'
    + '.cert-subtitle-ko{font-family:"Noto Serif KR",serif;font-size:9pt;color:#666;letter-spacing:0.5em;margin-top:6px;font-weight:400}'
    + '.divider{display:flex;align-items:center;justify-content:center;gap:12px;margin:14px auto 0}'
    + '.divider-line{width:60px;height:1px;background:#C9A961}'
    + '.divider-dot{width:5px;height:5px;background:#C9A961;border-radius:50%;transform:rotate(45deg)}'

    /* RECIPIENT */
    + '.recipient{text-align:center;margin:24px 60px 18px;padding-bottom:18px;border-bottom:1px solid #ece7da}'
    + '.recipient-label{font-size:8pt;letter-spacing:0.5em;color:#999;text-transform:uppercase;margin-bottom:5px;font-weight:500}'
    + '.recipient-label-ko{font-family:"Noto Serif KR",serif;font-size:7.5pt;color:#bbb;letter-spacing:0.3em;margin-bottom:14px}'
    + '.recipient-name{font-family:"Cormorant Garamond","Noto Serif KR",serif;font-size:30pt;font-weight:600;color:#0D2B1A;letter-spacing:-0.005em;line-height:1.1}'
    + '.recipient-flourish{margin-top:10px;font-size:14px;color:#C9A961;letter-spacing:8px}'

    /* INTRO */
    + '.intro{text-align:center;margin:0 60px 24px;font-family:"Cormorant Garamond","Noto Serif KR",serif;font-size:11pt;line-height:1.85;color:#444;font-style:italic}'
    + '.intro-ko{font-family:"Noto Serif KR",serif;font-size:9pt;color:#777;font-style:normal;margin-top:4px;line-height:1.7}'

    /* METRICS */
    + '.metrics{display:grid;grid-template-columns:repeat(4,1fr);margin:0 60px 24px;background:linear-gradient(180deg,#fafaf6,#f4f1e8);border:1px solid #ede5cf;border-radius:3px;overflow:hidden}'
    + '.metric{padding:18px 8px;text-align:center;border-right:1px solid #ede5cf;position:relative}'
    + '.metric:last-child{border-right:none}'
    + '.metric-icon{font-size:18px;margin-bottom:6px;opacity:0.85}'
    + '.metric-val{font-family:"Cormorant Garamond",serif;font-size:30pt;font-weight:600;color:#0D2B1A;line-height:1;letter-spacing:-0.02em}'
    + '.metric-unit{font-size:9pt;color:#888;margin-top:3px;font-weight:500;letter-spacing:0.05em}'
    + '.metric-label{font-size:8pt;color:#555;margin-top:6px;line-height:1.4;font-weight:600;text-transform:uppercase;letter-spacing:0.06em}'
    + '.metric-label-ko{font-family:"Noto Serif KR",serif;font-size:7.5pt;color:#999;margin-top:1px;font-weight:400;text-transform:none;letter-spacing:0}'

    /* IMPACT MESSAGE */
    + '.impact{margin:0 60px 22px;background:linear-gradient(135deg,#0D2B1A 0%,#1F4D30 100%);color:#fff;border-radius:3px;padding:20px 28px;position:relative;overflow:hidden}'
    + '.impact::before{content:"";position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:radial-gradient(circle,rgba(201,169,97,0.2),transparent);border-radius:50%}'
    + '.impact-trees{font-family:"Cormorant Garamond",serif;font-size:18pt;font-weight:600;color:#C9A961;letter-spacing:-0.01em;line-height:1.2;margin-bottom:8px;position:relative}'
    + '.impact-trees-num{font-size:26pt;font-weight:700}'
    + '.impact-detail{font-size:9.5pt;color:rgba(255,255,255,0.78);line-height:1.7;font-weight:300;position:relative}'
    + '.impact-detail strong{color:#fff;font-weight:500}'

    /* PILLARS */
    + '.pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:0 60px 24px}'
    + '.pillar{background:#fbfaf5;border:1px solid #ece7da;border-radius:3px;padding:14px 10px;text-align:center;position:relative}'
    + '.pillar-letter{position:absolute;top:6px;right:10px;font-family:"Cormorant Garamond",serif;font-size:24pt;font-weight:700;color:#C9A961;opacity:0.18;line-height:1}'
    + '.pillar-icon{font-size:18px;margin-bottom:5px;opacity:0.9}'
    + '.pillar-title{font-size:9pt;font-weight:700;color:#0D2B1A;letter-spacing:0.1em;margin-bottom:3px;text-transform:uppercase}'
    + '.pillar-desc{font-family:"Noto Serif KR",serif;font-size:8pt;color:#777;line-height:1.5;font-weight:400}'

    /* SIGNATURE */
    + '.sig-area{display:grid;grid-template-columns:1.3fr auto 1fr;gap:30px;align-items:flex-end;margin:0 60px 36px;padding-top:20px;border-top:1px solid #ece7da}'
    + '.sig-left{font-size:8.5pt;color:#777;line-height:1.9}'
    + '.sig-left strong{color:#333;font-weight:600;display:inline-block;min-width:48px}'
    + '.sig-cert-no{display:inline-block;background:#0D2B1A;color:#C9A961;font-family:"Inter",sans-serif;font-size:7.5pt;padding:3px 9px;border-radius:2px;letter-spacing:0.06em;font-weight:600;margin-top:4px}'
    + '.sig-center{display:flex;flex-direction:column;align-items:center}'
    + '.sig-line{width:140px;border-top:1px solid #888;margin-bottom:6px}'
    + '.sig-stamp{font-family:"Cormorant Garamond",serif;font-size:14pt;font-weight:600;color:#0D2B1A;font-style:italic;letter-spacing:0.02em}'
    + '.sig-right{text-align:right}'
    + '.sig-company{font-family:"Cormorant Garamond","Noto Serif KR",serif;font-size:14pt;font-weight:600;color:#0D2B1A;margin-bottom:3px;line-height:1.2}'
    + '.sig-company-en{font-size:8pt;color:#888;letter-spacing:0.04em;margin-bottom:6px}'
    + '.sig-title{font-size:9pt;color:#555;margin-bottom:10px;font-weight:500}'
    + '.sig-seal{display:inline-flex;align-items:center;justify-content:center;flex-direction:column;width:62px;height:62px;border:1.5px solid #C0392B;border-radius:50%;font-family:"Noto Serif KR",serif;font-size:8pt;font-weight:700;color:#C0392B;letter-spacing:0.5px;background:rgba(192,57,43,0.04);transform:rotate(-6deg);float:right}'

    /* WATERMARK */
    + '.watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-12deg);font-family:"Cormorant Garamond",serif;font-size:140pt;font-weight:700;color:rgba(13,43,26,0.025);letter-spacing:-0.02em;pointer-events:none;z-index:1;white-space:nowrap}'

    /* PRINT BUTTON */
    + '.print-btn{display:flex;justify-content:center;gap:10px;margin:20px auto 0;width:fit-content}'
    + '.print-btn button{background:#0D2B1A;color:#fff;border:none;border-radius:4px;padding:11px 28px;font-size:11pt;font-weight:500;cursor:pointer;font-family:inherit;letter-spacing:0.04em;transition:background 0.2s}'
    + '.print-btn button:hover{background:#1F4D30}'
    + '.print-btn button.outline{background:#fff;color:#0D2B1A;border:1.5px solid #0D2B1A}'
    + '@media print{.print-btn{display:none}body{background:#fff;padding:0}.cert{box-shadow:none}@page{size:A4;margin:0}}'
    + '</style>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ESG Certificate — ' + bizName + '</title>' + style + '</head><body>'
    + '<div class="cert">'
    + '<div class="corner tl"></div><div class="corner tr"></div><div class="corner bl"></div><div class="corner br"></div>'
    + '<div class="watermark">CERTIFIED</div>'

    /* HEADER */
    + '<div class="cert-header">'
    + '<div class="crest"><span class="crest-icon">🌿</span></div>'
    + '<div class="cert-eyebrow">Environmental · Social · Governance</div>'
    + '<div class="cert-title">Certificate <span class="cert-title-em">of Excellence</span></div>'
    + '<div class="cert-subtitle-ko">탄 소 중 립 우 수 인 증 서</div>'
    + '<div class="divider"><span class="divider-line"></span><span class="divider-dot"></span><span class="divider-line"></span></div>'
    + '</div>'

    /* RECIPIENT */
    + '<div class="recipient">'
    + '<div class="recipient-label">This Certificate is Proudly Presented to</div>'
    + '<div class="recipient-label-ko">본 인증서를 다음 업체에 수여합니다</div>'
    + '<div class="recipient-name">' + bizName + '</div>'
    + '<div class="recipient-flourish">❦ ❦ ❦</div>'
    + '</div>'

    /* INTRO */
    + '<div class="intro">'
    + '"In recognition of outstanding contribution to circular economy and<br>carbon reduction through Used Cooking Oil (UCO) recycling."'
    + '<div class="intro-ko">폐식용유 자원순환을 통한 탄소중립 기여 및 친환경 가치 창출에 대한 공로를 인정하여 본 인증서를 수여합니다.</div>'
    + '</div>'

    /* METRICS */
    + '<div class="metrics">'
    + '<div class="metric">'
    + '<div class="metric-icon">♻️</div>'
    + '<div class="metric-val">' + wasteCans.toLocaleString() + '</div>'
    + '<div class="metric-unit">CANS</div>'
    + '<div class="metric-label">UCO Collected</div>'
    + '<div class="metric-label-ko">폐유 수거</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="metric-icon">🌍</div>'
    + '<div class="metric-val">' + parseFloat(co2Kg).toLocaleString() + '</div>'
    + '<div class="metric-unit">KG</div>'
    + '<div class="metric-label">CO₂ Reduced</div>'
    + '<div class="metric-label-ko">탄소 감축</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="metric-icon">🛢️</div>'
    + '<div class="metric-val">' + parseFloat(bioL).toLocaleString() + '</div>'
    + '<div class="metric-unit">LITERS</div>'
    + '<div class="metric-label">Biodiesel Produced</div>'
    + '<div class="metric-label-ko">바이오디젤 생산</div>'
    + '</div>'
    + '<div class="metric">'
    + '<div class="metric-icon">⭐</div>'
    + '<div class="metric-val">' + esgPts.toLocaleString() + '</div>'
    + '<div class="metric-unit">POINTS</div>'
    + '<div class="metric-label">ESG Score</div>'
    + '<div class="metric-label-ko">ESG 점수</div>'
    + '</div>'
    + '</div>'

    /* IMPACT */
    + '<div class="impact">'
    + '<div class="impact-trees">Equivalent to planting <span class="impact-trees-num">' + trees_str + '</span> trees 🌳</div>'
    + '<div class="impact-detail">'
    + 'Your <strong>' + wasteKg + ' kg</strong> of UCO has been transformed into clean biodiesel, replacing fossil diesel and reducing CO₂ emissions by approximately <strong>80%</strong>.<br>'
    + '<span style="font-family:Noto Serif KR,sans-serif;font-size:8.5pt;color:rgba(255,255,255,0.6);">귀 업체의 ' + wasteKg + 'kg 폐유 수거 활동은 나무 ' + trees_str + '그루를 심은 효과와 같으며, 원주시 탄소중립 목표 달성에 직접 기여하고 있습니다.</span>'
    + '</div>'
    + '</div>'

    /* PILLARS */
    + '<div class="pillars">'
    + '<div class="pillar"><div class="pillar-letter">E</div><div class="pillar-icon">🌱</div><div class="pillar-title">Environmental</div><div class="pillar-desc">자원순환 · 탄소감축</div></div>'
    + '<div class="pillar"><div class="pillar-letter">S</div><div class="pillar-icon">🤝</div><div class="pillar-title">Social</div><div class="pillar-desc">지역사회 · 윤리경영</div></div>'
    + '<div class="pillar"><div class="pillar-letter">G</div><div class="pillar-icon">📋</div><div class="pillar-title">Governance</div><div class="pillar-desc">투명성 · 추적가능성</div></div>'
    + '</div>'

    /* SIGNATURE */
    + '<div class="sig-area">'
    + '<div class="sig-left">'
    + '<div><strong>Issued</strong> ' + dateEn + '</div>'
    + '<div><strong>Valid</strong> 12 months from issue</div>'
    + '<div><strong>Issuer</strong> HIVE Co., Ltd.</div>'
    + '<div class="sig-cert-no">No. ' + certNo + '</div>'
    + '</div>'
    + '<div class="sig-center">'
    + '<div class="sig-line"></div>'
    + '<div class="sig-stamp">Authorised</div>'
    + '</div>'
    + '<div class="sig-right">'
    + '<div class="sig-company">주식회사 하이브</div>'
    + '<div class="sig-company-en">HIVE Co., Ltd.</div>'
    + '<div class="sig-title">대표이사 / Chief Executive</div>'
    + '<div class="sig-seal">HIVE<br>대표<br>인</div>'
    + '</div>'
    + '</div>'

    + '</div>' // .cert

    + '<div class="print-btn">'
    + '<button onclick="window.print()">🖨️ Print / Save as PDF</button>'
    + '<button class="outline" onclick="window.close()">Close</button>'
    + '</div>'
    + '</body></html>';
  return html;
}

function toggleDeliveryDay(btn, day) {
  btn.classList.toggle('selected');
  if (btn.classList.contains('selected')) {
    btn.style.background = '#1F4D30'; btn.style.color = '#fff'; btn.style.borderColor = '#1F4D30';
  } else {
    btn.style.background = '#fff'; btn.style.color = '#000'; btn.style.borderColor = 'var(--gray-light)';
  }
}
function toggleClosedDay(btn, day) {
  btn.classList.toggle('selected');
  if (btn.classList.contains('selected')) {
    btn.style.background = '#D32F2F'; btn.style.color = '#fff'; btn.style.borderColor = '#D32F2F';
  } else {
    btn.style.background = '#fff'; btn.style.color = '#000'; btn.style.borderColor = 'var(--gray-light)';
  }
}
// ============================================================
// 📷 이미지 자동 압축 — 모바일 대용량 사진 INSERT 실패 방지
// ============================================================
function _compressImage(file, maxDim, quality) {
  maxDim = maxDim || 1280;
  quality = quality || 0.82;
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onload = function(e) {
      var img = new Image();
      img.onload = function() {
        try {
          var w = img.width, h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
            else { w = Math.round(w * maxDim / h); h = maxDim; }
          }
          var canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          var dataUrl = canvas.toDataURL('image/jpeg', quality);
          // 그래도 1MB 넘으면 더 압축
          if (dataUrl.length > 1.4 * 1024 * 1024 && quality > 0.5) {
            return resolve(_compressImageFromCanvas(canvas, quality - 0.15));
          }
          resolve(dataUrl);
        } catch(err) { reject(err); }
      };
      img.onerror = function() { reject(new Error('이미지 로드 실패')); };
      img.src = e.target.result;
    };
    reader.onerror = function() { reject(new Error('파일 읽기 실패')); };
    reader.readAsDataURL(file);
  });
}
function _compressImageFromCanvas(canvas, quality) {
  return new Promise(function(resolve) {
    var dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length > 1.4 * 1024 * 1024 && quality > 0.4) {
      return resolve(_compressImageFromCanvas(canvas, quality - 0.1));
    }
    resolve(dataUrl);
  });
}

function handleCertUpload(event, type) {
  var file = event.target.files[0];
  if (!file) return;
  var origSizeKB = (file.size/1024).toFixed(0);
  var isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  // PDF는 압축 없이 그대로 (이미지가 아니므로)
  if (isPdf) {
    var reader = new FileReader();
    reader.onload = function(e) {
      _setCertResult(type, e.target.result, file.name, origSizeKB, '(PDF)');
    };
    reader.readAsDataURL(file);
    return;
  }

  // 이미지 — 압축 적용
  var previewId = (type === 'regCert') ? 'regCertPreview' : (type === 'regBank') ? 'regBankPreview' : null;
  if (previewId) {
    var pe = document.getElementById(previewId);
    if (pe) pe.textContent = '⏳ 압축 중... ' + file.name;
  }
  _compressImage(file, 1280, 0.82).then(function(dataUrl) {
    var compressedKB = Math.round(dataUrl.length * 0.75 / 1024); // base64 → 실제 사이즈 추정
    var label = (parseInt(origSizeKB) > compressedKB * 1.2)
      ? '(' + origSizeKB + 'KB → ' + compressedKB + 'KB 압축됨)'
      : '(' + compressedKB + 'KB)';
    _setCertResult(type, dataUrl, file.name, compressedKB, label);
  }).catch(function(err) {
    console.warn('이미지 압축 실패, 원본 사용:', err);
    var reader = new FileReader();
    reader.onload = function(e) {
      _setCertResult(type, e.target.result, file.name, origSizeKB, '(원본)');
    };
    reader.readAsDataURL(file);
  });
}

function _setCertResult(type, dataUrl, fileName, sizeKB, label) {
  if (type === 'regCert') {
    window.regCertBase64 = dataUrl;
    var el = document.getElementById('regCertPreview');
    if (el) el.textContent = '✅ ' + fileName + ' ' + label;
  } else if (type === 'regBank') {
    window.regBankBase64 = dataUrl;
    var el2 = document.getElementById('regBankPreview');
    if (el2) el2.textContent = '✅ ' + fileName + ' ' + label;
  }
}

// ============================================================
// 🚀 일괄 처리 모달 — 한 업체에 납품/추가납품/폐유수거 동시 처리
// ============================================================
window._bulkProcessState = {
  bizId: null,
  visitDate: null,
  visitLabel: null,
  items: []  // [{type, productKey, productName, qty, unitPrice, sourceHistId}]
};

// 업체의 현재 상황 분석 → 자동으로 items 채움
// 탭별 자동채움 — mode: 'request'(신청 필요) | 'complete'(완료 필요)
function _autoPopulateBulkItems(bizId, mode) {
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return [];

  var items = [];
  var nowMs = Date.now();
  var sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  // 헬퍼: 7일 이내 + 같은 업체의 pending 이력
  function _pendingHistOf(type, methodFilter) {
    return historyData.filter(function(h){
      if (h.deleted_at) return false;
      if (String(h.bizId) !== String(bizId)) return false;
      if (h.type !== type) return false;
      if (h.status !== 'pending') return false;
      if (methodFilter && !methodFilter(h.method)) return false;
      if (h.rawDate) {
        var t = new Date(h.rawDate).getTime();
        if (!isNaN(t) && (nowMs - t > sevenDaysMs)) return false;
      }
      return true;
    });
  }

  // oils 키('soy','canola','corn')는 products 키로 변환
  var oilsToProductKey = { soy: 'soy_wonju', canola: 'can_grewell', corn: 'corn_oilers' };
  function _normalizeKey(k) {
    if (oilsToProductKey[k]) return oilsToProductKey[k];
    return k;
  }

  // 같은 type+productKey끼리 합산
  function _groupAndPush(histList, typeLabel, autoLabelPrefix) {
    var grouped = {};
    histList.forEach(function(h){
      var pk = _normalizeKey(h.productKey || (typeLabel === 'waste' ? 'waste' : 'soy_wonju'));
      // products 사전에 없는 키는 raw 노출 위험 → 스킵
      if (typeLabel !== 'waste' && (!PRICES.products || !PRICES.products[pk])) {
        console.warn('[일괄모달] 알 수 없는 productKey 스킵:', h.productKey, '→', pk);
        return;
      }
      if (!grouped[pk]) {
        var pInfo = typeLabel === 'waste'
          ? { label: '폐유', price: (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.price : 22000) }
          : getProductInfo(pk);
        grouped[pk] = {
          productKey: pk,
          productName: h.productName || pInfo.label,
          qty: 0,
          unitPrice: h.unitPrice || _extractUnitPrice(h) || pInfo.price || 0,
          sourceHistIds: [],
          count: 0
        };
      }
      grouped[pk].qty += (h.qty || 0);
      grouped[pk].count += 1;
      if (h.dbId) grouped[pk].sourceHistIds.push(h.dbId);
    });
    Object.keys(grouped).forEach(function(pk){
      var g = grouped[pk];
      items.push({
        type: typeLabel,
        productKey: g.productKey,
        productName: g.productName,
        qty: g.qty,
        unitPrice: g.unitPrice,
        sourceHistIds: g.sourceHistIds,
        _autoLabel: g.count > 1 ? autoLabelPrefix + ' ' + g.count + '건 합산' : autoLabelPrefix
      });
    });
  }

  if (mode === 'complete') {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 일괄 완료 탭: 모든 pending 이력 (자동발주 우선)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    var allOrderPending = _pendingHistOf('식용유발주', null);
    var orderList = allOrderPending.filter(function(h){ return h.method !== '추가발주'; });
    var extraList = allOrderPending.filter(function(h){ return h.method === '추가발주'; });
    _groupAndPush(orderList, 'order', '발주 대기');
    _groupAndPush(extraList, 'extra', '추가발주 대기');

    // 폐유 수거 pending
    var wastePending = _pendingHistOf('폐유수거', null);
    _groupAndPush(wastePending, 'waste', '수거 신청됨');

  } else {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 일괄 신청 탭: 납품/수거 예정인 모든 것 (신청 = 방문 예약 단계)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    
    // 1. 자동발주 추천 (재고 부족 품목 — 자동발주 자체의 pending만 체크)
    if (biz.auto) {
      // 자동발주 pending만 체크 (method '추가발주' 제외)
      var autoPendingProdKeys = {};
      _pendingHistOf('식용유발주', function(m){ return m !== '추가발주'; }).forEach(function(h){
        if (h.productKey) autoPendingProdKeys[_normalizeKey(h.productKey)] = true;
      });
      var prods = getBizProducts(biz);
      prods.forEach(function(p) {
        var safeKey = _normalizeKey(p.key);
        if (!PRICES.products || !PRICES.products[safeKey]) return;
        if (autoPendingProdKeys[safeKey]) return;  // 이미 자동발주 신청된 품목 제외
        if ((p.qty || 0) > 2) return;  // 재고 충분
        var recommendQty = biz.autoQty || 5;
        var pInfo = getProductInfo(safeKey);
        items.push({
          type: 'order',
          productKey: safeKey,
          productName: pInfo.label,
          qty: recommendQty,
          unitPrice: pInfo.price || 0,
          sourceHistIds: [],
          _autoLabel: '재고 ' + (p.qty || 0) + '캔 → 자동발주 ' + recommendQty + '캔'
        });
      });
    }

    // 2. 폐유 수거 신청 (pending 없고 재고만 있을 때)
    var wastePendingExists = _pendingHistOf('폐유수거', null).length > 0;
    if (!wastePendingExists && biz.wasteOil > 0) {
      var wastePrice = (PRICES.waste && PRICES.waste.can ? PRICES.waste.can.price : 22000);
      items.push({
        type: 'waste',
        productKey: 'waste',
        productName: '폐유',
        qty: biz.wasteOil,
        unitPrice: wastePrice,
        sourceHistIds: [],
        _autoLabel: '폐유 재고 ' + biz.wasteOil + '캔'
      });
    }
  }

  return items;
}

function openBulkProcessModal(prefilledBizId) {
  // 일괄 처리 기능 일시 비활성화 (v42)
  showToast('t1','ℹ️ 안내','일괄 처리 기능은 일시 비활성화되었습니다. 발주/수거를 개별로 처리해주세요.');
  return;

  // ↓ 이하 코드는 보존 (향후 재활성화 시 사용)
  if (!isAdminMode && !isDriverMode) {
    showToast('t1','🔒 권한 없음','관리자 또는 운반자만 이용 가능합니다');
    return;
  }
  var existing = document.getElementById('bulkProcessModal');
  if (existing) existing.remove();

  var activeBiz = businesses.filter(function(b){ return !b.deleted; });
  if (activeBiz.length === 0) {
    showToast('t1','⚠️ 등록 업체 없음','업체를 먼저 등록해주세요');
    return;
  }

  var initialBizId = prefilledBizId || activeBiz[0].id;
  // 기본 탭: 신청
  window._bulkProcessState = {
    bizId: initialBizId,
    mode: 'request',  // 'request' | 'complete'
    visitDate: null,
    visitLabel: null,
    items: _autoPopulateBulkItems(initialBizId, 'request')
  };

  var modal = document.createElement('div');
  modal.id = 'bulkProcessModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;';

  var bizOpts = activeBiz.map(function(b) {
    var sel = String(b.id) === String(initialBizId) ? 'selected' : '';
    return '<option value="' + b.id + '" ' + sel + '>' + b.name + '</option>';
  }).join('');

  modal.innerHTML =
    '<div style="background:#fff;border-radius:16px;max-width:520px;width:100%;box-shadow:0 12px 48px rgba(0,0,0,0.3);overflow:hidden;margin:auto;">' +
      // 헤더
      '<div style="background:linear-gradient(135deg,#0D2B1A,#1F4D30);color:#fff;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;">' +
        '<div>' +
          '<div style="font-family:var(--font-display);font-size:17px;font-weight:800;letter-spacing:-0.02em;">🚀 일괄 처리</div>' +
          '<div style="font-size:11px;color:rgba(255,255,255,0.7);margin-top:2px;">탭을 선택하면 그에 맞는 항목이 자동 표시돼요</div>' +
        '</div>' +
        '<button onclick="closeBulkProcessModal()" style="background:rgba(255,255,255,0.15);border:none;color:#fff;border-radius:8px;width:34px;height:34px;font-size:16px;cursor:pointer;">✕</button>' +
      '</div>' +

      // 탭 (📅 신청 / ✅ 완료)
      '<div style="display:flex;background:#F5F5F5;border-bottom:1px solid #E0E0E0;">' +
        '<button id="bulkTabRequest" onclick="switchBulkMode(\'request\')" style="flex:1;background:#fff;color:#E65100;border:none;padding:14px 8px;font-size:13px;font-weight:800;cursor:pointer;font-family:var(--font-body);border-bottom:3px solid #E65100;">' +
          '📅 일괄 신청' +
          '<div style="font-size:10px;font-weight:600;opacity:0.7;margin-top:2px;">신청이 필요한 항목</div>' +
        '</button>' +
        '<button id="bulkTabComplete" onclick="switchBulkMode(\'complete\')" style="flex:1;background:transparent;color:#666;border:none;padding:14px 8px;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font-body);border-bottom:3px solid transparent;">' +
          '✅ 일괄 완료' +
          '<div style="font-size:10px;font-weight:600;opacity:0.7;margin-top:2px;">완료 처리 대기 항목</div>' +
        '</button>' +
      '</div>' +

      '<div style="padding:18px 22px;">' +
        // 업체 선택
        '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">🏪 업체 선택</label>' +
        '<select id="bulkBizSelect" onchange="onBulkBizChange(this.value)" style="width:100%;padding:11px 12px;border:1.5px solid #DDD;border-radius:9px;font-size:14px;font-family:var(--font-body);box-sizing:border-box;background:#fff;font-weight:700;">' +
          bizOpts +
        '</select>' +

        // 항목 리스트 (자동 채움)
        '<div style="margin-top:14px;">' +
          '<div style="font-size:11px;font-weight:700;color:#444;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;">' +
            '<span id="bulkItemHeader">📋 신청 대상</span>' +
            '<span id="bulkItemCount" style="background:var(--green-main);color:#000;font-size:10px;padding:2px 8px;border-radius:10px;">0개</span>' +
          '</div>' +
          '<div id="bulkItemsList" style="background:#fff;border:1.5px solid #E5E5E5;border-radius:9px;padding:8px;min-height:80px;max-height:280px;overflow-y:auto;"></div>' +
        '</div>' +

        // 방문일 선택 (신청 모드 전용)
        '<div id="bulkVisitDateRow" style="margin-top:14px;background:#FFF8E7;border-radius:9px;padding:10px 12px;">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">' +
            '<label style="font-size:11px;font-weight:700;color:#92400E;white-space:nowrap;">📆 방문 예정일:</label>' +
            '<input type="date" id="bulkVisitDateInput" onchange="onBulkVisitDateChange()" style="flex:1;padding:7px 9px;border:1px solid #FCD34D;border-radius:6px;font-size:12px;font-family:var(--font-body);box-sizing:border-box;">' +
          '</div>' +
          // 🆕 v69: 빠른 선택 칩 (오늘/내일/모레)
          '<div style="display:flex;gap:5px;">' +
            '<button onclick="setBulkVisitQuick(0)" style="flex:1;padding:6px 8px;border:1.5px solid #FF6B35;background:#FFF3E0;color:#D4621A;border-radius:6px;font-size:11px;font-weight:800;cursor:pointer;font-family:var(--font-body);">⚡ 오늘 (당일)</button>' +
            '<button onclick="setBulkVisitQuick(1)" style="flex:1;padding:6px 8px;border:1.5px solid #FCD34D;background:#fff;color:#92400E;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">내일</button>' +
            '<button onclick="setBulkVisitQuick(2)" style="flex:1;padding:6px 8px;border:1.5px solid #FCD34D;background:#fff;color:#92400E;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">모레</button>' +
          '</div>' +
        '</div>' +

        // 단일 액션 버튼 (탭에 따라 변경)
        '<button id="bulkActionBtn" onclick="submitBulkProcess(window._bulkProcessState.mode)" style="width:100%;background:linear-gradient(135deg,#FFA726,#E65100);color:#fff;border:none;border-radius:11px;padding:16px 12px;font-size:14px;font-weight:800;cursor:pointer;font-family:var(--font-body);box-shadow:0 4px 12px rgba(230,81,0,0.25);line-height:1.4;margin-top:14px;">' +
          '<div style="font-size:15px;margin-bottom:2px;" id="bulkActionBtnTitle">📅 일괄 신청</div>' +
          '<div style="font-size:10px;font-weight:600;opacity:0.9;" id="bulkActionBtnSub">방문 예약 (예정일에 처리)</div>' +
        '</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(modal);

  // 기본 방문일: 내일
  var dateInput = document.getElementById('bulkVisitDateInput');
  if (dateInput) {
    var tmw = new Date(); tmw.setDate(tmw.getDate() + 1);
    dateInput.value = tmw.getFullYear() + '-' + String(tmw.getMonth()+1).padStart(2,'0') + '-' + String(tmw.getDate()).padStart(2,'0');
    onBulkVisitDateChange();
  }

  renderBulkItemsList();
}

// 탭 전환
function switchBulkMode(mode) {
  var st = window._bulkProcessState;
  st.mode = mode;
  // 항목 다시 자동채움
  st.items = _autoPopulateBulkItems(st.bizId, mode);

  // 탭 UI 갱신
  var reqTab = document.getElementById('bulkTabRequest');
  var cmpTab = document.getElementById('bulkTabComplete');
  if (mode === 'request') {
    if (reqTab) { reqTab.style.background = '#fff'; reqTab.style.color = '#E65100'; reqTab.style.borderBottomColor = '#E65100'; reqTab.style.fontWeight = '800'; }
    if (cmpTab) { cmpTab.style.background = 'transparent'; cmpTab.style.color = '#666'; cmpTab.style.borderBottomColor = 'transparent'; cmpTab.style.fontWeight = '700'; }
  } else {
    if (cmpTab) { cmpTab.style.background = '#fff'; cmpTab.style.color = '#0FA366'; cmpTab.style.borderBottomColor = '#0FA366'; cmpTab.style.fontWeight = '800'; }
    if (reqTab) { reqTab.style.background = 'transparent'; reqTab.style.color = '#666'; reqTab.style.borderBottomColor = 'transparent'; reqTab.style.fontWeight = '700'; }
  }

  // 헤더 라벨 갱신
  var hdr = document.getElementById('bulkItemHeader');
  if (hdr) hdr.textContent = mode === 'request' ? '📋 신청 대상' : '📋 완료 대상 (대기 중인 신청)';

  // 방문일 영역 — 신청 모드에서만 표시
  var visitRow = document.getElementById('bulkVisitDateRow');
  if (visitRow) visitRow.style.display = mode === 'request' ? 'flex' : 'none';

  // 액션 버튼 색상/문구 갱신
  var btn = document.getElementById('bulkActionBtn');
  var btnTitle = document.getElementById('bulkActionBtnTitle');
  var btnSub = document.getElementById('bulkActionBtnSub');
  if (mode === 'request') {
    if (btn) { btn.style.background = 'linear-gradient(135deg,#FFA726,#E65100)'; btn.style.boxShadow = '0 4px 12px rgba(230,81,0,0.25)'; }
    if (btnTitle) btnTitle.textContent = '📅 일괄 신청';
    if (btnSub) btnSub.textContent = '방문 예약 (예정일에 처리)';
  } else {
    if (btn) { btn.style.background = 'linear-gradient(135deg,#10D67A,#0FA366)'; btn.style.boxShadow = '0 4px 12px rgba(16,214,122,0.25)'; }
    if (btnTitle) btnTitle.textContent = '✅ 일괄 완료';
    if (btnSub) btnSub.textContent = '대기 중인 신청을 지금 완료 처리';
  }

  renderBulkItemsList();
}

function closeBulkProcessModal() {
  var m = document.getElementById('bulkProcessModal');
  if (m) m.remove();
}

function onBulkBizChange(bizId) {
  window._bulkProcessState.bizId = parseInt(bizId);
  // 업체가 바뀌면 현재 모드 기준으로 자동 채움 재실행
  window._bulkProcessState.items = _autoPopulateBulkItems(bizId, window._bulkProcessState.mode || 'request');
  renderBulkItemsList();
}

function onBulkVisitDateChange() {
  var input = document.getElementById('bulkVisitDateInput');
  if (!input || !input.value) return;
  var ymd = input.value;
  var d = new Date(ymd);
  var dayNames = ['일','월','화','수','목','금','토'];
  // 오늘이면 "오늘" 표시 추가
  var today = new Date();
  var isToday = (d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate());
  var label = (isToday ? '⚡ 오늘 ' : '') + (d.getMonth()+1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')';
  window._bulkProcessState.visitDate = ymd;
  window._bulkProcessState.visitLabel = label;
}

// 🆕 v69: 빠른 방문일 선택 (오늘=0, 내일=1, 모레=2)
function setBulkVisitQuick(daysOffset) {
  var input = document.getElementById('bulkVisitDateInput');
  if (!input) return;
  var d = new Date(); d.setDate(d.getDate() + daysOffset);
  var ymd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  input.value = ymd;
  onBulkVisitDateChange();
  // 시각 피드백
  showToast && showToast('t1','📅 방문일 변경', 
    daysOffset === 0 ? '오늘 (당일 처리)' : daysOffset === 1 ? '내일' : '모레');
}

// 수동 추가 (드물게 사용)
function bulkAddManualItem(type) {
  if (type === 'waste') {
    _bulkAddManualWaste();
  } else {
    _bulkAddManualOil(type);
  }
}

function _bulkAddManualOil(type) {
  var typeLabel = type === 'extra' ? '➕ 추가납품' : '📦 납품';
  var products = (PRICES.oils && Object.keys(PRICES.oils)) || ['soy','canola','corn'];
  var productNames = { soy: '대두유', canola: '카놀라유', corn: '옥배유' };
  var optsHtml = products.map(function(k) {
    var price = (PRICES.oils && PRICES.oils[k] && PRICES.oils[k].price) || 0;
    var label = productNames[k] || k;
    return '<option value="' + k + '" data-name="' + label + '" data-price="' + price + '">' + label + ' (' + price.toLocaleString() + '원/캔)</option>';
  }).join('');

  var sub = document.createElement('div');
  sub.id = 'bulkSubModal';
  sub.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';
  sub.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:380px;width:100%;padding:18px 22px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="font-size:14px;font-weight:800;color:var(--green-dark);margin-bottom:14px;">' + typeLabel + ' 수동 추가</div>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">품목</label>' +
      '<select id="subProductSelect" style="width:100%;padding:9px 11px;border:1.5px solid #DDD;border-radius:7px;font-size:13px;margin-bottom:12px;font-family:var(--font-body);box-sizing:border-box;">' + optsHtml + '</select>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">수량 (캔)</label>' +
      '<input id="subQtyInput" type="number" min="1" max="50" value="5" style="width:100%;padding:9px 11px;border:1.5px solid #DDD;border-radius:7px;font-size:14px;margin-bottom:14px;font-family:Menlo,monospace;box-sizing:border-box;text-align:right;font-weight:700;">' +
      '<div style="display:flex;gap:6px;">' +
        '<button onclick="document.getElementById(\'bulkSubModal\').remove()" style="flex:1;background:#F5F5F5;color:#444;border:none;border-radius:7px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
        '<button onclick="_bulkConfirmManualOil(\'' + type + '\')" style="flex:2;background:var(--green-main);color:#fff;border:none;border-radius:7px;padding:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font-body);">+ 추가</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(sub);
  setTimeout(function(){ var q = document.getElementById('subQtyInput'); if (q) { q.focus(); q.select(); } }, 100);
}

function _bulkConfirmManualOil(type) {
  var sel = document.getElementById('subProductSelect');
  var qtyEl = document.getElementById('subQtyInput');
  if (!sel || !qtyEl) return;
  var productKey = sel.value;
  var productName = sel.options[sel.selectedIndex].getAttribute('data-name');
  var unitPrice = parseInt(sel.options[sel.selectedIndex].getAttribute('data-price')) || 0;
  var qty = parseInt(qtyEl.value) || 1;
  if (qty < 1) { alert('수량은 1 이상'); return; }

  window._bulkProcessState.items.push({
    type: type, productKey: productKey, productName: productName,
    qty: qty, unitPrice: unitPrice, sourceHistId: null,
    _autoLabel: '수동 추가'
  });
  document.getElementById('bulkSubModal').remove();
  renderBulkItemsList();
}

function _bulkAddManualWaste() {
  var bizId = window._bulkProcessState.bizId;
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;
  var unitPrice = (PRICES.waste && PRICES.waste.can && PRICES.waste.can.price) || 22000;

  var sub = document.createElement('div');
  sub.id = 'bulkSubModal';
  sub.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;';
  sub.innerHTML =
    '<div style="background:#fff;border-radius:14px;max-width:380px;width:100%;padding:18px 22px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">' +
      '<div style="font-size:14px;font-weight:800;color:#E65100;margin-bottom:14px;">♻️ 폐유 수거 수동 추가</div>' +
      '<label style="display:block;font-size:11px;font-weight:700;color:#444;margin-bottom:5px;">수거 캔 수</label>' +
      '<input id="subQtyInput" type="number" min="1" max="99" value="' + (biz.wasteOil || 1) + '" style="width:100%;padding:9px 11px;border:1.5px solid #DDD;border-radius:7px;font-size:14px;margin-bottom:14px;font-family:Menlo,monospace;box-sizing:border-box;text-align:right;font-weight:700;">' +
      '<div style="display:flex;gap:6px;">' +
        '<button onclick="document.getElementById(\'bulkSubModal\').remove()" style="flex:1;background:#F5F5F5;color:#444;border:none;border-radius:7px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-body);">취소</button>' +
        '<button onclick="_bulkConfirmManualWaste(' + unitPrice + ')" style="flex:2;background:#E65100;color:#fff;border:none;border-radius:7px;padding:10px;font-size:12px;font-weight:800;cursor:pointer;font-family:var(--font-body);">+ 추가</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(sub);
  setTimeout(function(){ var q = document.getElementById('subQtyInput'); if (q) { q.focus(); q.select(); } }, 100);
}

function _bulkConfirmManualWaste(unitPrice) {
  var qtyEl = document.getElementById('subQtyInput');
  if (!qtyEl) return;
  var qty = parseInt(qtyEl.value) || 1;
  if (qty < 1) { alert('수량은 1 이상'); return; }
  window._bulkProcessState.items.push({
    type: 'waste', productKey: 'waste', productName: '폐유',
    qty: qty, unitPrice: unitPrice, sourceHistId: null,
    _autoLabel: '수동 추가'
  });
  document.getElementById('bulkSubModal').remove();
  renderBulkItemsList();
}

// 항목 리스트 렌더 (수량 inline 수정)
function renderBulkItemsList() {
  var listEl = document.getElementById('bulkItemsList');
  var countEl = document.getElementById('bulkItemCount');
  if (!listEl) return;
  var items = window._bulkProcessState.items;
  if (countEl) countEl.textContent = items.length + '개';

  if (items.length === 0) {
    var mode = window._bulkProcessState.mode || 'request';
    var emptyMsg = mode === 'request'
      ? '✅ 신청이 필요한 항목이 없어요<br><span style="font-size:10px;color:#bbb;margin-top:4px;display:inline-block;">재고가 충분하고, 폐유도 비어 있어요</span>'
      : '✅ 완료 처리할 대기 신청이 없어요<br><span style="font-size:10px;color:#bbb;margin-top:4px;display:inline-block;">대기 중인 발주·수거 신청이 없습니다</span>';
    listEl.innerHTML = '<div style="text-align:center;padding:24px 14px;color:#999;font-size:12px;">' + emptyMsg + '</div>';
    return;
  }

  var typeColors = {
    order: { bg: '#E8F5E9', color: '#2E7D32', icon: '📦', label: '납품' },
    extra: { bg: '#EEF4FF', color: '#185FA5', icon: '➕', label: '추가납품' },
    waste: { bg: '#FFF3E0', color: '#E65100', icon: '♻️', label: '폐유수거' }
  };
  listEl.innerHTML = items.map(function(it, idx) {
    var c = typeColors[it.type] || typeColors.order;
    var autoTag = it._autoLabel ? '<span style="font-size:9px;color:' + c.color + ';opacity:0.7;background:#fff;padding:1px 5px;border-radius:8px;margin-left:5px;">' + it._autoLabel + '</span>' : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:9px 10px;background:' + c.bg + ';border-radius:8px;margin-bottom:5px;">' +
      '<div style="font-size:18px;flex-shrink:0;">' + c.icon + '</div>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="font-size:12px;font-weight:700;color:' + c.color + ';">' + c.label + ' · ' + it.productName + autoTag + '</div>' +
        '<div style="font-size:10px;color:#666;margin-top:2px;display:flex;align-items:center;gap:4px;">' +
          '<input type="number" min="0" max="99" value="' + it.qty + '" data-idx="' + idx + '" oninput="bulkUpdateItemQty(this)" style="width:50px;padding:3px 6px;border:1px solid #CCC;border-radius:5px;font-size:12px;font-weight:700;text-align:right;font-family:Menlo,monospace;">' +
          '<span>캔 × ' + it.unitPrice.toLocaleString() + '원/캔</span>' +
        '</div>' +
      '</div>' +
      '<button onclick="bulkRemoveItem(' + idx + ')" style="background:#fff;color:#C0392B;border:1px solid #FFB3B3;border-radius:5px;width:26px;height:26px;font-size:11px;cursor:pointer;flex-shrink:0;font-weight:700;">✕</button>' +
    '</div>';
  }).join('');
}

function bulkUpdateItemQty(inputEl) {
  var idx = parseInt(inputEl.getAttribute('data-idx'));
  var newQty = parseInt(inputEl.value) || 0;
  if (window._bulkProcessState.items[idx]) {
    window._bulkProcessState.items[idx].qty = Math.max(0, Math.min(99, newQty));
  }
}

function bulkRemoveItem(idx) {
  window._bulkProcessState.items.splice(idx, 1);
  renderBulkItemsList();
}

// 일괄 처리 제출 (mode = 'request' or 'complete')
async function submitBulkProcess(mode) {
  var st = window._bulkProcessState;
  // 0인 항목은 자동 제외
  var validItems = st.items.filter(function(it){ return it.qty > 0; });
  if (validItems.length === 0) {
    showToast('t1','⚠️ 처리할 항목 없음','수량이 0인 항목은 자동 제외됩니다');
    return;
  }

  if (mode === 'request') {
    var dateInput = document.getElementById('bulkVisitDateInput');
    if (!dateInput || !dateInput.value) {
      showToast('t1','📅 방문 예정일 필요','달력에서 방문일을 선택해주세요');
      return;
    }
    onBulkVisitDateChange();
  }

  var biz = businesses.find(function(b){ return String(b.id) === String(st.bizId); });
  if (!biz) { showToast('t1','⚠️ 업체 못 찾음',''); return; }

  // 확인 다이얼로그
  var summary = validItems.map(function(it){
    var typeLabel = it.type === 'order' ? '납품' : it.type === 'extra' ? '추가납품' : '폐유수거';
    return '· ' + typeLabel + ' ' + it.productName + ' ' + it.qty + '캔';
  }).join('\n');
  var modeLabel = mode === 'request' ? '신청' : '완료';
  var visitInfo = mode === 'request' ? '\n\n📅 방문일: ' + st.visitLabel : '';
  if (!confirm('[' + biz.name + '] 다음 ' + validItems.length + '개 항목을 일괄 ' + modeLabel + '할까요?\n\n' + summary + visitInfo)) return;

  // 버튼 비활성
  var reqBtn = document.getElementById('bulkRequestBtn');
  var cmpBtn = document.getElementById('bulkCompleteBtn');
  if (reqBtn) reqBtn.disabled = true;
  if (cmpBtn) cmpBtn.disabled = true;

  var now = new Date();
  var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  var rawDate = now.toISOString();

  var successCount = 0;
  var failCount = 0;

  for (var i = 0; i < validItems.length; i++) {
    var it = validItems[i];
    try {
      var historyType, content, method, status;

      if (it.type === 'order' || it.type === 'extra') {
        historyType = '식용유발주';
        method = it.type === 'extra' ? '추가발주' : '수동';
        if (mode === 'request') {
          content = it.productName + ' ' + it.qty + '캔 발주' + (st.visitLabel ? ' · 방문예정 ' + st.visitLabel : '');
          status = 'pending';
        } else {
          content = it.productName + ' ' + it.qty + '캔 납품 완료';
          status = 'done';
          // 재고 증가
          var prods = getBizProducts(biz);
          // 🔧 oils 키('soy','canola','corn')는 products 키로 변환
          var safeKey = it.productKey;
          var oilsToProductKey = { soy: 'soy_wonju', canola: 'can_grewell', corn: 'corn_oilers' };
          if (oilsToProductKey[safeKey]) {
            console.log('[일괄완료] oils키 → products키 변환:', safeKey, '→', oilsToProductKey[safeKey]);
            safeKey = oilsToProductKey[safeKey];
          }
          // products 사전에 없는 키는 차단 (raw key 노출 방지)
          if (!PRICES.products || !PRICES.products[safeKey]) {
            console.warn('[일괄완료] 알 수 없는 품목 키 — 재고 추가 건너뜀:', safeKey);
            // 이력만 INSERT하고 재고는 안 건드림
          } else {
            var existProd = prods.find(function(p){ return p.key === safeKey; });
            if (existProd) {
              existProd.qty = (existProd.qty || 0) + it.qty;
            } else {
              prods.push({ key: safeKey, qty: it.qty });
            }
            biz.oilProducts = prods;
            biz.newOil = prods.reduce(function(s,p){ return s + (p.qty||0); }, 0);
          }
        }
      } else {
        historyType = '폐유수거';
        method = '수동';
        if (mode === 'request') {
          content = '폐유 ' + it.qty + '캔 수거 신청' + (st.visitLabel ? ' · 방문예정 ' + st.visitLabel : '');
          status = 'pending';
        } else {
          content = '폐유 ' + it.qty + '캔 수거 완료';
          status = 'done';
          biz.wasteOil = Math.max(0, (biz.wasteOil || 0) - it.qty);
        }
      }

      // 완료 모드 + 기존 pending 이력들이 있으면 → 첫번째를 done으로 합산 업데이트, 나머지는 삭제
      var pendingIds = it.sourceHistIds || (it.sourceHistId ? [it.sourceHistId] : []);
      var _handled = false;
      
      // 🆕 신청 모드 + 이미 pending 이력이 있는 경우 → visit_date만 업데이트 (중복 INSERT 방지)
      if (mode === 'request' && pendingIds.length > 0) {
        try {
          // 첫 pending 이력의 방문일/수량 업데이트
          await db.from('history').update({
            qty: it.qty,
            visit_date: st.visitDate,
            visit_label: st.visitLabel,
            content: content
          }).eq('id', pendingIds[0]);
          // 메모리도 갱신
          var memH0 = historyData.find(function(h){ return String(h.dbId) === String(pendingIds[0]); });
          if (memH0) {
            memH0.qty = it.qty;
            memH0.visitDate = st.visitDate;
            memH0.visitLabel = st.visitLabel;
            memH0.content = content;
          }
          // 나머지 pending들이 합산됐다면 삭제
          for (var ei = 1; ei < pendingIds.length; ei++) {
            try {
              await db.from('history').delete().eq('id', pendingIds[ei]);
              var idx = historyData.findIndex(function(h){ return String(h.dbId) === String(pendingIds[ei]); });
              if (idx >= 0) historyData.splice(idx, 1);
            } catch(e) {}
          }
          saveHistory();
          successCount++;
          _handled = true;
        } catch(e) {
          console.warn('기존 pending 신청 업데이트 실패 — 항목 건너뜀:', e.message);
          _handled = true;  // 중복 INSERT 방지 위해 건너뜀
        }
      }
      
      if (!_handled && mode === 'complete' && pendingIds.length > 0) {
        var primaryId = pendingIds[0];
        var extraIds = pendingIds.slice(1);
        try {
          // ① 첫 pending 이력을 done으로 업데이트 (합산된 수량/금액)
          await db.from('history').update({
            status: 'done',
            content: content,
            qty: it.qty,
            unit_price: it.unitPrice,
            amount: (it.qty * it.unitPrice).toLocaleString() + '원'
          }).eq('id', primaryId);
          // 메모리도 갱신
          var memH = historyData.find(function(h){ return String(h.dbId) === String(primaryId); });
          if (memH) {
            memH.status = 'done';
            memH.content = content;
            memH.qty = it.qty;
            memH.unitPrice = it.unitPrice;
            memH.amount = (it.qty * it.unitPrice).toLocaleString() + '원';
          }
          // ② 나머지 pending 이력들은 영구 삭제 (이미 첫 이력에 합산됨)
          for (var ei = 0; ei < extraIds.length; ei++) {
            try {
              await db.from('history').delete().eq('id', extraIds[ei]);
              // 메모리에서도 제거
              var idx = historyData.findIndex(function(h){ return String(h.dbId) === String(extraIds[ei]); });
              if (idx >= 0) historyData.splice(idx, 1);
            } catch(e) { console.warn('합산된 pending 삭제 실패:', extraIds[ei], e.message); }
          }
          saveHistory();
        } catch(e) {
          console.warn('기존 pending 이력 업데이트 실패, INSERT로 폴백:', e.message);
          // 폴백: 새 이력 INSERT
          var fallbackItem = {
            date: dateStr, rawDate: rawDate, biz: biz.name, bizId: biz.id,
            type: historyType, content: content, qty: it.qty,
            unitPrice: it.unitPrice, amount: (it.qty * it.unitPrice).toLocaleString() + '원',
            method: method, status: status,
            productKey: it.productKey, productName: it.productName,
          };
          historyData.unshift(fallbackItem);
          saveHistory();
          await saveHistoryToDB(fallbackItem);
        }
      } else if (!_handled) {
        // 일반 INSERT (신청 모드/완료 모드 + sourceHistIds 없는 경우)
        var item = {
          date: dateStr, rawDate: rawDate, biz: biz.name, bizId: biz.id,
          type: historyType, content: content, qty: it.qty,
          unitPrice: it.unitPrice, amount: (it.qty * it.unitPrice).toLocaleString() + '원',
          method: method, status: status,
          productKey: it.productKey, productName: it.productName,
          visitDate: mode === 'request' ? st.visitDate : null,
          visitLabel: mode === 'request' ? st.visitLabel : null,
        };
        historyData.unshift(item);
        saveHistory();
        await saveHistoryToDB(item);
      }
      if (!_handled) successCount++;
    } catch(e) {
      console.warn('일괄 처리 항목 실패:', it, e);
      failCount++;
    }
  }

  // 업체 재고 DB 동기화 (완료 모드)
  if (mode === 'complete') {
    saveBusinesses();
    try {
      await updateBizStockInDB(biz.id, biz.newOil, biz.wasteOil, '일괄처리 ' + dateStr, biz.oilProducts);
    } catch(e) { console.warn('재고 DB 동기화 실패:', e.message); }
  }

  closeBulkProcessModal();
  showToast('t1',
    (mode === 'request' ? '📅 일괄 신청 완료' : '✅ 일괄 완료 처리'),
    biz.name + ' — ' + successCount + '개 성공' + (failCount > 0 ? ' / ' + failCount + '개 실패' : '')
  );

  // 모든 패널 갱신
  renderHistory && renderHistory();
  renderDeliveryPanel && renderDeliveryPanel();
  renderWasteTable && renderWasteTable();
  renderWasteHistList && renderWasteHistList();
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  updateHqRealStats && updateHqRealStats();
  updateTabBadges && updateTabBadges();
  refreshMapMarkers && refreshMapMarkers();
}

// 패널 진입 시 일괄 처리 버튼 표시 (관리자/드라이버만)
function _refreshBulkProcessVisibility() {
  var canBulk = isAdminMode || isDriverMode;
  document.querySelectorAll('.admin-driver-only').forEach(function(el) {
    el.style.display = canBulk ? '' : 'none';
  });
}


// generateEsgReport는 아래에 있는 원래 함수
function generateEsgReport(targetBizId) {
  var now = new Date();
  var dateStr = now.getFullYear() + '년 ' + (now.getMonth()+1) + '월 ' + now.getDate() + '일';
  var canKg = PRICES.waste && PRICES.waste.can ? PRICES.waste.can.kg : 16.5;
  var carbonRate = PRICES.carbonRate || 0.7;
  var esgRate = PRICES.esgRate || 8.75;

  // 업체별 개별 인증서
  if (targetBizId) {
    var biz = businesses.find(function(b){ return String(b.id) === String(targetBizId); });
    if (!biz) {
      showToast('t1','⚠️ 업체 못 찾음','삭제된 업체일 수 있어요');
      return;
    }
    var wasteList = historyData.filter(function(h){ if(h.deleted_at) return false;  return h.bizId === biz.id && h.type === '폐유수거' && h.status === 'done'; });
    var cans = wasteList.reduce(function(s,h){ return s+(h.qty||0); }, 0);
    // 🛡️ 거래 이력이 없으면 인증서 발급 중단
    if (cans === 0) {
      showToast('t1','📊 거래 이력 없음', biz.name + ' — 폐유 수거 이력이 0건이라 인증서를 발급할 수 없어요');
      return;
    }
    var kg = (cans * canKg).toFixed(1);
    var co2 = (parseFloat(kg) * carbonRate).toFixed(1);
    var bio = (parseFloat(kg) * 0.75).toFixed(0);
    var pts = Math.round(parseFloat(kg) * esgRate);
    var certNo = 'HIVE-ESG-' + biz.id + '-' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0');
    var win = window.open('', '_blank');
    if (win) { win.document.write(buildEsgCertHtml(biz.name, cans, kg, co2, bio, pts, dateStr, certNo)); win.document.close(); }
    else { showToast('t1','⚠️ 팝업 차단','브라우저 팝업 허용 후 다시 시도해주세요'); }
    return;
  }

  // 전체 종합 인증서 (업체명 = HIVE 원주 전체)
  var allWaste = historyData.filter(function(h){ if(h.deleted_at) return false;  return h.type==='폐유수거' && h.status==='done'; }).reduce(function(s,h){ return s+(h.qty||0); },0);
  var allKg = (allWaste * canKg).toFixed(1);
  var allCo2 = (parseFloat(allKg) * carbonRate).toFixed(1);
  var allBio = (parseFloat(allKg) * 0.75).toFixed(0);
  var allPts = Math.round(parseFloat(allKg) * esgRate);
  var certNo2 = 'HIVE-ESG-ALL-' + now.getFullYear() + String(now.getMonth()+1).padStart(2,'0');
  var win2 = window.open('', '_blank');
  if (win2) { win2.document.write(buildEsgCertHtml('원주 외식업 연합 (' + businesses.length + '개 업체)', allWaste, allKg, allCo2, allBio, allPts, dateStr, certNo2)); win2.document.close(); }
  else { showToast('t1','⚠️ 팝업 차단','브라우저 팝업 허용 후 다시 시도해주세요'); }
}

// ============================================================
// 🆕 노트 #1: 업주 이력 조회 패널 (읽기 전용)
// ============================================================
var _ownerHistPeriod = 'day';   // 'day' | 'week' | 'month' | 'year'
var _ownerHistType = 'all';     // 'all' | 'order' | 'waste'
// 🆕 v68: 기간 필터 (시작/끝 ms 또는 null = 전체)
var _ownerHistRangeStart = null;
var _ownerHistRangeEnd = null;
var _ownerHistRangeLabel = '오늘';

function switchOwnerHistPeriod(btn, period) {
  _ownerHistPeriod = period;
  document.querySelectorAll('.ohist-period-tab').forEach(function(b) {
    b.style.background = 'transparent';
    b.style.color = '#666';
    b.classList.remove('active');
  });
  btn.style.background = '#0FA366';
  btn.style.color = '#fff';
  btn.classList.add('active');
  renderOwnerHistoryPanel();
}

// 🆕 v68: 빠른 기간 필터
function setOwnerHistRange(btn, range) {
  // 모든 quick 버튼 초기화
  document.querySelectorAll('.ohist-quick-btn').forEach(function(b) {
    b.style.background = '#fff';
    b.style.color = '#666';
    b.style.borderColor = '#DDE8E1';
    b.classList.remove('active');
  });
  if (btn) {
    btn.style.background = '#0FA366';
    btn.style.color = '#fff';
    btn.style.borderColor = '#0FA366';
    btn.classList.add('active');
  }
  
  var now = new Date();
  var y = now.getFullYear();
  var m = now.getMonth();
  var d = now.getDate();
  
  if (range === 'today') {
    var s = new Date(y, m, d, 0, 0, 0).getTime();
    var e = new Date(y, m, d, 23, 59, 59).getTime();
    _ownerHistRangeStart = s; _ownerHistRangeEnd = e;
    _ownerHistRangeLabel = '오늘 (' + (m+1) + '월 ' + d + '일)';
  } else if (range === 'thisweek') {
    // 이번 주 월요일 ~ 일요일
    var temp = new Date(now);
    temp.setHours(0, 0, 0, 0);
    var dayNum = temp.getDay() || 7;
    temp.setDate(temp.getDate() - dayNum + 1);
    var monday = new Date(temp);
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59);
    _ownerHistRangeStart = monday.getTime();
    _ownerHistRangeEnd = sunday.getTime();
    _ownerHistRangeLabel = '이번 주 (' + (monday.getMonth()+1) + '/' + monday.getDate() + '~' + (sunday.getMonth()+1) + '/' + sunday.getDate() + ')';
  } else if (range === 'thismonth') {
    _ownerHistRangeStart = new Date(y, m, 1, 0, 0, 0).getTime();
    _ownerHistRangeEnd = new Date(y, m+1, 0, 23, 59, 59).getTime();
    _ownerHistRangeLabel = y + '년 ' + (m+1) + '월';
  } else if (range === 'lastmonth') {
    _ownerHistRangeStart = new Date(y, m-1, 1, 0, 0, 0).getTime();
    _ownerHistRangeEnd = new Date(y, m, 0, 23, 59, 59).getTime();
    var lastDate = new Date(y, m-1, 1);
    _ownerHistRangeLabel = lastDate.getFullYear() + '년 ' + (lastDate.getMonth()+1) + '월';
  } else if (range === 'thisyear') {
    _ownerHistRangeStart = new Date(y, 0, 1, 0, 0, 0).getTime();
    _ownerHistRangeEnd = new Date(y, 11, 31, 23, 59, 59).getTime();
    _ownerHistRangeLabel = y + '년 전체';
  } else if (range === 'all') {
    _ownerHistRangeStart = null;
    _ownerHistRangeEnd = null;
    _ownerHistRangeLabel = '전체 기간';
  }
  
  // 드롭다운 동기화
  var ySel = document.getElementById('ownerHistYearSel');
  var mSel = document.getElementById('ownerHistMonthSel');
  if (range === 'today' || range === 'thisweek' || range === 'thismonth') {
    if (ySel) ySel.value = String(y);
    if (mSel) mSel.value = range === 'thismonth' ? String(m+1) : '';
  } else if (range === 'lastmonth') {
    var lm = m === 0 ? 12 : m;
    var ly = m === 0 ? y-1 : y;
    if (ySel) ySel.value = String(ly);
    if (mSel) mSel.value = String(lm);
  } else if (range === 'thisyear') {
    if (ySel) ySel.value = String(y);
    if (mSel) mSel.value = '';
  } else if (range === 'all') {
    if (ySel) ySel.value = '';
    if (mSel) mSel.value = '';
  }
  
  // 라벨 갱신
  var lbl = document.getElementById('ownerHistRangeLabel');
  if (lbl) lbl.textContent = '📍 ' + _ownerHistRangeLabel;
  
  renderOwnerHistoryPanel();
}

// 🆕 v68: 년/월 드롭다운 변경
function onOwnerHistYearChange() {
  var ySel = document.getElementById('ownerHistYearSel');
  var mSel = document.getElementById('ownerHistMonthSel');
  if (!ySel) return;
  var y = parseInt(ySel.value);
  // quick 버튼 비활성화
  document.querySelectorAll('.ohist-quick-btn').forEach(function(b) {
    b.style.background = '#fff'; b.style.color = '#666'; b.style.borderColor = '#DDE8E1';
    b.classList.remove('active');
  });
  if (!y) {
    _ownerHistRangeStart = null;
    _ownerHistRangeEnd = null;
    _ownerHistRangeLabel = '전체 기간';
    if (mSel) mSel.value = '';
  } else {
    var m = mSel ? parseInt(mSel.value) : NaN;
    if (m && m >= 1 && m <= 12) {
      _ownerHistRangeStart = new Date(y, m-1, 1, 0, 0, 0).getTime();
      _ownerHistRangeEnd = new Date(y, m, 0, 23, 59, 59).getTime();
      _ownerHistRangeLabel = y + '년 ' + m + '월';
    } else {
      _ownerHistRangeStart = new Date(y, 0, 1, 0, 0, 0).getTime();
      _ownerHistRangeEnd = new Date(y, 11, 31, 23, 59, 59).getTime();
      _ownerHistRangeLabel = y + '년 전체';
    }
  }
  var lbl = document.getElementById('ownerHistRangeLabel');
  if (lbl) lbl.textContent = '📍 ' + _ownerHistRangeLabel;
  renderOwnerHistoryPanel();
}

function onOwnerHistMonthChange() {
  // 년도 변경과 동일한 로직 (월만 바꿔도 그 년도 기준으로 재계산)
  onOwnerHistYearChange();
}

// 드롭다운 옵션 채우기 (이력에 있는 년도만)
function _populateOwnerHistDropdowns() {
  var ySel = document.getElementById('ownerHistYearSel');
  var mSel = document.getElementById('ownerHistMonthSel');
  if (!ySel || !mSel) return;
  
  // 이력에서 년도 수집
  var yearSet = {};
  if (typeof historyData !== 'undefined' && typeof ownerBizId !== 'undefined' && ownerBizId) {
    historyData.forEach(function(h) {
      if (h.deleted_at) return;
      if (String(h.bizId) !== String(ownerBizId)) return;
      var d = _parseHistoryDate(h);
      if (d) yearSet[d.getFullYear()] = true;
    });
  }
  // 현재 년도 항상 포함
  yearSet[new Date().getFullYear()] = true;
  
  var years = Object.keys(yearSet).map(Number).sort(function(a,b){ return b-a; });
  ySel.innerHTML = '<option value="">📆 년도 선택</option>' + years.map(function(y) {
    return '<option value="' + y + '">' + y + '년</option>';
  }).join('');
  
  mSel.innerHTML = '<option value="">전체 월</option>' + 
    [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m) {
      return '<option value="' + m + '">' + m + '월</option>';
    }).join('');
}

function switchOwnerHistType(btn, type) {
  _ownerHistType = type;
  document.querySelectorAll('.ohist-type-chip').forEach(function(b) {
    b.style.background = '#fff';
    b.style.color = '#666';
    b.style.borderColor = '#DDE8E1';
    b.classList.remove('active');
  });
  btn.style.background = '#0FA366';
  btn.style.color = '#fff';
  btn.style.borderColor = '#0FA366';
  btn.classList.add('active');
  renderOwnerHistoryPanel();
}

// 날짜 파싱 (YYYY.MM.DD 또는 YYYY.MM.DD HH:MM 등)
function _parseHistoryDate(h) {
  if (h.rawDate) {
    var d = new Date(h.rawDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (h.date) {
    // 'YYYY.MM.DD' or 'YYYY.MM.DD HH:MM'
    var parts = h.date.replace(/\./g, '-').split(' ')[0].split('-');
    if (parts.length === 3) {
      var d2 = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
      if (!isNaN(d2.getTime())) return d2;
    }
  }
  return null;
}

// 그룹 키 생성
function _getGroupKey(date, period) {
  if (!date) return '미분류';
  var y = date.getFullYear();
  var m = String(date.getMonth()+1).padStart(2,'0');
  var d = String(date.getDate()).padStart(2,'0');
  if (period === 'day') {
    return y + '.' + m + '.' + d;
  }
  if (period === 'week') {
    // ISO 주차 계산 (월요일 시작)
    var temp = new Date(date);
    temp.setHours(0, 0, 0, 0);
    var dayNum = temp.getDay() || 7;
    temp.setDate(temp.getDate() - dayNum + 1);  // 그 주의 월요일
    var monday = temp;
    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    var mLabel = (monday.getMonth()+1) + '/' + monday.getDate();
    var sLabel = (sunday.getMonth()+1) + '/' + sunday.getDate();
    return monday.getFullYear() + '. ' + mLabel + ' ~ ' + sLabel;
  }
  if (period === 'month') {
    return y + '년 ' + (date.getMonth()+1) + '월';
  }
  if (period === 'year') {
    return y + '년';
  }
  return y + '.' + m + '.' + d;
}

// 메인 렌더
function renderOwnerHistoryPanel() {
  if (typeof ownerBizId === 'undefined' || !ownerBizId) {
    var listEmpty = document.getElementById('ownerHistoryList');
    if (listEmpty) {
      listEmpty.innerHTML = '<div style="background:#fff;border-radius:12px;padding:40px 20px;text-align:center;color:#999;"><div style="font-size:36px;margin-bottom:8px;opacity:0.4;">🔒</div><div style="font-size:13px;">로그인 후 이용 가능합니다</div></div>';
    }
    return;
  }

  // 🆕 v68: 드롭다운 채우기 (한 번만)
  try { _populateOwnerHistDropdowns(); } catch(e) {}

  // 우리 업체 이력만 필터
  var myHist = (typeof historyData !== 'undefined' ? historyData : []).filter(function(h) {
    if (h.deleted_at) return false;
    if (String(h.bizId) !== String(ownerBizId)) return false;
    return true;
  });

  // 🆕 v68: 기간 필터 적용 (start/end ms 사이)
  if (_ownerHistRangeStart !== null && _ownerHistRangeEnd !== null) {
    myHist = myHist.filter(function(h) {
      var d = _parseHistoryDate(h);
      if (!d) return false;
      var t = d.getTime();
      return t >= _ownerHistRangeStart && t <= _ownerHistRangeEnd;
    });
  }

  // 종류 필터
  var typed = myHist.slice();
  if (_ownerHistType === 'order') {
    typed = typed.filter(function(h) { return h.type === '식용유발주'; });
  } else if (_ownerHistType === 'waste') {
    typed = typed.filter(function(h) { return h.type === '폐유수거'; });
  }

  // 합계 KPI 계산
  var oilCans = 0, oilAmt = 0, wasteCans = 0, wasteAmt = 0;
  myHist.forEach(function(h) {
    var amt = 0;
    if (typeof h.amount === 'string') {
      amt = parseInt(h.amount.replace(/[^0-9]/g, '')) || 0;
    } else if (typeof h.amount === 'number') {
      amt = h.amount;
    }
    if (h.type === '식용유발주' && h.status !== 'cancelled') {
      oilCans += (h.qty || 0);
      if (h.status === 'done') oilAmt += amt;
    } else if (h.type === '폐유수거' && h.status !== 'cancelled') {
      wasteCans += (h.qty || 0);
      if (h.status === 'done') wasteAmt += amt;
    }
  });

  // KPI 갱신
  var oilCansEl = document.getElementById('ownerHistOilCans');
  var oilAmtEl = document.getElementById('ownerHistOilAmt');
  var wasteCansEl = document.getElementById('ownerHistWasteCans');
  var wasteAmtEl = document.getElementById('ownerHistWasteAmt');
  var countEl = document.getElementById('ownerHistCount');
  var periodEl = document.getElementById('ownerHistPeriod');
  if (oilCansEl) oilCansEl.textContent = oilCans + '캔';
  if (oilAmtEl) oilAmtEl.textContent = oilAmt.toLocaleString() + '원';
  if (wasteCansEl) wasteCansEl.textContent = wasteCans + '캔';
  if (wasteAmtEl) wasteAmtEl.textContent = '+' + wasteAmt.toLocaleString() + '원';
  if (countEl) countEl.textContent = myHist.length + '건';
  if (periodEl) {
    periodEl.textContent = _ownerHistRangeLabel;
  }
  
  // 🆕 v70: ESG 포인트 — 본인 업체 누적 (전체 기간, ISCC 동의 시만)
  try {
    var esgEl = document.getElementById('ownerHistEsgPts');
    var tierEl = document.getElementById('ownerHistEsgTier');
    if (esgEl && tierEl) {
      var allMyDoneWaste = (typeof historyData !== 'undefined' ? historyData : []).filter(function(h) {
        return !h.deleted_at && h.type === '폐유수거' && h.status === 'done' 
            && String(h.bizId) === String(ownerBizId)
            && (typeof isIsccAgreed === 'function' ? isIsccAgreed(h.bizId) : true);
      });
      var totalWasteCans = allMyDoneWaste.reduce(function(s, h) { return s + (h.qty || 0); }, 0);
      var totalPts = Math.round(totalWasteCans * PRICES.waste.can.kg * (PRICES.esgRate || 8.75));
      esgEl.textContent = totalPts.toLocaleString() + ' pts';
      var tier = totalPts >= 50000 ? '🥇 골드' : totalPts >= 10000 ? '🥈 실버' : totalPts >= 1000 ? '🥉 브론즈' : '🌱 새싹';
      tierEl.textContent = tier;
    }
  } catch(e) { console.warn('ESG 포인트 갱신 실패:', e.message); }

  // 기간별 그룹화
  var groups = {};
  var groupOrder = [];  // 정렬 유지용
  typed.forEach(function(h) {
    var d = _parseHistoryDate(h);
    var key = _getGroupKey(d, _ownerHistPeriod);
    if (!groups[key]) {
      groups[key] = { items: [], oilCans: 0, oilAmt: 0, wasteCans: 0, wasteAmt: 0, sortDate: d };
      groupOrder.push(key);
    }
    groups[key].items.push(h);
    var amt = 0;
    if (typeof h.amount === 'string') amt = parseInt(h.amount.replace(/[^0-9]/g, '')) || 0;
    else if (typeof h.amount === 'number') amt = h.amount;
    if (h.type === '식용유발주' && h.status !== 'cancelled') {
      groups[key].oilCans += (h.qty || 0);
      if (h.status === 'done') groups[key].oilAmt += amt;
    } else if (h.type === '폐유수거' && h.status !== 'cancelled') {
      groups[key].wasteCans += (h.qty || 0);
      if (h.status === 'done') groups[key].wasteAmt += amt;
    }
  });

  // 그룹 정렬 (최신순)
  groupOrder.sort(function(a, b) {
    var da = groups[a].sortDate ? groups[a].sortDate.getTime() : 0;
    var db = groups[b].sortDate ? groups[b].sortDate.getTime() : 0;
    return db - da;
  });

  // 렌더
  var list = document.getElementById('ownerHistoryList');
  if (!list) return;

  if (groupOrder.length === 0) {
    list.innerHTML = '<div style="background:#fff;border-radius:12px;padding:40px 20px;text-align:center;color:#999;border:1px solid var(--gray-light);"><div style="font-size:36px;margin-bottom:8px;opacity:0.4;">📋</div><div style="font-size:13px;">조회된 이력이 없어요</div></div>';
    return;
  }

  var html = groupOrder.map(function(key) {
    var g = groups[key];
    // 그룹 내 아이템도 최신순 정렬
    g.items.sort(function(a, b) {
      var da = _parseHistoryDate(a); var db = _parseHistoryDate(b);
      return (db ? db.getTime() : 0) - (da ? da.getTime() : 0);
    });
    
    // 그룹 헤더 — 일별엔 요일 추가
    var groupHeaderExtra = '';
    if (_ownerHistPeriod === 'day' && g.sortDate) {
      var dayNames = ['일','월','화','수','목','금','토'];
      groupHeaderExtra = ' (' + dayNames[g.sortDate.getDay()] + ')';
    }

    var summary = [];
    if (g.oilCans > 0) summary.push('🫙 ' + g.oilCans + '캔');
    if (g.wasteCans > 0) summary.push('♻️ ' + g.wasteCans + '캔');
    var summaryStr = summary.length > 0 ? summary.join(' · ') : '';
    
    var netAmt = g.wasteAmt - g.oilAmt;
    var netStr = '';
    if (g.oilAmt > 0 || g.wasteAmt > 0) {
      var sign = netAmt >= 0 ? '+' : '';
      var netColor = netAmt >= 0 ? '#0FA366' : '#D4621A';
      netStr = '<div style="font-size:12px;font-weight:800;color:' + netColor + ';font-family:var(--font-display);">' + sign + netAmt.toLocaleString() + '원</div>';
    }

    var itemsHtml = g.items.map(function(h) {
      var typeIcon = h.type === '식용유발주' ? '🫙' : '♻️';
      var typeBg = h.type === '식용유발주' ? '#E8F5E9' : '#FFF3E0';
      var typeColor = h.type === '식용유발주' ? '#2E7D32' : '#D4621A';
      var statusBadge = '';
      if (h.status === 'pending') {
        statusBadge = '<span style="background:#FFF3E0;color:#D4621A;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;">⏳ 대기</span>';
      } else if (h.status === 'done') {
        statusBadge = '<span style="background:#E8F5E9;color:#2E7D32;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;">✅ 완료</span>';
      } else if (h.status === 'cancelled') {
        statusBadge = '<span style="background:#FFEBEE;color:#C62828;border-radius:5px;padding:2px 7px;font-size:9px;font-weight:700;">❌ 취소</span>';
      }
      var amtStr = h.amount || '';
      if (typeof amtStr === 'number') amtStr = amtStr.toLocaleString() + '원';
      var dateLabel = h.date || '';
      
      return '<div style="padding:10px 12px;display:flex;align-items:center;gap:10px;border-top:1px solid #F0F0F0;">'
        + '<div style="width:32px;height:32px;border-radius:8px;background:' + typeBg + ';display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;">' + typeIcon + '</div>'
        + '<div style="flex:1;min-width:0;">'
        +   '<div style="font-size:12px;font-weight:700;color:#0D0D0D;display:flex;align-items:center;gap:6px;">'
        +     '<span>' + (h.content || h.type) + '</span>' + statusBadge
        +   '</div>'
        +   '<div style="font-size:10px;color:#888;margin-top:2px;">' + dateLabel + '</div>'
        + '</div>'
        + (amtStr ? '<div style="font-size:11px;font-weight:700;color:' + typeColor + ';white-space:nowrap;font-family:var(--font-display);">' + amtStr + '</div>' : '')
        + '</div>';
    }).join('');
    
    return '<div style="background:#fff;border-radius:12px;box-shadow:var(--shadow);border:1px solid var(--gray-light);overflow:hidden;">'
      + '<div style="background:linear-gradient(135deg,#F0FBF5,#E8F5E9);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #C8E6C9;">'
      +   '<div>'
      +     '<div style="font-size:13px;font-weight:800;color:#1B5E20;letter-spacing:-0.02em;">' + key + groupHeaderExtra + '</div>'
      +     (summaryStr ? '<div style="font-size:11px;color:#388E3C;margin-top:2px;">' + summaryStr + '</div>' : '')
      +   '</div>'
      +   netStr
      + '</div>'
      + itemsHtml
      + '</div>';
  }).join('');

  list.innerHTML = html;
}

function renderOwnerMonthlyStats() {
  const now = new Date();
  const month = now.getMonth();
  const year  = now.getFullYear();
  const label = year + '년 ' + (month + 1) + '월 사용현황';
  const el = document.getElementById('ownerMonthLabel');
  if (el) el.textContent = label;

  // 이번달 이력 필터
  const myHistory = historyData.filter(h => { if(h.deleted_at) return false;
    if (String(h.bizId) !== String(ownerBizId)) return false;
    return isSameMonth(h, year, month);
  });

  // 식용유 구매금액
  const oilItems = myHistory.filter(h => h.type === '식용유발주' && h.status === 'done');
  const oilAmt   = oilItems.reduce((s, h) => {
    const n = parseInt((h.amount || '0').replace(/[^0-9]/g, '')) || 0;
    return s + n;
  }, 0);

  // 폐유 판매금액
  const wasteItems = myHistory.filter(h => h.type === '폐유수거' && h.status === 'done');
  const wasteAmt   = wasteItems.reduce((s, h) => {
    const n = parseInt((h.amount || '0').replace(/[^0-9]/g, '')) || 0;
    return s + n;
  }, 0);
  const wasteCans  = wasteItems.reduce((s, h) => s + (h.qty || 0), 0);

  // 탄소 감축 (폐유 수거량 × 0.7)
  const carbonKg = (wasteCans * PRICES.waste.can.kg * 0.7).toFixed(1);

  // ESG 포인트 (폐유 판매금액 × 0.5%)
  const esgPts = Math.round(wasteAmt * 0.005);

  const oilEl   = document.getElementById('ownerOilBuyAmt');
  const wasteEl = document.getElementById('ownerWasteSellAmt');
  const carbonEl= document.getElementById('ownerCarbonAmt');
  const esgEl   = document.getElementById('ownerEsgAmt');

  if (oilEl)    oilEl.textContent    = oilAmt.toLocaleString() + '원';
  if (wasteEl)  wasteEl.textContent  = wasteAmt.toLocaleString() + '원';
  if (carbonEl) carbonEl.textContent = carbonKg + ' kg';
  if (esgEl)    esgEl.textContent    = '+' + esgPts.toLocaleString() + ' pts';

  // 🆕 탄소저감 기부 위젯 갱신
  try {
    var mineEl = document.getElementById('ownerDonationMine');
    var totalEl = document.getElementById('ownerDonationTotal');
    if (mineEl) mineEl.textContent = getBizMonthlyDonation(ownerBizId).toLocaleString() + '원';
    if (totalEl) totalEl.textContent = getTotalDonations().toLocaleString() + '원';
  } catch(e) {}
}

function renderOwnerRecentHistory() {
  const el = document.getElementById('ownerRecentHistory');
  if (!el) return;
  const bizId = ownerBizId;
  const items = historyData.filter(h => !h.deleted_at && h.bizId === bizId).slice(0, 10);
  if (items.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:20px;color:var(--gray);font-size:12px;">아직 이력이 없어요</div>';
    return;
  }
  const statusColor = { pending:'#E65100', done:'#2E7D32', inprogress:'#185FA5' };
  const statusLabel = { pending:'대기중', done:'완료', inprogress:'처리중' };
  el.innerHTML = items.map(h => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-light);">
      <div style="width:8px;height:8px;border-radius:50%;background:${statusColor[h.status]||'#ccc'};flex-shrink:0;"></div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:700;">${h.content}</div>
        <div style="font-size:10px;color:var(--gray);margin-top:1px;">${h.date}</div>
      </div>
      <div style="font-size:12px;font-weight:700;color:var(--green-dark);">${h.amount}</div>
      <span style="font-size:10px;font-weight:700;color:${statusColor[h.status]||'#ccc'};">${statusLabel[h.status]||''}</span>
    </div>`).join('');
}


// ===== 🔐 v105: 보안 인프라 (SHA-256 해시 + 로그인 시도 제한 + 세션 만료) =====

// SHA-256 해시 (브라우저 내장 Web Crypto API)
async function sha256Hash(text) {
  try {
    var buf = new TextEncoder().encode(text);
    var hashBuf = await crypto.subtle.digest('SHA-256', buf);
    var hashArr = Array.from(new Uint8Array(hashBuf));
    return hashArr.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  } catch(e) {
    console.error('[sha256] 해시 실패:', e);
    return null;
  }
}

// 비밀번호 강도 검증 (최소 8자 + 영문+숫자)
function validatePasswordStrength(pw) {
  if (!pw || pw.length < 8) return { ok: false, msg: '비밀번호는 8자 이상이어야 해요' };
  if (!/[a-zA-Z]/.test(pw)) return { ok: false, msg: '영문자가 포함되어야 해요' };
  if (!/[0-9]/.test(pw)) return { ok: false, msg: '숫자가 포함되어야 해요' };
  return { ok: true };
}

// 아이디 유효성 검증 (영문/숫자/_/-, 4~20자)
function validateLoginId(id) {
  if (!id || id.length < 4) return { ok: false, msg: '아이디는 4자 이상이어야 해요' };
  if (id.length > 20) return { ok: false, msg: '아이디는 20자 이내로 입력해주세요' };
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return { ok: false, msg: '아이디는 영문/숫자/_/-만 사용 가능해요' };
  return { ok: true };
}

// 로그인 시도 제한 (5회 실패 → 5분 잠금) — localStorage 기반
var LOGIN_ATTEMPT_MAX = 5;
var LOGIN_LOCK_MIN = 5;

function getLoginLockState(scope) {
  // scope: 'admin' | 'driver'
  try {
    var raw = localStorage.getItem('hiveoil_login_lock_' + scope);
    if (!raw) return { count: 0, lockUntil: 0 };
    return JSON.parse(raw);
  } catch(e) { return { count: 0, lockUntil: 0 }; }
}

function saveLoginLockState(scope, state) {
  try { localStorage.setItem('hiveoil_login_lock_' + scope, JSON.stringify(state)); } catch(e) {}
}

function isLoginLocked(scope) {
  var state = getLoginLockState(scope);
  if (state.lockUntil && Date.now() < state.lockUntil) {
    var remainMin = Math.ceil((state.lockUntil - Date.now()) / 60000);
    return { locked: true, remainMin: remainMin };
  }
  return { locked: false };
}

function recordLoginFailure(scope) {
  var state = getLoginLockState(scope);
  state.count = (state.count || 0) + 1;
  if (state.count >= LOGIN_ATTEMPT_MAX) {
    state.lockUntil = Date.now() + LOGIN_LOCK_MIN * 60 * 1000;
    state.count = 0; // reset counter, but locked
  }
  saveLoginLockState(scope, state);
  return state;
}

function clearLoginFailure(scope) {
  saveLoginLockState(scope, { count: 0, lockUntil: 0 });
}

// 세션 만료 시간 (4시간)
var SESSION_TTL_MS = 4 * 60 * 60 * 1000;

function setSession(type, extra) {
  try {
    var payload = { type: type, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL_MS };
    if (extra) Object.assign(payload, extra);
    localStorage.setItem('hiveoil_session', JSON.stringify(payload));
  } catch(e) {}
}

function getSession() {
  try {
    var raw = localStorage.getItem('hiveoil_session');
    if (!raw) return null;
    var s = JSON.parse(raw);
    if (s.expiresAt && Date.now() > s.expiresAt) {
      localStorage.removeItem('hiveoil_session');
      return null;
    }
    return s;
  } catch(e) { return null; }
}

// ===== 관리자 인증 (v105 강화) =====
// DB의 app_settings.admin_credentials = JSON { id, pwHash, updatedAt }

async function getAdminCredentials() {
  // 1. 메모리/localStorage 캐시
  try {
    var cached = localStorage.getItem('hiveoil_admin_creds_v2');
    if (cached) return JSON.parse(cached);
  } catch(e) {}
  // 2. DB 조회
  try {
    var r = await db.from('app_settings').select('value').eq('key', 'admin_credentials_v2').single();
    if (r.data && r.data.value) {
      var creds = typeof r.data.value === 'string' ? JSON.parse(r.data.value) : r.data.value;
      localStorage.setItem('hiveoil_admin_creds_v2', JSON.stringify(creds));
      return creds;
    }
  } catch(e) {}
  return null;
}

async function saveAdminCredentials(creds) {
  // creds = { id, pwHash, updatedAt }
  try { localStorage.setItem('hiveoil_admin_creds_v2', JSON.stringify(creds)); } catch(e) {}
  try { await _saveSettingToDB('admin_credentials_v2', JSON.stringify(creds)); } catch(e) {}
}

// 기존 admin_pw → admin_credentials_v2 자동 마이그레이션
async function migrateAdminCredentialsIfNeeded() {
  var creds = await getAdminCredentials();
  if (creds && creds.pwHash) return creds; // 이미 마이그레이션됨

  // 기존 평문 비밀번호가 있으면 해시로 변환
  var legacyPw = localStorage.getItem('hiveoil_admin_pw');
  if (!legacyPw) {
    try {
      var r = await db.from('app_settings').select('value').eq('key', 'admin_pw').single();
      if (r.data && r.data.value) legacyPw = r.data.value;
    } catch(e) {}
  }

  if (legacyPw) {
    var hash = await sha256Hash(legacyPw);
    var newCreds = { id: 'admin', pwHash: hash, updatedAt: Date.now(), migrated: true };
    await saveAdminCredentials(newCreds);
    console.log('[v105] 관리자 인증 정보 마이그레이션 완료 (평문 → 해시)');
    return newCreds;
  }
  return null;
}

// ===== 드라이버 인증 (v105 강화) =====
// driverAccounts 항목 구조 확장:
// { id, name, phone, pwHash, approved, active, joinDate, createdBy }
// 기존 pw 필드는 마이그레이션 후 제거 (호환을 위해 잠시 유지)

async function migrateDriverAccountsIfNeeded() {
  if (!Array.isArray(driverAccounts)) return;
  var migrated = 0;
  for (var i = 0; i < driverAccounts.length; i++) {
    var d = driverAccounts[i];
    if (d.pwHash) continue; // 이미 해시됨
    if (d.pw) {
      d.pwHash = await sha256Hash(d.pw);
      d.active = d.active !== false; // 기본 활성
      delete d.pw; // 평문 제거
      migrated++;
    }
  }
  if (migrated > 0) {
    saveDriverAccounts();
    saveDriverAccountsToDB();
    console.log('[v105] 드라이버 ' + migrated + '명 인증정보 마이그레이션 완료');
  }
}

// ===== 🔐 v105: 관리자 계정·드라이버 관리 액션 =====

// 보안 상태 표시 갱신
function updateSecurityStatus() {
  var adminLock = isLoginLocked('admin');
  var driverLock = isLoginLocked('driver');
  var session = getSession();
  var parts = [];
  if (adminLock.locked) parts.push('🔒 관리자 잠금 (' + adminLock.remainMin + '분)');
  if (driverLock.locked) parts.push('🔒 드라이버 잠금 (' + driverLock.remainMin + '분)');
  if (parts.length === 0) parts.push('잠금 없음');
  if (session && session.expiresAt) {
    var remainHour = Math.floor((session.expiresAt - Date.now()) / 3600000);
    var remainMin = Math.floor(((session.expiresAt - Date.now()) % 3600000) / 60000);
    parts.push('세션 ' + remainHour + 'h ' + remainMin + 'm 남음');
  }
  var el = document.getElementById('securityStatusText');
  if (el) el.textContent = parts.join(' · ');

  // 현재 관리자 ID 표시
  getAdminCredentials().then(function(creds) {
    var lbl = document.getElementById('currentAdminIdLabel');
    if (!lbl) return;
    if (creds && creds.id) {
      lbl.textContent = '현재 ID: ' + creds.id;
      lbl.style.background = 'rgba(255,255,255,0.12)';
      lbl.style.color = '#FFEB3B';
    } else {
      lbl.textContent = '🆕 초기 설정 필요';
      lbl.style.background = 'rgba(255,235,59,0.22)';
      lbl.style.color = '#FFEB3B';
    }
  });
}

// 잠금 해제 (관리자 수동)
function resetLoginLocks() {
  if (!confirm('관리자/드라이버 로그인 잠금을 모두 해제할까요?')) return;
  clearLoginFailure('admin');
  clearLoginFailure('driver');
  updateSecurityStatus();
  showToast('t1','✅ 잠금 해제','로그인 시도가 다시 가능합니다');
}

// 관리자 자격 변경 (아이디 + 비밀번호) — 첫 셋업 모드 지원 (v112)
async function changeAdminCredentials() {
  var newId   = document.getElementById('changeAdminId').value.trim();
  var newPw   = document.getElementById('changeAdminPwNew').value;
  var oldPw   = document.getElementById('changeAdminPwOld').value;
  var confirmPw = document.getElementById('changeAdminPwConfirm').value;
  var statusEl = document.getElementById('adminChangeStatus');
  function setStatus(msg, color) { if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || '#888'; } }

  // 🆕 v112: 마이그레이션 자동 시도 후 자격 조회
  var creds = await migrateAdminCredentialsIfNeeded();
  if (!creds) creds = await getAdminCredentials();

  // 🆕 v112: 자격 없음 = 초기 설정 모드
  var isInitialSetup = !creds;

  if (isInitialSetup) {
    // 초기 설정: 새 ID + 새 PW 모두 필수, 현재 비번 검증 스킵
    if (!newId) { setStatus('❌ [초기 설정] 새 아이디를 입력해주세요', '#C62828'); return; }
    if (!newPw) { setStatus('❌ [초기 설정] 새 비밀번호를 입력해주세요', '#C62828'); return; }
  } else {
    // 기존 자격 검증
    if (!oldPw) { setStatus('❌ 현재 비밀번호를 입력해주세요', '#C62828'); return; }
    var oldHash = await sha256Hash(oldPw);
    if (oldHash !== creds.pwHash) {
      setStatus('❌ 현재 비밀번호가 맞지 않아요', '#C62828');
      recordLoginFailure('admin');
      updateSecurityStatus();
      return;
    }
  }

  // 아이디 검증 (입력했을 때만)
  var finalId = creds ? creds.id : 'admin';
  if (newId) {
    var idCheck = validateLoginId(newId);
    if (!idCheck.ok) { setStatus('❌ ' + idCheck.msg, '#C62828'); return; }
    finalId = newId;
  }

  // 비밀번호 검증 (입력했을 때만)
  var finalHash = creds ? creds.pwHash : null;
  if (newPw) {
    if (newPw !== confirmPw) { setStatus('❌ 새 비밀번호 확인이 일치하지 않아요', '#C62828'); return; }
    var pwCheck = validatePasswordStrength(newPw);
    if (!pwCheck.ok) { setStatus('❌ ' + pwCheck.msg, '#C62828'); return; }
    if (!isInitialSetup && newPw === oldPw) { setStatus('❌ 새 비밀번호가 기존과 같아요', '#C62828'); return; }
    finalHash = await sha256Hash(newPw);
  }

  if (!finalHash) { setStatus('❌ 비밀번호가 설정되어 있지 않아요', '#C62828'); return; }
  if (!isInitialSetup && !newId && !newPw) { setStatus('❌ 변경할 내용이 없어요', '#C62828'); return; }

  await saveAdminCredentials({ id: finalId, pwHash: finalHash, updatedAt: Date.now() });

  if (isInitialSetup) {
    setStatus('✅ 초기 설정 완료! 다음 로그인부터 이 계정 사용', '#2E7D32');
    showToast('t1','✅ 관리자 계정 초기 설정','아이디·비밀번호가 등록되었습니다');
  } else {
    setStatus('✅ 변경 완료! 다음 로그인부터 적용됩니다', '#2E7D32');
    showToast('t1','✅ 관리자 계정 변경','아이디·비밀번호가 업데이트되었습니다');
  }

  // 입력 필드 초기화
  document.getElementById('changeAdminId').value = '';
  document.getElementById('changeAdminPwNew').value = '';
  document.getElementById('changeAdminPwOld').value = '';
  document.getElementById('changeAdminPwConfirm').value = '';
  updateSecurityStatus();
}

// 드라이버 추가 (관리자 직접)
async function adminAddDriver() {
  var name  = document.getElementById('newDriverName').value.trim();
  var phone = document.getElementById('newDriverPhone').value.trim();
  var id    = document.getElementById('newDriverId').value.trim();
  var pw    = document.getElementById('newDriverInitPw').value;
  var statusEl = document.getElementById('driverAddStatus');
  function setStatus(msg, color) { if (statusEl) { statusEl.textContent = msg; statusEl.style.color = color || '#888'; } }

  if (!name) { setStatus('❌ 이름을 입력해주세요', '#C62828'); return; }
  var idCheck = validateLoginId(id);
  if (!idCheck.ok) { setStatus('❌ ' + idCheck.msg, '#C62828'); return; }
  var pwCheck = validatePasswordStrength(pw);
  if (!pwCheck.ok) { setStatus('❌ ' + pwCheck.msg, '#C62828'); return; }

  // 중복 아이디 체크
  await loadDriverAccountsFromDB();
  await migrateDriverAccountsIfNeeded();
  if (driverAccounts.find(function(d){ return d.id === id; })) {
    setStatus('❌ 이미 사용 중인 아이디예요', '#C62828'); return;
  }

  var hash = await sha256Hash(pw);
  driverAccounts.push({
    id: id, name: name, phone: phone || '',
    pwHash: hash, approved: true, active: true,
    joinDate: new Date().toISOString().slice(0,10),
    createdBy: 'admin', createdAt: Date.now()
  });
  saveDriverAccounts();
  saveDriverAccountsToDB();
  renderDriverAccounts();
  updateDriverPendingBadge();
  setStatus('✅ ' + name + ' 추가 완료 (즉시 로그인 가능)', '#2E7D32');
  showToast('t1','✅ 드라이버 추가', name + ' (' + id + ') 등록 완료');

  // 필드 초기화
  ['newDriverName','newDriverPhone','newDriverId','newDriverInitPw'].forEach(function(eid){
    var el = document.getElementById(eid); if (el) el.value = '';
  });
}

// 드라이버 비밀번호 리셋
async function adminResetDriverPw(driverId) {
  var newPw = prompt('새 비밀번호를 입력하세요 (8자+ 영문+숫자):');
  if (!newPw) return;
  var check = validatePasswordStrength(newPw);
  if (!check.ok) { alert('❌ ' + check.msg); return; }
  var d = driverAccounts.find(function(x){ return x.id === driverId; });
  if (!d) { alert('드라이버를 찾을 수 없어요'); return; }
  d.pwHash = await sha256Hash(newPw);
  delete d.pw;
  saveDriverAccounts();
  saveDriverAccountsToDB();
  renderDriverAccounts();
  showToast('t1','✅ 비밀번호 리셋', d.name + '의 비밀번호가 변경됐어요\n새 비밀번호: ' + newPw + ' (드라이버에게 전달)');
  alert('✅ 비밀번호 변경 완료\n\n드라이버: ' + d.name + '\n새 PW: ' + newPw + '\n\n드라이버에게 직접 전달해주세요.');
}

// 드라이버 활성/비활성 토글
function adminToggleDriverActive(driverId) {
  var d = driverAccounts.find(function(x){ return x.id === driverId; });
  if (!d) return;
  d.active = d.active === false ? true : false;
  saveDriverAccounts();
  saveDriverAccountsToDB();
  renderDriverAccounts();
  showToast('t1', d.active ? '✅ 활성화' : '🔒 비활성화', d.name + ' (' + d.id + ')');
}

// 드라이버 삭제
function adminDeleteDriver(driverId) {
  var d = driverAccounts.find(function(x){ return x.id === driverId; });
  if (!d) return;
  if (!confirm('드라이버 "' + d.name + ' (' + d.id + ')"을(를) 삭제할까요?\n\n로그인 불가 상태로 즉시 변경됩니다.')) return;
  driverAccounts = driverAccounts.filter(function(x){ return x.id !== driverId; });
  saveDriverAccounts();
  saveDriverAccountsToDB();
  renderDriverAccounts();
  showToast('t1','🗑️ 삭제 완료', d.name + ' 제거됨');
}

// ===== 🔐 v106: 보안 설정 페이지 탭 전환 =====
function securityShowTab(tab) {
  // 권한 체크
  if (!isAdminMode) {
    showToast('t1','🔒 관리자 전용','관리자 로그인 후 이용 가능합니다');
    return;
  }
  ['admin','driver','franchise','status'].forEach(function(t) {
    var content = document.getElementById('secTabContent' + t.charAt(0).toUpperCase() + t.slice(1));
    var btn = document.getElementById('secTab' + t.charAt(0).toUpperCase() + t.slice(1));
    if (content) content.style.display = (t === tab) ? 'block' : 'none';
    if (btn) {
      if (t === tab) {
        btn.className = 'security-tab security-tab-active';
        btn.style.background = '#FFEB3B';
        btn.style.color = '#0F2419';
        btn.style.border = 'none';
        btn.style.fontWeight = '800';
      } else {
        btn.className = 'security-tab';
        btn.style.background = 'rgba(255,255,255,0.15)';
        btn.style.color = '#fff';
        btn.style.border = '1px solid rgba(255,255,255,0.3)';
        btn.style.fontWeight = '700';
      }
    }
  });
  // 탭별 데이터 갱신
  if (tab === 'admin') {
    getAdminCredentials().then(function(creds) {
      var lbl = document.getElementById('currentAdminIdLabel');
      if (lbl && creds) lbl.textContent = '현재 ID: ' + creds.id;
    });
  } else if (tab === 'driver') {
    renderDriverAccounts();
    updateDriverPendingBadge();
  } else if (tab === 'franchise') {
    securityRefreshFranchise();
  } else if (tab === 'status') {
    updateSecurityStatusFull();
  }
}

// 🆕 v126: 보안 설정 > 프랜차이즈 탭 새로고침
async function securityRefreshFranchise() {
  await loadFranchiseBrandsFromDB();
  await loadHqAccountsFromDB();
  var listEl = document.getElementById('securityFranchiseList');
  if (!listEl) return;
  if (franchiseHqAccounts.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:24px 12px;color:#888;font-size:12.5px;">'
      + '<div style="font-size:28px;margin-bottom:8px;">🏪</div>'
      + '등록된 본사 계정이 없습니다. 위에서 첫 브랜드를 등록해주세요.'
      + '</div>';
    return;
  }
  listEl.innerHTML = franchiseHqAccounts.map(function(acc) {
    var brand = franchiseBrands.find(function(b){ return b.id === acc.brand_id; });
    var stores = brand ? getStoresOfBrand(brand.id) : [];
    var statusColor = (brand && brand.status === 'active') ? '#3D9E6E' : '#FFA726';
    var lastLogin = acc.last_login_at ? new Date(acc.last_login_at).toLocaleString('ko-KR',{year:'2-digit',month:'numeric',day:'numeric',hour:'numeric',minute:'2-digit'}) : '미접속';
    return ''
      + '<div style="background:#fff;border:1px solid #E5E5E5;border-radius:10px;padding:14px 16px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">'
      + '<div style="flex:1;min-width:200px;">'
      +   '<div style="font-size:14px;font-weight:800;color:#1F6B40;">'
      +     '🏪 ' + escapeHtml(brand ? brand.name : '(브랜드 없음)')
      +     '<span style="background:' + statusColor + ';color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;margin-left:6px;">' + (brand ? (brand.status === 'active' ? '활성' : '일시정지') : '미연결') + '</span>'
      +   '</div>'
      +   '<div style="font-size:11px;color:#666;margin-top:3px;font-family:monospace;">@' + escapeHtml(acc.login_id) + ' · 가맹점 ' + stores.length + '개</div>'
      +   '<div style="font-size:10.5px;color:#888;margin-top:2px;">마지막 접속: ' + lastLogin + (acc.contact_name ? ' · 담당: ' + escapeHtml(acc.contact_name) : '') + '</div>'
      + '</div>'
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      +   '<button onclick="frAdminResetHqPw(\'' + acc.id + '\',\'' + escapeHtml(acc.login_id) + '\')" style="background:#FFF8E1;color:#7C5A00;border:1px solid #FFB300;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🔑 비번 리셋</button>'
      +   (brand ? '<button onclick="frAdminOpenBrand(\'' + brand.id + '\')" style="background:#EDF7F1;color:#1F6B40;border:1px solid #3D9E6E;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">⚙️ 관리</button>' : '')
      + '</div>'
      + '</div>';
  }).join('');
}

// 보안 상태 풀 갱신 (status 탭용)
function updateSecurityStatusFull() {
  // 기본 상태
  updateSecurityStatus();

  // 관리자 잠금 상세
  var adminEl = document.getElementById('adminLockInfo');
  if (adminEl) {
    var adminState = getLoginLockState('admin');
    var adminLock = isLoginLocked('admin');
    if (adminLock.locked) {
      adminEl.innerHTML = '🔒 잠금 중 (' + adminLock.remainMin + '분 남음)';
      adminEl.style.color = '#C62828';
      adminEl.style.fontWeight = '700';
    } else if (adminState.count > 0) {
      adminEl.innerHTML = '⚠️ ' + adminState.count + '회 실패 누적<br>(' + (LOGIN_ATTEMPT_MAX - adminState.count) + '회 더 실패 시 잠금)';
      adminEl.style.color = '#E65100';
      adminEl.style.fontWeight = '600';
    } else {
      adminEl.textContent = '✅ 정상';
      adminEl.style.color = '#2E7D32';
      adminEl.style.fontWeight = '600';
    }
  }

  // 드라이버 잠금 상세
  var driverEl = document.getElementById('driverLockInfo');
  if (driverEl) {
    var driverState = getLoginLockState('driver');
    var driverLock = isLoginLocked('driver');
    if (driverLock.locked) {
      driverEl.innerHTML = '🔒 잠금 중 (' + driverLock.remainMin + '분 남음)';
      driverEl.style.color = '#C62828';
      driverEl.style.fontWeight = '700';
    } else if (driverState.count > 0) {
      driverEl.innerHTML = '⚠️ ' + driverState.count + '회 실패 누적<br>(' + (LOGIN_ATTEMPT_MAX - driverState.count) + '회 더 실패 시 잠금)';
      driverEl.style.color = '#1565C0';
      driverEl.style.fontWeight = '600';
    } else {
      driverEl.textContent = '✅ 정상';
      driverEl.style.color = '#2E7D32';
      driverEl.style.fontWeight = '600';
    }
  }
}

// 사이드바 보안 뱃지 갱신 (잠금/실패가 있으면 표시)
function updateSecuritySideBadge() {
  var badge = document.getElementById('sideSecurityBadge');
  if (!badge) return;
  var adminState = getLoginLockState('admin');
  var driverState = getLoginLockState('driver');
  var adminLock = isLoginLocked('admin');
  var driverLock = isLoginLocked('driver');
  if (adminLock.locked || driverLock.locked) {
    badge.style.display = 'inline-block';
    badge.textContent = '🔒';
    badge.style.background = 'var(--red-accent)';
  } else if (adminState.count >= 3 || driverState.count >= 3) {
    badge.style.display = 'inline-block';
    badge.textContent = '!';
    badge.style.background = '#FF9800';
  } else {
    badge.style.display = 'none';
  }
}

// ===== 🔐 v105: 보안 인프라 끝 =====

// ===== 🆕 v103: QR 시트 일괄 인쇄 =====
// 라벨지: 20×20mm 정사각, A4(210×297) 13행 × 8열 = 104칸
function openQrPrintModal() {
  if (!isAdminMode) { showToast('t1', '🔒 관리자 전용', ''); return; }

  // 승인된 업체만 (가입 대기/거절 제외)
  var approvedBiz = businesses.filter(function(b) {
    return b.approved !== false && !b.deleted_at;
  }).sort(function(a, b) { return (a.name || '').localeCompare(b.name || '', 'ko'); });

  var existing = document.getElementById('qrPrintModal');
  if (existing) existing.remove();

  var listHtml = approvedBiz.length === 0
    ? '<div style="text-align:center;padding:24px;color:#888;font-size:12px;">승인된 업체가 없어요</div>'
    : approvedBiz.map(function(b) {
        return '<label style="display:flex;align-items:center;gap:10px;padding:9px 12px;background:#fff;border:1px solid #E5E5E5;border-radius:8px;cursor:pointer;font-size:13px;">'
             + '<input type="checkbox" class="qrPrintBizChk" data-id="' + b.id + '" data-name="' + (b.name || '').replace(/"/g,'&quot;') + '" checked style="width:16px;height:16px;cursor:pointer;flex-shrink:0;">'
             + '<div style="flex:1;min-width:0;">'
             + '<div style="font-weight:700;color:#0F2419;font-size:12.5px;">' + (b.name || '—') + '</div>'
             + '<div style="font-size:10.5px;color:#888;margin-top:1px;">' + (b.type || '') + '</div>'
             + '</div>'
             + '<input type="number" class="qrPrintBizQty" data-id="' + b.id + '" min="1" max="20" value="2" style="width:56px;padding:5px 7px;border:1px solid #DDD;border-radius:6px;font-size:12px;text-align:center;font-family:var(--font-body);" title="출력 매수">'
             + '<span style="font-size:10px;color:#888;">매</span>'
             + '</label>';
      }).join('');

  var modalHtml = '<div id="qrPrintModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;">'
    + '<div style="background:#fff;border-radius:16px;max-width:560px;width:100%;max-height:92vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'
    + '<div style="background:linear-gradient(135deg,#0F2419,#1F4D30);padding:18px 22px;color:#fff;display:flex;align-items:center;justify-content:space-between;">'
    + '<div>'
    + '<div style="font-size:16px;font-weight:800;letter-spacing:-0.02em;">🏷️ QR 스티커 일괄 인쇄</div>'
    + '<div style="font-size:11px;color:#B8E5BB;margin-top:2px;">폼텍 QRP-3990 방수 라벨 (40×40mm · A4 28칸)</div>'
    + '</div>'
    + '<button onclick="document.getElementById(\'qrPrintModal\').remove()" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;width:32px;height:32px;font-size:18px;cursor:pointer;">×</button>'
    + '</div>'

    + '<div style="padding:14px 22px;background:#F4F8F2;border-bottom:1px solid #E5E5E5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
    + '<button onclick="qrPrintSelectAll(true)" style="background:#0F2419;color:#FFEB3B;border:none;border-radius:7px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">✅ 전체 선택</button>'
    + '<button onclick="qrPrintSelectAll(false)" style="background:#fff;color:#0F2419;border:1px solid #0F2419;border-radius:7px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--font-body);">전체 해제</button>'
    + '<div style="margin-left:auto;display:flex;align-items:center;gap:6px;font-size:11px;color:#5C7466;">'
    + '<span>시작 위치:</span>'
    + '<input type="number" id="qrPrintStartPos" min="1" max="28" value="1" style="width:54px;padding:5px 7px;border:1px solid #DDD;border-radius:6px;font-size:12px;text-align:center;font-family:var(--font-body);" title="이미 일부 사용한 라벨지면 빈 위치 번호 입력">'
    + '<span>/ 28</span>'
    + '</div>'
    + '</div>'

    + '<div style="flex:1;overflow-y:auto;padding:14px 22px;display:flex;flex-direction:column;gap:6px;">'
    + listHtml
    + '</div>'

    + '<div style="padding:14px 22px;border-top:1px solid #E5E5E5;background:#FAFBF9;display:flex;align-items:center;gap:10px;">'
    + '<div style="flex:1;font-size:11px;color:#5C7466;line-height:1.5;">'
    + '💡 <strong>매수</strong>: 한 업체당 인쇄할 라벨 수<br>'
    + '💡 <strong>시작 위치</strong>: 라벨지 빈 칸부터 인쇄 (1~28)'
    + '</div>'
    + '<button onclick="generateQrPrintSheet()" style="background:#0F2419;color:#FFEB3B;border:none;border-radius:10px;padding:11px 22px;font-size:13px;font-weight:800;cursor:pointer;font-family:var(--font-body);">🖨️ 인쇄 미리보기</button>'
    + '</div>'

    + '</div></div>';

  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function qrPrintSelectAll(checked) {
  document.querySelectorAll('.qrPrintBizChk').forEach(function(cb) { cb.checked = checked; });
}

function generateQrPrintSheet() {
  // 선택된 업체 + 매수 수집
  var checks = document.querySelectorAll('.qrPrintBizChk:checked');
  if (checks.length === 0) { alert('인쇄할 업체를 1개 이상 선택해주세요'); return; }

  var items = [];
  checks.forEach(function(cb) {
    var bizId = cb.getAttribute('data-id');
    var bizName = cb.getAttribute('data-name');
    var qtyEl = document.querySelector('.qrPrintBizQty[data-id="' + bizId + '"]');
    var qty = qtyEl ? Math.max(1, Math.min(20, parseInt(qtyEl.value) || 1)) : 1;
    for (var i = 0; i < qty; i++) {
      items.push({ bizId: bizId, bizName: bizName });
    }
  });

  // 시작 위치 (라벨지 빈 칸부터 인쇄)
  var startPosEl = document.getElementById('qrPrintStartPos');
  var startPos = startPosEl ? Math.max(1, Math.min(28, parseInt(startPosEl.value) || 1)) : 1;
  var blankCount = startPos - 1; // 비어있을 빈 칸 수

  // 새 창에 인쇄용 페이지 열기
  openQrPrintWindow(items, blankCount);

  // 모달 닫기
  var modal = document.getElementById('qrPrintModal');
  if (modal) modal.remove();
}

function openQrPrintWindow(items, blankCount) {
  // 인쇄용 URL 생성 함수 (각 업체별)
  function makeBizUrl(bizId, bizName) {
    var base = 'https://cocodss7-cell.github.io./';
    var safeName = encodeURIComponent(bizName || '');
    return base + '#stock?biz=' + encodeURIComponent(bizId) + '&name=' + safeName;
  }

  // 빈 칸 + 실제 칸 합쳐서 셀 데이터 생성
  var cells = [];
  for (var i = 0; i < blankCount; i++) cells.push(null); // 빈 칸
  items.forEach(function(it) { cells.push(it); });

  // A4 1매 = 28칸 (4열 × 7행), 부족하면 다음 페이지
  var pages = [];
  for (var i = 0; i < cells.length; i += 28) {
    pages.push(cells.slice(i, i + 28));
  }
  // 마지막 페이지 28칸 채우기 (빈 칸)
  if (pages.length > 0) {
    while (pages[pages.length - 1].length < 28) pages[pages.length - 1].push(null);
  }

  // QR 이미지 URL 빌더 (qrserver API) — 40mm 인쇄용 고해상도
  function qrImgUrl(url) {
    return 'https://api.qrserver.com/v1/create-qr-code/?size=600x600&ecc=H&margin=0&data=' + encodeURIComponent(url);
  }

  // 인쇄용 HTML 생성
  var pagesHtml = pages.map(function(page, pageIdx) {
    var cellsHtml = page.map(function(cell, cellIdx) {
      if (!cell) {
        return '<div class="qr-cell qr-cell-empty"></div>';
      }
      var url = makeBizUrl(cell.bizId, cell.bizName);
      var img = qrImgUrl(url);
      return '<div class="qr-cell">'
           + '<img src="' + img + '" alt="QR" />'
           + '<div class="qr-label">' + escapeHtml(cell.bizName || '') + '</div>'
           + '</div>';
    }).join('');
    return '<div class="qr-page">' + cellsHtml + '</div>';
  }).join('');

  // HTML escape 헬퍼
  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, function(c) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c];
    });
  }

  var html = '<!DOCTYPE html>'
    + '<html><head>'
    + '<meta charset="UTF-8">'
    + '<title>식용유니버스 QR 시트 — 폼텍 QR-3111</title>'
    + '<style>'
    + '@page { size: A4 portrait; margin: 0; }'
    + '* { box-sizing: border-box; }'
    + 'body { margin: 0; padding: 0; font-family: "Pretendard", "Apple SD Gothic Neo", -apple-system, sans-serif; background: #f4f4f4; }'
    + '.toolbar { position: fixed; top: 0; left: 0; right: 0; background: #0F2419; color: #FFEB3B; padding: 14px 24px; display: flex; align-items: center; gap: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); z-index: 1000; }'
    + '.toolbar-title { font-size: 14px; font-weight: 800; flex: 1; }'
    + '.toolbar button { background: #FFEB3B; color: #0F2419; border: none; border-radius: 8px; padding: 8px 18px; font-size: 13px; font-weight: 800; cursor: pointer; font-family: inherit; }'
    + '.toolbar button.secondary { background: rgba(255,255,255,0.15); color: #fff; }'
    + '.content { padding: 80px 20px 40px; }'
    /* A4 페이지: 210mm × 297mm — QRP-3990: 4열 × 7행 = 28칸 (v116: 명시적 40mm로 누적 오차 제거) */
    + '.qr-page { width: 210mm; height: 297mm; background: #fff; margin: 0 auto 24px; padding: 8.5mm 25mm; display: grid; grid-template-columns: repeat(4, 40mm); grid-template-rows: repeat(7, 40mm); gap: 0; page-break-after: always; box-shadow: 0 4px 24px rgba(0,0,0,0.1); position: relative; overflow: hidden; }'
    + '.qr-page:last-child { page-break-after: auto; }'
    /* 각 라벨 칸: 40×40mm (그리드와 정확히 일치) */
    + '.qr-cell { width: 40mm; height: 40mm; display: flex; flex-direction: column; align-items: center; justify-content: center; overflow: hidden; padding: 1mm; position: relative; box-sizing: border-box; }'
    + '.qr-cell-empty { background: transparent; }'
    + '.qr-cell img { width: 30mm; height: 30mm; display: block; image-rendering: -webkit-optimize-contrast; image-rendering: crisp-edges; }'
    + '.qr-label { font-size: 7pt; font-weight: 700; color: #0F2419; text-align: center; line-height: 1.15; margin-top: 1mm; max-width: 36mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; letter-spacing: -0.02em; }'
    /* 🆕 v118: 폼텍 QRP-3990 실측 보정 — 라벨지가 비대칭이라 열마다 시프트값이 다름 */
    + '.qr-cell:nth-child(4n+1) { transform: translateX(-4mm); }'
    + '.qr-cell:nth-child(4n+2) { transform: translateX(-3mm); }'
    + '.qr-cell:nth-child(4n+3) { transform: translateX(2mm); }'
    + '.qr-cell:nth-child(4n+0) { transform: translateX(3mm); }'
    /* 인쇄용 미디어 쿼리 */
    + '@media print {'
    + '  body { background: #fff; }'
    + '  .toolbar, #printGuide, #offsetPanel { display: none !important; }'
    + '  .content { padding: 0; }'
    + '  .qr-page { margin: 0; box-shadow: none; page-break-after: always; }'
    + '  .qr-page:last-child { page-break-after: auto; }'
    + '}'
    + '@media screen and (max-width: 900px) {'
    + '  .qr-page { transform: scale(0.5); transform-origin: top center; margin-bottom: -150mm; }'
    + '}'
    + '</style></head>'
    + '<body>'
    + '<div class="toolbar">'
    + '<div class="toolbar-title">🏷️ QR 스티커 — 폼텍 QRP-3990 (' + items.length + '장 · ' + pages.length + '페이지)</div>'
    + '<button class="secondary" onclick="document.getElementById(\'printGuide\').style.display=document.getElementById(\'printGuide\').style.display===\'none\'?\'block\':\'none\'">📋 인쇄 가이드</button>'
    + '<button class="secondary" onclick="window.close()">닫기</button>'
    + '<button onclick="window.print()">🖨️ 인쇄</button>'
    + '</div>'
    + '<div id="printGuide" style="position:fixed;top:60px;left:50%;transform:translateX(-50%);max-width:560px;width:calc(100% - 40px);background:#FFF8E1;border:2px solid #FFB300;border-radius:12px;padding:18px 22px;box-shadow:0 8px 32px rgba(0,0,0,0.18);z-index:999;font-size:13px;line-height:1.7;color:#0F2419;display:none;">'
    + '<div style="font-weight:800;font-size:15px;margin-bottom:10px;display:flex;align-items:center;gap:6px;">⚠️ 라벨 정확히 맞추는 인쇄 설정 <span style="margin-left:auto;font-size:11px;color:#888;cursor:pointer;" onclick="document.getElementById(\'printGuide\').style.display=\'none\'">✕ 닫기</span></div>'
    + '<div><b>1. 인쇄 다이얼로그 열기</b> → 우측 상단 <b>🖨️ 인쇄</b> 버튼 클릭</div>'
    + '<div><b>2. 용지 크기</b>: <b>A4</b> (반드시)</div>'
    + '<div><b>3. 여백</b>: <b>없음</b> (Chrome: 추가 설정 → 여백 → 없음)</div>'
    + '<div><b>4. 배율</b>: <b>100%</b> 또는 "실제 크기" (자동 맞춤 OFF)</div>'
    + '<div><b>5. 헤더·바닥글</b>: OFF (체크 해제)</div>'
    + '<div><b>6. 양면 인쇄</b>: 단면만</div>'
    + '<div style="margin-top:10px;padding-top:10px;border-top:1px dashed #FFB300;color:#7A4F00;font-size:12px;">'
    + '💡 <b>여전히 잘릴 때</b>: 아래 <b>📐 미세조정</b> 패널에서 좌우/상하 슬라이더로 1mm 단위 조정 가능. 시험 인쇄 후 잘리는 방향과 반대로 슬라이더 조정 → 재인쇄.'
    + '</div>'
    + '</div>'
    /* 🆕 v117: 미세조정 슬라이더 패널 */
    + '<div id="offsetPanel" style="position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0F2419;color:#FFEB3B;padding:14px 22px;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:998;display:flex;gap:18px;align-items:center;font-size:12px;font-family:inherit;flex-wrap:wrap;justify-content:center;max-width:calc(100% - 40px);">'
    + '<div style="font-weight:800;font-size:13px;">📐 미세조정</div>'
    + '<div style="display:flex;flex-direction:column;gap:3px;min-width:170px;">'
    + '<div style="font-size:10.5px;opacity:0.85;display:flex;justify-content:space-between;">← 좌우 → <span id="hOffsetVal" style="color:#fff;font-weight:700;">0mm</span></div>'
    + '<input type="range" id="hOffset" min="-5" max="5" step="0.5" value="0" style="width:170px;accent-color:#FFEB3B;">'
    + '</div>'
    + '<div style="display:flex;flex-direction:column;gap:3px;min-width:170px;">'
    + '<div style="font-size:10.5px;opacity:0.85;display:flex;justify-content:space-between;">↑ 상하 ↓ <span id="vOffsetVal" style="color:#fff;font-weight:700;">0mm</span></div>'
    + '<input type="range" id="vOffset" min="-5" max="5" step="0.5" value="0" style="width:170px;accent-color:#FFEB3B;">'
    + '</div>'
    + '<button onclick="resetOffsets()" style="background:rgba(255,235,59,0.2);color:#FFEB3B;border:1px solid #FFEB3B;border-radius:7px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit;">🔄 리셋</button>'
    + '</div>'
    + '<div class="content">'
    + pagesHtml
    + '</div>'
    + '<script>'
    /* QR 이미지가 모두 로드된 후 자동 인쇄 다이얼로그는 띄우지 않음 (사용자가 직접 클릭) */
    + 'function applyOffsets(){'
    + '  var h=parseFloat(document.getElementById("hOffset").value)||0;'
    + '  var v=parseFloat(document.getElementById("vOffset").value)||0;'
    + '  document.getElementById("hOffsetVal").textContent=(h>0?"+":"")+h+"mm";'
    + '  document.getElementById("vOffsetVal").textContent=(v>0?"+":"")+v+"mm";'
    + '  var pages=document.querySelectorAll(".qr-page");'
    + '  for(var i=0;i<pages.length;i++){'
    + '    pages[i].style.paddingTop=(8.5+v)+"mm";'
    + '    pages[i].style.paddingBottom=(8.5-v)+"mm";'
    + '    pages[i].style.paddingLeft=(25+h)+"mm";'
    + '    pages[i].style.paddingRight=(25-h)+"mm";'
    + '  }'
    + '  try{localStorage.setItem("hiveoil_qr_offset",JSON.stringify({h:h,v:v}));}catch(e){}'
    + '}'
    + 'function resetOffsets(){'
    + '  document.getElementById("hOffset").value=0;'
    + '  document.getElementById("vOffset").value=0;'
    + '  applyOffsets();'
    + '}'
    + 'window.addEventListener("load",function(){'
    + '  try{var saved=JSON.parse(localStorage.getItem("hiveoil_qr_offset")||"null");'
    + '    if(saved){'
    + '      document.getElementById("hOffset").value=saved.h||0;'
    + '      document.getElementById("vOffset").value=saved.v||0;'
    + '    }'
    + '  }catch(e){}'
    + '  document.getElementById("hOffset").addEventListener("input",applyOffsets);'
    + '  document.getElementById("vOffset").addEventListener("input",applyOffsets);'
    + '  applyOffsets();'
    + '  console.log("[QR Print] 페이지 로딩 완료. 미세조정 슬라이더로 위치를 조정 후 인쇄해주세요.");'
    + '});'
    + '<\/script>'
    + '</body></html>';

  var win = window.open('', '_blank');
  if (!win) {
    alert('팝업이 차단됐어요. 팝업 허용 후 다시 시도해주세요.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ════════════════════════════════════════════════════════════════════
// 🏪 v119+ 프랜차이즈 시스템 — 핵심 함수들
// ════════════════════════════════════════════════════════════════════

// 전역 상태
var franchiseBrands = [];        // 브랜드 마스터 (캐시)
var franchiseHqAccounts = [];    // 본사 계정 (캐시)
var hqLoggedIn = false;          // 본사 로그인 상태
var hqBrandId = null;            // 본사 로그인 시 자기 브랜드 ID
var hqAccountId = null;          // 본사 계정 ID

// ───── 브랜드 CRUD ─────
async function loadFranchiseBrandsFromDB() {
  try {
    var r = await db.from('franchise_brands').select('*').order('created_at', { ascending: true });
    if (r.error) throw r.error;
    franchiseBrands = (r.data || []).filter(function(b){ return b.status !== 'terminated'; });
    return franchiseBrands;
  } catch(e) {
    console.warn('브랜드 로드 실패:', e.message);
    return [];
  }
}

async function createFranchiseBrand(brand) {
  try {
    var r = await db.from('franchise_brands').insert([brand]).select().single();
    if (r.error) throw r.error;
    franchiseBrands.push(r.data);
    return r.data;
  } catch(e) {
    console.error('브랜드 생성 실패:', e);
    throw e;
  }
}

async function updateFranchiseBrand(id, patch) {
  try {
    var r = await db.from('franchise_brands').update(patch).eq('id', id).select().single();
    if (r.error) throw r.error;
    var idx = franchiseBrands.findIndex(function(b){ return b.id === id; });
    if (idx >= 0) franchiseBrands[idx] = r.data;
    return r.data;
  } catch(e) {
    console.error('브랜드 업데이트 실패:', e);
    throw e;
  }
}

async function deleteFranchiseBrand(id) {
  // 소속 가맹점들의 franchise_brand_id를 NULL로
  try { await db.from('businesses').update({ franchise_brand_id: null }).eq('franchise_brand_id', id); } catch(e) {}
  // HQ 계정 삭제 (CASCADE 자동)
  try {
    var r = await db.from('franchise_brands').delete().eq('id', id);
    if (r.error) throw r.error;
    franchiseBrands = franchiseBrands.filter(function(b){ return b.id !== id; });
  } catch(e) {
    console.error('브랜드 삭제 실패:', e);
    throw e;
  }
}

// ───── HQ 계정 CRUD ─────
async function loadHqAccountsFromDB() {
  try {
    var r = await db.from('franchise_hq_accounts').select('*');
    if (r.error) throw r.error;
    franchiseHqAccounts = r.data || [];
    return franchiseHqAccounts;
  } catch(e) {
    console.warn('HQ 계정 로드 실패:', e.message);
    return [];
  }
}

async function createHqAccount(brandId, loginId, plainPw, contactName) {
  var idCheck = validateLoginId(loginId);
  if (!idCheck.ok) throw new Error(idCheck.msg);
  var pwCheck = validatePasswordStrength(plainPw);
  if (!pwCheck.ok) throw new Error(pwCheck.msg);
  var hash = await sha256Hash(plainPw);
  var newAccount = {
    brand_id: brandId,
    login_id: loginId,
    pw_hash: hash,
    contact_name: contactName || null,
    is_active: true
  };
  try {
    var r = await db.from('franchise_hq_accounts').insert([newAccount]).select().single();
    if (r.error) throw r.error;
    franchiseHqAccounts.push(r.data);
    return r.data;
  } catch(e) {
    console.error('HQ 계정 생성 실패:', e);
    throw e;
  }
}

async function resetHqAccountPassword(accountId, newPlainPw) {
  var pwCheck = validatePasswordStrength(newPlainPw);
  if (!pwCheck.ok) throw new Error(pwCheck.msg);
  var hash = await sha256Hash(newPlainPw);
  try {
    var r = await db.from('franchise_hq_accounts').update({ pw_hash: hash }).eq('id', accountId).select().single();
    if (r.error) throw r.error;
    var idx = franchiseHqAccounts.findIndex(function(a){ return a.id === accountId; });
    if (idx >= 0) franchiseHqAccounts[idx] = r.data;
    return r.data;
  } catch(e) {
    console.error('HQ 비번 리셋 실패:', e);
    throw e;
  }
}

async function deleteHqAccount(accountId) {
  try {
    var r = await db.from('franchise_hq_accounts').delete().eq('id', accountId);
    if (r.error) throw r.error;
    franchiseHqAccounts = franchiseHqAccounts.filter(function(a){ return a.id !== accountId; });
  } catch(e) {
    console.error('HQ 계정 삭제 실패:', e);
    throw e;
  }
}

// ───── 본사 로그인 ─────
async function hqLogin(loginId, plainPw) {
  // 잠금 체크
  var lockState = isLoginLocked('hq');
  if (lockState.locked) {
    return { ok: false, msg: '🔒 너무 많이 실패했어요. ' + lockState.remainMin + '분 후 다시 시도해주세요.' };
  }

  await loadHqAccountsFromDB();
  await loadFranchiseBrandsFromDB();

  var account = franchiseHqAccounts.find(function(a){ return a.login_id === loginId && a.is_active !== false; });
  if (!account) {
    recordLoginFailure('hq');
    return { ok: false, msg: '아이디 또는 비밀번호가 맞지 않아요' };
  }
  var inputHash = await sha256Hash(plainPw);
  if (inputHash !== account.pw_hash) {
    var state = recordLoginFailure('hq');
    var remain = LOGIN_ATTEMPT_MAX - state.count;
    if (state.lockUntil && Date.now() < state.lockUntil) {
      return { ok: false, msg: '🔒 5회 연속 실패 → 5분 잠금' };
    }
    return { ok: false, msg: '아이디 또는 비밀번호가 맞지 않아요 (남은 시도: ' + remain + '회)' };
  }
  var brand = franchiseBrands.find(function(b){ return b.id === account.brand_id; });
  if (!brand) {
    return { ok: false, msg: '연결된 브랜드를 찾을 수 없어요. 관리자에게 문의해주세요.' };
  }
  if (brand.status !== 'active') {
    return { ok: false, msg: '계약이 일시정지 또는 종료된 브랜드입니다. 관리자에게 문의해주세요.' };
  }

  // 로그인 성공
  clearLoginFailure('hq');
  setSession('hq');
  hqLoggedIn = true;
  hqBrandId = brand.id;
  hqAccountId = account.id;
  try { localStorage.setItem('hiveoil_hq_session', JSON.stringify({ brandId: brand.id, accountId: account.id, ts: Date.now() })); } catch(e) {}
  try { await db.from('franchise_hq_accounts').update({ last_login_at: new Date().toISOString() }).eq('id', account.id); } catch(e) {}
  return { ok: true, brand: brand, account: account };
}

function hqLogout() {
  hqLoggedIn = false;
  hqBrandId = null;
  hqAccountId = null;
  try { localStorage.removeItem('hiveoil_hq_session'); } catch(e) {}
  try { localStorage.removeItem('hiveoil_session'); } catch(e) {}
}

function restoreHqSessionIfValid() {
  try {
    var raw = localStorage.getItem('hiveoil_hq_session');
    if (!raw) return false;
    var s = JSON.parse(raw);
    var session = JSON.parse(localStorage.getItem('hiveoil_session') || 'null');
    if (!session || session.expiresAt < Date.now()) {
      localStorage.removeItem('hiveoil_hq_session');
      return false;
    }
    if (session.role !== 'hq') return false;
    hqLoggedIn = true;
    hqBrandId = s.brandId;
    hqAccountId = s.accountId;
    return true;
  } catch(e) {
    return false;
  }
}

// ───── 브랜드 조회 헬퍼 ─────
function getBrandById(id) {
  return franchiseBrands.find(function(b){ return b.id === id; });
}
function getStoresOfBrand(brandId) {
  return businesses.filter(function(b){
    return b.tenantType === 'franchise_store' && b.franchiseBrandId === brandId;
  });
}
function getActiveStoresOfBrand(brandId) {
  return getStoresOfBrand(brandId).filter(function(b){ return b.approved !== false; });
}

// ───── 가맹점 → 브랜드 가격 적용 (Phase 2에서 실제 적용, 일단 표시만) ─────
function getEffectiveOilPrice(biz, oilType) {
  // 일반 가맹점 → PRICES.oils[oilType].price
  // 가맹점이고 브랜드에 협상가가 있으면 → 협상가
  var brandId = biz && biz.franchiseBrandId;
  if (brandId) {
    var brand = getBrandById(brandId);
    if (brand) {
      var contractField = 'contract_oil_price_' + oilType;
      if (brand[contractField]) return brand[contractField];
    }
  }
  return (PRICES.oils[oilType] && PRICES.oils[oilType].price) || 0;
}

// ════════════════════════════════════════════════════════════════════
// 🏪 v126: 관리자 — 프랜차이즈 관리 페이지 (필터 + 매장 현황)
// ════════════════════════════════════════════════════════════════════

// 현재 필터 상태 (null = 전체, brandId = 특정 브랜드)
var frAdminFilterBrandId = null;

function toggleFrAdminNewBrand() {
  // v126: 신규 브랜드 등록은 보안 설정으로 이동
  // 이전 코드와의 호환성을 위해 함수 유지하되 보안 설정 패널로 안내
  showPanel('security', null);
  setTimeout(function(){ securityShowTab('franchise'); }, 100);
}

async function frAdminRefresh() {
  await loadFranchiseBrandsFromDB();
  await loadHqAccountsFromDB();
  renderFranchiseAdminPage();
}

function renderFranchiseAdminPage() {
  var el = function(id){ return document.getElementById(id); };

  // ── 1. 필터 칩 렌더 ──
  var chipsEl = el('frAdminBrandFilterChips');
  if (chipsEl) {
    var chips = '<button onclick="frAdminSetFilter(null)" class="frChip" style="background:' + (frAdminFilterBrandId === null ? 'var(--green-dark)' : 'var(--gray-light)') + ';color:' + (frAdminFilterBrandId === null ? '#fff' : 'var(--gray)') + ';border:none;border-radius:8px;padding:6px 12px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">🌐 전체</button>';
    chips += franchiseBrands.map(function(b) {
      var active = frAdminFilterBrandId === b.id;
      return '<button onclick="frAdminSetFilter(\'' + b.id + '\')" class="frChip" style="background:' + (active ? 'var(--green-dark)' : 'var(--green-pale)') + ';color:' + (active ? '#fff' : 'var(--green-dark)') + ';border:' + (active ? 'none' : '1px solid var(--green-main)') + ';border-radius:8px;padding:6px 12px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:inherit;">🏪 ' + escapeHtml(b.name) + ' <span style="opacity:0.7;font-weight:600;">(' + getStoresOfBrand(b.id).length + ')</span></button>';
    }).join('');
    chipsEl.innerHTML = chips;
  }

  // ── 2. 필터에 따라 매장 집합 결정 ──
  var allStores = businesses.filter(function(b){ return b.tenantType === 'franchise_store' && b.franchiseBrandId; });
  var filteredStores = frAdminFilterBrandId === null
    ? allStores
    : allStores.filter(function(b){ return b.franchiseBrandId === frAdminFilterBrandId; });

  // 검색어 적용
  var searchInput = el('frAdminStoresSearch');
  var searchKw = searchInput ? searchInput.value.trim().toLowerCase() : '';
  var searchedStores = searchKw === '' ? filteredStores : filteredStores.filter(function(b) {
    return (b.name || '').toLowerCase().indexOf(searchKw) >= 0
        || (b.storeCode || '').toLowerCase().indexOf(searchKw) >= 0
        || (b.owner || '').toLowerCase().indexOf(searchKw) >= 0;
  });

  // ── 3. 통계 KPI 렌더 ──
  var kpiEl = el('frAdminKpiArea');
  if (kpiEl) {
    var nowMonth = new Date().toISOString().slice(0,7);
    var monthHist = historyData.filter(function(h) {
      var sid = String(h.bizId);
      var isMyStore = filteredStores.some(function(s){ return String(s.id) === sid; });
      return isMyStore && (h.rawDate||'').startsWith(nowMonth);
    });
    var monthOrders = monthHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; }).length;
    var monthWaste = monthHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(s,h){ return s + (h.qty||0); }, 0);
    var monthCO2 = Math.round(monthWaste * 16.5 * 0.7 * 10) / 10;

    // 🆕 v136: 누적 폐유 수거 → CO2 감축 + ESG 포인트
    var allHist = historyData.filter(function(h){
      var sid = String(h.bizId);
      return filteredStores.some(function(s){ return String(s.id) === sid; });
    });
    var totalWasteCans = allHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(s,h){ return s + (h.qty||0); }, 0);
    var totalWasteKg = Math.round(totalWasteCans * 16.5);
    var totalCO2 = Math.round(totalWasteKg * 0.7 * 10) / 10;
    var totalEsgPts = Math.round(totalWasteKg * 12.5);  // 1kg당 12.5pt (예시 환산)

    // 🆕 v129/v132: 승인 대기 가맹점 알림 (KPI 위)
    //   - businesses.approved=false (CSV 일괄로 등록되었으나 대기)
    //   - pending_biz의 franchise_store 신청 (자율 가입)
    var pendingBizCount = filteredStores.filter(function(s){ return s.approved === false; }).length;
    var pendingSignupCount = (typeof pendingBizData !== 'undefined' ? pendingBizData : []).filter(function(p) {
      if (p.tenant_type !== 'franchise_store') return false;
      if (frAdminFilterBrandId && p.franchise_brand_id !== frAdminFilterBrandId) return false;
      return true;
    }).length;
    var pendingCount = pendingBizCount + pendingSignupCount;
    var pendingHtml = pendingCount > 0
      ? '<div style="grid-column:1/-1;background:linear-gradient(135deg,#FFB300,#FF9500);border-radius:12px;padding:14px 18px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:0;">'
        + '<div>'
        +   '<div style="font-size:10.5px;font-weight:800;letter-spacing:0.08em;opacity:0.9;">⏳ PENDING APPROVAL</div>'
        +   '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;margin-top:2px;">' + pendingCount + '개 가맹점 가입 승인 대기' + (pendingSignupCount > 0 ? ' <span style="font-size:11px;opacity:0.85;">(자율가입 ' + pendingSignupCount + ')</span>' : '') + '</div>'
        + '</div>'
        + '<button onclick="frAdminShowPendingModal()" style="background:#fff;color:#7A4F00;border:none;border-radius:7px;padding:8px 14px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;">📋 검토하기</button>'
        + '</div>'
      : '';

    var headerTxt = frAdminFilterBrandId === null
      ? '<span style="color:var(--gray);font-weight:700;">전체</span>'
      : (function(){ var b = getBrandById(frAdminFilterBrandId); return '<span style="color:var(--green-dark);font-weight:800;">🏪 ' + escapeHtml(b ? b.name : '?') + '</span>'; })();

    kpiEl.innerHTML = pendingHtml
      + _frAdminKpi('등록 브랜드', frAdminFilterBrandId === null ? franchiseBrands.length + '개' : '1개', frAdminFilterBrandId === null ? '활성 ' + franchiseBrands.filter(function(b){return b.status==='active';}).length + '개' : headerTxt)
      + _frAdminKpi('가맹점 수', filteredStores.length + '개', '활성 ' + filteredStores.filter(function(s){return s.approved !== false;}).length + '개')
      + _frAdminKpi('📊 이번달 발주', monthOrders + '건', '브랜드 합계')
      + _frAdminKpi('♻️ 이번달 폐유', monthWaste + '캔', monthCO2 + 'kg CO₂ 절감')
      + _frAdminKpi('🌍 누적 CO₂ 감축', totalCO2.toLocaleString() + 'kg', '누적 폐유 ' + totalWasteKg.toLocaleString() + 'kg')
      + _frAdminKpi('🌱 누적 ESG 포인트', totalEsgPts.toLocaleString() + 'pt', '바이오디젤 ' + Math.round(totalWasteKg * 0.9).toLocaleString() + 'L 전환');
  }

  // ── 4. 매장 재고 현황 표 ──
  var titleEl = el('frAdminStoresTitle');
  var subTitleEl = el('frAdminStoresSubtitle');
  if (titleEl && subTitleEl) {
    if (frAdminFilterBrandId === null) {
      titleEl.innerHTML = '🏪 가맹점 재고 현황 (전체 · ' + searchedStores.length + '개)';
      subTitleEl.textContent = '전체 브랜드 가맹점의 식용유·폐유 재고와 이번 달 활동을 한눈에';
    } else {
      var brand = getBrandById(frAdminFilterBrandId);
      titleEl.innerHTML = '🏪 ' + escapeHtml(brand ? brand.name : '?') + ' 가맹점 (' + searchedStores.length + '개)';
      subTitleEl.textContent = '브랜드별 상세 관리는 [⚙️ 브랜드 관리] 버튼으로 진입';
    }
  }

  var listEl = el('frAdminStoresInventory');
  if (listEl) {
    if (searchedStores.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:36px 16px;color:var(--gray);">'
        + '<div style="font-size:36px;margin-bottom:10px;">🏪</div>'
        + (allStores.length === 0
            ? '아직 등록된 가맹점이 없어요. [➕ 새 브랜드 등록]에서 시작해주세요.'
            : (searchKw ? '"' + escapeHtml(searchKw) + '"에 해당하는 매장이 없어요' : '필터된 매장이 없어요'))
        + '</div>';
    } else {
      var nowMonth = new Date().toISOString().slice(0,7);
      var rows = searchedStores.map(function(s) {
        var brand = getBrandById(s.franchiseBrandId);
        var sHist = historyData.filter(function(h){ return String(h.bizId) === String(s.id) && (h.rawDate||'').startsWith(nowMonth); });
        var sOrders = sHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; }).length;
        var sWaste = sHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(t,h){ return t + (h.qty||0); }, 0);
        // 재고 상태 색상
        var newOilColor = s.newOil <= 2 ? '#C62828' : s.newOil <= 4 ? '#FF9800' : '#3D9E6E';
        var wasteOilColor = s.wasteOil >= 3 ? '#C62828' : s.wasteOil >= 2 ? '#FF9800' : '#999';
        return '<tr style="border-bottom:1px solid var(--gray-light);">'
          + '<td style="padding:9px 8px;font-weight:700;font-size:12.5px;">' + escapeHtml(s.name) + (s.auto ? '<span style="font-size:9px;color:var(--green-main);margin-left:5px;">⚡</span>' : '') + '</td>'
          + '<td style="padding:9px 8px;font-size:11px;color:var(--green-dark);font-weight:700;">' + escapeHtml(brand ? brand.name : '-') + '</td>'
          + '<td style="padding:9px 8px;font-size:10.5px;color:var(--gray);">' + (s.storeCode ? escapeHtml(s.storeCode) : '—') + '</td>'
          + '<td style="padding:9px 8px;text-align:right;"><span style="color:' + newOilColor + ';font-weight:800;font-size:13px;">' + s.newOil + '</span><span style="font-size:9.5px;color:var(--gray);">캔</span></td>'
          + '<td style="padding:9px 8px;text-align:right;"><span style="color:' + wasteOilColor + ';font-weight:800;font-size:13px;">' + s.wasteOil + '</span><span style="font-size:9.5px;color:var(--gray);">캔</span></td>'
          + '<td style="padding:9px 8px;text-align:right;font-weight:700;color:var(--green-dark);">' + sOrders + '</td>'
          + '<td style="padding:9px 8px;text-align:right;font-weight:700;color:#26A69A;">' + sWaste + '캔</td>'
          + '<td style="padding:9px 8px;font-size:10.5px;color:var(--gray);">' + escapeHtml((s.addr || '—').substring(0, 25)) + (s.addr && s.addr.length > 25 ? '…' : '') + '</td>'
          + '</tr>';
      }).join('');
      listEl.innerHTML = '<div style="overflow-x:auto;">'
        + '<table style="width:100%;font-size:12px;border-collapse:collapse;">'
        + '<thead><tr style="background:var(--green-pale);color:var(--green-dark);">'
        +   '<th style="padding:10px 8px;text-align:left;">매장명</th>'
        +   '<th style="padding:10px 8px;text-align:left;">브랜드</th>'
        +   '<th style="padding:10px 8px;text-align:left;">코드</th>'
        +   '<th style="padding:10px 8px;text-align:right;">🫙 식용유</th>'
        +   '<th style="padding:10px 8px;text-align:right;">♻️ 폐유</th>'
        +   '<th style="padding:10px 8px;text-align:right;">월 발주</th>'
        +   '<th style="padding:10px 8px;text-align:right;">월 폐유</th>'
        +   '<th style="padding:10px 8px;text-align:left;">주소</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table>'
        + '<div style="margin-top:10px;font-size:10.5px;color:var(--gray);text-align:right;">'
        +   '식용유: <span style="color:#C62828;font-weight:700;">≤2 위험</span> · <span style="color:#FF9800;font-weight:700;">≤4 주의</span> · <span style="color:#3D9E6E;font-weight:700;">정상</span> &nbsp; | &nbsp; 폐유: <span style="color:#C62828;font-weight:700;">≥3 수거 필요</span>'
        + '</div>'
        + '</div>';
    }
  }

  // ── 5. 필터된 브랜드 단축 진입 카드 ──
  var shortcutEl = el('frAdminBrandShortcut');
  if (shortcutEl) {
    if (frAdminFilterBrandId !== null) {
      var brand = getBrandById(frAdminFilterBrandId);
      var hqAccount = franchiseHqAccounts.find(function(a){ return a.brand_id === frAdminFilterBrandId; });
      shortcutEl.style.display = 'block';
      shortcutEl.innerHTML = '<div class="card"><div style="padding:18px 22px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">'
        + '<div>'
        +   '<div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--green-dark);">⚙️ ' + escapeHtml(brand ? brand.name : '?') + ' 브랜드 상세 관리</div>'
        +   '<div style="font-size:11.5px;color:var(--gray);margin-top:3px;">협상 단가 설정 · CSV 일괄 등록 · 매장 분리 · 본사 비번 리셋 등</div>'
        +   (hqAccount ? '<div style="font-size:11px;color:#888;margin-top:3px;font-family:monospace;">본사 ID: @' + escapeHtml(hqAccount.login_id) + '</div>' : '')
        + '</div>'
        + '<button onclick="frAdminOpenBrand(\'' + frAdminFilterBrandId + '\')" style="background:var(--green-dark);color:#fff;border:none;border-radius:10px;padding:10px 20px;font-size:13px;font-weight:800;cursor:pointer;font-family:inherit;">⚙️ 브랜드 관리 →</button>'
        + '</div></div>';
    } else {
      shortcutEl.style.display = 'none';
      shortcutEl.innerHTML = '';
    }
  }

  // v133: 미니맵 제거 — 매장 위치는 [🗺️ 가맹점 지도] 메뉴에서
  // 🆕 v137: 운영 이력 섹션 렌더
  setTimeout(function(){ renderFrOpsSection('frAdminOpsSection', filteredStores); }, 50);
}

function _frAdminKpi(title, value, sub) {
  return '<div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1.5px solid var(--green-pale);">'
    + '<div style="font-size:10.5px;color:var(--gray);font-weight:700;letter-spacing:-0.01em;">' + title + '</div>'
    + '<div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:var(--green-dark);margin-top:3px;">' + value + '</div>'
    + '<div style="font-size:10.5px;color:var(--gray);margin-top:1px;">' + sub + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════════
// 🗺️ v127: 프랜차이즈 미니맵 (재사용 가능)
// ════════════════════════════════════════════════════════════════════
// 미니맵 인스턴스 캐시 (DOM 재사용 시 중복 방지)
var _frMiniMapInstances = {};

/**
 * 컨테이너에 매장들의 미니맵을 렌더.
 * containerId: 지도 컨테이너 div id
 * stores: 표시할 매장 배열 (lat/lng/name/newOil/wasteOil 필요)
 * options: { height: '280px', clickToFullMap: true, brandIdForFilter: 'xxx' }
 */
function renderFranchiseMiniMap(containerId, stores, options) {
  options = options || {};
  var container = document.getElementById(containerId);
  if (!container) return null;

  // Kakao Maps 미준비 시 안내
  if (typeof kakao === 'undefined' || typeof kakao.maps === 'undefined') {
    container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#f8f9fa;gap:8px;padding:30px;">'
      + '<div style="font-size:28px;">🗺️</div>'
      + '<div style="font-size:12px;color:#666;text-align:center;">지도 SDK 로딩 중입니다. 잠시 후 다시 시도해주세요.</div>'
      + '</div>';
    return null;
  }

  // 매장이 없으면 안내
  if (!stores || stores.length === 0) {
    container.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:#FAFBF9;gap:8px;padding:30px;color:var(--gray);">'
      + '<div style="font-size:36px;">🏪</div>'
      + '<div style="font-size:12px;text-align:center;">표시할 가맹점이 없어요</div>'
      + '</div>';
    return null;
  }

  // 컨테이너 비우기 (이전 지도 제거)
  container.innerHTML = '';
  container.style.height = options.height || '320px';
  container.style.position = 'relative';
  container.style.borderRadius = '10px';
  container.style.overflow = 'hidden';
  container.style.border = '1px solid var(--gray-light)';

  // 평균 위경도로 중심 결정
  var avgLat = stores.reduce(function(s,b){ return s + (b.lat || 37.3450); }, 0) / stores.length;
  var avgLng = stores.reduce(function(s,b){ return s + (b.lng || 127.9280); }, 0) / stores.length;

  var mapInstance;
  try {
    mapInstance = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(avgLat, avgLng),
      level: stores.length === 1 ? 4 : 8,
    });
  } catch(e) {
    console.warn('미니맵 생성 실패:', e);
    container.innerHTML = '<div style="padding:30px;text-align:center;color:#C62828;font-size:12px;">⚠️ 지도 로딩 실패</div>';
    return null;
  }

  // bounds 자동 계산 (매장 2개 이상 시)
  if (stores.length >= 2) {
    try {
      var bounds = new kakao.maps.LatLngBounds();
      stores.forEach(function(b){
        if (b.lat && b.lng) bounds.extend(new kakao.maps.LatLng(b.lat, b.lng));
      });
      mapInstance.setBounds(bounds);
    } catch(e) {}
  }

  // 마커 표시
  stores.forEach(function(biz) {
    if (!biz.lat || !biz.lng) return;
    var isLow = (getBizTotalNewOil ? getBizTotalNewOil(biz) : biz.newOil) <= 2;
    var isWaste = biz.wasteOil >= 5;
    var color = isLow ? '#E83A2F' : isWaste ? '#FF8C00' : '#05C46B';
    var emoji = isLow ? '⚠️' : isWaste ? '🗑️' : '🫙';

    var markerContent = document.createElement('div');
    markerContent.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">'
      + '<div style="background:' + color + ';border:2px solid white;border-radius:50% 50% 50% 0;width:30px;height:30px;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">'
      +   '<span style="transform:rotate(45deg);font-size:12px;line-height:1;">' + emoji + '</span>'
      + '</div>'
      + '<div style="background:rgba(0,0,0,0.82);color:#fff;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-top:2px;white-space:nowrap;font-family:Pretendard,sans-serif;">' + (biz.name || '').split(' ').slice(0,2).join(' ') + '</div>'
      + '</div>';

    try {
      var overlay = new kakao.maps.CustomOverlay({
        position: new kakao.maps.LatLng(biz.lat, biz.lng),
        content: markerContent,
        yAnchor: 1
      });
      overlay.setMap(mapInstance);

      // 마커 클릭 시 간단한 인포 표시
      markerContent.addEventListener('click', function(e) {
        e.stopPropagation();
        var newOilDisplay = getBizTotalNewOil ? getBizTotalNewOil(biz) : (biz.newOil || 0);
        showToast('t1', '🏪 ' + biz.name, '🫙 ' + newOilDisplay + '캔 · ♻️ ' + biz.wasteOil + '캔' + (biz.storeCode ? ' · #' + biz.storeCode : ''));
      });
    } catch(e) {
      console.warn('마커 추가 실패:', biz.name, e);
    }
  });

  // 우상단 풀스크린 버튼
  if (options.clickToFullMap !== false) {
    var fullBtn = document.createElement('div');
    fullBtn.style.cssText = 'position:absolute;top:10px;right:10px;z-index:5;background:rgba(15,36,25,0.9);color:#FFEB3B;font-size:11px;font-weight:800;padding:6px 12px;border-radius:8px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.2);font-family:Pretendard,sans-serif;';
    fullBtn.textContent = '🗺️ 전체 지도 →';
    fullBtn.onclick = function(e) {
      e.stopPropagation();
      if (options.brandIdForFilter) {
        frMapFilterBrandId = options.brandIdForFilter;
      }
      showPanel('map', null);
    };
    container.appendChild(fullBtn);
  }

  // 좌하단 통계 박스
  var statsBox = document.createElement('div');
  var totalNew = stores.reduce(function(s,b){ return s + (getBizTotalNewOil ? getBizTotalNewOil(b) : (b.newOil||0)); }, 0);
  var totalWaste = stores.reduce(function(s,b){ return s + (b.wasteOil||0); }, 0);
  statsBox.style.cssText = 'position:absolute;bottom:10px;left:10px;z-index:5;background:rgba(255,255,255,0.95);padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;color:var(--green-dark);box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:Pretendard,sans-serif;border:1px solid var(--green-pale);';
  statsBox.innerHTML = '🏪 ' + stores.length + '개 매장 · 📦 ' + totalNew + '캔 · ♻️ ' + totalWaste + '캔';
  container.appendChild(statsBox);

  // 인스턴스 캐시
  _frMiniMapInstances[containerId] = mapInstance;
  return mapInstance;
}

function frAdminSetFilter(brandId) {
  frAdminFilterBrandId = brandId;
  renderFranchiseAdminPage();
}

async function frAdminCreateBrand() {
  var setStatus = function(msg, ok) {
    var el = document.getElementById('frBrandCreateStatus');
    if (el) { el.textContent = msg; el.style.color = ok ? '#2E7D32' : '#C62828'; }
  };
  var name        = (document.getElementById('frBrandName').value || '').trim();
  var contactName = (document.getElementById('frBrandContactName').value || '').trim();
  var phone       = (document.getElementById('frBrandContactPhone').value || '').trim();
  var email       = (document.getElementById('frBrandContactEmail').value || '').trim();
  var startDate   = (document.getElementById('frBrandStartDate').value || '').trim();
  var notes       = (document.getElementById('frBrandNotes').value || '').trim();
  var hqLoginId   = (document.getElementById('frHqLoginId').value || '').trim();
  var hqLoginPw   = (document.getElementById('frHqLoginPw').value || '').trim();

  if (!name) { setStatus('❌ 브랜드명을 입력해주세요'); return; }
  if (franchiseBrands.find(function(b){ return b.name === name; })) {
    setStatus('❌ 이미 같은 이름의 브랜드가 있어요'); return;
  }
  if (!hqLoginId || !hqLoginPw) { setStatus('❌ 본사 계정 ID/비밀번호를 입력해주세요'); return; }
  var idCheck = validateLoginId(hqLoginId);
  if (!idCheck.ok) { setStatus('❌ ' + idCheck.msg); return; }
  var pwCheck = validatePasswordStrength(hqLoginPw);
  if (!pwCheck.ok) { setStatus('❌ ' + pwCheck.msg); return; }
  // 중복 체크
  await loadHqAccountsFromDB();
  if (franchiseHqAccounts.find(function(a){ return a.login_id === hqLoginId; })) {
    setStatus('❌ 같은 본사 ID가 이미 사용중이에요'); return;
  }

  setStatus('⏳ 생성 중...', true);
  try {
    var brand = await createFranchiseBrand({
      name: name,
      contact_name: contactName || null,
      contact_phone: phone || null,
      contact_email: email || null,
      contract_start_date: startDate || null,
      notes: notes || null,
      status: 'active'
    });
    await createHqAccount(brand.id, hqLoginId, hqLoginPw, contactName);
    setStatus('✅ 생성 완료! 본사 ID: ' + hqLoginId + ' / 비밀번호는 따로 안전하게 전달해주세요', true);
    showToast('t1', '✅ 브랜드 등록', name + ' 등록 완료 (본사 ID: ' + hqLoginId + ')');
    // 입력 초기화
    document.getElementById('frBrandName').value = '';
    document.getElementById('frBrandContactName').value = '';
    document.getElementById('frBrandContactPhone').value = '';
    document.getElementById('frBrandContactEmail').value = '';
    document.getElementById('frBrandStartDate').value = '';
    document.getElementById('frBrandNotes').value = '';
    document.getElementById('frHqLoginId').value = '';
    document.getElementById('frHqLoginPw').value = '';
    // 🆕 v126: 보안 설정 프랜차이즈 탭 갱신
    if (typeof securityRefreshFranchise === 'function') securityRefreshFranchise();
  } catch(e) {
    setStatus('❌ 생성 실패: ' + (e.message || e));
  }
}

// HTML 이스케이프 (이미 있을 수도 있지만 안전하게 정의)
if (typeof escapeHtml !== 'function') {
  window.escapeHtml = function(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  };
}

// ════════════════════════════════════════════════════════════════════
// 🏪 v120: 브랜드 상세 — 가맹점 관리 화면
// ════════════════════════════════════════════════════════════════════

var currentFrBrandId = null;  // 현재 보고 있는 브랜드

function frAdminOpenBrand(brandId) {
  currentFrBrandId = brandId;
  showPanel('franchise-brand-detail', null);
  renderFrBrandDetail();
}

function frAdminBackToList() {
  currentFrBrandId = null;
  showPanel('franchise-admin', null);
  renderFranchiseAdminPage();
}

function renderFrBrandDetail() {
  var brandId = currentFrBrandId;
  var brand = getBrandById(brandId);
  var container = document.getElementById('frBrandDetailContent');
  if (!container) return;
  if (!brand) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray);">브랜드 정보를 찾을 수 없어요. <button onclick="frAdminBackToList()" style="background:none;border:none;color:var(--green-main);cursor:pointer;text-decoration:underline;">← 목록으로</button></div>';
    return;
  }

  var stores = getStoresOfBrand(brandId);
  var hqAccount = franchiseHqAccounts.find(function(a){ return a.brand_id === brandId; });

  // 이번 달 발주/폐유 합계 계산
  var nowMonth = new Date().toISOString().slice(0,7);
  var monthHist = historyData.filter(function(h) {
    var sid = String(h.bizId);
    var isMyStore = stores.some(function(s){ return String(s.id) === sid; });
    if (!isMyStore) return false;
    var d = h.rawDate || '';
    return d.startsWith(nowMonth);
  });
  var monthOrders = monthHist.filter(function(h){ return h.type === '🫙 발주' || h.type === '🫙'; }).length;
  var monthWaste  = monthHist.filter(function(h){ return h.type === '♻️ 수거' || h.type === '♻️'; }).reduce(function(s,h){ return s + (h.qty||0); }, 0);
  var co2 = Math.round(monthWaste * 16.5 * 0.7 * 10) / 10;

  container.innerHTML = ''
    + '<button onclick="frAdminBackToList()" style="background:none;border:none;color:var(--green-main);font-size:13px;cursor:pointer;margin-bottom:14px;font-weight:700;font-family:inherit;">← 브랜드 목록</button>'
    // 헤더
    + '<div style="background:linear-gradient(135deg,#0F2419,#1F4D30);border-radius:18px;padding:24px 28px;color:#fff;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">'
    +   '<div>'
    +     '<div style="font-size:10.5px;font-weight:800;color:rgba(255,255,255,0.7);letter-spacing:0.1em;margin-bottom:4px;">FRANCHISE BRAND</div>'
    +     '<div style="font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:-0.02em;">🏪 ' + escapeHtml(brand.name) + '</div>'
    +     '<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">'
    +       (brand.contact_name ? '👤 ' + escapeHtml(brand.contact_name) : '담당자 미지정')
    +       (brand.contact_phone ? ' · 📞 ' + escapeHtml(brand.contact_phone) : '')
    +       (hqAccount ? ' · 🔐 @' + escapeHtml(hqAccount.login_id) : '')
    +     '</div>'
    +   '</div>'
    +   '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +     '<button onclick="frAdminEditBrandModal(\'' + brand.id + '\')" style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">✏️ 정보 수정</button>'
    +     (hqAccount ? '<button onclick="frAdminResetHqPw(\'' + hqAccount.id + '\',\'' + escapeHtml(hqAccount.login_id) + '\')" style="background:rgba(255,235,59,0.2);color:#FFEB3B;border:1px solid rgba(255,235,59,0.4);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">🔑 본사 비번 리셋</button>' : '')
    +     '<button onclick="frAdminDeleteBrandConfirm(\'' + brand.id + '\',\'' + escapeHtml(brand.name) + '\')" style="background:rgba(198,40,40,0.2);color:#FFCDD2;border:1px solid rgba(198,40,40,0.4);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">🗑️ 브랜드 삭제</button>'
    +   '</div>'
    + '</div>'
    // KPI
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px;">'
    +   _frKpiCard('🏪 가맹점', stores.length + '개', '활성 ' + stores.filter(function(s){return s.approved !== false;}).length + '개')
    +   _frKpiCard('📦 이번달 발주', monthOrders + '건', '브랜드 합계')
    +   _frKpiCard('♻️ 이번달 폐유', monthWaste + '캔', co2 + 'kg CO₂ 절감')
    +   _frKpiCard('💰 이번달 매입', (monthWaste * (PRICES.waste.can.price + (brand.waste_oil_premium||0))).toLocaleString() + '원', '가맹점 직접 입금')
    + '</div>'
    // 협상 단가
    + _frContractPriceCard(brand)
    // 가맹점 일괄 등록
    + _frBulkAddCard(brand)
    // 가맹점 리스트
    + _frStoresListCard(brand, stores);
}

function _frKpiCard(title, value, sub) {
  return '<div style="background:var(--white);border-radius:12px;padding:14px 16px;border:1.5px solid var(--green-pale);">'
    + '<div style="font-size:10.5px;color:var(--gray);font-weight:700;letter-spacing:-0.01em;">' + title + '</div>'
    + '<div style="font-family:var(--font-display);font-size:20px;font-weight:800;color:var(--green-dark);margin-top:3px;">' + value + '</div>'
    + '<div style="font-size:10.5px;color:var(--gray);margin-top:1px;">' + sub + '</div>'
    + '</div>';
}

function _frContractPriceCard(brand) {
  var oilLabels = { soy:'🫘 대두유', canola:'🌿 카놀라유', corn:'🌽 옥수수유', sun:'🌻 해바라기유' };
  var rows = Object.keys(oilLabels).map(function(k) {
    var field = 'contract_oil_price_' + k;
    var contractPrice = brand[field];
    var generalPrice = (PRICES.oils[k] && PRICES.oils[k].price) || 0;
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px dashed var(--gray-light);">'
      + '<div style="font-size:13px;font-weight:700;">' + oilLabels[k] + '</div>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      +   '<div style="font-size:11px;color:var(--gray);">일반: <span style="font-weight:700;">' + generalPrice.toLocaleString() + '원</span></div>'
      +   '<div style="font-size:12px;color:var(--green-dark);font-weight:800;">협상가: ' + (contractPrice ? '<span style="color:var(--green-main);">' + contractPrice.toLocaleString() + '원</span>' : '<span style="color:var(--gray);">미설정 (일반가 적용)</span>') + '</div>'
      +   '<input type="number" id="frPrice_' + k + '" value="' + (contractPrice || '') + '" placeholder="원" style="width:100px;padding:6px 8px;font-size:12px;border:1px solid var(--gray-light);border-radius:6px;text-align:right;">'
      + '</div>'
      + '</div>';
  }).join('');
  return '<div class="card" style="margin-bottom:20px;"><div style="padding:18px 22px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--green-dark);">💰 협상 단가 (관리자만 수정)</div>'
    +     '<div style="font-size:11.5px;color:var(--gray);margin-top:2px;">본사 ↔ 식용유니버스 협상가. 미설정 시 일반 단가 적용. (Phase 2부터 실제 발주에 적용 예정, 지금은 표시만)</div>'
    +   '</div>'
    +   '<button onclick="frAdminSaveContractPrices(\'' + brand.id + '\')" style="background:var(--green-dark);color:#fff;border:none;border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">💾 저장</button>'
    + '</div>'
    + rows
    + '<div id="frPriceSaveStatus" style="font-size:11.5px;text-align:center;margin-top:10px;min-height:14px;"></div>'
    + '</div></div>';
}

function _frBulkAddCard(brand) {
  // 브랜드명에서 영문 약자 추출 (기본값 제안)
  var defaultPrefix = '';
  var brandName = (brand.name || '').toLowerCase();
  // 영문이면 그대로, 한글이면 '봉봉_' 같은 한글 prefix 또는 빈 값
  if (/^[a-z0-9_]+$/i.test(brand.name || '')) {
    defaultPrefix = brand.name.replace(/[^a-z0-9_]/gi, '').toLowerCase();
  }
  return '<div class="card" style="margin-bottom:20px;"><div style="padding:18px 22px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" onclick="toggleFrBulkBody()">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--green-dark);">📥 가맹점 일괄 등록</div>'
    +     '<div style="font-size:11.5px;color:var(--gray);margin-top:2px;">CSV 붙여넣기로 여러 매장을 한 번에 등록 (ID·비밀번호 자동 발급)</div>'
    +   '</div>'
    +   '<span id="frBulkArrow" style="font-size:18px;color:var(--gray);">▼</span>'
    + '</div>'
    + '<div id="frBulkBody" style="display:none;margin-top:16px;padding-top:16px;border-top:1px dashed var(--gray-light);">'

    // 🆕 v129: ID 접두어 입력 + 자동 생성 규칙 안내
    +   '<div style="background:#FFF8E1;border:1.5px solid #FFB300;border-radius:10px;padding:12px 14px;margin-bottom:12px;">'
    +     '<div style="font-size:12px;font-weight:800;color:#7A4F00;margin-bottom:8px;">🔐 로그인 계정 자동 발급 설정</div>'
    +     '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">'
    +       '<div>'
    +         '<label style="font-size:11px;font-weight:700;color:#7A4F00;display:block;margin-bottom:4px;">ID 접두어 *</label>'
    +         '<input type="text" id="frBulkIdPrefix" placeholder="예: bongbong, kyochon" value="' + defaultPrefix + '" oninput="updateFrBulkIdPreview()" style="width:100%;padding:8px 10px;font-size:12.5px;border:1px solid var(--gray-light);border-radius:7px;font-family:monospace;">'
    +         '<div style="font-size:10px;color:#888;margin-top:3px;">영문·숫자만, 공백 X</div>'
    +       '</div>'
    +       '<div>'
    +         '<label style="font-size:11px;font-weight:700;color:#7A4F00;display:block;margin-bottom:4px;">임시 비번 suffix</label>'
    +         '<input type="text" id="frBulkPwSuffix" placeholder="2026" value="2026" oninput="updateFrBulkIdPreview()" style="width:100%;padding:8px 10px;font-size:12.5px;border:1px solid var(--gray-light);border-radius:7px;font-family:monospace;">'
    +         '<div style="font-size:10px;color:#888;margin-top:3px;">매장코드 뒤에 붙는 비번 끝자리</div>'
    +       '</div>'
    +     '</div>'
    +     '<div id="frBulkIdPreview" style="margin-top:10px;padding:8px 11px;background:rgba(255,255,255,0.7);border-radius:7px;font-size:11px;color:#5C3D00;font-family:monospace;">'
    +       'ID: <b>' + (defaultPrefix || '브랜드명') + '_001</b> · PW: <b>' + (defaultPrefix || '브랜드명') + '0012026</b>  (매장코드 001 예시)'
    +     '</div>'
    +   '</div>'

    +   '<div style="background:var(--green-pale);border-radius:8px;padding:12px 14px;font-size:12px;color:var(--green-dark);margin-bottom:12px;line-height:1.7;">'
    +     '<div style="font-weight:800;margin-bottom:4px;">📋 CSV 형식 (헤더 포함):</div>'
    +     '<code style="display:block;background:rgba(255,255,255,0.6);padding:6px 8px;border-radius:6px;font-size:11px;margin-top:4px;letter-spacing:0;">점포명,점포코드,주소,전화번호,담당자,사업자번호,자동발주</code>'
    +     '<div style="margin-top:6px;font-size:11px;">예: <code style="font-size:11px;">' + escapeHtml(brand.name) + ' 원주점,001,강원도 원주시 단계동 123,033-744-1234,홍길동,123-45-67890,Y</code></div>'
    +     '<div style="margin-top:4px;font-size:11px;color:#888;">자동발주: Y/N (생략 시 N) · 점포코드 생략 시 자동 채번 (001, 002...)</div>'
    +   '</div>'
    +   '<textarea id="frBulkCSV" placeholder="첫 줄에 헤더 (점포명,점포코드,...) 입력. Excel/Google Sheets에서 복사 → 붙여넣기 가능" style="width:100%;height:150px;padding:10px 12px;border:1px solid var(--gray-light);border-radius:8px;font-family:monospace;font-size:11px;resize:vertical;"></textarea>'
    +   '<div style="display:flex;gap:10px;margin-top:10px;">'
    +     '<button onclick="frBulkPreview(\'' + brand.id + '\')" style="flex:1;background:var(--green-pale);color:var(--green-dark);border:1px solid var(--green-main);border-radius:8px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">👁️ 미리보기</button>'
    +     '<button onclick="frBulkImport(\'' + brand.id + '\')" style="flex:1;background:var(--green-dark);color:#fff;border:none;border-radius:8px;padding:10px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">✅ 일괄 등록 (ID/PW 자동 발급)</button>'
    +   '</div>'
    +   '<div id="frBulkStatus" style="font-size:12px;margin-top:8px;text-align:center;min-height:16px;"></div>'
    +   '<div id="frBulkPreviewArea" style="margin-top:10px;"></div>'
    +   '<div id="frBulkResultArea" style="margin-top:10px;"></div>'
    + '</div>'
    + '</div></div>';
}

// 🆕 v129: ID 미리보기 갱신
function updateFrBulkIdPreview() {
  var prefix = (document.getElementById('frBulkIdPrefix')?.value || '').trim();
  var suffix = (document.getElementById('frBulkPwSuffix')?.value || '').trim();
  var preview = document.getElementById('frBulkIdPreview');
  if (!preview) return;
  var p = prefix || '브랜드명';
  var s = suffix || '2026';
  preview.innerHTML = 'ID: <b>' + p + '_001</b> · PW: <b>' + p + '001' + s + '</b>  (매장코드 001 예시)';
}

function _frStoresListCard(brand, stores) {
  if (stores.length === 0) {
    return '<div class="card"><div style="padding:30px 18px;text-align:center;color:var(--gray);">'
      + '<div style="font-size:36px;margin-bottom:10px;">🏪</div>'
      + '아직 등록된 가맹점이 없어요. 위의 <b>일괄 등록</b> 또는 [관리자 메뉴] <b>업체 등록</b>에서 추가해주세요.'
      + '</div></div>';
  }
  var rows = stores.map(function(s) {
    var nowMonth = new Date().toISOString().slice(0,7);
    var sHist = historyData.filter(function(h){ return String(h.bizId) === String(s.id) && (h.rawDate||'').startsWith(nowMonth); });
    var sOrders = sHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; }).length;
    var sWaste = sHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(t,h){ return t + (h.qty||0); }, 0);
    return '<tr style="border-bottom:1px solid var(--gray-light);">'
      + '<td style="padding:10px 8px;font-weight:700;">' + escapeHtml(s.name) + '</td>'
      + '<td style="padding:10px 8px;font-size:11px;color:var(--gray);">' + (s.storeCode ? escapeHtml(s.storeCode) : '—') + '</td>'
      + '<td style="padding:10px 8px;font-size:11.5px;color:var(--gray);">' + escapeHtml(s.addr || '—') + '</td>'
      + '<td style="padding:10px 8px;text-align:center;">' + (s.auto ? '<span style="color:var(--green-main);font-weight:800;">ON</span>' : '<span style="color:#999;">OFF</span>') + '</td>'
      + '<td style="padding:10px 8px;text-align:right;font-weight:700;">' + sOrders + '</td>'
      + '<td style="padding:10px 8px;text-align:right;font-weight:700;">' + sWaste + '캔</td>'
      + '<td style="padding:10px 8px;text-align:center;"><button onclick="frAdminUnlinkStore(' + s.id + ',\'' + escapeHtml(s.name) + '\')" title="브랜드에서 분리 (가맹점→일반)" style="background:none;border:1px solid var(--gray-light);border-radius:6px;padding:4px 8px;font-size:10.5px;cursor:pointer;">🔗 분리</button></td>'
      + '</tr>';
  }).join('');
  return '<div class="card"><div style="padding:18px 22px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--green-dark);">🏪 등록 가맹점 (' + stores.length + ')</div>'
    +     '<div style="font-size:11.5px;color:var(--gray);margin-top:2px;">이번 달 발주/수거 현황 포함</div>'
    +   '</div>'
    + '</div>'
    + '<div style="overflow-x:auto;">'
    + '<table style="width:100%;font-size:12.5px;border-collapse:collapse;">'
    + '<thead><tr style="background:var(--green-pale);color:var(--green-dark);">'
    +   '<th style="padding:10px 8px;text-align:left;">점포명</th>'
    +   '<th style="padding:10px 8px;text-align:left;">코드</th>'
    +   '<th style="padding:10px 8px;text-align:left;">주소</th>'
    +   '<th style="padding:10px 8px;text-align:center;">자동발주</th>'
    +   '<th style="padding:10px 8px;text-align:right;">이번달 발주</th>'
    +   '<th style="padding:10px 8px;text-align:right;">이번달 폐유</th>'
    +   '<th style="padding:10px 8px;text-align:center;"></th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div></div>';
}

function toggleFrBulkBody() {
  var body = document.getElementById('frBulkBody');
  var arrow = document.getElementById('frBulkArrow');
  if (!body) return;
  var open = body.style.display === 'none' || !body.style.display;
  body.style.display = open ? 'block' : 'none';
  if (arrow) arrow.textContent = open ? '▲' : '▼';
}

// ───── 협상 단가 저장 ─────
async function frAdminSaveContractPrices(brandId) {
  var setStatus = function(msg, ok) {
    var el = document.getElementById('frPriceSaveStatus');
    if (el) { el.textContent = msg; el.style.color = ok ? '#2E7D32' : '#C62828'; }
  };
  var patch = {};
  ['soy','canola','corn','sun'].forEach(function(k) {
    var v = parseInt(document.getElementById('frPrice_' + k).value);
    patch['contract_oil_price_' + k] = (v && v > 0) ? v : null;
  });
  try {
    await updateFranchiseBrand(brandId, patch);
    setStatus('✅ 협상 단가 저장 완료', true);
    showToast('t1','💰 협상 단가 변경','반영되었습니다');
  } catch(e) {
    setStatus('❌ 저장 실패: ' + (e.message || e));
  }
}

// ───── CSV 파싱 ─────
function _parseCSV(text) {
  // 간단 CSV 파서 — 쉼표 + 따옴표 처리
  var lines = text.split(/\r?\n/).filter(function(l){ return l.trim().length > 0; });
  if (lines.length < 2) return { ok: false, error: 'CSV에 헤더와 최소 1개 행이 있어야 해요' };
  var rows = lines.map(function(line) {
    var cells = [];
    var current = '';
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cells.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
  return { ok: true, rows: rows };
}

function frBulkPreview(brandId) {
  var setStatus = function(msg, ok) {
    var el = document.getElementById('frBulkStatus');
    if (el) { el.textContent = msg; el.style.color = ok ? '#2E7D32' : '#C62828'; }
  };
  var preview = document.getElementById('frBulkPreviewArea');
  var csv = document.getElementById('frBulkCSV').value;
  if (!csv.trim()) { setStatus('❌ CSV를 붙여넣어주세요'); return; }
  var parsed = _parseCSV(csv);
  if (!parsed.ok) { setStatus('❌ ' + parsed.error); return; }
  var header = parsed.rows[0];
  var dataRows = parsed.rows.slice(1);
  // 헤더 검증 (점포명 필수, 나머지 선택)
  var nameIdx = header.findIndex(function(h){ return h.indexOf('점포명') >= 0 || h.toLowerCase() === 'name'; });
  if (nameIdx < 0) { setStatus('❌ "점포명" 컬럼이 헤더에 있어야 해요'); return; }

  var html = '<div style="background:var(--green-pale);border:1px solid var(--green-main);border-radius:8px;padding:10px 14px;margin-top:8px;">'
    + '<div style="font-size:12px;font-weight:800;color:var(--green-dark);margin-bottom:8px;">👁️ 미리보기 (' + dataRows.length + '행)</div>'
    + '<div style="overflow-x:auto;max-height:200px;">'
    + '<table style="width:100%;font-size:11px;border-collapse:collapse;">'
    + '<thead><tr style="background:rgba(255,255,255,0.7);">' + header.map(function(h){ return '<th style="padding:4px 6px;text-align:left;border:1px solid rgba(0,0,0,0.1);">' + escapeHtml(h) + '</th>'; }).join('') + '</tr></thead>'
    + '<tbody>' + dataRows.slice(0,20).map(function(r){
        return '<tr>' + r.map(function(c){ return '<td style="padding:3px 6px;border:1px solid rgba(0,0,0,0.05);">' + escapeHtml(c) + '</td>'; }).join('') + '</tr>';
      }).join('')
    + '</tbody></table>'
    + (dataRows.length > 20 ? '<div style="font-size:10.5px;color:var(--gray);margin-top:6px;">... 외 ' + (dataRows.length - 20) + '행</div>' : '')
    + '</div></div>';
  preview.innerHTML = html;
  setStatus('✅ ' + dataRows.length + '행 파싱 완료. [✅ 일괄 등록] 누르면 DB에 추가됩니다', true);
}

async function frBulkImport(brandId) {
  var setStatus = function(msg, ok) {
    var el = document.getElementById('frBulkStatus');
    if (el) { el.textContent = msg; el.style.color = ok ? '#2E7D32' : '#C62828'; }
  };
  var csv = document.getElementById('frBulkCSV').value;
  if (!csv.trim()) { setStatus('❌ CSV를 붙여넣어주세요'); return; }

  // 🆕 v129: ID 접두어 검증
  var idPrefix = (document.getElementById('frBulkIdPrefix')?.value || '').trim();
  var pwSuffix = (document.getElementById('frBulkPwSuffix')?.value || '2026').trim();
  if (!idPrefix) { setStatus('❌ ID 접두어를 입력해주세요 (예: bongbong)'); return; }
  if (!/^[a-z0-9_]+$/i.test(idPrefix)) { setStatus('❌ ID 접두어는 영문·숫자·_만 허용 (예: bongbong)'); return; }
  if (idPrefix.length < 2) { setStatus('❌ ID 접두어는 최소 2자 이상'); return; }

  var parsed = _parseCSV(csv);
  if (!parsed.ok) { setStatus('❌ ' + parsed.error); return; }
  var header = parsed.rows[0];
  var dataRows = parsed.rows.slice(1);

  // 인덱스 매핑
  var idx = {
    name:    header.findIndex(function(h){ return h.indexOf('점포명') >= 0; }),
    code:    header.findIndex(function(h){ return h.indexOf('점포코드') >= 0 || h.indexOf('코드') >= 0; }),
    addr:    header.findIndex(function(h){ return h.indexOf('주소') >= 0; }),
    phone:   header.findIndex(function(h){ return h.indexOf('전화') >= 0; }),
    owner:   header.findIndex(function(h){ return h.indexOf('담당자') >= 0; }),
    bizNo:   header.findIndex(function(h){ return h.indexOf('사업자') >= 0; }),
    auto:    header.findIndex(function(h){ return h.indexOf('자동발주') >= 0 || h.indexOf('자동') >= 0; }),
  };
  if (idx.name < 0) { setStatus('❌ "점포명" 컬럼이 없어요'); return; }

  // 🆕 v129: 발급된 계정 정보 수집
  var issued = [];  // [{name, code, loginId, loginPw}]
  var existingIds = new Set();
  // 기존 ID 충돌 회피용 사전 조회
  try {
    var existing = await db.from('businesses').select('login_id').not('login_id', 'is', null);
    if (existing.data) existing.data.forEach(function(r){ if (r.login_id) existingIds.add(r.login_id); });
  } catch(e) {}

  setStatus('⏳ 등록 중... 0 / ' + dataRows.length, true);
  var success = 0, failed = 0, errors = [];
  for (var i = 0; i < dataRows.length; i++) {
    var r = dataRows[i];
    var name = r[idx.name];
    if (!name) { failed++; continue; }

    // 매장 코드 결정 (없으면 자동 채번)
    var code = idx.code >= 0 ? (r[idx.code] || '').trim() : '';
    if (!code) code = String(i + 1).padStart(3, '0');

    // 🆕 ID/PW 자동 생성
    var baseLoginId = idPrefix + '_' + code;
    var loginId = baseLoginId;
    var dup = 1;
    while (existingIds.has(loginId)) {
      loginId = baseLoginId + '_' + (++dup);
    }
    existingIds.add(loginId);
    var loginPw = idPrefix + code + pwSuffix;  // 예: bongbong0012026

    try {
      var payload = {
        name: name,
        type: '프랜차이즈',
        owner: idx.owner >= 0 ? r[idx.owner] : '',
        phone: idx.phone >= 0 ? r[idx.phone] : '',
        addr: idx.addr >= 0 ? r[idx.addr] : '',
        new_oil: 5,
        max_new: 10,
        waste_oil: 0,
        auto: idx.auto >= 0 ? /^(Y|y|ON|on|1|true)$/.test((r[idx.auto] || '').trim()) : false,
        tenant_type: 'franchise_store',
        franchise_brand_id: brandId,
        store_code: code,
        login_id: loginId,
        login_pw: loginPw,
        approved: true
      };
      var res = await db.from('businesses').insert([payload]).select().single();
      if (res.error) {
        var msg = res.error.message || '';
        errors.push((i+2) + '행 (' + name + '): ' + msg);
        failed++;
      } else {
        issued.push({ name: name, code: code, loginId: loginId, loginPw: loginPw });
        success++;
      }
    } catch(e) {
      failed++;
      errors.push((i+2) + '행: ' + (e.message || e));
    }
    if ((i+1) % 5 === 0) setStatus('⏳ 등록 중... ' + (i+1) + ' / ' + dataRows.length, true);
  }
  // 끝나면 DB 재로드
  await loadBusinessesFromDB();
  setStatus('✅ 완료: 성공 ' + success + ' / 실패 ' + failed + (errors.length > 0 ? ' (첫 에러: ' + errors[0] + ')' : ''), failed === 0);
  showToast('t1', '✅ 일괄 등록 완료', success + '개 매장 추가, ID/PW 자동 발급');

  // 🆕 v129: 발급 결과 출력 (복사/다운로드 가능)
  var resultEl = document.getElementById('frBulkResultArea');
  if (resultEl && issued.length > 0) {
    // 클립보드 복사용 텍스트
    var copyText = '매장명\t코드\t로그인ID\t임시비밀번호\n';
    copyText += issued.map(function(it){
      return it.name + '\t' + it.code + '\t' + it.loginId + '\t' + it.loginPw;
    }).join('\n');
    window._frBulkIssuedCopy = copyText;

    var rows = issued.map(function(it){
      return '<tr style="border-bottom:1px solid var(--gray-light);">'
        + '<td style="padding:8px;font-weight:700;">' + escapeHtml(it.name) + '</td>'
        + '<td style="padding:8px;color:var(--gray);font-size:11px;">' + escapeHtml(it.code) + '</td>'
        + '<td style="padding:8px;font-family:monospace;color:var(--green-dark);font-weight:700;">' + escapeHtml(it.loginId) + '</td>'
        + '<td style="padding:8px;font-family:monospace;color:#C62828;font-weight:700;">' + escapeHtml(it.loginPw) + '</td>'
        + '</tr>';
    }).join('');

    resultEl.innerHTML = '<div style="background:#FFF8E1;border:2px solid #FFB300;border-radius:10px;padding:14px 16px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px;">'
      +   '<div>'
      +     '<div style="font-size:13px;font-weight:800;color:#7A4F00;">🔐 발급된 계정 정보 (' + issued.length + '개)</div>'
      +     '<div style="font-size:11px;color:#7A4F00;margin-top:2px;">⚠️ 이 정보는 한 번만 표시됩니다. 반드시 복사/저장해서 매장에 전달해주세요!</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:6px;flex-wrap:wrap;">'
      +     '<button onclick="frBulkCopyResult()" style="background:#0F2419;color:#FFEB3B;border:none;border-radius:7px;padding:7px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">📋 표 복사</button>'
      +     '<button onclick="frBulkDownloadResult()" style="background:#FFB300;color:#0F2419;border:none;border-radius:7px;padding:7px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">💾 CSV 다운</button>'
      +     '<button onclick="frBulkPrintResult()" style="background:#fff;color:#7A4F00;border:1px solid #FFB300;border-radius:7px;padding:7px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">🖨️ 인쇄용</button>'
      +   '</div>'
      + '</div>'
      + '<div style="overflow-x:auto;max-height:300px;">'
      + '<table style="width:100%;font-size:12px;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;">'
      + '<thead><tr style="background:#FFEFC0;color:#7A4F00;">'
      +   '<th style="padding:9px 8px;text-align:left;">매장명</th>'
      +   '<th style="padding:9px 8px;text-align:left;">코드</th>'
      +   '<th style="padding:9px 8px;text-align:left;">로그인 ID</th>'
      +   '<th style="padding:9px 8px;text-align:left;">임시 비번</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div>'
      + '<div style="margin-top:10px;font-size:11px;color:#7A4F00;background:rgba(255,255,255,0.6);padding:8px 11px;border-radius:6px;line-height:1.6;">'
      +   '💡 <b>전달 방법</b>: 식용유 첫 납품 시 매장별로 ID/비번 + QR 스티커를 같이 전달해주세요.<br>'
      +   '💡 <b>비번 변경</b>: 사장님이 PWA 로그인 후 [내 정보]에서 비번 변경 가능 (권장).'
      + '</div>'
      + '</div>';
  }

  document.getElementById('frBulkCSV').value = '';
  document.getElementById('frBulkPreviewArea').innerHTML = '';
  // 결과 표는 유지 (사용자가 직접 닫을 때까지)
  renderFrBrandDetail();
}

// 🆕 v129: 발급 결과 복사/다운로드/인쇄
function frBulkCopyResult() {
  if (!window._frBulkIssuedCopy) return;
  navigator.clipboard.writeText(window._frBulkIssuedCopy).then(function(){
    showToast('t1', '📋 복사 완료', '엑셀이나 메모장에 붙여넣기 하세요');
  }).catch(function(){
    // fallback
    var ta = document.createElement('textarea');
    ta.value = window._frBulkIssuedCopy;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); showToast('t1','📋 복사 완료','엑셀에 붙여넣기'); } catch(e) { alert('복사 실패. 수동으로 복사해주세요.'); }
    document.body.removeChild(ta);
  });
}

function frBulkDownloadResult() {
  if (!window._frBulkIssuedCopy) return;
  var csv = window._frBulkIssuedCopy.replace(/\t/g, ',');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '가맹점_계정_' + (new Date()).toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('t1', '💾 다운로드 완료', '엑셀로 열어 확인하세요');
}

function frBulkPrintResult() {
  if (!window._frBulkIssuedCopy) return;
  var lines = window._frBulkIssuedCopy.split('\n');
  var header = lines[0].split('\t');
  var rows = lines.slice(1).filter(function(l){ return l.trim(); }).map(function(l){ return l.split('\t'); });
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>가맹점 계정 발급 명세</title>'
    + '<style>'
    + '@page { size: A4; margin: 18mm; }'
    + 'body { font-family: "Pretendard", "Apple SD Gothic Neo", sans-serif; margin:0; padding:20px; }'
    + 'h1 { font-size: 20px; margin-bottom: 4px; }'
    + '.sub { color: #666; font-size: 12px; margin-bottom: 18px; }'
    + 'table { width:100%; border-collapse:collapse; font-size:12.5px; }'
    + 'th { background:#FFF8E1; padding:8px; text-align:left; border-bottom:2px solid #FFB300; }'
    + 'td { padding:8px; border-bottom:1px solid #eee; }'
    + '.warn { margin-top:16px; padding:10px 14px; background:#FFF3E0; border-left:3px solid #FF9500; font-size:11.5px; line-height:1.7; }'
    + '.no-print button { background:#0F2419;color:#FFEB3B;border:none;padding:10px 20px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:800; }'
    + '@media print { .no-print { display:none; } }'
    + '</style></head><body>'
    + '<div class="no-print" style="margin-bottom:14px;"><button onclick="window.print()">🖨️ 인쇄 / PDF 저장</button></div>'
    + '<h1>🔐 가맹점 로그인 계정 발급 명세</h1>'
    + '<div class="sub">발급일: ' + (new Date()).toLocaleString('ko-KR') + ' · ' + rows.length + '개 매장</div>'
    + '<table><thead><tr>' + header.map(function(h){ return '<th>' + h + '</th>'; }).join('') + '</tr></thead>'
    + '<tbody>' + rows.map(function(r){ return '<tr>' + r.map(function(c){ return '<td>' + c + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>'
    + '<div class="warn">💡 <b>보안 안내</b>: 본 임시 비밀번호는 첫 로그인 후 변경을 권장합니다. 인쇄본은 매장 전달 후 안전한 곳에 보관 또는 폐기해주세요.</div>'
    + '</body></html>';
  var win = window.open('', '_blank');
  if (!win) { alert('팝업이 차단되었습니다. 팝업 허용 후 다시 시도해주세요.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ───── 본사 비번 리셋 ─────
async function frAdminResetHqPw(accountId, loginId) {
  var newPw = prompt('@' + loginId + ' 의 새 비밀번호 (8자+ 영문+숫자):');
  if (!newPw) return;
  try {
    await resetHqAccountPassword(accountId, newPw);
    showToast('t1','🔑 비번 리셋 완료','새 비밀번호: ' + newPw + ' (본사 담당자에게 안전하게 전달해주세요)');
    alert('✅ 비번 리셋 완료\n새 비밀번호: ' + newPw + '\n\n본사 담당자에게 안전하게 전달해주세요.');
  } catch(e) {
    alert('❌ 실패: ' + (e.message || e));
  }
}

// ───── 가맹점 분리 (브랜드에서 분리 → 일반 사업자) ─────
async function frAdminUnlinkStore(bizId, bizName) {
  if (!confirm(bizName + ' 을(를) 이 브랜드에서 분리할까요?\n(가맹점 → 일반 사업자로 전환됨. 데이터는 유지됨)')) return;
  try {
    var res = await db.from('businesses').update({
      franchise_brand_id: null,
      tenant_type: 'individual',
      store_code: null
    }).eq('id', bizId);
    if (res.error) throw res.error;
    await loadBusinessesFromDB();
    showToast('t1','✅ 분리 완료', bizName + ' 이(가) 일반 사업자로 전환됐어요');
    renderFrBrandDetail();
  } catch(e) {
    alert('❌ 실패: ' + (e.message || e));
  }
}

// ───── 브랜드 삭제 ─────
async function frAdminDeleteBrandConfirm(brandId, brandName) {
  var stores = getStoresOfBrand(brandId);
  var warn = stores.length > 0
    ? ('⚠️ "' + brandName + '" 브랜드를 삭제할까요?\n\n소속 가맹점 ' + stores.length + '개는 일반 사업자로 전환됩니다 (데이터 유지).\n본사 계정도 함께 삭제됩니다.\n\n계속하려면 OK를 누르세요.')
    : ('"' + brandName + '" 브랜드를 삭제할까요?\n본사 계정도 함께 삭제됩니다.');
  if (!confirm(warn)) return;
  try {
    await deleteFranchiseBrand(brandId);
    await loadHqAccountsFromDB();
    await loadBusinessesFromDB();
    showToast('t1','🗑️ 브랜드 삭제 완료', brandName + ' 삭제됨');
    frAdminBackToList();
  } catch(e) {
    alert('❌ 실패: ' + (e.message || e));
  }
}

// ───── 브랜드 정보 수정 (간단 prompt) ─────
async function frAdminEditBrandModal(brandId) {
  var brand = getBrandById(brandId);
  if (!brand) return;
  var newName = prompt('브랜드명:', brand.name);
  if (newName === null) return;
  newName = newName.trim();
  if (!newName) { alert('빈 이름은 안 돼요'); return; }
  var newPhone = prompt('담당자 연락처:', brand.contact_phone || '');
  if (newPhone === null) newPhone = brand.contact_phone || '';
  var newContact = prompt('담당자명:', brand.contact_name || '');
  if (newContact === null) newContact = brand.contact_name || '';
  try {
    await updateFranchiseBrand(brandId, {
      name: newName,
      contact_phone: newPhone,
      contact_name: newContact
    });
    showToast('t1','✅ 브랜드 정보 수정 완료', newName);
    renderFrBrandDetail();
  } catch(e) {
    alert('❌ 실패: ' + (e.message || e));
  }
}

// ════════════════════════════════════════════════════════════════════
// 🏪 v120: 끝
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// 🏢 v122: 본사 로그인 처리
// ════════════════════════════════════════════════════════════════════

async function frHqLoginSubmit() {
  var setStatus = function(msg) {
    var el = document.getElementById('frHqLoginStatus');
    if (el) el.textContent = msg || '';
  };
  var idEl = document.getElementById('frHqLoginInputId');
  var pwEl = document.getElementById('frHqLoginInputPw');
  var loginId = (idEl?.value || '').trim();
  var loginPw = (pwEl?.value || '').trim();
  if (!loginId || !loginPw) { setStatus('아이디와 비밀번호를 입력해주세요'); return; }
  setStatus('⏳ 로그인 중...');
  try {
    var result = await hqLogin(loginId, loginPw);
    if (!result.ok) {
      setStatus(result.msg);
      if (pwEl) { pwEl.style.borderColor = 'var(--red-accent)'; setTimeout(function(){ pwEl.style.borderColor=''; }, 1500); }
      return;
    }
    // 성공
    setStatus('');
    if (idEl) idEl.value = '';
    if (pwEl) pwEl.value = '';
    showToast('t1','✅ 본사 로그인 완료', result.brand.name + ' 대시보드로 이동합니다');
    // 🆕 v133: 사이드바 이름·아바타를 브랜드명 + "본사"로 갱신
    try {
      var sName = document.getElementById('sidebarName');
      var sSub = document.getElementById('sidebarSubtext');
      var sAvatar = document.getElementById('sidebarAvatar');
      if (sName) sName.textContent = result.brand.name;
      if (sSub) sSub.textContent = '본사';
      if (sAvatar) { sAvatar.textContent = (result.brand.name[0] || 'H'); sAvatar.style.background = '#FFB300'; sAvatar.style.color = '#0F2419'; }
    } catch(e) {}
    // 🆕 v126: 사이드바 갱신
    try { updateNavByMode(); } catch(e) {}
    // 본사 대시보드로 이동
    showPanel('fr-hq-dashboard', null);
  } catch(e) {
    setStatus('❌ 오류: ' + (e.message || e));
  }
}

function frHqLogout() {
  hqLogout();
  // 🆕 v126: 사이드바 갱신
  try { updateNavByMode(); } catch(e) {}
  showToast('t1','👋 로그아웃 되었습니다','다시 만나요!');
  showPanel('owner-dash', null);
}

// ════════════════════════════════════════════════════════════════════
// 🏢 v123: 본사 대시보드 렌더
// ════════════════════════════════════════════════════════════════════

async function renderFrHqDashboard() {
  var container = document.getElementById('frHqDashboardContent');
  if (!container) return;
  if (!hqLoggedIn || !hqBrandId) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--gray);">'
      + '<div style="font-size:36px;margin-bottom:10px;">🔒</div>'
      + '본사 로그인이 필요합니다.<br>'
      + '<button onclick="showPanel(\'fr-hq-login\',null)" style="margin-top:14px;background:var(--green-dark);color:#fff;border:none;border-radius:8px;padding:10px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;">🔐 본사 로그인</button>'
      + '</div>';
    return;
  }

  // 최신 데이터 로드
  await loadFranchiseBrandsFromDB();
  if (typeof loadBusinessesFromDB === 'function') await loadBusinessesFromDB();
  if (typeof loadHistoryFromDB === 'function') await loadHistoryFromDB();

  var brand = getBrandById(hqBrandId);
  if (!brand) {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#C62828;">브랜드 정보를 찾을 수 없어요. 식용유니버스 관리자에게 문의해주세요.</div>';
    return;
  }
  if (brand.status !== 'active') {
    container.innerHTML = '<div style="text-align:center;padding:60px 20px;color:#FFA726;"><div style="font-size:36px;">⏸️</div>현재 계약이 ' + (brand.status === 'paused' ? '일시정지' : '종료') + ' 상태입니다.<br>식용유니버스 관리자에게 문의해주세요.</div>';
    return;
  }

  var stores = getStoresOfBrand(hqBrandId);
  var activeStores = stores.filter(function(s){ return s.approved !== false; });

  // 이번 달 데이터 계산
  var nowMonth = new Date().toISOString().slice(0,7);
  var nowMonthLabel = (new Date()).getMonth() + 1;
  var monthHist = historyData.filter(function(h) {
    var sid = String(h.bizId);
    var isMyStore = stores.some(function(s){ return String(s.id) === sid; });
    if (!isMyStore) return false;
    return (h.rawDate || '').startsWith(nowMonth);
  });
  var monthOrders = monthHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; });
  var monthWasteHist = monthHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; });
  var monthOrderCount = monthOrders.length;
  var monthWasteCans = monthWasteHist.reduce(function(s,h){ return s + (h.qty||0); }, 0);
  var monthCO2 = Math.round(monthWasteCans * 16.5 * 0.7 * 10) / 10;
  // 발주 합계 금액
  var monthOrderAmount = monthOrders.reduce(function(s,h) {
    var amt = parseInt(String(h.amount || '0').replace(/[^\d]/g,'')) || 0;
    return s + amt;
  }, 0);
  // 폐유 매입금 (가맹점이 받는 돈)
  var wastePrice = (PRICES.waste.can.price || 19000) + (brand.waste_oil_premium || 0);
  var monthWasteRevenue = monthWasteCans * wastePrice;
  // 누적 ESG 포인트 (간단 계산: 폐유 캔 × 100pt)
  var allWasteHist = historyData.filter(function(h) {
    var sid = String(h.bizId);
    var isMyStore = stores.some(function(s){ return String(s.id) === sid; });
    return isMyStore && h.type && h.type.indexOf('수거') >= 0;
  });
  var totalEsgPts = allWasteHist.reduce(function(s,h){ return s + ((h.qty||0) * 100); }, 0);

  container.innerHTML = ''
    // 헤더
    + '<div style="background:linear-gradient(135deg,#0F2419,#1F4D30);border-radius:18px;padding:24px 28px;color:#fff;margin-bottom:22px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">'
    +   '<div>'
    +     '<div style="font-size:10.5px;font-weight:800;color:rgba(255,255,255,0.7);letter-spacing:0.1em;margin-bottom:4px;">FRANCHISE HQ DASHBOARD</div>'
    +     '<div style="font-family:var(--font-display);font-size:24px;font-weight:800;letter-spacing:-0.02em;">🏪 ' + escapeHtml(brand.name) + '</div>'
    +     '<div style="font-size:12px;color:rgba(255,255,255,0.75);margin-top:4px;">' + activeStores.length + ' / ' + stores.length + ' 매장 활성 · ' + nowMonthLabel + '월 운영 현황</div>'
    +   '</div>'
    +   '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
    +     '<button onclick="frHqDownloadReport()" style="background:rgba(255,235,59,0.2);color:#FFEB3B;border:1px solid rgba(255,235,59,0.4);border-radius:8px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">📄 ESG 리포트</button>'
    +     '<button onclick="frHqShowAddStoreModal()" style="background:rgba(255,255,255,0.18);color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:8px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">➕ 신규 매장</button>'
    +     '<button onclick="frHqLogout()" style="background:rgba(198,40,40,0.18);color:#FFCDD2;border:1px solid rgba(198,40,40,0.35);border-radius:8px;padding:9px 16px;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;">로그아웃</button>'
    +   '</div>'
    + '</div>'
    // 🆕 v129/v132: 승인 대기 가맹점 알림 (있을 때만)
    + (function(){
        var pendingBiz = stores.filter(function(s){ return s.approved === false; });
        var pendingSignups = (typeof pendingBizData !== 'undefined' ? pendingBizData : []).filter(function(p) {
          return p.tenant_type === 'franchise_store' && p.franchise_brand_id === hqBrandId;
        });
        var total = pendingBiz.length + pendingSignups.length;
        if (total === 0) return '';
        return '<div style="background:linear-gradient(135deg,#FFB300,#FF9500);border-radius:14px;padding:16px 20px;margin-bottom:18px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;box-shadow:0 4px 14px rgba(255,179,0,0.3);">'
          + '<div>'
          +   '<div style="font-size:11px;font-weight:800;letter-spacing:0.08em;opacity:0.9;">PENDING APPROVAL</div>'
          +   '<div style="font-family:var(--font-display);font-size:17px;font-weight:800;margin-top:2px;">⏳ ' + total + '개 매장이 가입 승인을 기다리고 있어요</div>'
          +   '<div style="font-size:11.5px;opacity:0.9;margin-top:3px;">'
          +     (pendingSignups.length > 0 ? '🆕 자율 가입 ' + pendingSignups.length + '건' : '')
          +     (pendingSignups.length > 0 && pendingBiz.length > 0 ? ' · ' : '')
          +     (pendingBiz.length > 0 ? '📥 CSV 등록 대기 ' + pendingBiz.length + '건' : '')
          +   '</div>'
          + '</div>'
          + '<button onclick="frHqShowPendingModal()" style="background:#fff;color:#7A4F00;border:none;border-radius:8px;padding:10px 18px;font-size:12.5px;font-weight:800;cursor:pointer;font-family:inherit;">📋 신청 검토</button>'
          + '</div>';
      })()
    // KPI 4개
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:22px;">'
    +   _frHqKpiCard('📦 이번달 발주', monthOrderCount + '건', '합계 ' + (monthOrderAmount/10000).toFixed(0) + '만원', 'var(--green-main)')
    +   _frHqKpiCard('♻️ 이번달 폐유', monthWasteCans + '캔', 'CO₂ ' + monthCO2 + 'kg 절감', '#26A69A')
    +   _frHqKpiCard('💰 폐유 매입금', monthWasteRevenue.toLocaleString() + '원', '가맹점 직접 입금 ('+wastePrice.toLocaleString()+'/캔)', '#FFA726')
    +   _frHqKpiCard('🌱 누적 ESG 포인트', totalEsgPts.toLocaleString() + 'pt', '바이오디젤 전환 ' + Math.round(allWasteHist.reduce(function(s,h){return s+(h.qty||0);},0) * 16.5 * 0.9) + 'L', '#9B59B6')
    + '</div>'
    // 🆕 v133: ESG & Certification 미니 카드 영역 (지도 대신)
    + (function() {
        var totalWasteAllTime = allWasteHist.reduce(function(s,h){return s+(h.qty||0);}, 0);
        var totalKg = Math.round(totalWasteAllTime * 16.5);
        var totalCO2 = Math.round(totalKg * 0.7 * 10) / 10;
        var biodieselL = Math.round(totalKg * 0.9);
        var isccStores = stores.filter(function(s){ return s.iscc_agreed === true; }).length;
        var signedStores = stores.filter(function(s){ return !!s.owner_signature; }).length;
        return '<div class="card" style="margin-bottom:22px;"><div style="padding:18px 22px;">'
          + '<div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:var(--green-dark);margin-bottom:14px;">🌿 ESG & 인증 현황</div>'
          + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;">'
          // CO2 카드
          +   '<div style="background:linear-gradient(135deg,#E8F5E9,#fff);border-left:3px solid #2E7D32;border-radius:10px;padding:13px 15px;">'
          +     '<div style="font-size:10.5px;font-weight:700;color:#2E7D32;letter-spacing:0.05em;">CO₂ 감축</div>'
          +     '<div style="font-family:var(--font-display);font-size:21px;font-weight:800;color:var(--green-dark);margin-top:2px;">' + totalCO2.toLocaleString() + '<span style="font-size:13px;font-weight:600;color:var(--gray);">kg</span></div>'
          +     '<div style="font-size:10.5px;color:var(--gray);margin-top:2px;">누적 폐유 ' + totalKg + 'kg 기반</div>'
          +   '</div>'
          // 바이오디젤 전환
          +   '<div style="background:linear-gradient(135deg,#FFF8E1,#fff);border-left:3px solid #FFA726;border-radius:10px;padding:13px 15px;">'
          +     '<div style="font-size:10.5px;font-weight:700;color:#E65100;letter-spacing:0.05em;">바이오디젤 잠재량</div>'
          +     '<div style="font-family:var(--font-display);font-size:21px;font-weight:800;color:#E65100;margin-top:2px;">' + biodieselL.toLocaleString() + '<span style="font-size:13px;font-weight:600;color:var(--gray);">L</span></div>'
          +     '<div style="font-size:10.5px;color:var(--gray);margin-top:2px;">SAF · 친환경 연료 원료</div>'
          +   '</div>'
          // ISCC 인증
          +   '<div style="background:linear-gradient(135deg,#E3F2FD,#fff);border-left:3px solid #1976D2;border-radius:10px;padding:13px 15px;">'
          +     '<div style="font-size:10.5px;font-weight:700;color:#185FA5;letter-spacing:0.05em;">🌍 ISCC 자가선언</div>'
          +     '<div style="font-family:var(--font-display);font-size:21px;font-weight:800;color:#185FA5;margin-top:2px;">' + isccStores + '<span style="font-size:13px;font-weight:600;color:var(--gray);"> / ' + stores.length + '</span></div>'
          +     '<div style="font-size:10.5px;color:var(--gray);margin-top:2px;">EU 인증 추적 매장</div>'
          +   '</div>'
          // 서명 등록
          +   '<div style="background:linear-gradient(135deg,#FCE4EC,#fff);border-left:3px solid #C2185B;border-radius:10px;padding:13px 15px;">'
          +     '<div style="font-size:10.5px;font-weight:700;color:#AD1457;letter-spacing:0.05em;">✍️ 대표자 서명</div>'
          +     '<div style="font-family:var(--font-display);font-size:21px;font-weight:800;color:#AD1457;margin-top:2px;">' + signedStores + '<span style="font-size:13px;font-weight:600;color:var(--gray);"> / ' + stores.length + '</span></div>'
          +     '<div style="font-size:10.5px;color:var(--gray);margin-top:2px;">자가선언서 자동 삽입</div>'
          +   '</div>'
          + '</div>'
          + '</div></div>';
      })()
    // 매장 리스트
    + _frHqStoresTable(stores)
    // 🆕 v137: 운영 이력 상세 (필터 + 엑셀)
    + '<div id="frHqOpsSection"></div>'
    // 안내 박스
    + '<div style="background:var(--green-pale);border:1.5px solid var(--green-main);border-radius:12px;padding:16px 20px;margin-top:18px;color:var(--green-dark);font-size:12.5px;line-height:1.7;">'
    +   '<div style="font-weight:800;margin-bottom:6px;">💡 본사 대시보드 사용 안내</div>'
    +   '<div>• <b>단가 협상</b>: 식용유 협상 단가는 식용유니버스 관리자만 수정 가능합니다. 변경 요청은 담당자에게 문의해주세요.</div>'
    +   '<div>• <b>폐유 매입금</b>: 본사 정산 X. 매장 폐유 매입금은 식용유니버스가 가맹점에 직접 입금합니다.</div>'
    +   '<div>• <b>ESG 리포트</b>: 우측 상단 [📄 ESG 리포트] 버튼으로 분기/연간 PDF 다운로드 가능 (분기 결산 시 사내 회의 자료로 활용).</div>'
    +   '<div>• <b>신규 매장 추가</b>: 우측 상단 [➕ 신규 매장] 버튼 사용. 추가된 매장에는 식용유니버스 담당자가 별도로 ID/QR을 전달합니다.</div>'
    + '</div>';

  // 🆕 v137: 운영 이력 섹션 렌더 (innerHTML 후)
  setTimeout(function(){ renderFrOpsSection('frHqOpsSection', stores); }, 50);

  // v133: 미니맵 제거 — 매장 위치는 [가맹점 지도] 메뉴에서 확인
}

// ════════════════════════════════════════════════════════════════════
// 🏫 v139: 급식소 관리 (관리자 페이지)
// ════════════════════════════════════════════════════════════════════

var schoolAdminFilterType = null;  // null=전체, '초중고'/'대학'/'병원'/'기업'

function _schoolAdminClassify(biz) {
  // 학교 유형 자동 분류 (이름 기반)
  var name = (biz.name || '').toLowerCase();
  if (/(초등|중학|고등|중고|초중|학교)/.test(biz.name || '')) return '초중고';
  if (/(대학|대학교|university|college)/i.test(biz.name || '')) return '대학';
  if (/(병원|의원|요양|클리닉|hospital)/i.test(biz.name || '')) return '병원';
  if (/(기업|회사|구내|사옥|법인)/i.test(biz.name || '')) return '기업';
  return '기타';
}

function renderSchoolAdminPage() {
  // 1. 급식소만 추출 (type === '급식소' 또는 tenant_type === 'school')
  var allSchools = businesses.filter(function(b) {
    return (b.type === '급식소') || (b.tenantType === 'school');
  });

  // 검색어
  var searchEl = document.getElementById('schoolAdminSearch');
  var searchKw = searchEl ? (searchEl.value || '').toLowerCase().trim() : '';
  // 필터 적용
  var filtered = allSchools.filter(function(b) {
    if (schoolAdminFilterType && _schoolAdminClassify(b) !== schoolAdminFilterType) return false;
    if (!searchKw) return true;
    return (b.name || '').toLowerCase().indexOf(searchKw) >= 0
      || (b.owner || '').toLowerCase().indexOf(searchKw) >= 0
      || (b.addr || '').toLowerCase().indexOf(searchKw) >= 0;
  });

  // 2. 유형 필터 칩
  var chipsEl = document.getElementById('schoolAdminFilterChips');
  if (chipsEl) {
    var counts = { '초중고': 0, '대학': 0, '병원': 0, '기업': 0, '기타': 0 };
    allSchools.forEach(function(b) { counts[_schoolAdminClassify(b)]++; });
    var chips = [
      { v: null, label: '🌐 전체', count: allSchools.length },
      { v: '초중고', label: '🏫 초·중·고', count: counts['초중고'] },
      { v: '대학', label: '🎓 대학', count: counts['대학'] },
      { v: '병원', label: '🏥 병원·요양', count: counts['병원'] },
      { v: '기업', label: '🏢 기업·구내식당', count: counts['기업'] },
      { v: '기타', label: '📦 기타', count: counts['기타'] }
    ];
    chipsEl.innerHTML = chips.map(function(c) {
      var active = schoolAdminFilterType === c.v;
      return '<button onclick="schoolAdminSetFilter(' + (c.v === null ? 'null' : '\''+c.v+'\'') + ')" '
        + 'style="padding:7px 14px;font-size:12px;font-weight:700;border-radius:18px;cursor:pointer;font-family:inherit;border:1.5px solid ' + (active ? 'var(--green-dark)' : 'var(--gray-light)') + ';background:' + (active ? 'var(--green-dark)' : '#fff') + ';color:' + (active ? '#fff' : 'var(--gray)') + ';">'
        + c.label + ' <span style="opacity:0.7;font-weight:600;">(' + c.count + ')</span>'
        + '</button>';
    }).join('');
  }

  // 3. KPI 계산
  var schoolIds = filtered.map(function(s){ return String(s.id); });
  var nowMonth = new Date().toISOString().slice(0,7);
  var schoolHist = historyData.filter(function(h) {
    return schoolIds.indexOf(String(h.bizId)) >= 0;
  });
  var monthHist = schoolHist.filter(function(h){ return (h.rawDate||'').startsWith(nowMonth); });
  var monthCollects = monthHist.filter(function(h){ return (h.type||'').indexOf('수거') >= 0; });
  var monthWasteCans = monthCollects.reduce(function(s,h){ return s + (h.qty||0); }, 0);
  var monthCO2 = Math.round(monthWasteCans * 16.5 * 0.7 * 10) / 10;

  // 누적
  var allCollects = schoolHist.filter(function(h){ return (h.type||'').indexOf('수거') >= 0; });
  var totalWasteCans = allCollects.reduce(function(s,h){ return s + (h.qty||0); }, 0);
  var totalWasteKg = Math.round(totalWasteCans * 16.5);
  var totalCO2 = Math.round(totalWasteKg * 0.7 * 10) / 10;
  // 학교 환경 교육 기금 (kg당 200원 예시)
  var totalFund = totalWasteKg * 200;
  // 환경 교육 활용 시간 (캔당 0.7시간 예시)
  var totalEduHours = (totalWasteCans * 0.7).toFixed(1);

  // 4. KPI 렌더
  var kpiEl = document.getElementById('schoolAdminKpiArea');
  if (kpiEl) {
    kpiEl.innerHTML = ''
      + _frAdminKpi('등록 급식소', allSchools.length + '개', '필터: ' + filtered.length + '개')
      + _frAdminKpi('활성 급식소', filtered.filter(function(s){return s.approved !== false;}).length + '개', '대기 ' + filtered.filter(function(s){return s.approved === false;}).length + '개')
      + _frAdminKpi('♻️ 이번달 폐유', monthWasteCans + '캔', monthCO2 + 'kg CO₂ 절감')
      + _frAdminKpi('🌍 누적 CO₂ 감축', totalCO2.toLocaleString() + 'kg', '누적 폐유 ' + totalWasteKg.toLocaleString() + 'kg')
      + _frAdminKpi('💚 환경교육 기금', (totalFund/10000).toFixed(0) + '만원', '학생 활동비 환산')
      + _frAdminKpi('📚 환경교육 시간', totalEduHours + '시간', '바이오디젤 ' + Math.round(totalWasteKg * 0.9).toLocaleString() + 'L');
  }

  // 5. 학교 리스트
  var listEl = document.getElementById('schoolAdminList');
  if (listEl) {
    if (filtered.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:40px 20px;color:var(--gray);">'
        + '<div style="font-size:40px;margin-bottom:10px;">🏫</div>'
        + (allSchools.length === 0 ? '아직 등록된 급식소가 없어요.<br>관리자 [업체 등록] 메뉴에서 추가하거나 [📋 신청 접수]에서 승인해주세요.' : '필터 조건에 맞는 급식소가 없어요')
        + '</div>';
    } else {
      var rows = filtered.map(function(s) {
        var sHist = historyData.filter(function(h){ return String(h.bizId) === String(s.id) && (h.rawDate||'').startsWith(nowMonth); });
        var sWasteThisMonth = sHist.filter(function(h){ return (h.type||'').indexOf('수거') >= 0; }).reduce(function(t,h){ return t + (h.qty||0); }, 0);
        var sWasteAll = historyData.filter(function(h){ return String(h.bizId) === String(s.id) && (h.type||'').indexOf('수거') >= 0; }).reduce(function(t,h){ return t + (h.qty||0); }, 0);
        var schoolType = _schoolAdminClassify(s);
        var typeBadge = '<span style="background:#E8F5E9;color:#2E7D32;font-size:10px;font-weight:800;padding:2px 7px;border-radius:5px;">' + schoolType + '</span>';
        var statusBadge = s.approved === false
          ? '<span style="background:#FFA726;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:5px;">대기</span>'
          : '<span style="background:var(--green-main);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:5px;">활성</span>';
        return '<tr style="border-bottom:1px solid var(--gray-light);">'
          + '<td style="padding:11px 8px;">' + statusBadge + '</td>'
          + '<td style="padding:11px 8px;">' + typeBadge + '</td>'
          + '<td style="padding:11px 8px;font-weight:700;">' + escapeHtml(s.name) + '</td>'
          + '<td style="padding:11px 8px;font-size:11.5px;color:var(--gray);">' + escapeHtml(s.owner || '—') + '</td>'
          + '<td style="padding:11px 8px;font-size:11.5px;color:var(--gray);">' + escapeHtml(s.addr || '—') + '</td>'
          + '<td style="padding:11px 8px;text-align:right;font-weight:800;color:#2E7D32;">' + sWasteThisMonth + '<span style="font-size:10px;color:var(--gray);font-weight:600;">캔</span></td>'
          + '<td style="padding:11px 8px;text-align:right;font-weight:700;color:var(--gray);">' + sWasteAll + '<span style="font-size:10px;font-weight:600;">캔</span></td>'
          + '</tr>';
      }).join('');
      listEl.innerHTML = '<div style="overflow-x:auto;"><table style="width:100%;font-size:12.5px;border-collapse:collapse;">'
        + '<thead><tr style="border-bottom:2px solid var(--green-main);background:var(--green-pale);">'
        +   '<th style="padding:11px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">상태</th>'
        +   '<th style="padding:11px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">유형</th>'
        +   '<th style="padding:11px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">급식소명</th>'
        +   '<th style="padding:11px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">담당자</th>'
        +   '<th style="padding:11px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">주소</th>'
        +   '<th style="padding:11px 8px;text-align:right;font-size:11px;color:var(--green-dark);font-weight:800;">이번달 폐유</th>'
        +   '<th style="padding:11px 8px;text-align:right;font-size:11px;color:var(--green-dark);font-weight:800;">누적</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody></table></div>';
    }
  }

  // 6. 운영 이력 (필터 + 엑셀)
  setTimeout(function(){
    if (typeof renderFrOpsSection === 'function') {
      renderFrOpsSection('schoolAdminOpsSection', filtered);
    }
  }, 50);
}

function schoolAdminSetFilter(type) {
  schoolAdminFilterType = type;
  renderSchoolAdminPage();
}

function _frHqKpiCard(title, value, sub, color) {
  return '<div style="background:var(--white);border-radius:14px;padding:18px 20px;border-left:4px solid ' + color + ';box-shadow:var(--shadow);">'
    + '<div style="font-size:11px;color:var(--gray);font-weight:700;letter-spacing:-0.01em;">' + title + '</div>'
    + '<div style="font-family:var(--font-display);font-size:22px;font-weight:800;color:' + color + ';margin-top:5px;">' + value + '</div>'
    + '<div style="font-size:11px;color:var(--gray);margin-top:2px;">' + sub + '</div>'
    + '</div>';
}

// ════════════════════════════════════════════════════════════════════
// 🆕 v137: 운영 이력 상세 (필터 + 엑셀 다운로드)
// ════════════════════════════════════════════════════════════════════

// 필터 상태 (전역)
var frOpsFilters = {
  store: 'all',  // 매장 ID or 'all'
  month: 'all',  // YYYY-MM or 'all'
  type: 'all'    // 'all' / '발주' / '수거'
};

// 매장 배열 + 컨텍스트 캐시 (다운로드 시 재사용)
var frOpsContext = { stores: [], containerId: null };

function renderFrOpsSection(containerId, stores, opts) {
  opts = opts || {};
  frOpsContext.stores = stores;
  frOpsContext.containerId = containerId;

  var el = document.getElementById(containerId);
  if (!el) return;

  // 1. 데이터 필터링
  var storeIds = stores.map(function(s){ return String(s.id); });
  var hist = historyData.filter(function(h) {
    return storeIds.indexOf(String(h.bizId)) >= 0;
  });

  // 매장 옵션
  var storeOpts = [{ value: 'all', label: '🏪 전체 매장 (' + stores.length + ')' }]
    .concat(stores.map(function(s){
      return { value: String(s.id), label: s.name + (s.storeCode ? ' #' + s.storeCode : '') };
    }));

  // 월 옵션 (이력에서 추출)
  var monthSet = {};
  hist.forEach(function(h) {
    var m = (h.rawDate || '').slice(0, 7);
    if (m) monthSet[m] = true;
  });
  var monthList = Object.keys(monthSet).sort().reverse();
  var monthOpts = [{ value: 'all', label: '📅 전체 월' }]
    .concat(monthList.map(function(m){
      var d = new Date(m + '-01');
      return { value: m, label: d.getFullYear() + '년 ' + (d.getMonth()+1) + '월' };
    }));

  // 종류 옵션
  var typeOpts = [
    { value: 'all', label: '📋 전체 종류' },
    { value: '발주', label: '📦 식용유 발주' },
    { value: '수거', label: '♻️ 폐유 수거' }
  ];

  // 필터 적용
  var filtered = hist.filter(function(h) {
    if (frOpsFilters.store !== 'all' && String(h.bizId) !== frOpsFilters.store) return false;
    if (frOpsFilters.month !== 'all' && (h.rawDate || '').slice(0, 7) !== frOpsFilters.month) return false;
    if (frOpsFilters.type !== 'all' && (h.type || '').indexOf(frOpsFilters.type) < 0) return false;
    return true;
  });
  // 최신순 정렬
  filtered.sort(function(a, b) {
    return (b.rawDate || '').localeCompare(a.rawDate || '');
  });

  // 요약 계산
  var sumOrders = filtered.filter(function(h){ return (h.type||'').indexOf('발주') >= 0; }).length;
  var sumWaste = filtered.filter(function(h){ return (h.type||'').indexOf('수거') >= 0; }).reduce(function(s,h){ return s + (h.qty||0); }, 0);

  // 2. 필터 UI + 표 + 다운로드 버튼 HTML 생성
  function _selOpts(arr, current) {
    return arr.map(function(o){
      return '<option value="' + escapeHtml(o.value) + '"' + (o.value === current ? ' selected' : '') + '>' + escapeHtml(o.label) + '</option>';
    }).join('');
  }

  var rowsHtml = filtered.length === 0
    ? '<tr><td colspan="6" style="padding:30px 12px;text-align:center;color:var(--gray);font-size:12.5px;">조건에 맞는 운영 이력이 없어요</td></tr>'
    : filtered.slice(0, 200).map(function(h) {
        var biz = stores.find(function(s){ return String(s.id) === String(h.bizId); });
        var isOrder = (h.type || '').indexOf('발주') >= 0;
        var typeColor = isOrder ? '#185FA5' : '#2E7D32';
        var typeBg = isOrder ? '#E3F2FD' : '#E8F5E9';
        var typeLabel = isOrder ? '📦 발주' : '♻️ 수거';
        return '<tr style="border-bottom:1px solid var(--gray-light);">'
          + '<td style="padding:10px 8px;font-size:11.5px;color:var(--gray);white-space:nowrap;">' + escapeHtml(h.date || '—') + '</td>'
          + '<td style="padding:10px 8px;font-size:12px;font-weight:700;">' + escapeHtml(biz ? biz.name : '?') + (biz && biz.storeCode ? ' <span style="font-size:10px;color:var(--gray);font-weight:600;">#' + escapeHtml(biz.storeCode) + '</span>' : '') + '</td>'
          + '<td style="padding:10px 8px;"><span style="background:' + typeBg + ';color:' + typeColor + ';font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:5px;white-space:nowrap;">' + typeLabel + '</span></td>'
          + '<td style="padding:10px 8px;font-size:11.5px;color:#555;">' + escapeHtml(h.product || h.oilType || '—') + '</td>'
          + '<td style="padding:10px 8px;text-align:right;font-weight:800;color:' + typeColor + ';">' + (h.qty || 0) + '<span style="font-size:10px;color:var(--gray);font-weight:600;"> 캔</span></td>'
          + '<td style="padding:10px 8px;text-align:right;font-size:11.5px;color:var(--gray);">' + (h.amount ? h.amount.toLocaleString() + '원' : '—') + '</td>'
          + '</tr>';
      }).join('');

  el.innerHTML = '<div class="card" style="margin-bottom:18px;"><div style="padding:18px 22px;">'
    // 헤더
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--green-dark);">📊 운영 이력 상세</div>'
    +     '<div style="font-size:11.5px;color:var(--gray);margin-top:2px;">매장·월·종류별로 필터링하고 엑셀로 다운로드할 수 있어요</div>'
    +   '</div>'
    +   '<button onclick="frOpsDownloadCsv()" style="background:#1F4D30;color:#FFEB3B;border:none;border-radius:8px;padding:9px 16px;font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;display:flex;align-items:center;gap:6px;">📥 엑셀 다운로드</button>'
    + '</div>'

    // 필터 UI
    + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;margin-bottom:12px;">'
    +   '<div>'
    +     '<label style="font-size:10.5px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px;">매장</label>'
    +     '<select onchange="frOpsSetFilter(\'store\', this.value)" style="width:100%;padding:8px 10px;font-size:12px;border:1px solid var(--gray-light);border-radius:7px;background:#fff;">' + _selOpts(storeOpts, frOpsFilters.store) + '</select>'
    +   '</div>'
    +   '<div>'
    +     '<label style="font-size:10.5px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px;">월</label>'
    +     '<select onchange="frOpsSetFilter(\'month\', this.value)" style="width:100%;padding:8px 10px;font-size:12px;border:1px solid var(--gray-light);border-radius:7px;background:#fff;">' + _selOpts(monthOpts, frOpsFilters.month) + '</select>'
    +   '</div>'
    +   '<div>'
    +     '<label style="font-size:10.5px;font-weight:700;color:var(--gray);display:block;margin-bottom:3px;">종류</label>'
    +     '<select onchange="frOpsSetFilter(\'type\', this.value)" style="width:100%;padding:8px 10px;font-size:12px;border:1px solid var(--gray-light);border-radius:7px;background:#fff;">' + _selOpts(typeOpts, frOpsFilters.type) + '</select>'
    +   '</div>'
    + '</div>'

    // 요약 바
    + '<div style="background:var(--green-pale);border-radius:8px;padding:9px 14px;margin-bottom:10px;font-size:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">'
    +   '<div style="color:var(--green-dark);">'
    +     '🔍 필터 결과: <b>' + filtered.length + '건</b>'
    +     ' · 발주 <b>' + sumOrders + '건</b>'
    +     ' · 폐유 수거 <b>' + sumWaste + '캔 (' + Math.round(sumWaste * 16.5) + 'kg)</b>'
    +   '</div>'
    +   (filtered.length > 200 ? '<div style="font-size:10.5px;color:#E65100;">⚠️ 최근 200건만 표시 — 전체는 엑셀 다운로드로</div>' : '')
    + '</div>'

    // 표
    + '<div style="overflow-x:auto;max-height:480px;overflow-y:auto;border:1px solid var(--gray-light);border-radius:8px;">'
    + '<table style="width:100%;font-size:12px;border-collapse:collapse;">'
    +   '<thead style="position:sticky;top:0;background:var(--green-pale);z-index:1;">'
    +   '<tr style="border-bottom:2px solid var(--green-main);">'
    +     '<th style="padding:10px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">날짜</th>'
    +     '<th style="padding:10px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">매장</th>'
    +     '<th style="padding:10px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">종류</th>'
    +     '<th style="padding:10px 8px;text-align:left;font-size:11px;color:var(--green-dark);font-weight:800;">품목</th>'
    +     '<th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--green-dark);font-weight:800;">수량</th>'
    +     '<th style="padding:10px 8px;text-align:right;font-size:11px;color:var(--green-dark);font-weight:800;">금액</th>'
    +   '</tr>'
    +   '</thead>'
    +   '<tbody>' + rowsHtml + '</tbody>'
    + '</table>'
    + '</div>'
    + '</div></div>';
}

function frOpsSetFilter(key, value) {
  frOpsFilters[key] = value;
  if (frOpsContext.containerId) {
    renderFrOpsSection(frOpsContext.containerId, frOpsContext.stores);
  }
}

function frOpsResetFilters() {
  frOpsFilters = { store: 'all', month: 'all', type: 'all' };
}

function frOpsDownloadCsv() {
  var stores = frOpsContext.stores || [];
  var storeIds = stores.map(function(s){ return String(s.id); });
  var hist = historyData.filter(function(h) {
    return storeIds.indexOf(String(h.bizId)) >= 0;
  });
  // 현재 필터 적용
  var filtered = hist.filter(function(h) {
    if (frOpsFilters.store !== 'all' && String(h.bizId) !== frOpsFilters.store) return false;
    if (frOpsFilters.month !== 'all' && (h.rawDate || '').slice(0, 7) !== frOpsFilters.month) return false;
    if (frOpsFilters.type !== 'all' && (h.type || '').indexOf(frOpsFilters.type) < 0) return false;
    return true;
  });
  filtered.sort(function(a, b) { return (a.rawDate || '').localeCompare(b.rawDate || ''); });

  if (filtered.length === 0) {
    showToast('t1', '📊 데이터 없음', '필터 조건에 맞는 운영 이력이 없어요');
    return;
  }

  // CSV 컬럼: 날짜 / 매장명 / 코드 / 브랜드 / 종류 / 품목 / 수량(캔) / 환산(kg) / 금액
  var header = ['날짜', '매장명', '매장코드', '브랜드', '종류', '품목', '수량(캔)', '환산(kg)', '금액(원)'];
  var lines = [header.join(',')];
  filtered.forEach(function(h) {
    var biz = stores.find(function(s){ return String(s.id) === String(h.bizId); });
    var brand = biz && biz.franchiseBrandId && typeof getBrandById === 'function' ? getBrandById(biz.franchiseBrandId) : null;
    var isOrder = (h.type || '').indexOf('발주') >= 0;
    var typeLabel = isOrder ? '발주' : '수거';
    var qty = h.qty || 0;
    var kg = isOrder ? '' : Math.round(qty * 16.5);
    var row = [
      h.date || h.rawDate || '',
      (biz ? biz.name : '').replace(/,/g, ' '),
      (biz && biz.storeCode) || '',
      (brand ? brand.name : '').replace(/,/g, ' '),
      typeLabel,
      (h.product || h.oilType || '').replace(/,/g, ' '),
      qty,
      kg,
      h.amount || ''
    ];
    lines.push(row.join(','));
  });

  var csv = lines.join('\n');
  var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var fnameParts = ['운영이력'];
  if (frOpsFilters.month !== 'all') fnameParts.push(frOpsFilters.month);
  if (frOpsFilters.type !== 'all') fnameParts.push(frOpsFilters.type);
  fnameParts.push((new Date()).toISOString().slice(0,10));
  a.download = fnameParts.join('_') + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('t1', '✅ 다운로드 완료', filtered.length + '건 운영이력 CSV 저장됨');
}

function _frHqStoresTable(stores) {
  if (stores.length === 0) {
    return '<div class="card"><div style="padding:40px 20px;text-align:center;color:var(--gray);">'
      + '<div style="font-size:36px;margin-bottom:10px;">🏪</div>'
      + '아직 등록된 매장이 없어요.<br>우측 상단 [➕ 신규 매장]으로 추가하거나 식용유니버스 담당자에게 일괄 등록을 요청해주세요.'
      + '</div></div>';
  }
  var nowMonth = new Date().toISOString().slice(0,7);
  var rows = stores.map(function(s) {
    var sHist = historyData.filter(function(h){ return String(h.bizId) === String(s.id) && (h.rawDate||'').startsWith(nowMonth); });
    var sOrders = sHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; }).length;
    var sWaste = sHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(t,h){ return t + (h.qty||0); }, 0);
    var lastDate = sHist.length > 0 ? sHist[0].date : '—';
    var statusBadge = s.approved === false
      ? '<span style="background:#FFA726;color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:5px;">대기</span>'
      : '<span style="background:var(--green-main);color:#fff;font-size:10px;font-weight:800;padding:2px 7px;border-radius:5px;">활성</span>';
    return '<tr style="border-bottom:1px solid var(--gray-light);transition:background 0.1s;" onmouseover="this.style.background=\'var(--green-pale)\'" onmouseout="this.style.background=\'\'">'
      + '<td style="padding:11px 8px;">' + statusBadge + '</td>'
      + '<td style="padding:11px 8px;font-weight:700;">' + escapeHtml(s.name) + '</td>'
      + '<td style="padding:11px 8px;font-size:11px;color:var(--gray);">' + (s.storeCode ? escapeHtml(s.storeCode) : '—') + '</td>'
      + '<td style="padding:11px 8px;font-size:11.5px;color:var(--gray);">' + escapeHtml(s.addr || '—') + '</td>'
      + '<td style="padding:11px 8px;text-align:center;">' + (s.auto ? '<span style="color:var(--green-main);font-weight:800;">ON</span>' : '<span style="color:#999;">OFF</span>') + '</td>'
      + '<td style="padding:11px 8px;text-align:right;font-weight:700;color:var(--green-dark);">' + sOrders + '</td>'
      + '<td style="padding:11px 8px;text-align:right;font-weight:700;color:#26A69A;">' + sWaste + '</td>'
      + '<td style="padding:11px 8px;font-size:11px;color:var(--gray);">' + lastDate + '</td>'
      + '</tr>';
  }).join('');
  return '<div class="card"><div style="padding:18px 22px;">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:var(--green-dark);">🏪 가맹점 운영 현황 (' + stores.length + '개)</div>'
    +     '<div style="font-size:11.5px;color:var(--gray);margin-top:2px;">이번 달 발주·폐유 합계 포함</div>'
    +   '</div>'
    +   '<input type="text" placeholder="🔍 매장 검색" oninput="frHqFilterStores(this.value)" style="padding:8px 12px;font-size:12px;border:1px solid var(--gray-light);border-radius:8px;width:180px;">'
    + '</div>'
    + '<div style="overflow-x:auto;">'
    + '<table style="width:100%;font-size:12.5px;border-collapse:collapse;" id="frHqStoresTable">'
    + '<thead><tr style="background:var(--green-pale);color:var(--green-dark);">'
    +   '<th style="padding:10px 8px;text-align:left;">상태</th>'
    +   '<th style="padding:10px 8px;text-align:left;">매장명</th>'
    +   '<th style="padding:10px 8px;text-align:left;">코드</th>'
    +   '<th style="padding:10px 8px;text-align:left;">주소</th>'
    +   '<th style="padding:10px 8px;text-align:center;">자동발주</th>'
    +   '<th style="padding:10px 8px;text-align:right;">이번달 발주</th>'
    +   '<th style="padding:10px 8px;text-align:right;">이번달 폐유</th>'
    +   '<th style="padding:10px 8px;text-align:left;">마지막 활동</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div></div>';
}

function frHqFilterStores(keyword) {
  var k = (keyword || '').trim().toLowerCase();
  var rows = document.querySelectorAll('#frHqStoresTable tbody tr');
  rows.forEach(function(tr) {
    if (!k) { tr.style.display = ''; return; }
    var text = tr.textContent.toLowerCase();
    tr.style.display = text.indexOf(k) >= 0 ? '' : 'none';
  });
}

// ───── 신규 매장 추가 (간단 모달) ─────
async function frHqShowAddStoreModal() {
  if (!hqLoggedIn || !hqBrandId) { alert('본사 로그인이 필요합니다'); return; }
  var brand = getBrandById(hqBrandId);
  var name = prompt('새 매장 이름:');
  if (!name) return;
  name = name.trim();
  if (!name) return;
  var code = prompt('매장 코드 (선택, 예: 003):', '') || '';
  var addr = prompt('주소 (선택):', '') || '';
  var phone = prompt('전화번호 (선택):', '') || '';
  var owner = prompt('담당자명 (선택):', '') || '';

  try {
    var payload = {
      name: name,
      type: '프랜차이즈',
      owner: owner,
      phone: phone,
      addr: addr,
      new_oil: 5, max_new: 10, waste_oil: 0,
      auto: false,
      tenant_type: 'franchise_store',
      franchise_brand_id: hqBrandId,
      store_code: code || null,
      approved: true
    };
    var res = await db.from('businesses').insert([payload]).select().single();
    if (res.error) throw res.error;
    await loadBusinessesFromDB();
    showToast('t1','✅ 매장 추가 완료', brand.name + ' · ' + name + ' 등록됨. 식용유니버스 담당자가 ID/QR 발송 예정');
    renderFrHqDashboard();
  } catch(e) {
    alert('❌ 매장 추가 실패: ' + (e.message || e));
  }
}

// ───── ESG 리포트 PDF 다운로드 (간단 HTML 출력 → 브라우저 인쇄로 PDF) ─────
async function frHqDownloadReport() {
  if (!hqLoggedIn || !hqBrandId) return;
  var brand = getBrandById(hqBrandId);
  var stores = getStoresOfBrand(hqBrandId);

  // 기간 선택 (이번달 / 분기 / 연간)
  var rangeChoice = prompt('리포트 기간을 선택해주세요\n1. 이번 달\n2. 이번 분기\n3. 올해 전체\n\n번호 입력:', '1');
  if (!rangeChoice) return;
  var rangeLabel, startDate, endDate;
  var now = new Date();
  if (rangeChoice === '1') {
    rangeLabel = (now.getMonth()+1) + '월';
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth()+1, 0);
  } else if (rangeChoice === '2') {
    var q = Math.floor(now.getMonth() / 3);
    rangeLabel = (q+1) + '분기';
    startDate = new Date(now.getFullYear(), q*3, 1);
    endDate = new Date(now.getFullYear(), q*3+3, 0);
  } else {
    rangeLabel = now.getFullYear() + '년 연간';
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  }
  var startStr = startDate.toISOString().slice(0,10);
  var endStr = endDate.toISOString().slice(0,10);

  // 기간 내 데이터
  var rangeHist = historyData.filter(function(h) {
    var sid = String(h.bizId);
    var isMyStore = stores.some(function(s){ return String(s.id) === sid; });
    if (!isMyStore) return false;
    var d = (h.rawDate || '').slice(0,10);
    return d >= startStr && d <= endStr;
  });
  var rangeOrders = rangeHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; });
  var rangeWasteHist = rangeHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; });
  var totalWaste = rangeWasteHist.reduce(function(s,h){ return s + (h.qty||0); }, 0);
  var totalCO2 = Math.round(totalWaste * 16.5 * 0.7);
  var totalBiodiesel = Math.round(totalWaste * 16.5 * 0.9);
  var totalOrderAmount = rangeOrders.reduce(function(s,h) {
    return s + (parseInt(String(h.amount||'0').replace(/[^\d]/g,'')) || 0);
  }, 0);

  // 매장별 데이터
  var storeStats = stores.map(function(s) {
    var sHist = rangeHist.filter(function(h){ return String(h.bizId) === String(s.id); });
    var sOrders = sHist.filter(function(h){ return h.type && h.type.indexOf('발주') >= 0; }).length;
    var sWaste = sHist.filter(function(h){ return h.type && h.type.indexOf('수거') >= 0; }).reduce(function(t,h){ return t + (h.qty||0); }, 0);
    return { name: s.name, code: s.storeCode || '—', orders: sOrders, waste: sWaste };
  }).sort(function(a,b){ return b.waste - a.waste; });

  // PDF용 HTML 생성
  var html = ''
    + '<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">'
    + '<title>' + escapeHtml(brand.name) + ' ESG 리포트 - ' + rangeLabel + '</title>'
    + '<style>'
    + '@page { size: A4 portrait; margin: 18mm; }'
    + 'body { font-family: "Pretendard", "Apple SD Gothic Neo", sans-serif; color:#1a1a1a; line-height:1.5; margin:0; }'
    + '.no-print { background:#0F2419;color:#FFEB3B;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;z-index:10; }'
    + '.no-print button { background:#FFEB3B;color:#0F2419;border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:800;cursor:pointer; }'
    + '@media print { .no-print { display:none !important; } }'
    + '.content { padding: 24px 28px; max-width: 800px; margin: 0 auto; }'
    + 'h1 { font-size: 26px; margin: 0 0 4px; color:#0F2419; letter-spacing:-0.03em; }'
    + 'h2 { font-size: 16px; margin: 22px 0 10px; color:#1F6B40; border-bottom: 2px solid #3D9E6E; padding-bottom: 6px; }'
    + '.subtitle { color:#666; font-size:13px; margin-bottom:6px; }'
    + '.brand-info { display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:20px; }'
    + '.kpi-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:8px; }'
    + '.kpi-card { background:#F0F8F2;border-left:4px solid #3D9E6E;padding:12px 14px;border-radius:8px; }'
    + '.kpi-label { font-size:11px;color:#666;font-weight:700; }'
    + '.kpi-value { font-size:22px;font-weight:800;color:#1F6B40;margin-top:4px; }'
    + '.kpi-sub { font-size:11px;color:#888;margin-top:2px; }'
    + 'table { width:100%;border-collapse:collapse;font-size:12px;margin-top:8px; }'
    + 'th { background:#E8F5E9;color:#1F6B40;padding:8px;text-align:left;border-bottom:2px solid #3D9E6E; }'
    + 'td { padding:7px 8px;border-bottom:1px solid #eee; }'
    + '.footer { margin-top:30px;padding-top:14px;border-top:1px dashed #999;font-size:10.5px;color:#777;line-height:1.7; }'
    + '.formula-box { background:#FFF8E1;border:1px solid #FFB300;border-radius:8px;padding:10px 14px;font-size:11px;color:#7A4F00;margin-top:8px; }'
    + '</style></head><body>'
    + '<div class="no-print">'
    +   '<div style="font-weight:800;">📄 ' + escapeHtml(brand.name) + ' ESG 리포트 — ' + rangeLabel + '</div>'
    +   '<div><button onclick="window.print()">🖨️ PDF 저장 / 인쇄</button> '
    +   '<button onclick="window.close()" style="background:rgba(255,255,255,0.15);color:#fff;margin-left:6px;">닫기</button></div>'
    + '</div>'
    + '<div class="content">'

    + '<div class="brand-info">'
    +   '<div>'
    +     '<h1>🏪 ' + escapeHtml(brand.name) + '</h1>'
    +     '<div class="subtitle">ESG 운영 리포트 · ' + rangeLabel + '</div>'
    +     '<div class="subtitle">대상 기간: ' + startStr + ' ~ ' + endStr + '</div>'
    +   '</div>'
    +   '<div style="text-align:right;font-size:11px;color:#666;">'
    +     '<div><b>발급</b> 식용유니버스 (HIVEOIL)</div>'
    +     '<div><b>발급일</b> ' + (new Date()).toISOString().slice(0,10) + '</div>'
    +     '<div><b>대상 매장</b> ' + stores.length + '개</div>'
    +   '</div>'
    + '</div>'

    + '<h2>📊 종합 운영 현황</h2>'
    + '<div class="kpi-grid">'
    +   '<div class="kpi-card"><div class="kpi-label">📦 총 발주</div><div class="kpi-value">' + rangeOrders.length + '건</div><div class="kpi-sub">합계 ' + (totalOrderAmount/10000).toFixed(0) + '만원 (VAT포함)</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">♻️ 폐유 수거</div><div class="kpi-value">' + totalWaste + '캔</div><div class="kpi-sub">합계 ' + (totalWaste * 16.5) + 'kg</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">🌍 CO₂ 절감</div><div class="kpi-value">' + totalCO2 + 'kg</div><div class="kpi-sub">승용차 약 ' + Math.round(totalCO2 * 4.4) + 'km 주행 배출량 상쇄</div></div>'
    +   '<div class="kpi-card"><div class="kpi-label">⛽ 바이오디젤 전환</div><div class="kpi-value">' + totalBiodiesel + 'L</div><div class="kpi-sub">전량 단석산업 공급</div></div>'
    + '</div>'
    + '<div class="formula-box"><b>📐 환산 기준</b> · 폐유 1캔 = 16.5kg · 폐유 1L → CO₂ 0.7kg 절감 (바이오디젤 환산) · 폐유 1L → 바이오디젤 약 0.9L</div>'

    + '<h2>🏪 매장별 현황 (' + storeStats.length + '개, 폐유 수거량 기준 정렬)</h2>'
    + '<table>'
    + '<thead><tr><th>순위</th><th>매장명</th><th>코드</th><th style="text-align:right;">발주</th><th style="text-align:right;">폐유 (캔)</th><th style="text-align:right;">CO₂ 절감 (kg)</th></tr></thead>'
    + '<tbody>'
    + storeStats.map(function(s, i) {
        var co2 = Math.round(s.waste * 16.5 * 0.7 * 10) / 10;
        return '<tr>'
          + '<td>' + (i+1) + '</td>'
          + '<td><b>' + escapeHtml(s.name) + '</b></td>'
          + '<td>' + escapeHtml(s.code) + '</td>'
          + '<td style="text-align:right;">' + s.orders + '건</td>'
          + '<td style="text-align:right;font-weight:700;">' + s.waste + '</td>'
          + '<td style="text-align:right;color:#1F6B40;">' + co2 + '</td>'
          + '</tr>';
      }).join('')
    + '</tbody></table>'

    + '<h2>🌱 ESG 성과 요약</h2>'
    + '<ul style="font-size:13px;line-height:1.9;padding-left:18px;">'
    +   '<li><b>' + brand.name + '</b> 브랜드 ' + stores.length + '개 매장에서 ' + rangeLabel + ' 동안 폐식용유 <b>' + totalWaste + '캔(' + (totalWaste * 16.5) + 'kg)</b>을 안전하게 수거·재활용했습니다.</li>'
    +   '<li>이는 CO₂ <b>' + totalCO2 + 'kg</b> 절감 효과로, 30년생 소나무 <b>약 ' + Math.round(totalCO2 / 6.6) + '그루</b>가 1년간 흡수하는 양과 동일합니다.</li>'
    +   '<li>수거된 폐유는 전량 <b>단석산업</b>으로 공급되어 바이오디젤로 재탄생, 항공유(SAF)·차량연료로 활용됩니다.</li>'
    +   '<li>본 활동은 EU ISCC EU 인증 기준에 따라 추적·관리되고 있으며, 추후 자가선언서 발행을 통해 매장별 ESG 자산화가 가능합니다.</li>'
    + '</ul>'

    + '<div class="footer">'
    +   '<b>📜 본 리포트는 식용유니버스(HIVEOIL) PWA에서 자동 생성되었습니다.</b><br>'
    +   '문의 · 검증: 식용유니버스 대표 김기봉 · ' + (new Date()).toISOString().slice(0,10) + ' 발급<br>'
    +   '본 리포트는 ' + escapeHtml(brand.name) + ' 사내 ESG 보고·홍보 자료로 자유롭게 활용하실 수 있습니다.'
    + '</div>'

    + '</div></body></html>';

  var win = window.open('', '_blank');
  if (!win) { alert('팝업이 차단됐어요. 팝업 허용 후 다시 시도해주세요.'); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

// ════════════════════════════════════════════════════════════════════
// 🆕 v129: 가맹점 자율 가입
// ════════════════════════════════════════════════════════════════════

async function frStoreSignupInit() {
  // 브랜드 드롭다운 채우기 (활성 브랜드만)
  await loadFranchiseBrandsFromDB();
  var sel = document.getElementById('frSignupBrandId');
  if (!sel) return;
  var activeBrands = franchiseBrands.filter(function(b){ return b.status === 'active'; });
  if (activeBrands.length === 0) {
    sel.innerHTML = '<option value="">— 활성 브랜드 없음 (식용유니버스에 문의해주세요) —</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = '<option value="">— 브랜드를 선택해주세요 —</option>'
    + activeBrands.map(function(b){
        return '<option value="' + b.id + '">🏪 ' + escapeHtml(b.name) + '</option>';
      }).join('');
}

// 🆕 v130: panel-register 프랜차이즈 토글
function toggleRegFranchiseSection() {
  var checked = document.querySelector('input[name="reg_tenant_type"]:checked');
  var value = checked ? checked.value : 'individual';
  var section = document.getElementById('reg_franchise_section');
  var schoolSection = document.getElementById('reg_school_section');
  if (section) section.style.display = (value === 'franchise_store') ? 'block' : 'none';
  if (schoolSection) schoolSection.style.display = (value === 'school') ? 'block' : 'none';

  // 시각 효과 - 선택된 라디오 카드 강조
  document.querySelectorAll('.reg-tenant-option').forEach(function(el) {
    var isActive = el.dataset.value === value;
    el.style.borderColor = isActive ? 'var(--green-main)' : 'var(--gray-light)';
    el.style.background = isActive ? 'var(--green-pale)' : '#fff';
    el.querySelector('div:nth-child(2)').style.color = isActive ? 'var(--green-dark)' : 'var(--gray)';
  });

  // 프랜차이즈 선택 시 브랜드 드롭다운 채움
  if (value === 'franchise_store') {
    populateRegBrandDropdown();
  }
}

async function populateRegBrandDropdown() {
  await loadFranchiseBrandsFromDB();
  var sel = document.getElementById('reg_brand_id');
  if (!sel) return;
  var activeBrands = franchiseBrands.filter(function(b){ return b.status === 'active'; });
  if (activeBrands.length === 0) {
    sel.innerHTML = '<option value="">— 활성 브랜드 없음 (식용유니버스에 문의해주세요) —</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  var prevValue = sel.value;
  sel.innerHTML = '<option value="">— 브랜드를 선택해주세요 —</option>'
    + activeBrands.map(function(b){
        return '<option value="' + b.id + '">🏪 ' + escapeHtml(b.name) + '</option>';
      }).join('');
  if (prevValue) sel.value = prevValue;
}

// 🆕 v130: 가맹점 가입 메뉴 → register 패널로 redirect (프랜차이즈 옵션 자동 선택)
function showFrSignupRedirect() {
  showPanel('register', null);
  setTimeout(function(){
    var radio = document.querySelector('input[name="reg_tenant_type"][value="franchise_store"]');
    if (radio) { radio.checked = true; toggleRegFranchiseSection(); }
  }, 250);
}

async function frStoreSignupSubmit() {
  var setStatus = function(msg, ok) {
    var el = document.getElementById('frSignupStatus');
    if (el) { el.textContent = msg; el.style.color = ok ? '#2E7D32' : '#C62828'; }
  };

  // 입력값 수집
  var brandId = (document.getElementById('frSignupBrandId').value || '').trim();
  var name = (document.getElementById('frSignupName').value || '').trim();
  var code = (document.getElementById('frSignupCode').value || '').trim();
  var addr = (document.getElementById('frSignupAddr').value || '').trim();
  var phone = (document.getElementById('frSignupPhone').value || '').trim();
  var owner = (document.getElementById('frSignupOwner').value || '').trim();
  var bizNo = (document.getElementById('frSignupBizNo').value || '').trim();
  var loginId = (document.getElementById('frSignupLoginId').value || '').trim();
  var loginPw = (document.getElementById('frSignupLoginPw').value || '').trim();
  var agreed = document.getElementById('frSignupAgree').checked;

  // 검증
  if (!brandId) { setStatus('❌ 브랜드를 선택해주세요'); return; }
  if (!name) { setStatus('❌ 매장명을 입력해주세요'); return; }
  if (!addr) { setStatus('❌ 주소를 입력해주세요'); return; }
  if (!phone) { setStatus('❌ 전화번호를 입력해주세요'); return; }
  if (!owner) { setStatus('❌ 사장님 성함을 입력해주세요'); return; }
  if (!loginId) { setStatus('❌ 로그인 아이디를 입력해주세요'); return; }
  if (loginId.length < 4) { setStatus('❌ 아이디는 4자 이상이어야 합니다'); return; }
  if (!loginPw || loginPw.length < 4) { setStatus('❌ 비밀번호는 4자 이상이어야 합니다'); return; }
  if (!agreed) { setStatus('❌ 이용약관에 동의해주세요'); return; }

  // 아이디 중복 체크
  setStatus('⏳ 확인 중...', true);
  try {
    var dup = await db.from('businesses').select('id, name').eq('login_id', loginId).limit(1);
    if (dup.data && dup.data.length > 0) {
      setStatus('❌ 이미 사용중인 아이디입니다. 다른 아이디로 시도해주세요'); return;
    }
  } catch(e) {
    console.warn('아이디 중복 체크 실패:', e);
  }

  // 등록 (approved: false → 승인 대기)
  setStatus('⏳ 가입 신청 중...', true);
  try {
    var payload = {
      name: name,
      type: '프랜차이즈',
      owner: owner,
      phone: phone,
      addr: addr,
      new_oil: 5,
      max_new: 10,
      waste_oil: 0,
      auto: false,
      tenant_type: 'franchise_store',
      franchise_brand_id: brandId,
      store_code: code || null,
      login_id: loginId,
      login_pw: loginPw,
      approved: false  // 🔑 승인 대기 상태
    };
    if (bizNo) payload.biz_no = bizNo;
    var res = await db.from('businesses').insert([payload]).select().single();
    if (res.error) throw res.error;

    // 입력값 초기화
    ['frSignupName','frSignupCode','frSignupAddr','frSignupPhone','frSignupOwner','frSignupBizNo','frSignupLoginId','frSignupLoginPw'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.getElementById('frSignupAgree').checked = false;
    document.getElementById('frSignupBrandId').value = '';

    var brand = getBrandById(brandId);
    setStatus('', true);
    // 성공 화면 표시
    showFrSignupSuccess(name, brand ? brand.name : '', loginId);
  } catch(e) {
    if (e.message && e.message.indexOf('column') >= 0 && e.message.indexOf('biz_no') >= 0) {
      // biz_no 컬럼 없으면 재시도
      setStatus('⏳ 재시도 중...', true);
      try {
        delete payload.biz_no;
        var res2 = await db.from('businesses').insert([payload]).select().single();
        if (res2.error) throw res2.error;
        showFrSignupSuccess(name, getBrandById(brandId)?.name || '', loginId);
        setStatus('', true);
        return;
      } catch(e2) {
        setStatus('❌ 가입 실패: ' + (e2.message || e2));
        return;
      }
    }
    setStatus('❌ 가입 실패: ' + (e.message || e));
  }
}

function showFrSignupSuccess(storeName, brandName, loginId) {
  var panel = document.getElementById('panel-fr-store-signup');
  if (!panel) return;
  panel.innerHTML = '<div style="max-width:520px;margin:60px auto;padding:0 24px;text-align:center;">'
    + '<div style="font-size:64px;margin-bottom:14px;">✅</div>'
    + '<div style="font-family:var(--font-display);font-size:24px;font-weight:800;color:var(--green-dark);margin-bottom:8px;letter-spacing:-0.03em;">가입 신청 완료!</div>'
    + '<div style="font-size:13px;color:var(--gray);margin-bottom:24px;line-height:1.7;">'
    +   '<b>' + escapeHtml(storeName) + '</b> 매장이 <b>' + escapeHtml(brandName) + '</b>의 가맹점으로 신청되었습니다.<br>'
    +   '식용유니버스 담당자 또는 본사 승인을 거쳐 활성화됩니다.'
    + '</div>'
    + '<div style="background:var(--green-pale);border:1.5px solid var(--green-main);border-radius:12px;padding:18px 20px;margin-bottom:20px;font-size:12.5px;color:var(--green-dark);line-height:1.8;text-align:left;">'
    +   '<div style="font-weight:800;margin-bottom:8px;">📌 다음 단계</div>'
    +   '<div>① 가입하신 ID <code style="background:#fff;padding:2px 6px;border-radius:4px;font-family:monospace;">' + escapeHtml(loginId) + '</code>를 잘 기억해주세요</div>'
    +   '<div>② 본사 또는 식용유니버스 담당자에게 가입 사실을 알려주세요</div>'
    +   '<div>③ 승인 완료 후 [업주 로그인]에서 로그인할 수 있어요</div>'
    +   '<div>④ 평균 승인 시간: <b>1영업일 이내</b></div>'
    + '</div>'
    + '<button onclick="location.reload()" style="background:var(--green-dark);color:#fff;border:none;border-radius:10px;padding:13px 28px;font-size:13.5px;font-weight:800;cursor:pointer;font-family:inherit;">메인으로 돌아가기</button>'
    + '</div>';
  // 토스트도 띄움
  showToast('t1', '✅ 가입 신청 완료', '본사 승인 후 로그인 가능합니다');
}

// ════════════════════════════════════════════════════════════════════
// 🆕 v129: 가맹점 가입 승인 (본사 + 관리자)
// ════════════════════════════════════════════════════════════════════

function frHqShowPendingModal() {
  // 본사 로그인 또는 관리자만
  if (!hqLoggedIn && !isAdminMode) {
    showToast('t1', '🔒 권한 없음', '본사 또는 관리자만 접근 가능');
    return;
  }
  var brandFilter = hqLoggedIn ? hqBrandId : null;  // 본사면 자기 브랜드만, 관리자면 전체

  // 🆕 v132: pending_biz에서 프랜차이즈 가맹점 신청 가져오기
  //   + 기존 businesses.approved=false도 (v129 이전 데이터 호환)
  var pendingFromQueue = (typeof pendingBizData !== 'undefined' ? pendingBizData : []).filter(function(p) {
    if (p.tenant_type !== 'franchise_store') return false;
    if (brandFilter && p.franchise_brand_id !== brandFilter) return false;
    return true;
  });
  var pendingFromBiz = businesses.filter(function(b) {
    if (b.tenantType !== 'franchise_store') return false;
    if (b.approved !== false) return false;
    if (brandFilter && b.franchiseBrandId !== brandFilter) return false;
    return true;
  });

  // 모달 생성
  var modal = document.createElement('div');
  modal.id = 'frPendingModal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.onclick = function(e){ if (e.target === modal) modal.remove(); };

  var totalCount = pendingFromQueue.length + pendingFromBiz.length;
  var emptyHtml = '<div style="text-align:center;padding:40px 20px;color:var(--gray);"><div style="font-size:40px;margin-bottom:10px;">🎉</div>승인 대기 중인 가맹점이 없어요!</div>';

  // pending_biz 신청 카드 (자율 가입)
  var pendingQueueHtml = pendingFromQueue.map(function(p) {
    var brand = (typeof franchiseBrands !== 'undefined' ? franchiseBrands : []).find(function(b){ return b.id === p.franchise_brand_id; });
    return '<div style="background:var(--white);border:1.5px solid #FFB300;border-radius:10px;padding:14px 16px;margin-bottom:10px;position:relative;">'
      + '<span style="position:absolute;top:8px;right:10px;background:#FFB300;color:#fff;font-size:9px;font-weight:800;padding:2px 7px;border-radius:5px;">🆕 자율가입</span>'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:14px;font-weight:800;color:var(--green-dark);">🏪 ' + escapeHtml(p.name) + (p.store_code ? ' <span style="font-size:11px;color:var(--gray);font-weight:600;">#' + escapeHtml(p.store_code) + '</span>' : '') + '</div>'
      +     '<div style="font-size:11.5px;color:var(--gray);margin-top:4px;line-height:1.7;">'
      +       '브랜드: <b style="color:var(--green-dark);">' + escapeHtml(brand ? brand.name : '?') + '</b><br>'
      +       '사장: ' + escapeHtml(p.owner || '?') + ' · 📞 ' + escapeHtml(p.phone || '?') + '<br>'
      +       '📍 ' + escapeHtml(p.addr || '?') + '<br>'
      +       '🔐 ID: <code style="background:#FFF8E1;padding:1px 5px;border-radius:3px;font-family:monospace;">' + escapeHtml(p.login_id || '?') + '</code>'
      +       (p.iscc_agreed ? '<br><span style="color:#2E7D32;font-weight:700;">✓ ISCC 동의 완료</span>' : '')
      +       (p.owner_signature ? ' <span style="color:#2E7D32;font-weight:700;">✓ 서명 완료</span>' : '')
      +       (p.cert_image ? '<br><a href="' + p.cert_image + '" target="_blank" style="color:#185FA5;text-decoration:underline;font-size:11px;">📄 사업자등록증 보기</a>' : '')
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:6px;flex-direction:column;">'
      +     '<button onclick="frApproveSignup(' + p.id + ')" style="background:var(--green-dark);color:#fff;border:none;border-radius:7px;padding:8px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">✅ 승인</button>'
      +     '<button onclick="frRejectSignup(' + p.id + ',\'' + escapeHtml(p.name) + '\')" style="background:#fff;color:#C62828;border:1px solid #C62828;border-radius:7px;padding:8px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">❌ 거절</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  // businesses 신청 카드 (CSV 일괄로 등록되었으나 아직 approved=false인 경우 + v129 호환)
  var pendingBizHtml = pendingFromBiz.map(function(s) {
    var brand = getBrandById(s.franchiseBrandId);
    return '<div style="background:var(--white);border:1.5px solid var(--gray-light);border-radius:10px;padding:14px 16px;margin-bottom:10px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">'
      +   '<div style="flex:1;min-width:200px;">'
      +     '<div style="font-size:14px;font-weight:800;color:var(--green-dark);">🏪 ' + escapeHtml(s.name) + (s.storeCode ? ' <span style="font-size:11px;color:var(--gray);font-weight:600;">#' + escapeHtml(s.storeCode) + '</span>' : '') + '</div>'
      +     '<div style="font-size:11.5px;color:var(--gray);margin-top:4px;line-height:1.6;">'
      +       '브랜드: <b style="color:var(--green-dark);">' + escapeHtml(brand ? brand.name : '?') + '</b><br>'
      +       '사장: ' + escapeHtml(s.owner || '?') + ' · 📞 ' + escapeHtml(s.phone || '?') + '<br>'
      +       '📍 ' + escapeHtml(s.addr || '?') + '<br>'
      +       '🔐 ID: <code style="background:#FFF8E1;padding:1px 5px;border-radius:3px;font-family:monospace;">' + escapeHtml(s.loginId || '?') + '</code>'
      +     '</div>'
      +   '</div>'
      +   '<div style="display:flex;gap:6px;flex-direction:column;">'
      +     '<button onclick="frApproveStore(' + s.id + ')" style="background:var(--green-dark);color:#fff;border:none;border-radius:7px;padding:8px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">✅ 승인</button>'
      +     '<button onclick="frRejectStore(' + s.id + ',\'' + escapeHtml(s.name) + '\')" style="background:#fff;color:#C62828;border:1px solid #C62828;border-radius:7px;padding:8px 14px;font-size:11.5px;font-weight:800;cursor:pointer;font-family:inherit;">❌ 거절</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');

  var bodyHtml = totalCount === 0
    ? emptyHtml
    : (pendingFromQueue.length > 0 ? '<div style="font-size:11.5px;font-weight:800;color:#7A4F00;margin-bottom:8px;letter-spacing:-0.01em;">🆕 자율 가입 신청 (' + pendingFromQueue.length + ')</div>' + pendingQueueHtml : '')
      + (pendingFromBiz.length > 0 ? '<div style="font-size:11.5px;font-weight:800;color:var(--gray);margin:14px 0 8px;letter-spacing:-0.01em;">📥 CSV 일괄 등록 매장 (승인 대기 ' + pendingFromBiz.length + ')</div>' + pendingBizHtml : '');

  modal.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:640px;width:100%;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.3);">'
    + '<div style="background:linear-gradient(135deg,#FFB300,#FF9500);color:#fff;padding:16px 22px;display:flex;justify-content:space-between;align-items:center;">'
    +   '<div>'
    +     '<div style="font-family:var(--font-display);font-size:17px;font-weight:800;">⏳ 가맹점 가입 신청 검토</div>'
    +     '<div style="font-size:11.5px;opacity:0.85;margin-top:3px;">' + totalCount + '건 대기 중' + (brandFilter ? ' · 자기 브랜드만' : ' · 전체 브랜드') + '</div>'
    +   '</div>'
    +   '<button onclick="document.getElementById(\'frPendingModal\').remove()" style="background:rgba(255,255,255,0.2);color:#fff;border:none;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;">닫기</button>'
    + '</div>'
    + '<div style="padding:18px 22px;overflow-y:auto;flex:1;">' + bodyHtml + '</div>'
    + '</div>';

  document.body.appendChild(modal);
}

// 🆕 v132: pending_biz 자율가입 승인 (기존 approvePendingBiz 위임)
async function frApproveSignup(pendingId) {
  try {
    if (typeof approvePendingBiz !== 'function') {
      throw new Error('approvePendingBiz 함수 없음');
    }
    // 관리자 모드가 아니면 (본사 로그인) 임시 권한 부여
    var wasAdmin = isAdminMode;
    if (!isAdminMode) {
      // 본사가 자기 브랜드 가맹점 승인하는 경우 — 임시 관리자 권한
      window._tempAdminForApproval = true;
      isAdminMode = true;
    }
    try {
      approvePendingBiz(pendingId);
      showToast('t1', '✅ 승인 완료', '가맹점 활성화 됨');
      // 모달 갱신
      setTimeout(function() {
        var modal = document.getElementById('frPendingModal');
        if (modal) { modal.remove(); frHqShowPendingModal(); }
        if (hqLoggedIn) renderFrHqDashboard();
        if (wasAdmin) renderFranchiseAdminPage();
      }, 800);
    } finally {
      if (!wasAdmin) {
        isAdminMode = false;
        window._tempAdminForApproval = false;
      }
    }
  } catch(e) {
    alert('❌ 승인 실패: ' + (e.message || e));
  }
}

async function frRejectSignup(pendingId, bizName) {
  var reason = prompt('"' + bizName + '" 가입 신청을 거절할까요?\n\n(거절 사유 - 선택, 매장에 전달 안 됨)', '');
  if (reason === null) return;
  try {
    var res = await db.from('pending_biz').delete().eq('id', pendingId);
    if (res.error) throw res.error;
    // 메모리에서도 제거
    if (typeof pendingBizData !== 'undefined') {
      pendingBizData = pendingBizData.filter(function(p){ return p.id !== pendingId; });
    }
    showToast('t1', '❌ 거절 완료', bizName + ' 가입 신청 삭제됨');
    var modal = document.getElementById('frPendingModal');
    if (modal) { modal.remove(); frHqShowPendingModal(); }
    if (hqLoggedIn) renderFrHqDashboard();
    if (isAdminMode) renderFranchiseAdminPage();
  } catch(e) {
    alert('❌ 거절 실패: ' + (e.message || e));
  }
}

async function frApproveStore(bizId) {
  try {
    var res = await db.from('businesses').update({ approved: true }).eq('id', bizId);
    if (res.error) throw res.error;
    await loadBusinessesFromDB();
    var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
    showToast('t1', '✅ 승인 완료', (biz ? biz.name : '매장') + ' 활성화 됨');
    // 모달 갱신
    var modal = document.getElementById('frPendingModal');
    if (modal) { modal.remove(); frHqShowPendingModal(); }
    // 대시보드 갱신
    if (hqLoggedIn) renderFrHqDashboard();
    if (isAdminMode) renderFranchiseAdminPage();
  } catch(e) {
    alert('❌ 승인 실패: ' + (e.message || e));
  }
}

async function frRejectStore(bizId, bizName) {
  var reason = prompt('"' + bizName + '" 가입을 거절하시겠어요?\n\n(거절 사유 - 선택, 매장에 전달 안 됨)', '');
  if (reason === null) return;  // 취소
  try {
    var res = await db.from('businesses').delete().eq('id', bizId);
    if (res.error) throw res.error;
    await loadBusinessesFromDB();
    showToast('t1', '❌ 거절 완료', bizName + ' 가입 신청 삭제됨');
    var modal = document.getElementById('frPendingModal');
    if (modal) { modal.remove(); frHqShowPendingModal(); }
    if (hqLoggedIn) renderFrHqDashboard();
    if (isAdminMode) renderFranchiseAdminPage();
  } catch(e) {
    alert('❌ 거절 실패: ' + (e.message || e));
  }
}

// 관리자 페이지에서도 사용
function frAdminShowPendingModal() { frHqShowPendingModal(); }


// ════════════════════════════════════════════════════════════════════
// 🏪 v119+ 프랜차이즈 시스템 — 끝
// ════════════════════════════════════════════════════════════════════

// ===== 발주 페이지 렌더 =====
function renderDeliveryPanel() {
  // 업주 로그인 시 자기 업체만
  const myBizFilter = (ownerLoggedIn && ownerBizId) ? function(b){ return String(b.id) === String(ownerBizId); } : function(){ return true; };
  const myHistFilter = (ownerLoggedIn && ownerBizId) ? function(h){ return String(h.bizId) === String(ownerBizId); } : function(){ return true; };


  // 자동발주 업체 목록
  const autoList = document.getElementById('autoOrderList');
  // 🛡️ v102: 자동발주 OFF 업체 절대 제외 (===true 만 통과)
  // 이전 버그: row.auto !== false 매핑이 null/undefined를 true로 처리 → OFF 업체도 표시됨
  const autoBiz  = businesses.filter(function(b) {
    if (b.auto !== true) return false;  // 명시적 true가 아니면 제외 (null/undefined/false 모두 차단)
    var prods = getBizProducts(b);
    return prods.some(function(p){ return (p.qty||0) <= 2; });
  }).filter(myBizFilter);

  // KPI 카운터
  const autoCountEl  = document.getElementById('orderAutoCount');
  const extraCountEl = document.getElementById('orderExtraCount');
  const extraOrders  = historyData.filter(h => !h.deleted_at && h.type === '식용유발주' && h.status === 'pending' && h.method === '추가발주').filter(myHistFilter);
  const autoOrders   = historyData.filter(h => !h.deleted_at && h.type === '식용유발주' && h.status === 'pending' && h.method !== '추가발주').filter(myHistFilter);
  // 자동발주 카운트 = 실제 화면에 표시될 업체 수와 정확히 일치
  // ⚠️ 핵심: businesses에 존재하는 업체만 카운트 (deleted/legacy biz 제외)
  // - autoBiz: 재고부족 + auto=true 업체 (이미 businesses에서 필터됨)
  // - autoOrders: pending 자동발주 history → 해당 bizId가 businesses에 살아있는 것만
  // - dismiss(_suppressAutoOrder)된 업체는 양쪽 다 제외
  const allAutoBizIds = new Set();
  autoBiz.forEach(function(b){
    if (b._suppressAutoOrder && Date.now() < b._suppressAutoOrder) return;
    allAutoBizIds.add(String(b.id));
  });
  autoOrders.forEach(function(h){
    if (!h.bizId) return;
    var bz = businesses.find(function(x){ return String(x.id) === String(h.bizId); });
    if (!bz) return; // 삭제된 업체는 카운트하지 않음
    if (bz.auto !== true) return; // 🛡️ v102: 자동발주 OFF 업체의 pending 이력은 제외
    if (bz._suppressAutoOrder && Date.now() < bz._suppressAutoOrder) return;
    allAutoBizIds.add(String(bz.id));
  });
  const realAutoCount = allAutoBizIds.size;
  if (autoCountEl)  autoCountEl.textContent  = realAutoCount;
  if (extraCountEl) extraCountEl.textContent = extraOrders.length;

  // 사이드바 뱃지
  const sideBadge = document.getElementById('sideDeliveryBadge');
  if (sideBadge) {
    const total = realAutoCount + extraOrders.length;
    sideBadge.textContent = total;
    sideBadge.style.display = total > 0 ? 'inline-block' : 'none';
  }

  // ① 자동발주 목록
  if (autoList) {
    if (allAutoBizIds.size === 0) {
      autoList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray);font-size:13px;">✅ 자동발주 필요 업체 없음</div>';
    } else {
      // 자동발주 대기 업체 + 기존 pending 자동발주 이력 합산 (KPI와 동일한 ID 집합 사용)
      const rendered = new Set();
      let html = '';

      // 재고 부족 업체 우선 렌더 (dismiss 제외)
      autoBiz.forEach(b => {
        if (b._suppressAutoOrder && Date.now() < b._suppressAutoOrder) return;
        var idStr = String(b.id);
        if (rendered.has(idStr)) return;
        rendered.add(idStr);
        const hasPending = historyData.some(h => String(h.bizId) === idStr && h.type === '식용유발주' && h.status === 'pending');
        html += renderAutoOrderRow(b, hasPending ? 'pending' : 'new');
      });

      // pending 이력 있는데 재고가 이미 회복된 업체 (dismiss + 삭제 업체 + OFF 업체 제외)
      autoOrders.forEach(h => {
        if (!h.bizId) return;
        const b = businesses.find(x => String(x.id) === String(h.bizId));
        if (!b) return;
        if (b.auto !== true) return; // 🛡️ v102: 자동발주 OFF 업체 제외
        if (b._suppressAutoOrder && Date.now() < b._suppressAutoOrder) return;
        var idStr = String(b.id);
        if (rendered.has(idStr)) return;
        rendered.add(idStr);
        html += renderAutoOrderRow(b, 'pending');
      });

      autoList.innerHTML = html || '<div style="text-align:center;padding:24px;color:var(--gray);font-size:13px;">✅ 자동발주 필요 업체 없음</div>';
    }
  }

  // ② 추가발주 목록
  renderExtraOrderList();

  // ③ 오늘 납품 이력
  renderTodayDelivList();

  // 이번달 통계
  updateOrderMonthStats();
}

function renderAutoOrderRow(b, state) {
  var prods = getBizProducts(b);
  if (prods.length === 0) prods = [{ key: '', qty: 0 }];
  var stateParam = state;  // 업체 레벨 state ('pending' or 'new')
  var defaultQty = b.autoQty || 5;
  var typeLabels = { soy:'🫘', canola:'🌿', corn:'🌽' };
  var html = '';

  // 업체 헤더 행
  var totalNew = getBizTotalNewOil(b);
  html += '<div style="background:#F8F9FA;padding:10px 20px;border-bottom:1px solid var(--gray-light);display:flex;align-items:center;gap:10px;" id="autoRow_' + b.id + '">'
    + '<div style="width:32px;height:32px;background:' + (getBizProducts(b).every(function(p){return (p.qty||0)===0;})?'var(--red-accent)':'#FF9500') + ';border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">' + (totalNew===0?'🆘':'⚡') + '</div>'
    + '<div style="flex:1;"><div style="font-weight:800;font-size:13px;">' + b.name + '</div><div style="font-size:11px;color:var(--gray);">' + b.type + '</div></div>'
    + '<div style="font-size:10px;font-weight:700;color:' + (stateParam==='pending'?'#1565C0':'#D4621A') + ';background:' + (stateParam==='pending'?'#E3F2FD':'#FFF8F0') + ';padding:2px 8px;border-radius:6px;">' + (stateParam==='pending'?'🚛 납품 예정':'📦 납품 필요') + '</div>'
    + '<button onclick="cancelAutoOrderRow(\'' + b.id + '\')" title="자동발주 알림 OFF + 목록에서 제거" style="background:#FFEBEE;border:1px solid #FFCDD2;border-radius:8px;padding:5px 9px;font-size:10px;font-weight:700;color:#C62828;cursor:pointer;white-space:nowrap;flex-shrink:0;">✕ 취소</button>'
    + '</div>';

  // 품목별 개별 행
  prods.forEach(function(p, idx) {
    var pi = getProductInfo(p.key);
    var icon = typeLabels[pi.type] || '🫙';
    var prodName = pi.label || '식용유';
    var unitPrice = getProductUnitPrice(p.key) || PRICES.oils.soy.price;
    var amt = (defaultQty * unitPrice).toLocaleString();
    var rowId = 'autoRow_' + b.id + '_' + (p.key || idx);
    var isLow = (p.qty||0) <= 2;
    var btnId = 'autoRowBtn_' + b.id + '_' + (p.key || idx);

    html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 20px 10px 28px;border-bottom:1px solid var(--gray-light);" id="' + rowId + '">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:12px;font-weight:700;">' + icon + ' ' + prodName
      + (isLow ? ' <span style="color:var(--red-accent);font-size:10px;font-weight:700;">재고 ' + (p.qty||0) + '캔 ⚠️</span>' : '') + '</div>'
      + '<div style="font-size:11px;color:var(--green-dark);margin-top:2px;font-weight:600;">' + defaultQty + '캔 발주 · ' + amt + '원</div>'
      + '</div>';

    // 품목별로 pending 여부 개별 체크
    // pending: 담당자가 직접 [신청] 버튼 눌러서 생성된 것만 표시 (자동⚡ 제외)
    // 담당자가 [신청] 클릭 후 수동신청 pending이 생성된 경우
    var prodPending = historyData.some(function(h){
      return String(h.bizId) === String(b.id) && h.type === '식용유발주' && h.status === 'pending'
        && h.method === '수동신청'
        && (!h.productKey || String(h.productKey) === String(p.key));
    });

    // 🆕 v143: 메인 액션 + 수정/취소 버튼 컬럼
    html += '<div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;">';
    if (isLow && prodPending) {
      // 신청 완료 → 납품완료 버튼
      html += '<button id="' + btnId + '" data-biz="' + b.id + '" data-key="' + (p.key||'') + '" data-qty="' + defaultQty + '" onclick="deliverDoneBtnByKey(this)" style="background:#E8F5E9;border:1.5px solid #A5D6A7;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:800;color:#2E7D32;cursor:pointer;white-space:nowrap;">✅ 납품 완료</button>';
    } else if (isLow) {
      // 재고 부족이지만 신청 전 → [신청] 버튼 표시
      html += '<button id="' + btnId + '" data-biz="' + b.id + '" data-key="' + (p.key||'') + '" data-qty="' + defaultQty + '" onclick="requestDeliveryByKey(this)" style="background:var(--green-main);border:none;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:800;color:#0D0D0D;cursor:pointer;white-space:nowrap;">🚛 신청</button>';
    } else {
      html += '<span style="font-size:11px;color:var(--gray);">재고 충분</span>';
    }
    // 🆕 v143: 수정/취소 (운반자·관리자만 + 재고부족이거나 pending일 때만)
    if (isLow && (isAdminMode || isDriverMode)) {
      html += '<div style="display:flex;gap:4px;">'
        + '<button onclick="editAutoOrderQty(\'' + b.id + '\', \'' + (p.key||'') + '\')" style="padding:4px 9px;font-size:10px;font-weight:700;color:#1565C0;background:#E3F2FD;border:1.5px solid #90CAF9;border-radius:8px;cursor:pointer;white-space:nowrap;">✏️ 수정</button>'
        + (prodPending ? '<button onclick="cancelAutoOrder(\'' + b.id + '\', \'' + (p.key||'') + '\')" style="padding:4px 9px;font-size:10px;font-weight:700;color:var(--red-accent);background:#FFF0F0;border:1.5px solid #FFCDD2;border-radius:8px;cursor:pointer;white-space:nowrap;">✕ 취소</button>' : '')
        + '</div>';
    }
    html += '</div>';
    html += '</div>';
  });

  return html;
}

// 품목별 납품신청 (새 버전) — 날짜 선택 모달 먼저 띄움
async function requestDeliveryByKey(btn) {
  if (btn.disabled) return;
  var bizId = btn.dataset.biz;
  var prodKey = btn.dataset.key;
  var qty = parseInt(btn.dataset.qty) || 5;

  // 권한 체크
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 납품 처리는 담당자가 해요','현황만 확인 가능합니다');
    return;
  }

  // 날짜 선택 모달 표시 → 선택 후 confirmDeliveryDate에서 requestDelivery 호출
  showDeliveryDateModal(btn, bizId, prodKey, qty);
}

// 발주 납품일 선택 모달
function showDeliveryDateModal(btn, bizId, prodKey, qty, asExtraOrder) {
  // 기존 모달 제거
  var existing = document.getElementById('deliveryDateModal');
  if (existing) existing.remove();

  var b = businesses.find(function(x){ return String(x.id) === String(bizId); });
  if (!b) return;
  var pi = getProductInfo(prodKey);
  var prodName = pi.label || '식용유';

  // btn ID를 임시로 저장 — 따옴표 escape 문제 회피
  var btnId = btn && btn.id ? btn.id : '';
  var asExtraFlag = asExtraOrder ? '1' : '';

  var dayNames = ['일','월','화','수','목','금','토'];
  var today = new Date();
  var dateBtns = '';
  // 🆕 v74: 오늘(당일) 옵션 추가 — 발주에도 동일 적용
  for (var i = 0; i <= 7; i++) {
    var d = new Date(today); d.setDate(today.getDate() + i);
    var ymd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var label = (i===0?'⚡ 오늘 ':i===1?'내일 ':i===2?'모레 ':'') + (d.getMonth()+1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')';
    // 오늘은 강조 색상 (당일 발주 표시)
    var btnStyle = i === 0
      ? 'padding:10px 14px;border:2px solid #FF6B35;border-radius:8px;font-size:13px;background:#FFF3E0;cursor:pointer;font-weight:800;color:#D4621A;'
      : 'padding:10px 14px;border:1.5px solid #ccc;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;font-weight:600;';
    // dataset 사용 — 따옴표 안 깨짐
    dateBtns += '<button class="delivery-date-btn" data-bizid="' + String(bizId) + '" data-prodkey="' + String(prodKey||'') + '" data-qty="' + qty + '" data-ymd="' + ymd + '" data-label="' + label.replace(/"/g,'&quot;') + '" data-btnid="' + btnId + '" data-extra="' + asExtraFlag + '" style="' + btnStyle + '">' + label + '</button>';
  }
  var unitPrice = getProductUnitPrice(prodKey) || PRICES.oils.soy.price;
  var totalPrice = (qty * unitPrice).toLocaleString();
  var titleText = asExtraOrder ? '📅 추가발주 — 납품 희망일' : '📅 납품 희망일 선택';
  var html = '<div id="deliveryDateModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div style="background:#fff;border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.25);">'
    + '<div style="font-size:16px;font-weight:800;color:#185FA5;margin-bottom:4px;">' + titleText + '</div>'
    + '<div style="font-size:12px;color:var(--gray);margin-bottom:16px;">' + b.name + ' · ' + prodName + ' ' + qty + '캔 (' + totalPrice + '원)</div>'
    + '<div id="deliveryDateBtnGrid" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' + dateBtns + '</div>'
    + '<button id="deliveryDateCancelBtn" style="width:100%;padding:10px;background:#f5f5f5;border:none;border-radius:8px;font-size:13px;cursor:pointer;color:#666;">취소</button>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  // 이벤트 바인딩
  var modalEl = document.getElementById('deliveryDateModal');
  var btns = modalEl.querySelectorAll('.delivery-date-btn');
  btns.forEach(function(b) {
    b.addEventListener('click', function() {
      var btnIdAttr = this.getAttribute('data-btnid');
      var origBtn = btnIdAttr ? document.getElementById(btnIdAttr) : null;
      var bid = this.getAttribute('data-bizid');
      var pk  = this.getAttribute('data-prodkey');
      var q   = parseInt(this.getAttribute('data-qty')) || 5;
      var ymd = this.getAttribute('data-ymd');
      var lbl = this.getAttribute('data-label');
      var ex  = this.getAttribute('data-extra') === '1';
      confirmDeliveryDate(origBtn, bid, pk, q, ymd, lbl, ex);
    });
  });
  var cancelBtn = document.getElementById('deliveryDateCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    var m = document.getElementById('deliveryDateModal');
    if (m) m.remove();
  });
  modalEl.addEventListener('click', function(e) {
    if (e.target === modalEl) modalEl.remove();
  });
}

// 납품일 확정 → 실제 발주 신청 진행
async function confirmDeliveryDate(btn, bizId, prodKey, qty, visitDate, visitLabel, asExtraOrder) {
  var modal = document.getElementById('deliveryDateModal');
  if (modal) modal.remove();

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳...';
    btn.style.opacity = '0.6';
  }

  if (asExtraOrder) {
    // 🔧 추가발주로 처리 — submitQRExtraOrder와 동일한 패턴
    await submitExtraOrderDirect(bizId, prodKey, qty, visitDate, visitLabel);
    showToast('t1','✅ 추가발주 신청 완료!', visitLabel + ' 납품 예정 — 추가발주 요청 목록에 표시됩니다');
    return;
  }

  await requestDelivery(btn, bizId, prodKey, qty, visitDate, visitLabel);

  // 신청 후 품목 행 상태 업데이트 (버튼을 "납품 완료"로 변경)
  if (btn) {
    btn.disabled = false;
    btn.textContent = '✅ 납품 완료';
    btn.style.opacity = '1';
    btn.style.background = '#E8F5E9';
    btn.style.border = '1.5px solid #A5D6A7';
    btn.style.color = '#2E7D32';
    btn.setAttribute('onclick', 'deliverDoneBtnByKey(this)');
  }

  showToast('t1','📦 발주 신청 완료!', visitLabel + ' 납품 예정');
}

// 추가발주 직접 등록 (submitQRExtraOrder의 매니저 버전)
async function submitExtraOrderDirect(bizId, prodKey, qty, visitDate, visitLabel) {
  const biz = businesses.find(b => String(b.id) === String(bizId));
  if (!biz) { showToast('t1','⚠️ 업체 정보 오류',''); return; }
  // 이미 pending 추가발주가 있으면 중복 차단 (DB 검증 + stale 캐시 자동 정리)
  const localPending = historyData.find(h =>
    !h.deleted_at &&
    h.type === '식용유발주' && h.status === 'pending' && h.method === '추가발주' &&
    String(h.bizId) === String(bizId) &&
    String(h.productKey || '') === String(prodKey || '')
  );
  if (localPending) {
    var dbHasPending = false;
    try {
      var dbCheck = await db.from('history')
        .select('id')
        .eq('biz_id', bizId)
        .eq('type', '식용유발주')
        .eq('status', 'pending')
        .eq('method', '추가발주')
        .eq('product_key', prodKey || '')
        .is('deleted_at', null)
        .limit(1);
      dbHasPending = dbCheck.data && dbCheck.data.length > 0;
    } catch(e) {
      console.warn('[추가발주-매니저] DB 검증 실패:', e.message);
      dbHasPending = true;
    }
    if (dbHasPending) {
      showToast('t1','⚠️ 이미 신청됨','이 업체에 같은 품목의 추가발주가 진행 중이에요');
      return;
    }
    // stale 캐시 정리 후 진행
    historyData = historyData.filter(h => !(
      !h.deleted_at &&
      h.type === '식용유발주' && h.status === 'pending' && h.method === '추가발주' &&
      String(h.bizId) === String(bizId) &&
      String(h.productKey || '') === String(prodKey || '')
    ));
    saveHistory();
    console.log('[추가발주-매니저] stale 캐시 정리 완료');
  }
  var prodInfo = getProductInfo(prodKey);
  const oilName = prodInfo.label || '식용유';
  const unitPrice = getProductUnitPrice(prodKey) || PRICES.oils.soy.price;
  const price = qty * unitPrice;
  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  var contentTxt = oilName + ' ' + qty + '캔 추가발주 신청';
  if (visitLabel) contentTxt += ' (납품예정: ' + visitLabel + ')';
  const item = {
    date: dateStr, rawDate: now.toISOString(),
    biz: biz.name, bizId: biz.id,
    type: '식용유발주',
    content: contentTxt,
    qty: qty,
    amount: price.toLocaleString() + '원',
    method: '추가발주',
    status: 'pending',
    productKey: prodKey,
    productName: oilName,
    visitDate: visitDate || null,
    visitLabel: visitLabel || null
  };
  historyData.unshift(item);
  saveHistory();
  try { await saveHistoryToDB(item); } catch(e) {}
  // UI 즉시 갱신
  renderDeliveryPanel && renderDeliveryPanel();
  renderHistory && renderHistory();
  updateDashboard && updateDashboard();
  updateOrderMonthStats && updateOrderMonthStats();
  // SMS 알림 (업주 전화번호로 추가발주 안내)
  try {
    if (biz.phone) {
      var smsTxt = '[식용유니버스] ' + biz.name + ' ' + oilName + ' ' + qty + '캔 추가발주 접수됐어요.';
      if (visitLabel) smsTxt += ' 납품예정: ' + visitLabel + '.';
      smsTxt += ' 담당자가 확인 후 방문합니다. 문의: 033-000-0000';
      var phoneClean = biz.phone.replace(/[^0-9]/g,'');
      var isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      if (isMobile && phoneClean) {
        var smsMsg = encodeURIComponent(smsTxt);
        setTimeout(function(){
          window.location.href = 'sms:' + phoneClean + (navigator.platform==='iPhone'?'&':'?') + 'body=' + smsMsg;
        }, 800);
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(smsTxt).catch(function(){});
      }
    }
  } catch(e) {}
}

// 품목별 납품완료 (새 버전)
async function deliverDoneBtnByKey(btn) {
  if (btn.disabled) return;
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 납품 처리는 담당자가 해요','현황만 확인 가능합니다');
    return;
  }
  var bizId = btn.dataset.biz;
  var prodKey = btn.dataset.key;
  var qty = parseInt(btn.dataset.qty) || 5;

  btn.disabled = true;
  btn.textContent = '⏳ 처리 중...';
  btn.style.opacity = '0.6';

  // suppress를 localStorage에도 저장 (폴링 재로드 후에도 유지)
  try {
    var _supKey = 'hiveoil_suppress_' + bizId;
    var _supTime = Date.now() + 120000; // 2분
    localStorage.setItem(_supKey, String(_supTime));
    var _b = businesses.find(function(x){ return String(x.id) === String(bizId); });
    if (_b) _b._suppressAutoOrder = _supTime;
  } catch(e) {}
  await confirmDeliveryById(bizId, prodKey, qty);

  // 납품 완료 즉시 이력/통계 갱신
  updateDashboard && updateDashboard();
  renderHistory && renderHistory();
  updateOrderMonthStats && updateOrderMonthStats();

  // 이 품목 행만 제거
  var rowId = 'autoRow_' + bizId + '_' + prodKey;
  var prodRow = document.getElementById(rowId);
  if (prodRow) {
    prodRow.style.transition = 'all 0.3s';
    prodRow.style.opacity = '0.3';
    setTimeout(function() {
      prodRow.style.height = '0';
      prodRow.style.overflow = 'hidden';
      prodRow.style.padding = '0';
      setTimeout(function() {
        prodRow.remove();
        // 이 업체의 품목 행이 모두 사라지면 헤더도 제거
        var autoList = document.getElementById('autoOrderList');
        var remaining = autoList ? autoList.querySelectorAll('[id^="autoRow_' + bizId + '_"]') : [];
        if (remaining.length === 0) {
          var header = document.getElementById('autoRow_' + bizId);
          if (header) header.remove();
        }
        // 카운트 갱신 — 헤더 행만 카운트 (autoRow_숫자, 언더바 1개만)
        var countEl = document.getElementById('orderAutoCount');
        if (autoList && countEl) {
          var headers = Array.from(autoList.querySelectorAll('[id^="autoRow_"]'))
            .filter(function(el) { return /^autoRow_\d+$/.test(el.id); });
          countEl.textContent = headers.length;
          if (headers.length === 0) {
            autoList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray);font-size:13px;">✅ 자동발주 필요 업체 없음</div>';
          }
        }
      }, 300);
    }, 300);
  }
}

function updateAutoRowAmount(bizId, prodKey, qty, selectEl) {
  var unitP = getProductUnitPrice(prodKey) || PRICES.oils.soy.price;
  var newAmt = (qty * unitP).toLocaleString() + '원';
  var amtEl = document.getElementById('autoRowAmt_' + bizId);
  if (amtEl) {
    amtEl.textContent = newAmt;
    // 가격 강조 애니메이션
    amtEl.style.transition = 'color 0.2s';
    amtEl.style.color = '#185FA5';
    setTimeout(function(){ amtEl.style.color = 'var(--green-dark)'; }, 500);
  }
}


// 추가발주 수량 수정 (관리자만)
function editExtraOrderQty(histIdx) {
  // 🆕 v143: 운반자도 수정 가능
  if (!isAdminMode && !isDriverMode) { showToast('t1','🔒 관리자·운반자만 수정 가능',''); return; }
  const h = historyData[histIdx];
  if (!h || h.status !== 'pending') { showToast('t1','⚠️ 수정 불가','이미 처리된 발주예요'); return; }
  const newQty = parseInt(prompt('수량을 수정해주세요 (현재: ' + h.qty + '캔)', h.qty));
  if (!newQty || isNaN(newQty) || newQty <= 0) return;
  // 금액 재계산
  const unitPrice = h.productKey ? getProductUnitPrice(h.productKey) : PRICES.oils.soy.price;
  const newAmount = (newQty * unitPrice).toLocaleString() + '원';
  const oldQtyStr = h.qty + '캔';
  h.qty = newQty;
  h.amount = newAmount;
  h.content = h.content.replace(/\d+캔/, newQty + '캔');
  if (h.dbId) {
    db.from('history').update({ qty: newQty, amount: newAmount, content: h.content })
      .eq('id', h.dbId).then(function(r) {
        if (r.error) console.warn('수량 수정 실패:', r.error.message);
      });
  }
  saveHistory();
  renderDeliveryPanel && renderDeliveryPanel();
  showToast('t1','✅ 수량 수정 완료', oldQtyStr + ' → ' + newQty + '캔 · ' + newAmount);
}

// ════════════════════════════════════════════════════════════════════
// 🆕 v143: 현장 수량 조정 도구 — 운반자·관리자가 도착 후 실제 수량 반영
// ════════════════════════════════════════════════════════════════════

// 권한 헬퍼: 운반자 또는 관리자
function _canEditFieldQty() {
  return isAdminMode || isDriverMode;
}

// 🚛 수거 대기 수량 수정 (pending 상태)
function editWasteQty(bizId) {
  if (!_canEditFieldQty()) { showToast('t1','🔒 운반자·관리자만 수정 가능',''); return; }
  var b = businesses.find(function(x){ return String(x.id) === String(bizId); });
  if (!b) return;
  var currentCans = b.wasteOil || 0;

  // pending 이력이 있으면 그 수량을 사용 (신청된 수량)
  var pendingH = historyData.find(function(h){
    return !h.deleted_at && h.type === '폐유수거' && h.status === 'pending' && String(h.bizId) === String(bizId);
  });
  if (pendingH && pendingH.qty) currentCans = pendingH.qty;

  var input = prompt(
    '🚛 ' + b.name + '\n현장 실제 수량을 입력해주세요\n\n현재: ' + currentCans + '캔 (' + (currentCans * 16.5).toFixed(1) + 'kg)\n1캔 = 16.5kg',
    currentCans
  );
  if (input === null) return;
  var newQty = parseFloat(input);
  if (isNaN(newQty) || newQty < 0) { showToast('t1','⚠️ 수량 오류','0 이상 숫자를 입력해주세요'); return; }

  // 업체 wasteOil 갱신
  var oldCans = b.wasteOil || 0;
  b.wasteOil = newQty;
  saveBizToDB && saveBizToDB(b);
  saveBusinesses && saveBusinesses();

  // pending 이력이 있으면 이력도 갱신
  if (pendingH) {
    var newKg = (newQty * 16.5).toFixed(1);
    var newAmt = Math.round(newQty * (PRICES.waste.can.price || 22000)).toLocaleString() + '원';
    pendingH.qty = newQty;
    pendingH.amount = newAmt;
    pendingH.content = newQty + '캔 (' + newKg + 'kg) 수거 예정';
    if (pendingH.dbId) {
      db.from('history').update({ qty: newQty, amount: newAmt, content: pendingH.content })
        .eq('id', pendingH.dbId).then(function(r) {
          if (r.error) console.warn('수거 수량 DB 갱신 실패:', r.error.message);
        });
    }
    saveHistory();
  }

  // 화면 갱신
  renderWastePendingList && renderWastePendingList();
  renderWasteTable && renderWasteTable();
  renderWasteDoneList && renderWasteDoneList();
  updateWasteMonthStats && updateWasteMonthStats();

  showToast('t1','✅ 수거 수량 수정 완료', oldCans + '캔 → ' + newQty + '캔');
}

// 🚛 자동발주 품목 수량 수정 (재고 부족 + auto=true 업체)
function editAutoOrderQty(bizId, prodKey) {
  if (!_canEditFieldQty()) { showToast('t1','🔒 운반자·관리자만 수정 가능',''); return; }
  var b = businesses.find(function(x){ return String(x.id) === String(bizId); });
  if (!b) return;

  // 기본값: 업체 autoQty 또는 5
  var currentQty = b.autoQty || 5;

  // pending 이력 있으면 그 수량 사용
  var pendingH = historyData.find(function(h){
    return !h.deleted_at && h.type === '식용유발주' && h.status === 'pending'
      && String(h.bizId) === String(bizId) && (!h.productKey || String(h.productKey) === String(prodKey));
  });
  if (pendingH && pendingH.qty) currentQty = pendingH.qty;

  var pi = getProductInfo(prodKey);
  var prodLabel = pi.label || '식용유';
  var input = prompt(
    '📦 ' + b.name + '\n' + prodLabel + ' 발주 수량을 수정해주세요\n\n현재: ' + currentQty + '캔',
    currentQty
  );
  if (input === null) return;
  var newQty = parseInt(input);
  if (isNaN(newQty) || newQty <= 0) { showToast('t1','⚠️ 수량 오류','1 이상 정수를 입력해주세요'); return; }

  var oldQty = currentQty;
  var unitPrice = getProductUnitPrice(prodKey) || PRICES.oils.soy.price;
  var newAmt = (newQty * unitPrice).toLocaleString() + '원';

  if (pendingH) {
    // pending 이력 갱신
    pendingH.qty = newQty;
    pendingH.amount = newAmt;
    pendingH.content = (pendingH.content || '').replace(/\d+캔/, newQty + '캔');
    if (pendingH.dbId) {
      db.from('history').update({ qty: newQty, amount: newAmt, content: pendingH.content })
        .eq('id', pendingH.dbId).then(function(r) {
          if (r.error) console.warn('발주 수량 DB 갱신 실패:', r.error.message);
        });
    }
    saveHistory();
  } else {
    // pending 없으면 업체 autoQty 갱신 (다음 신청 기본값)
    b.autoQty = newQty;
    saveBizToDB && saveBizToDB(b);
    saveBusinesses && saveBusinesses();
  }

  renderDeliveryPanel && renderDeliveryPanel();
  showToast('t1','✅ 발주 수량 수정 완료', oldQty + '캔 → ' + newQty + '캔 · ' + newAmt);
}

// 🚛 자동발주 (자동⚡ 흐름) 취소 → 신청 전이면 진짜 취소, 신청 후면 pending 삭제
function cancelAutoOrder(bizId, prodKey) {
  if (!_canEditFieldQty() && !(ownerLoggedIn && String(bizId) === String(ownerBizId))) {
    showToast('t1','🔒 권한 없음',''); return;
  }
  // pending 이력 있는지 확인
  var idx = historyData.findIndex(function(h){
    return !h.deleted_at && h.type === '식용유발주' && h.status === 'pending'
      && String(h.bizId) === String(bizId) && (!h.productKey || String(h.productKey) === String(prodKey));
  });
  if (idx === -1) {
    // 🆕 v146: 신청 전이면 항목 자체를 제거 (자동발주 OFF)
    cancelAutoOrderRow(bizId);
    return;
  }
  if (!confirm('발주 신청을 취소할까요?')) return;
  var h = historyData[idx];
  if (h.dbId) {
    db.from('history').delete().eq('id', h.dbId).then(function(r) {
      if (r.error) console.warn('이력 삭제 실패:', r.error.message);
    });
  }
  historyData.splice(idx, 1);
  saveHistory();
  renderDeliveryPanel && renderDeliveryPanel();
  showToast('t1','✅ 발주 취소됨','발주 신청이 취소됐어요');
}

// 추가발주 취소 (업주 본인 / 관리자 / 운반자)
function cancelExtraOrder(histIdx) {
  // 🆕 v143: 운반자도 취소 가능
  if (!ownerLoggedIn && !isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음',''); return; }
  if (!confirm('추가발주 신청을 취소할까요?')) return;
  const h = historyData[histIdx];
  if (!h || h.status !== 'pending') { showToast('t1','⚠️ 취소 불가','이미 처리된 발주예요'); return; }
  // DB에서 삭제
  if (h.dbId) {
    db.from('history').delete().eq('id', h.dbId).then(function(r) {
      if (r.error) console.warn('이력 삭제 실패:', r.error.message);
    });
  }
  historyData.splice(histIdx, 1);
  saveHistory();
  renderDeliveryPanel && renderDeliveryPanel();
  showToast('t1','✅ 추가발주 취소됨','발주가 취소됐어요');
}

// 수거 신청 취소 (업주 본인 / 관리자 / 운반자)
function cancelWasteRequest(bizId) {
  // 🆕 v143: 운반자도 취소 가능
  if (!ownerLoggedIn && !isAdminMode && !isDriverMode) { showToast('t1','🔒 권한 없음',''); return; }
  if (!confirm('수거 신청을 취소할까요?')) return;
  // pending 수거 이력 찾아서 삭제
  const idx = historyData.findIndex(h =>
    h.type === '폐유수거' && h.status === 'pending' && String(h.bizId) === String(bizId)
  );
  if (idx === -1) { showToast('t1','⚠️ 신청 내역 없음',''); return; }
  const h = historyData[idx];
  if (h.dbId) {
    db.from('history').delete().eq('id', h.dbId).then(function(r) {
      if (r.error) console.warn('이력 삭제 실패:', r.error.message);
    });
  }
  historyData.splice(idx, 1);
  saveHistory();
  renderWasteTable && renderWasteTable();
  renderWastePendingCards && renderWastePendingCards();
  showToast('t1','✅ 수거 신청 취소됨','수거 신청이 취소됐어요');
}

function renderExtraOrderList() {
  const el = document.getElementById('extraOrderList');
  if (!el) return;
  let extraOrders = historyData.filter(h => !h.deleted_at && h.type === '식용유발주' && h.status === 'pending' && h.method === '추가발주');
  // 업주 로그인 시 자기 업체만
  if (ownerLoggedIn && ownerBizId) {
    extraOrders = extraOrders.filter(h => String(h.bizId) === String(ownerBizId));
  }
  if (extraOrders.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray);font-size:13px;">📭 추가발주 요청 없음</div>';
    return;
  }
  el.innerHTML = extraOrders.map(h => {
    const b = businesses.find(x => x.id === h.bizId);
    // 🔧 2단계 흐름: visitDate 없으면 "신청" 단계, 있으면 "납품완료" 단계
    var hasVisitDate = !!(h.visitDate || h.visitLabel);
    var actionBtn;
    if (hasVisitDate) {
      // 신청 완료 → 납품완료 버튼
      actionBtn = '<button onclick="completeExtraOrder(\'' + (h.dbId || historyData.indexOf(h)) + '\',' + (b ? b.id : 'null') + ',' + (h.qty || 5) + ')" '
        + 'style="background:#E8F5E9;border:1.5px solid #A5D6A7;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:800;color:#2E7D32;cursor:pointer;white-space:nowrap;">'
        + '✅ 납품 완료</button>';
    } else {
      // 신청 단계 — 납품일 선택
      actionBtn = '<button onclick="requestExtraOrderDate(\'' + (h.dbId || historyData.indexOf(h)) + '\',' + (b ? b.id : 'null') + ',\'' + (h.productKey||'') + '\',' + (h.qty || 5) + ')" '
        + 'style="background:#1F4D30;border:none;border-radius:10px;padding:8px 14px;font-size:12px;font-weight:800;color:#fff;cursor:pointer;white-space:nowrap;">'
        + '🚛 신청</button>';
    }
    var visitInfo = hasVisitDate
      ? '<div style="font-size:10px;color:#2E7D32;margin-top:3px;font-weight:700;">📅 ' + (h.visitLabel || h.visitDate) + ' 납품 예정</div>'
      : '<div style="font-size:10px;color:#E65100;margin-top:3px;font-weight:700;">⏳ 납품일 미정 — 신청 필요</div>';
    return `
    <div style="display:flex;align-items:center;gap:14px;padding:14px 20px;border-bottom:1px solid var(--gray-light);">
      <div style="width:40px;height:40px;background:#EEF4FF;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">📦</div>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:13px;">${h.biz}</div>
        <div style="font-size:11px;color:var(--gray);margin-top:2px;">${h.content} · 신청일 ${h.date}</div>
        ${visitInfo}
      </div>
      <div style="text-align:right;flex-shrink:0;margin-right:10px;">
        <div style="font-family:var(--font-display);font-size:15px;font-weight:800;color:#185FA5;">${h.amount}</div>
        <div style="font-size:10px;margin-top:3px;font-weight:700;color:#185FA5;background:#EEF4FF;padding:2px 8px;border-radius:6px;display:inline-block;">📦 추가발주</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        ${actionBtn}
        ${(isAdminMode || isDriverMode || (ownerLoggedIn && String(h.bizId) === String(ownerBizId))) ? `
        <div style="display:flex;gap:5px;align-items:center;margin-top:4px;">
          ${(isAdminMode || isDriverMode) ? `<button onclick="editExtraOrderQty(${historyData.indexOf(h)})" 
            style="background:#E3F2FD;border:1.5px solid #90CAF9;border-radius:8px;padding:4px 10px;font-size:10px;font-weight:700;color:#1565C0;cursor:pointer;white-space:nowrap;">
            ✏️ 수정
          </button>` : ''}
          <button onclick="cancelExtraOrder(${historyData.indexOf(h)})"
            style="background:#FFF0F0;border:1.5px solid #FFCDD2;border-radius:8px;padding:4px 10px;font-size:10px;font-weight:700;color:var(--red-accent);cursor:pointer;white-space:nowrap;">
            ✕ 취소
          </button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// 🚛 신청 버튼 → pending 이력 DB 저장 + "납품 완료"로 교체
function requestDelivery(btn, bizId, prodKey, qty, visitDate, visitLabel) {
  if (btn && btn.disabled) {
    // 버튼이 disabled여도 진행 (날짜 모달에서 disabled로 설정해놓음)
  }
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 납품 처리는 담당자가 해요','현황만 확인 가능합니다');
    return;
  }
  var b = businesses.find(function(x){ return String(x.id) === String(bizId); });
  if (!b) return;

  // suppress 설정 (폴링 재렌더 방지)
  b._suppressAutoOrder = Date.now() + 120000;

  // pending 이력이 없으면 생성 + DB 저장
  var alreadyPending = historyData.some(function(h){
    return String(h.bizId) === String(bizId) && h.type === '식용유발주' && h.status === 'pending'
      && h.method !== '추가발주' && (!prodKey || !h.productKey || String(h.productKey) === String(prodKey));
  });
  if (!alreadyPending) {
    var pi = getProductInfo(prodKey);
    var prodName = pi.label || '식용유';
    var unitPrice = getProductUnitPrice(prodKey) || PRICES.oils.soy.price;
    var now = new Date();
    var dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
    var contentTxt = '⚡ 자동발주 알림 — ' + prodName + ' 납품 신청';
    if (visitLabel) contentTxt += ' · 납품예정: ' + visitLabel;
    var newPending = {
      date: dateStr, rawDate: now.toISOString(),
      biz: b.name, bizId: b.id, type: '식용유발주',
      content: contentTxt,
      qty: qty || b.autoQty || 5,
      amount: ((qty || b.autoQty || 5) * unitPrice).toLocaleString() + '원',
      method: '수동신청', status: 'pending',
      productKey: prodKey, productName: prodName,
      visitDate: visitDate || null, visitLabel: visitLabel || null,
    };
    historyData.unshift(newPending);
    saveHistory();
    try { saveHistoryToDB(newPending); } catch(e) {}
  }

  // SMS 알림 (업주 전화번호로 납품 신청 안내) — 수거 신청과 동일한 패턴
  try {
    if (b.phone) {
      var pi2 = getProductInfo(prodKey);
      var pName2 = pi2.label || '식용유';
      var smsTxt = '[식용유니버스] ' + b.name + ' ' + pName2 + ' ' + (qty||5) + '캔 납품 신청 접수됐어요.';
      if (visitLabel) smsTxt += ' 납품예정: ' + visitLabel + '.';
      smsTxt += ' 담당자가 확인 후 방문합니다. 문의: 033-000-0000';

      var isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
      var phoneClean = b.phone.replace(/[^0-9]/g,'');
      if (isMobile && phoneClean) {
        // 모바일 — 문자 앱 자동 열기 + 알림
        var smsMsg = encodeURIComponent(smsTxt);
        showToast('t1','📱 문자 발송 준비','업주 폰으로 안내 문자가 열려요');
        setTimeout(function(){
          window.location.href = 'sms:' + phoneClean + (navigator.platform==='iPhone'?'&':'?') + 'body=' + smsMsg;
        }, 800);
      } else {
        // PC — 클립보드 복사 + 알림
        if (navigator.clipboard) {
          navigator.clipboard.writeText(smsTxt).then(function(){
            showToast('t1','📋 문자 내용 복사됨','업주 연락처: ' + (b.phone||'미등록') + ' · 문자앱에 붙여넣기 하세요');
          }).catch(function(){
            showToast('t1','📤 발주 신청 처리됨','업주 연락처: ' + (b.phone||'미등록'));
          });
        } else {
          showToast('t1','📤 발주 신청 처리됨','업주 연락처: ' + (b.phone||'미등록'));
        }
      }
    } else {
      showToast('t1','📤 발주 신청 처리됨','업주 전화번호 미등록 — 직접 연락해주세요');
    }
  } catch(e) { console.warn('SMS 알림 실패:', e); }
  // 버튼 → 납품 완료로 교체
  if (btn) {
    btn.textContent = '✅ 납품 완료';
    btn.style.background = '#E8F5E9';
    btn.style.border = '1.5px solid #A5D6A7';
    btn.style.color = '#2E7D32';
    btn.setAttribute('data-biz', String(bizId));
    btn.setAttribute('data-key', String(prodKey || ''));
    btn.setAttribute('data-qty', String(qty || 5));
    btn.onclick = function() { deliverDoneBtnByKey(btn); };
  }
}

// 기존 호환
function deliverNeedBtn(btn, bizId, oilKey, qty) {
  requestDelivery(btn, bizId, oilKey, qty);
}

// ✅ 납품 완료 클릭 → 즉시 완료 처리 후 목록에서 제거
async function deliverDoneBtn(btn, bizId, oilKey, qty) {
  if (btn.disabled) return;
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 납품 처리는 담당자가 해요','현황만 확인 가능합니다');
    return;
  }
  btn.disabled = true;
  btn.textContent = '⏳ 처리 중...';
  btn.style.opacity = '0.6';

  await confirmDeliveryById(bizId, oilKey, qty);

  // 완료 후 해당 행만 제거 (renderDeliveryPanel 재호출 없이)
  const row = document.getElementById('autoRow_' + bizId);
  if (row) {
    row.style.transition = 'all 0.3s';
    row.style.background = '#F1F8E9';
    row.style.opacity = '0.5';
    setTimeout(() => {
      row.style.height = '0';
      row.style.overflow = 'hidden';
      row.style.padding = '0';
      setTimeout(() => {
        row.remove();
        // 카운트 갱신 — 헤더 행만 카운트 (autoRow_숫자, 언더바 1개만)
        var autoList = document.getElementById('autoOrderList');
        var countEl = document.getElementById('orderAutoCount');
        if (autoList && countEl) {
          var headers = Array.from(autoList.querySelectorAll('[id^="autoRow_"]'))
            .filter(function(el) { return /^autoRow_\d+$/.test(el.id); });
          countEl.textContent = headers.length;
          if (headers.length === 0) {
            autoList.innerHTML = '<div style="text-align:center;padding:24px;color:var(--gray);font-size:13px;">✅ 자동발주 필요 업체 없음</div>';
          }
        }
      }, 400);
    }, 300);
  }
}

async function autoDeliverBiz(bizId, prodKey, qty, skipHistory) {
  const b = businesses.find(x => String(x.id) === String(bizId));
  if (!b) return;
  // 전달받은 prodKey 우선 사용, 없으면 첫 번째 품목
  var allProds = getBizProducts(b);
  var targetProd = (prodKey && allProds.find(function(p){ return String(p.key) === String(prodKey); })) || (prodKey ? null : allProds[0]) || {};
  var prodKey2 = targetProd.key || prodKey || '';
  const unitPrice = getProductUnitPrice(prodKey2) || PRICES.oils.soy.price;
  var prodName2 = getProductInfo(prodKey2).label || '식용유';
  const prevStock = b.newOil;
  b.newOil += qty;
  // 품목별 재고도 업데이트
  if (prodKey2 && b.oilProducts) {
    var pp2 = b.oilProducts.find(function(p){ return p.key === prodKey2; });
    if (pp2) pp2.qty = (pp2.qty || 0) + qty;
  }
  b.lastUpdate = '방금 납품 완료';
  saveBusinesses();
  await updateBizStockInDB(b.id, b.newOil, b.wasteOil, b.lastUpdate, b.oilProducts);

  // 🔧 skipHistory=true면 이력 추가 생략 (이미 pending row가 done으로 업데이트되었으므로 중복 방지)
  if (!skipHistory) {
    const now = new Date();
    const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
    const item = { date: dateStr, rawDate: now.toISOString(), biz: b.name, bizId: b.id, type: '식용유발주', content: prodName2 + ' ' + qty + '캔 납품 완료', qty, unitPrice: unitPrice, amount: (qty * unitPrice).toLocaleString() + '원', method: '운반관리자', status: 'done', productKey: prodKey2, productName: prodName2 };
    historyData.unshift(item);
    saveHistory();
    await saveHistoryToDB(item);
  }
  refreshMapMarkers();
  updateDashboard();
  renderHistory && renderHistory();
  updateOrderMonthStats && updateOrderMonthStats();
  // 업주 전화번호로 납품 완료 SMS 알림
  try {
    var bPhone = (b.phone || '').replace(/[^0-9]/g, '');
    if (bPhone && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      var smsMsg = encodeURIComponent('[식용유니버스]\n' + b.name + ' 납품 완료 안내\n\n품목: ' + prodName2 + ' ' + qty + '캔\n금액: ' + (qty * unitPrice).toLocaleString() + '원\n\n문의: 033-000-0000');
      window._pendingSms = 'sms:' + bPhone + (navigator.platform === 'iPhone' ? '&' : '?') + 'body=' + smsMsg;
    }
  } catch(e) {}
  showToast('t1','✅ 납품 완료!', b.name + ' — ' + prodName2 + ' ' + qty + '캔 납품 완료');
}

// pending 상태에서 납품 완료 처리 (품목 키 기준)
async function confirmDeliveryById(bizId, prodKey, qty) {
  const b = businesses.find(x => String(x.id) === String(bizId));
  if (!b) return;

  // 해당 품목의 pending만 done으로 변경 (다른 품목 pending은 유지)
  const pendingItems = historyData.filter(function(h) {
    if (String(h.bizId) !== String(b.id) && h.bizId !== b.id) return false;
    if (h.type !== '식용유발주' || h.status !== 'pending' || h.method === '추가발주') return false;
    // prodKey가 있으면 해당 품목만, 없으면 productKey 없는 것만
    if (prodKey) return String(h.productKey || '') === String(prodKey);
    return true;
  });

  pendingItems.forEach(function(pending) {
    pending.status = 'done';
    pending.method = '운반관리자'; // 처리 주체 명확히
    pending.content = (pending.productName || getProductInfo(prodKey).label || '식용유') + ' ' + (pending.qty || qty) + '캔 납품 완료';
    if (pending.dbId) {
      try { db.from('history').update({ status: 'done', content: pending.content, method: '운반관리자' }).eq('id', pending.dbId).then(function(){}); } catch(e) {}
    }
  });
  saveHistory();
  // 🔧 pending이 있으면 그것을 done으로 업데이트만 하고, autoDeliverBiz는 history 추가 X (중복 방지)
  // pending이 없으면 새 done row 추가 (직접 완료 처리 케이스)
  var skipHistory = pendingItems.length > 0;
  await autoDeliverBiz(bizId, prodKey, qty, skipHistory);
}

// 🚛 추가발주 신청 단계 — 납품일 선택 후 row의 visitDate/visitLabel 업데이트
function requestExtraOrderDate(histIdxOrDbId, bizId, prodKey, qty) {
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 신청 처리는 담당자가 해요','현황만 확인 가능합니다');
    return;
  }
  // 매칭 row 찾기
  var h = historyData.find(function(x){ return x.dbId && String(x.dbId) === String(histIdxOrDbId); });
  if (!h) h = historyData[parseInt(histIdxOrDbId)];
  if (!h) { showToast('t1','⚠️ 항목을 찾지 못했어요',''); return; }

  var b = businesses.find(function(x){ return String(x.id) === String(bizId || h.bizId); });
  if (!b) { showToast('t1','⚠️ 업체 정보 오류',''); return; }

  var pi = getProductInfo(prodKey || h.productKey);
  var prodName = pi.label || h.productName || '식용유';

  // 날짜 선택 모달 (직접 표시 — 자동발주 모달과 동일 디자인)
  var existing = document.getElementById('deliveryDateModal');
  if (existing) existing.remove();

  var dayNames = ['일','월','화','수','목','금','토'];
  var today = new Date();
  var dateBtns = '';
  // 🆕 v74: 오늘(당일) 옵션 추가
  for (var i = 0; i <= 7; i++) {
    var d = new Date(today); d.setDate(today.getDate() + i);
    var ymd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var label = (i===0?'⚡ 오늘 ':i===1?'내일 ':i===2?'모레 ':'') + (d.getMonth()+1) + '/' + d.getDate() + '(' + dayNames[d.getDay()] + ')';
    var btnStyle = i === 0
      ? 'padding:10px 14px;border:2px solid #FF6B35;border-radius:8px;font-size:13px;background:#FFF3E0;cursor:pointer;font-weight:800;color:#D4621A;'
      : 'padding:10px 14px;border:1.5px solid #ccc;border-radius:8px;font-size:13px;background:#fff;cursor:pointer;font-weight:600;';
    dateBtns += '<button class="extra-date-btn" data-ymd="' + ymd + '" data-label="' + label.replace(/"/g,'&quot;') + '" style="' + btnStyle + '">' + label + '</button>';
  }
  var html = '<div id="deliveryDateModal" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;">'
    + '<div style="background:#fff;border-radius:16px;padding:24px;max-width:380px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,0.25);">'
    + '<div style="font-size:16px;font-weight:800;color:#185FA5;margin-bottom:4px;">📅 추가발주 — 납품 희망일</div>'
    + '<div style="font-size:12px;color:var(--gray);margin-bottom:16px;">' + b.name + ' · ' + prodName + ' ' + qty + '캔</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;">' + dateBtns + '</div>'
    + '<button id="extraDateCancelBtn" style="width:100%;padding:10px;background:#f5f5f5;border:none;border-radius:8px;font-size:13px;cursor:pointer;color:#666;">취소</button>'
    + '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  var modalEl = document.getElementById('deliveryDateModal');
  var btns = modalEl.querySelectorAll('.extra-date-btn');
  btns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var ymd = this.getAttribute('data-ymd');
      var lbl = this.getAttribute('data-label');
      // row 업데이트
      h.visitDate = ymd;
      h.visitLabel = lbl;
      saveHistory();
      // DB sync
      if (h.dbId) {
        try {
          db.from('history').update({ visit_date: ymd, visit_label: lbl }).eq('id', h.dbId).then(function(res) {
            if (res.error) {
              var msg = res.error.message || '';
              if (/visit_date|visit_label|column .* does not exist/i.test(msg)) {
                console.warn('💡 history 테이블에 visit_date/visit_label 컬럼이 없어요. SQL: ALTER TABLE history ADD COLUMN IF NOT EXISTS visit_date TEXT, ADD COLUMN IF NOT EXISTS visit_label TEXT;');
              } else { console.warn('visit_date 동기화 실패:', msg); }
            }
          });
        } catch(e) {}
      }
      modalEl.remove();
      showToast('t1','✅ 추가발주 신청 완료!', lbl + ' 납품 예정 — 다음은 납품완료 처리만 남았어요');
      // SMS 알림 (업주에게 신청 확정 안내)
      try {
        if (b.phone) {
          var smsTxt = '[식용유니버스] ' + b.name + ' 추가발주 ' + qty + '캔 신청이 확정됐어요. 납품예정: ' + lbl + '. 문의: 033-000-0000';
          var phoneClean = b.phone.replace(/[^0-9]/g,'');
          var isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
          if (isMobile && phoneClean) {
            var smsMsg = encodeURIComponent(smsTxt);
            setTimeout(function(){
              window.location.href = 'sms:' + phoneClean + (navigator.platform==='iPhone'?'&':'?') + 'body=' + smsMsg;
            }, 800);
          } else if (navigator.clipboard) {
            navigator.clipboard.writeText(smsTxt).catch(function(){});
          }
        }
      } catch(e) {}
      renderDeliveryPanel && renderDeliveryPanel();
      renderHistory && renderHistory();
    });
  });
  var cancelBtn = document.getElementById('extraDateCancelBtn');
  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    var m = document.getElementById('deliveryDateModal');
    if (m) m.remove();
  });
  modalEl.addEventListener('click', function(e) {
    if (e.target === modalEl) modalEl.remove();
  });
}

// 추가발주 납품 완료
async function completeExtraOrder(histIdxOrDbId, bizId, qty) {
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 납품 처리는 담당자가 해요','현황만 확인 가능합니다');
    return;
  }
  // dbId 우선, 없으면 인덱스
  var h = historyData.find(function(x){ return x.dbId && String(x.dbId) === String(histIdxOrDbId); });
  if (!h) h = historyData[histIdxOrDbId];
  if (!h) return;
  if (h.status === 'done') { showToast('t1','ℹ️ 이미 완료됨','중복 처리를 방지했어요'); return; }

  const b = businesses.find(function(x){ return String(x.id) === String(bizId || h.bizId); });

  // 납품 전 재고 캡처 → 전후 기록
  var beforeQty = 0;
  var prodKey = h.productKey;
  if (b) {
    b._suppressAutoOrder = Date.now() + 60000;
    if (!b.oilProducts || b.oilProducts.length === 0) {
      b.oilProducts = getBizProducts(b).map(function(p){ return {key:p.key, qty:p.qty}; });
    }
    if (prodKey && b.oilProducts) {
      var pp = b.oilProducts.find(function(p){ return p.key === prodKey; });
      beforeQty = pp ? (pp.qty || 0) : (b.newOil || 0);
      if (pp) { pp.qty = beforeQty + qty; }
      else { b.oilProducts.push({ key: prodKey, qty: qty }); }
    } else {
      beforeQty = b.newOil || 0;
      b.newOil = beforeQty + qty;
    }
    var afterQty = prodKey
      ? (b.oilProducts ? b.oilProducts.reduce(function(s,p){ return s+(p.qty||0); },0) : (beforeQty + qty))
      : b.newOil;
    var prodName = h.productName || (prodKey ? getProductInfo(prodKey).label : '식용유');
    h.content = prodName + ' ' + qty + '캔 추가납품 완료';
    b.newOil = afterQty;
    b.lastUpdate = '방금 납품 완료';
    saveBusinesses();
    await updateBizStockInDB(b.id, b.newOil, b.wasteOil, b.lastUpdate, b.oilProducts);
  } else {
    h.content = qty + '캔 납품 완료';
  }

  h.status = 'done';
  if (h.dbId) {
    await db.from('history').update({ status: 'done', content: h.content }).eq('id', h.dbId);
  } else {
    saveHistoryToDB(h);
  }
  saveHistory();
  refreshMapMarkers();
  updateDashboard();
  renderDeliveryPanel && renderDeliveryPanel();
  renderTodayDelivList && renderTodayDelivList();
  renderOrderPendingList && renderOrderPendingList();
  updateOrderMonthStats && updateOrderMonthStats();
  renderHistory && renderHistory();
  showToast('t1','✅ 추가발주 납품 완료!', h.biz + ' — ' + qty + '캔 납품됨');
}

// QR 추가발주 신청 (업주용)
var qrExtraQty = 5;
function changeQRExtra(delta) {
  qrExtraQty = Math.max(1, Math.min(99, qrExtraQty + delta));
  const el = document.getElementById('qrExtraVal');
  if (el) {
    if (el.tagName === 'INPUT') el.value = qrExtraQty;
    else el.textContent = qrExtraQty;
  }
  updateQRExtraPrice();
}

// input에서 직접 입력 시 호출
function updateQRExtraPriceFromInput(qty) {
  qrExtraQty = qty;
  updateQRExtraPrice();
}

// ===== 신규 발주 신청 (관리자용 — 발주 패널 상단) =====
var newOrderQty = 5;
function toggleNewOrderForm() {
  var form = document.getElementById('newOrderForm');
  var btn  = document.getElementById('newOrderToggleBtn');
  if (!form) return;
  var isOpen = form.style.display !== 'none';
  if (isOpen) {
    form.style.display = 'none';
    if (btn) btn.textContent = '➕ 추가발주 신청';
  } else {
    form.style.display = 'block';
    if (btn) btn.textContent = '✕ 닫기';
    populateNewOrderSelects();
  }
}
function populateNewOrderSelects() {
  // 업체 select 채우기
  var bizSel = document.getElementById('newOrderBiz');
  if (bizSel) {
    var current = bizSel.value;
    bizSel.innerHTML = '<option value="">— 업체 선택 —</option>';
    businesses.forEach(function(b) {
      var opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.name + ' (' + b.type + ')';
      bizSel.appendChild(opt);
    });
    if (current) bizSel.value = current;
  }
  // 유종 select 채우기
  var prodSel = document.getElementById('newOrderProd');
  if (prodSel && PRICES.products) {
    prodSel.innerHTML = '';
    Object.keys(PRICES.products).forEach(function(key) {
      var p = PRICES.products[key];
      var opt = document.createElement('option');
      opt.value = key;
      opt.textContent = p.label + ' · ' + (p.price||0).toLocaleString() + '원';
      prodSel.appendChild(opt);
    });
  }
  updateNewOrderPrice();
}
function changeNewOrderQty(delta) {
  newOrderQty = Math.max(1, Math.min(99, newOrderQty + delta));
  var el = document.getElementById('newOrderQty');
  if (el) el.textContent = newOrderQty;
  updateNewOrderPrice();
}
function updateNewOrderPrice() {
  var prodSel = document.getElementById('newOrderProd');
  var prodKey = prodSel ? prodSel.value : '';
  var unitPrice = prodKey ? getProductUnitPrice(prodKey) : (PRICES.oils.soy.price || 0);
  var price = (newOrderQty * unitPrice).toLocaleString();
  var el = document.getElementById('newOrderPrice');
  if (el) el.textContent = price + '원';
}
function submitNewOrder() {
  // 권한 체크
  if (ownerLoggedIn && !isAdminMode && !isDriverMode) {
    showToast('t1','🔒 발주 신청은 담당자가 해요','현황만 확인 가능합니다');
    return;
  }
  var bizSel = document.getElementById('newOrderBiz');
  var prodSel = document.getElementById('newOrderProd');
  var bizId = bizSel ? bizSel.value : '';
  var prodKey = prodSel ? prodSel.value : '';
  if (!bizId) { showToast('t1','⚠️ 업체 선택 필요','업체를 선택해주세요'); return; }
  if (!prodKey) { showToast('t1','⚠️ 유종 선택 필요','유종을 선택해주세요'); return; }
  var qty = newOrderQty;

  // 날짜 선택 모달 호출 — 추가발주 플래그 전달
  showDeliveryDateModal(null, bizId, prodKey, qty, true /* asExtraOrder */);

  // 폼 닫기 (모달 닫힘 후)
  setTimeout(function() {
    if (!document.getElementById('deliveryDateModal')) {
      var form = document.getElementById('newOrderForm');
      if (form) form.style.display = 'none';
      var btn = document.getElementById('newOrderToggleBtn');
      if (btn) btn.textContent = '➕ 추가발주 신청';
    }
  }, 500);
}
// =====================================================

function updateQRExtraPrice() {
  var prodSel = document.getElementById('qrExtraProduct');
  var prodKey = prodSel ? prodSel.value : '';
  var unitPrice = prodKey ? getProductUnitPrice(prodKey) : PRICES.oils.soy.price;
  var price = (qrExtraQty * unitPrice).toLocaleString();
  var el = document.getElementById('qrExtraPrice');
  if (el) {
    // 타사 브랜드(해표·오뚜기)는 적립 제외 안내
    var POINT_EXCLUDED = ['soy_ottogi', 'soy_haepyo'];
    var isExcluded = prodKey && POINT_EXCLUDED.indexOf(prodKey) !== -1;
    if (isExcluded) {
      el.innerHTML = price + '원 <span style="font-size:10px;color:#C0392B;font-weight:600;margin-left:4px;">(포인트 적립 제외)</span>';
    } else {
      el.textContent = price + '원';
    }
  }
}
async function submitQRExtraOrder() {
  if (!qrSelectedBizId) { showToast('t1','⚠️ 업체를 먼저 선택해주세요',''); return; }
  const biz = businesses.find(b => String(b.id) === String(qrSelectedBizId));
  if (!biz) { showToast('t1','⚠️ 업체 정보 오류',''); return; }
  // 이미 pending 추가발주가 있으면 중복 차단 (DB 검증 + stale 캐시 자동 정리)
  const localPending = historyData.find(h =>
    h.type === '식용유발주' && h.status === 'pending' && h.method === '추가발주' &&
    String(h.bizId) === String(qrSelectedBizId)
  );
  if (localPending) {
    var dbHasPending = false;
    try {
      var dbCheck = await db.from('history')
        .select('id')
        .eq('biz_id', qrSelectedBizId)
        .eq('type', '식용유발주')
        .eq('status', 'pending')
        .eq('method', '추가발주')
        .is('deleted_at', null)
        .limit(1);
      dbHasPending = dbCheck.data && dbCheck.data.length > 0;
    } catch(e) {
      console.warn('[추가발주] DB 검증 실패:', e.message);
      dbHasPending = true; // 네트워크 에러 시 안전하게 차단
    }
    if (dbHasPending) {
      showToast('t1','⚠️ 이미 신청됨','담당자가 처리 중인 추가발주가 있어요');
      return;
    }
    // DB에 없는데 local에만 있는 stale 캐시 → 자동 정리 후 진행
    historyData = historyData.filter(h => !(
      h.type === '식용유발주' && h.status === 'pending' && h.method === '추가발주' &&
      String(h.bizId) === String(qrSelectedBizId)
    ));
    saveHistory();
    console.log('[추가발주] stale 캐시 정리 완료 — 신청 진행');
  }
  var prodSel  = document.getElementById('qrExtraProduct');
  var prodKey  = prodSel ? prodSel.value : '';
  var prodInfo = getProductInfo(prodKey);
  const oilName = prodInfo.label || '식용유';
  // DOM에서 수량 읽기 (전역 변수 보조)
  var qtyEl = document.getElementById('qrExtraVal');
  var qty = qtyEl ? (parseInt(qtyEl.textContent) || qrExtraQty || 5) : (qrExtraQty || 5);
  const unitPrice = prodKey ? getProductUnitPrice(prodKey) : PRICES.oils.soy.price;
  const price = qty * (unitPrice || PRICES.oils.soy.price);
  const now     = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  const item = {
    date: dateStr, rawDate: now.toISOString(),
    biz: biz.name, bizId: biz.id,
    type: '식용유발주',
    content: oilName + ' ' + qty + '캔 추가발주 신청',
    qty: qty,
    amount: price.toLocaleString() + '원',
    method: '추가발주',
    status: 'pending',
    productKey: prodKey,
    productName: oilName,
  };
  historyData.unshift(item);
  saveHistory();
  await saveHistoryToDB(item);
  updateDashboard();
  renderDeliveryPanel && renderDeliveryPanel();

  const extraBtn = document.getElementById('qrExtraBtn');
  if (extraBtn) {
    extraBtn.textContent = '✅ 추가발주 신청 완료!';
    extraBtn.style.background = '#2E7D32';
    extraBtn.disabled = true;
    setTimeout(() => {
      extraBtn.textContent = '📦 추가발주 신청';
      extraBtn.style.background = '#185FA5';
      extraBtn.disabled = false;
    }, 3000);
  }
  showToast('t1','📦 추가발주 신청 완료!', biz.name + ' — ' + oilName + ' ' + qty + '캔 · 담당자에게 전달됐어요');
}

// QR 추가발주 select 변경 시 금액 업데이트
document.addEventListener('change', e => {
  if (e.target && e.target.id === 'qrExtraProduct') updateQRExtraPrice();
});

function toggleSidebar() {
  const sidebar  = document.getElementById('mainSidebar');
  const backdrop = document.getElementById('sidebarBackdrop');
  sidebar.classList.toggle('open');
  backdrop.classList.toggle('open');
}
function closeSidebar() {
  document.getElementById('mainSidebar')?.classList.remove('open');
  document.getElementById('sidebarBackdrop')?.classList.remove('open');
}
// 패널 이동 시 사이드바 닫기 (모바일)
function closeSidebarOnMobile() {
  if (window.innerWidth <= 768) {
    document.getElementById('mainSidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('open');
  }
}

// ===== 관리자 로그인/모드 전환 (v112 통합: v105+ admin_credentials_v2 시스템 사용) =====
async function hqAdminLogin() {
  // 🔐 잠금 상태 체크
  var lockState = isLoginLocked('admin');
  if (lockState.locked) {
    showToast('t1', '🔒 로그인 잠김', '너무 많이 실패했어요. ' + lockState.remainMin + '분 후 다시 시도해주세요.');
    return;
  }

  const idEl = document.getElementById('hqAdminId');
  const pwEl = document.getElementById('hqAdminPw');
  const id = (idEl?.value || '').trim();
  const pw = (pwEl?.value || '').trim();
  if (!id || !pw) {
    showToast('t1','⚠️ 입력 오류','아이디와 비밀번호를 입력해주세요');
    return;
  }

  // 마이그레이션 자동 실행 (기존 평문 admin_pw → 해시 admin_credentials_v2)
  var creds = await migrateAdminCredentialsIfNeeded();
  if (!creds) creds = await getAdminCredentials();

  // 최초 설정 (자격 없음): 입력한 ID/PW로 초기 자격 등록
  if (!creds) {
    var strength = validatePasswordStrength(pw);
    if (!strength.ok) {
      showToast('t1','⚠️ 비밀번호 약함', strength.msg + '\n첫 로그인 시 비밀번호가 설정됩니다.');
      return;
    }
    var idCheck = validateLoginId(id);
    if (!idCheck.ok) { showToast('t1','⚠️ 아이디', idCheck.msg); return; }
    var newHash = await sha256Hash(pw);
    await saveAdminCredentials({ id: id, pwHash: newHash, updatedAt: Date.now() });
    showToast('t1','✅ 관리자 계정 초기 설정','이번 로그인부터 관리자 모드 활성화');
  } else {
    // 정상 로그인: SHA-256 해시 비교
    var inputHash = await sha256Hash(pw);
    if (id !== creds.id || inputHash !== creds.pwHash) {
      var newState = recordLoginFailure('admin');
      var remain = LOGIN_ATTEMPT_MAX - newState.count;
      if (newState.lockUntil && Date.now() < newState.lockUntil) {
        showToast('t1','🔒 로그인 잠김','5회 연속 실패 → 5분 잠금');
      } else {
        showToast('t1','⚠️ 로그인 실패','아이디 또는 비밀번호가 맞지 않아요 (남은 시도: ' + remain + '회)');
      }
      if (pwEl) { pwEl.style.borderColor='var(--red-accent)'; setTimeout(()=>pwEl.style.borderColor='',1500); }
      return;
    }
  }

  // ✅ 로그인 성공
  clearLoginFailure('admin');
  setSession('admin');
  try {
    // 현재 시세도 DB에 동기화 (기존 동작 유지)
    _saveSettingToDB('hiveoil_prices', JSON.stringify(PRICES));
    setAdminMode(true);
    showPanel('dashboard', null);
    if (pwEl) pwEl.value = '';
    showToast('t1','✅ 관리자 로그인 완료','전체 관리 기능이 활성화됐어요');
  } catch(e) {
    showToast('t1','❌ 오류 발생', e.message || '관리자 모드 전환 중 오류');
  }
}

// ===== 사이드바 메뉴 제어 =====
// updateNavByMode는 아래에 정의됨 (7943줄)

// ===== 업주 로그인 =====
async function doOwnerLogin() {
  var id = (document.getElementById('ownerLoginId') || {value:''}).value.trim();
  var pw = (document.getElementById('ownerLoginPw') || {value:''}).value.trim();
  if (!id || !pw) { showToast('t1','⚠️ 입력 필요','아이디와 비밀번호를 입력해주세요'); return; }

  // 로그인 시도 중 표시
  var loginBtn = document.querySelector('#panel-owner-login button.btn-primary');
  var origText = '';
  if (loginBtn) { origText = loginBtn.textContent; loginBtn.textContent = '⏳ 확인 중...'; loginBtn.disabled = true; }

  function _restoreBtn() {
    if (loginBtn) { loginBtn.textContent = origText || '🔑 로그인'; loginBtn.disabled = false; }
  }

  async function tryLogin() {
    var acct = null;
    var customAccounts = JSON.parse(localStorage.getItem('hiveoil_custom_accounts') || '{}');
    var customAcct = customAccounts[id];

    // 1. 직접 설정한 ID/PW (localStorage 캐시) — 빠른 경로
    if (customAcct && customAcct.pw === pw) {
      acct = { bizId: customAcct.bizId, name: customAcct.name };
    }

    // 2. 메모리 businesses에서 loginId/loginPw 체크
    if (!acct) {
      var dbAcct = businesses.find(function(b) {
        return b.loginId && b.loginPw &&
               String(b.loginId).trim() === id && String(b.loginPw).trim() === pw;
      });
      if (dbAcct) {
        acct = { bizId: dbAcct.id, name: dbAcct.name };
        customAccounts[id] = { pw: pw, bizId: dbAcct.id, name: dbAcct.name };
        try { localStorage.setItem('hiveoil_custom_accounts', JSON.stringify(customAccounts)); } catch(e) {}
      }
    }

    // 3. 🆕 DB 직접 조회 (모바일에서 메모리에 아직 안 들어왔을 때)
    if (!acct && db && typeof db.from === 'function') {
      try {
        var res = await db.from('businesses').select('id, name, login_id, login_pw, deleted').eq('login_id', id).limit(5);
        if (res.data && res.data.length > 0) {
          var matched = res.data.find(function(r) {
            return !r.deleted && String(r.login_pw || '').trim() === pw;
          });
          if (matched) {
            acct = { bizId: matched.id, name: matched.name };
            customAccounts[id] = { pw: pw, bizId: matched.id, name: matched.name };
            try { localStorage.setItem('hiveoil_custom_accounts', JSON.stringify(customAccounts)); } catch(e) {}
            console.log('✅ DB 직접 조회로 로그인 성공:', id);
          }
        }
      } catch(e) {
        console.warn('DB 직접 조회 실패:', e.message);
      }
    }

    // 4. WJ 코드 방식 (기존 호환)
    if (!acct) {
      var wjAccts = buildOwnerAccounts();
      var wjAcct = wjAccts[id.toUpperCase()];
      if (wjAcct && wjAcct.pw === pw) {
        acct = { bizId: wjAcct.bizId, name: wjAcct.name };
        customAccounts[id.toUpperCase()] = { pw: pw, bizId: wjAcct.bizId, name: wjAcct.name };
        try { localStorage.setItem('hiveoil_custom_accounts', JSON.stringify(customAccounts)); } catch(e) {}
      }
    }

    if (!acct) {
      _restoreBtn();
      showToast('t1','❌ 로그인 실패','아이디 또는 비밀번호를 확인해주세요');
      return;
    }

    ownerLoggedIn = true;
    ownerBizId    = acct.bizId;
    var biz = businesses.find(function(b){ return String(b.id) === String(acct.bizId); });

    // 메모리에 없으면 DB에서 한 번 더 fetch
    if (!biz && db && typeof db.from === 'function') {
      try {
        var bRes = await db.from('businesses').select('*').eq('id', acct.bizId).single();
        if (bRes.data) {
          biz = dbRowToBiz(bRes.data);
          businesses.push(biz);
          saveBusinesses();
        }
      } catch(e) {}
    }

    ownerNewVal   = biz ? getBizTotalNewOil(biz) : 0;
    ownerWasteVal = biz ? (biz.wasteOil || 0) : 0;
    try { localStorage.setItem('hiveoil_session', JSON.stringify({ type: 'owner', bizId: acct.bizId, loginId: id })); } catch(e) {}
    var dispName = biz ? biz.name : (acct.name || id);
    var sName = document.getElementById('sidebarName');
    var sAvatar = document.getElementById('sidebarAvatar');
    if (sName) sName.textContent = dispName;
    if (sAvatar) { sAvatar.textContent = dispName[0] || 'O'; sAvatar.style.background = '#FFD43B'; }
    updateNavByMode();
    showPanel('qr', null);
    showToast('t1','✅ 로그인 성공', dispName + ' — 재고를 입력해주세요');
    // 푸시 알림 켜져 있으면 owner role + bizId로 재구독
    try { pushSyncAfterLogin && pushSyncAfterLogin(); } catch(e) {}

    // ISCC 인증용 서명 자동 체크 (없으면 등록 유도)
    setTimeout(function() {
      try {
        refreshOwnerSigStatus();
        // 🆕 v131: 새 강제 온보딩 우선 — ISCC + 서명 모두 처리
        if (checkOwnerOnboardingRequired(acct.bizId)) {
          console.log('[온보딩] 🆕 첫 로그인 — 강제 온보딩 모달');
          showOwnerOnboarding(acct.bizId);
          return;  // 기존 서명-only 자동 띄우기 건너뜀
        }
        var hasSig = hasOwnerSignature(acct.bizId);
        console.log('[서명체크] bizId=' + acct.bizId + ' / 서명 등록 여부=' + hasSig);
        // 한 번 "나중에" 누르면 그 세션 동안은 안 묻기 (편의)
        var skippedThisSession = sessionStorage.getItem('hiveoil_sig_skipped_' + acct.bizId);
        if (!hasSig && !skippedThisSession) {
          // 이미 떠 있는 다른 모달이 있으면 닫고 띄우기
          var existing = document.getElementById('signatureModal');
          if (existing) {
            existing.style.display = 'flex';
            existing.style.alignItems = 'center';
            existing.style.justifyContent = 'center';
            console.log('[서명모달] 표시 시도 ✍️');
            // 진짜로 보이는지 0.3초 후 재확인
            setTimeout(function() {
              var m = document.getElementById('signatureModal');
              if (m && getComputedStyle(m).display === 'none') {
                console.warn('[서명모달] CSS에 의해 숨겨짐! 강제 재표시');
                m.style.cssText += ';display:flex !important;';
              }
            }, 300);
            openSignatureModal(acct.bizId);
          } else {
            console.warn('[서명모달] DOM에서 #signatureModal 못 찾음');
          }
        }
      } catch(e) { console.error('서명 체크 실패:', e); }
    }, 1500);
  }

  // businesses 없으면 DB 먼저 로드
  try {
    if (businesses.length === 0) {
      showToast('t1','⏳ 로딩 중...','업체 정보를 불러오고 있어요');
      await loadBusinessesFromDB();
    }
    await tryLogin();
  } catch(e) {
    console.error('로그인 처리 중 오류:', e);
    _restoreBtn();
    showToast('t1','⚠️ 오류 발생', '잠시 후 다시 시도해주세요');
  }
}

// ===== 🆕 v142: 운반자 로그인 진단 도구 =====
async function runDriverDiagnostics() {
  var box = document.getElementById('driverDiagBox');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '🔍 <b>진단 중...</b>';

  var report = [];
  var hasError = false;

  // 1. db 객체 존재 확인
  if (typeof db === 'undefined' || !db || typeof db.from !== 'function') {
    report.push('❌ <b>Supabase 클라이언트 없음</b> — 네트워크 또는 SDK 로드 실패');
    hasError = true;
  } else {
    report.push('✅ Supabase 클라이언트 정상');
  }

  // 2. localStorage 캐시 상태
  try {
    var cached = JSON.parse(localStorage.getItem('hiveoil_drivers') || '[]');
    report.push('📦 localStorage 캐시: <b>' + cached.length + '명</b>');
  } catch(e) {
    report.push('⚠️ localStorage 읽기 오류: ' + e.message);
  }

  // 3. 메모리 driverAccounts 상태
  var memCount = Array.isArray(driverAccounts) ? driverAccounts.length : 0;
  report.push('🧠 메모리 driverAccounts: <b>' + memCount + '명</b>');
  if (memCount > 0) {
    var ids = driverAccounts.slice(0, 3).map(function(d) {
      return d.id + (d.approved === false ? '⏸️대기' : '') + (d.active === false ? '🚫비활성' : '');
    }).join(', ');
    report.push('  └ 상위 ID: ' + ids + (memCount > 3 ? ' ...' : ''));
  }

  // 4. DB에서 직접 조회 (RLS·권한 확인)
  if (typeof db !== 'undefined' && db && typeof db.from === 'function') {
    try {
      var r = await db.from('app_settings').select('value').eq('key', 'driver_accounts').single();
      if (r.error) {
        report.push('❌ <b>DB 조회 실패</b>: ' + r.error.message);
        if (/permission|RLS|policy/i.test(r.error.message)) {
          report.push('  └ 💡 <b>RLS 정책 문제</b> — Supabase Dashboard에서 app_settings 테이블 RLS 비활성화 또는 anon SELECT 허용 필요');
        }
        if (/quota|egress|exceed/i.test(r.error.message)) {
          report.push('  └ 💡 <b>Supabase 사용량 초과</b> — 청구·플랜 확인');
        }
        hasError = true;
      } else if (r.data && r.data.value) {
        try {
          var parsed = JSON.parse(r.data.value);
          report.push('✅ <b>DB에서 ' + parsed.length + '명 로드 성공</b>');
          var driver1 = parsed.find(function(d){ return d.id === 'driver1'; });
          if (driver1) {
            report.push('  └ driver1 확인됨 (approved=' + (driver1.approved !== false ? '✅' : '❌') + ', active=' + (driver1.active !== false ? '✅' : '❌') + ', pwHash=' + (driver1.pwHash ? '있음' : '없음') + ')');
          } else {
            report.push('  └ ⚠️ driver1 계정이 DB에 없어요');
          }
          // 강제 갱신
          driverAccounts = parsed;
          saveDriverAccounts();
          report.push('🔄 메모리·캐시 갱신 완료 — <b>이제 로그인 시도해보세요</b>');
        } catch(e2) {
          report.push('❌ DB 값 파싱 실패: ' + e2.message);
          hasError = true;
        }
      } else {
        report.push('⚠️ DB의 driver_accounts 키가 비어있음 — 관리자가 운반자 등록 필요');
        hasError = true;
      }
    } catch(e) {
      report.push('❌ DB 호출 예외: ' + (e.message || e));
      hasError = true;
    }
  }

  // 5. 잠금 상태 체크
  try {
    var lock = isLoginLocked('driver');
    if (lock.locked) {
      report.push('🔒 <b>현재 로그인 잠금</b>: ' + lock.remainMin + '분 후 해제');
    } else {
      report.push('🔓 로그인 잠금 없음');
    }
  } catch(e) {}

  // 결과 박스 색상 변경
  box.style.background = hasError ? '#FEF2F2' : '#E8F5E9';
  box.style.borderColor = hasError ? '#C0392B' : '#2E7D32';
  box.style.color = hasError ? '#7F1D1D' : '#1B5E20';
  box.innerHTML = '<b>🔍 운반자 로그인 진단 결과</b><br><br>' + report.join('<br>')
    + '<br><br><div style="font-size:10px;opacity:0.8;border-top:1px dashed currentColor;padding-top:8px;margin-top:8px;">이 결과를 기봉 차장에게 캡처해서 보내면 빠르게 해결돼요.</div>';
}

// ===== 운반자 로그인 =====
async function doDriverLogin() {
  // 🔐 v105: 잠금 상태 체크
  var lockState = isLoginLocked('driver');
  if (lockState.locked) {
    showToast('t1','🔒 로그인 잠김','너무 많이 실패했어요. ' + lockState.remainMin + '분 후 다시 시도해주세요.');
    return;
  }

  var id = (document.getElementById('driverLoginId') || {value:''}).value.trim();
  var pw = (document.getElementById('driverLoginPw') || {value:''}).value.trim();
  if (!id || !pw) { showToast('t1','⚠️ 입력 필요','아이디와 비밀번호를 입력해주세요'); return; }

  // 🔐 해시 기반 인증 (async)
  var driverAcct = await checkDriverLogin(id, pw);
  if (!driverAcct) {
    var newState = recordLoginFailure('driver');
    var remain = LOGIN_ATTEMPT_MAX - newState.count;
    if (newState.lockUntil && Date.now() < newState.lockUntil) {
      showToast('t1','🔒 로그인 잠김','5회 연속 실패 → 5분 잠금');
    } else {
      showToast('t1','❌ 로그인 실패','아이디 또는 비밀번호가 맞지 않아요 (남은 시도: ' + remain + '회)');
    }
    return;
  }

  // ✅ 로그인 성공
  clearLoginFailure('driver');
  isDriverMode = true;
  var displayName = driverAcct.name || '운반자';
  setSession('driver', { loginId: id, name: displayName });
  document.getElementById('sidebarName').textContent = displayName;
  document.getElementById('sidebarAvatar').textContent = '🚛';
  document.getElementById('sidebarAvatar').style.background = '#185FA5';
  updateNavByMode();
  showPanel('waste', null);
  showToast('t1','✅ ' + displayName + ' 로그인','수거·발주 업무를 시작하세요');
  try { pushSyncAfterLogin && pushSyncAfterLogin(); } catch(e) {}
}

// ===== 통합 로그아웃 =====
function doLogout() {
  ownerLoggedIn = false;
  ownerBizId    = null;
  isAdminMode   = false;
  isDriverMode  = false;
  try { localStorage.removeItem('hiveoil_session'); } catch(e) {}
  document.getElementById('sidebarName').textContent = '식용유니버스';
  document.getElementById('sidebarAvatar').textContent = 'H';
  document.getElementById('sidebarAvatar').style.background = 'var(--green-main)';
  updateNavByMode();
  renderPendingBizList && renderPendingBizList();
  updateRegisterBadge && updateRegisterBadge();
  showPanel('owner-dash', null);
  showToast('t1','👋 로그아웃됐어요','메인 화면으로 돌아갑니다');
}

function setAdminMode(on) {
  isAdminMode = on;
  if (on) { ownerLoggedIn = false; ownerBizId = null; isDriverMode = false; }
  document.getElementById('sidebarName').textContent = on ? '식용유니버스 관리자' : '식용유니버스';
  document.getElementById('sidebarAvatar').textContent = on ? 'A' : 'H';
  document.getElementById('sidebarAvatar').style.background = on ? '#C0392B' : 'var(--green-main)';
  updateNavByMode();
  if (on) { loadPendingBizFromDB && loadPendingBizFromDB(); }
  else { renderPendingBizList && renderPendingBizList(); }
  updateRegisterBadge && updateRegisterBadge();
}

function hqAdminLogout() { doLogout(); }

// ===== 업주 대시보드 렌더 =====
function renderOwnerDash() {
  // 시세 업데이트
  const el = (id) => document.getElementById(id);
  if (el('odSoy'))    el('odSoy').textContent    = (PRICES.oils.soy.price > 0 ? PRICES.oils.soy.price.toLocaleString() + '원' : '—');
  if (el('odCanola')) el('odCanola').textContent = (PRICES.oils.canola.price > 0 ? PRICES.oils.canola.price.toLocaleString() + '원' : '—');
  if (el('odCorn'))   el('odCorn').textContent   = (PRICES.oils.corn.price > 0 ? PRICES.oils.corn.price.toLocaleString() + '원' : '—');
  if (el('odWaste'))  el('odWaste').textContent  = PRICES.waste.can.price.toLocaleString() + '원/캔';

  // ESG 적립율 표시
  if (el('ownerDashPurchaseRate') && PRICES.pointRates) {
    el('ownerDashPurchaseRate').textContent = Math.round(PRICES.pointRates.purchase * 100) + '%';
  }
  if (el('ownerDashWasteRate') && PRICES.pointRates) {
    el('ownerDashWasteRate').textContent = Math.round(PRICES.pointRates.waste * 100) + '%';
  }

  // 업주 로그인 상태면 업체 현황 카드 표시
  if (ownerBizId) {
    const b = businesses.find(x => String(x.id) === String(ownerBizId));
    if (b) {
      const card = el('ownerDashBizCard');
      if (card) card.style.display = '';
      if (el('ownerDashBizName'))  el('ownerDashBizName').textContent  = b.name;
      if (el('ownerDashNewOil')) {
    var prods = getBizProducts(b);
    el('ownerDashNewOil').textContent = prods.length > 1
      ? getBizProductSummary(b)
      : getBizTotalNewOil(b) + '캔';
  }
      if (el('ownerDashWasteOil')) el('ownerDashWasteOil').textContent = b.wasteOil;
      const esgPts = Math.round(b.wasteOil * 144);
      if (el('ownerDashEsg'))      el('ownerDashEsg').textContent      = esgPts;
      const greet = el('ownerDashGreeting');
      if (greet) greet.textContent = '👋 ' + b.name + ' · 안녕하세요!';
    }
  }

  // 🆕 v114: 월간 랭킹 카드는 로그인 상태에서만 표시
  const rankingCard = el('ownerDashRankingCard');
  if (rankingCard) {
    var isLoggedIn = (typeof ownerLoggedIn !== 'undefined' && ownerLoggedIn)
                  || (typeof isAdminMode !== 'undefined' && isAdminMode)
                  || (typeof isDriverMode !== 'undefined' && isDriverMode);
    rankingCard.style.display = isLoggedIn ? '' : 'none';
  }

  // 🆕 v125: 가맹점 로그인 시 브랜드 헤더 표시
  renderFranchiseStoreHeader();

  // 🆕 v145: 업주 최근 발주·수거 신청 현황 카드
  renderOwnerRecentRequests();
}

// ════════════════════════════════════════════════════════════════════
// 🆕 v145: 업주 대시보드 - 내 신청 현황 (발주가 잘 들어갔는지 확인용)
// ════════════════════════════════════════════════════════════════════
function renderOwnerRecentRequests() {
  var card = document.getElementById('ownerRecentRequestCard');
  var list = document.getElementById('ownerRecentRequestList');
  var badge = document.getElementById('ownerRecentRequestBadge');
  if (!card || !list) return;

  // 업주 로그인 상태가 아니면 숨김
  if (!ownerLoggedIn || !ownerBizId) {
    card.style.display = 'none';
    return;
  }

  // 내 업체의 최근 신청 (pending + 최근 7일 done)
  var sevenDaysAgo = Date.now() - 7 * 86400 * 1000;
  var myRequests = (historyData || []).filter(function(h) {
    if (h.deleted_at) return false;
    if (String(h.bizId) !== String(ownerBizId)) return false;
    if (h.type !== '식용유발주' && h.type !== '폐유수거') return false;
    if (h.status === 'pending') return true;
    // 완료 이력은 최근 7일만
    var hDate = new Date(h.rawDate || h.date || 0).getTime();
    return h.status === 'done' && hDate >= sevenDaysAgo;
  });

  // 최신순 정렬 (pending 우선)
  myRequests.sort(function(a, b) {
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return (b.rawDate || '').localeCompare(a.rawDate || '');
  });

  // 카드 없으면 숨김
  if (myRequests.length === 0) {
    card.style.display = 'none';
    return;
  }

  card.style.display = 'block';
  var pendingCount = myRequests.filter(function(h){ return h.status === 'pending'; }).length;
  if (badge) {
    badge.textContent = pendingCount > 0 ? pendingCount + '건 진행중' : myRequests.length + '건';
    badge.style.background = pendingCount > 0 ? '#FFEB3B' : '#A5D6A7';
    badge.style.color = pendingCount > 0 ? '#0F2419' : '#1B5E20';
  }

  // 최대 5건만
  var shown = myRequests.slice(0, 5);
  list.innerHTML = shown.map(function(h) {
    var isOrder = h.type === '식용유발주';
    var isPending = h.status === 'pending';
    var typeIcon = isOrder ? '📦' : '♻️';
    var typeColor = isOrder ? '#185FA5' : '#D4621A';
    var typeBg = isOrder ? '#EEF4FF' : '#FFF8F0';

    // 상태 라벨
    var statusLabel, statusColor, statusBg;
    if (isPending) {
      var hasVisit = !!(h.visitDate || h.visitLabel);
      if (hasVisit) {
        statusLabel = '🚛 ' + (h.visitLabel || '예정') + ' 처리';
        statusColor = '#1565C0';
        statusBg = '#E3F2FD';
      } else {
        statusLabel = '⏳ 접수됨 · 배차 대기';
        statusColor = '#E65100';
        statusBg = '#FFF8E1';
      }
    } else {
      statusLabel = '✅ 완료';
      statusColor = '#2E7D32';
      statusBg = '#E8F5E9';
    }

    var prodName = h.productName || h.content || (isOrder ? '식용유' : '폐유');
    if (prodName.length > 20) prodName = prodName.slice(0, 20) + '…';

    return '<div style="display:flex;align-items:center;gap:10px;padding:11px 12px;background:' + typeBg + ';border-radius:8px;margin-bottom:6px;border-left:3px solid ' + typeColor + ';">'
      + '<div style="font-size:20px;flex-shrink:0;">' + typeIcon + '</div>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:12.5px;font-weight:700;color:#333;line-height:1.3;">' + escapeHtml(prodName) + (h.qty ? ' · ' + h.qty + '캔' : '') + '</div>'
      +   '<div style="font-size:10.5px;color:#888;margin-top:2px;">' + (h.date || '날짜 미상') + (h.amount ? ' · ' + h.amount : '') + '</div>'
      + '</div>'
      + '<div style="background:' + statusBg + ';color:' + statusColor + ';font-size:10px;font-weight:800;padding:4px 9px;border-radius:6px;flex-shrink:0;white-space:nowrap;">' + statusLabel + '</div>'
      + '</div>';
  }).join('');

  if (myRequests.length > 5) {
    list.innerHTML += '<div style="text-align:center;padding:8px;font-size:11px;color:var(--gray);"><a href="javascript:showPanel(\'history\', null)" style="color:var(--green-dark);font-weight:700;text-decoration:none;">전체 이력 보기 (' + myRequests.length + '건) →</a></div>';
  }
}

function renderFranchiseStoreHeader() {
  // 기존 헤더 제거
  var existing = document.getElementById('frStoreHeader');
  if (existing) existing.remove();
  if (!ownerBizId || !ownerLoggedIn) return;
  var biz = businesses.find(function(b){ return String(b.id) === String(ownerBizId); });
  if (!biz || biz.tenantType !== 'franchise_store' || !biz.franchiseBrandId) return;
  // 브랜드 로드 (캐시 없으면)
  var doRender = function() {
    var brand = getBrandById(biz.franchiseBrandId);
    if (!brand) return;
    var panel = document.getElementById('panel-owner-dash');
    if (!panel) return;
    var inner = panel.firstElementChild || panel;
    var header = document.createElement('div');
    header.id = 'frStoreHeader';
    header.style.cssText = 'background:linear-gradient(135deg,#0F2419,#1F4D30);border-radius:12px;padding:12px 18px;margin:0 0 14px;color:#fff;display:flex;align-items:center;gap:12px;';
    header.innerHTML = ''
      + '<div style="width:36px;height:36px;border-radius:8px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;">🏪</div>'
      + '<div style="flex:1;min-width:0;">'
      +   '<div style="font-size:10px;font-weight:800;color:rgba(255,235,59,0.85);letter-spacing:0.08em;">FRANCHISE STORE</div>'
      +   '<div style="font-family:var(--font-display);font-size:14px;font-weight:800;letter-spacing:-0.01em;">' + escapeHtml(brand.name) + ' 가맹점' + (biz.storeCode ? ' · #' + escapeHtml(biz.storeCode) : '') + '</div>'
      + '</div>';
    // 첫 번째 자식으로 삽입
    inner.insertBefore(header, inner.firstChild);
  };
  if (franchiseBrands.length === 0) {
    loadFranchiseBrandsFromDB().then(doRender);
  } else {
    doRender();
  }
}

// ===== 급식소 수거 신청 =====
var applyData = JSON.parse(localStorage.getItem('hive_apply') || '[]');

function saveApply() { localStorage.setItem('hive_apply', JSON.stringify(applyData)); }

function applyCalcESG() {
  const l = parseFloat(document.getElementById('apply_waste')?.value || 0);
  const preview = document.getElementById('applyEsgPreview');
  if (!preview) return;
  if (!l || l <= 0) { preview.style.display='none'; return; }
  preview.style.display = 'block';
  const co2 = (l * 0.7).toFixed(1);
  const pts = Math.round(l * 5);
  const amt = Math.round(l * (PRICES.waste?.price || 1152)).toLocaleString();
  document.getElementById('applyPreCo2').textContent = co2 + ' kg';
  document.getElementById('applyPrePts').textContent = pts + ' pts';
  document.getElementById('applyPreAmt').textContent = amt + '원';
}

// ===== 업주 서명 등록 (ISCC 인증용) =====
var _sigCtx = null, _sigDrawing = false, _sigHasContent = false, _sigBizId = null;

// ════════════════════════════════════════════════════════════════════
// 🆕 v131: 첫 로그인 강제 온보딩 (ISCC 동의 + 대표자 서명)
// ════════════════════════════════════════════════════════════════════

var _onbSigCtx = null;
var _onbSigHasContent = false;
var _onbBizId = null;

function checkOwnerOnboardingRequired(bizId) {
  if (!bizId) return false;
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return false;
  // localStorage에 서명 캐시도 체크 (DB 동기화 지연 대비)
  var sigCache = null;
  try { sigCache = JSON.parse(localStorage.getItem('hiveoil_owner_signatures') || '{}')[bizId]; } catch(e) {}
  var hasSig = !!(biz.owner_signature || (sigCache && sigCache.signature));
  var hasIscc = biz.iscc_agreed === true;
  // 온보딩 완료 localStorage 플래그 (DB 데이터 손실 대비 안전망)
  var onbDone = false;
  try { onbDone = localStorage.getItem('hiveoil_onboard_' + bizId) === '1'; } catch(e) {}
  if (onbDone && hasSig) return false;  // 캐시 + 서명 있으면 통과
  return !hasSig || !hasIscc;
}

function showOwnerOnboarding(bizId) {
  _onbBizId = bizId;
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) return;
  var modal = document.getElementById('ownerOnboardModal');
  if (!modal) return;

  // 매장 정보 채우기
  var nameEl = document.getElementById('onboardBizName');
  var metaEl = document.getElementById('onboardBizMeta');
  if (nameEl) nameEl.textContent = biz.name;
  if (metaEl) {
    var brand = (biz.franchiseBrandId && typeof getBrandById === 'function') ? getBrandById(biz.franchiseBrandId) : null;
    var brandTxt = brand ? '🏪 ' + brand.name + (biz.storeCode ? ' #' + biz.storeCode + ' · ' : ' · ') : '';
    metaEl.textContent = brandTxt + (biz.owner ? '사장 ' + biz.owner + ' · ' : '') + (biz.phone || '') + (biz.addr ? ' · ' + biz.addr : '');
  }
  // 환영 메시지 (가맹점일 시 멘트 변경)
  var titleEl = document.getElementById('onboardWelcomeTitle');
  if (titleEl) {
    if (biz.franchiseBrandId) {
      var b2 = (typeof getBrandById === 'function') ? getBrandById(biz.franchiseBrandId) : null;
      titleEl.textContent = (b2 ? b2.name + ' ' : '') + '가맹점 가입을 환영해요!';
    } else {
      titleEl.textContent = '식용유니버스 가입을 환영해요!';
    }
  }

  // 체크박스 초기화 + 버튼 비활성화
  var ic = document.getElementById('onboardIsccAgree');
  var mk = document.getElementById('onboardMarketingAgree');
  if (ic) { ic.checked = false; ic.onchange = _onbUpdateButton; }
  if (mk) { mk.checked = false; }

  // 모달 표시
  modal.setAttribute('style', 'display:flex !important;position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:99999;align-items:center;justify-content:center;padding:20px;');

  // 캔버스 초기화 (requestAnimationFrame 2번 보장)
  var canvas = document.getElementById('onboardSigCanvas');
  if (!canvas) return;
  canvas._onbEventsAttached = false;
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var rect = canvas.getBoundingClientRect();
      var w = rect.width > 0 ? rect.width : (canvas.parentElement ? canvas.parentElement.clientWidth - 4 : 360);
      var h = rect.height > 0 ? rect.height : 170;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      _onbSigCtx = canvas.getContext('2d');
      _onbSigCtx.setTransform(1,0,0,1,0,0);
      _onbSigCtx.scale(dpr, dpr);
      _onbSigCtx.lineWidth = 2.5;
      _onbSigCtx.lineCap = 'round';
      _onbSigCtx.lineJoin = 'round';
      _onbSigCtx.strokeStyle = '#0D0D0D';
      _onbSigHasContent = false;
      onboardClearSig(true);  // placeholder 표시
      _attachOnboardSigEvents();
    });
  });

  // ESC 키 / 배경 클릭 막기 (강제 모달)
  modal.onclick = function(e){ if (e.target === modal) { showToast('t1','⚠️ 필수 절차','동의 + 서명을 완료해주세요'); } };
}

function _attachOnboardSigEvents() {
  var canvas = document.getElementById('onboardSigCanvas');
  if (!canvas || canvas._onbEventsAttached) return;
  canvas._onbEventsAttached = true;
  var drawing = false;
  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var x, y;
    if (e.touches && e.touches[0]) { x = e.touches[0].clientX - rect.left; y = e.touches[0].clientY - rect.top; }
    else { x = e.clientX - rect.left; y = e.clientY - rect.top; }
    return { x: x, y: y };
  }
  function start(e) {
    e.preventDefault();
    drawing = true;
    var p = getPos(e);
    _onbSigCtx.beginPath();
    _onbSigCtx.moveTo(p.x, p.y);
  }
  function move(e) {
    if (!drawing) return;
    e.preventDefault();
    var p = getPos(e);
    _onbSigCtx.lineTo(p.x, p.y);
    _onbSigCtx.stroke();
    if (!_onbSigHasContent) {
      _onbSigHasContent = true;
      var ph = document.getElementById('onboardSigPlaceholder');
      if (ph) ph.style.display = 'none';
      var meta = document.getElementById('onboardSigMeta');
      if (meta) { meta.textContent = '✓ 서명 입력됨'; meta.style.color = '#2E7D32'; meta.style.fontWeight = '700'; }
      _onbUpdateButton();
    }
  }
  function end(e) {
    e.preventDefault();
    drawing = false;
  }
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
}

function onboardClearSig(silent) {
  var canvas = document.getElementById('onboardSigCanvas');
  if (!canvas || !_onbSigCtx) return;
  _onbSigCtx.clearRect(0, 0, canvas.width, canvas.height);
  _onbSigHasContent = false;
  var ph = document.getElementById('onboardSigPlaceholder');
  if (ph) ph.style.display = 'flex';
  var meta = document.getElementById('onboardSigMeta');
  if (meta) { meta.textContent = '서명을 그려주세요'; meta.style.color = ''; meta.style.fontWeight = ''; }
  _onbUpdateButton();
  if (!silent) showToast('t1', '🔄 서명 초기화', '다시 서명해주세요');
}

function _onbUpdateButton() {
  var ic = document.getElementById('onboardIsccAgree');
  var btn = document.getElementById('onboardCompleteBtn');
  if (!btn) return;
  var ready = (ic && ic.checked) && _onbSigHasContent;
  btn.disabled = !ready;
  btn.style.opacity = ready ? '1' : '0.5';
  btn.style.cursor = ready ? 'pointer' : 'not-allowed';
  btn.style.background = ready ? 'linear-gradient(135deg,#10D67A,#1F6B40)' : '#1F4D30';
}

async function completeOwnerOnboarding() {
  var ic = document.getElementById('onboardIsccAgree');
  var mk = document.getElementById('onboardMarketingAgree');
  if (!ic || !ic.checked) { showToast('t1','⚠️ ISCC 동의 필요','자가선언서 동의가 필수입니다'); return; }
  if (!_onbSigHasContent) { showToast('t1','⚠️ 서명 필요','대표자 서명을 입력해주세요'); return; }
  var canvas = document.getElementById('onboardSigCanvas');
  if (!canvas) return;
  var sigDataUrl = canvas.toDataURL('image/png');
  var marketingAgreed = mk && mk.checked;

  var btn = document.getElementById('onboardCompleteBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ 처리 중...'; btn.style.opacity = '0.7'; }

  // 1. localStorage 즉시 캐시
  try {
    var sigs = JSON.parse(localStorage.getItem('hiveoil_owner_signatures') || '{}');
    sigs[_onbBizId] = { signature: sigDataUrl, savedAt: new Date().toISOString() };
    localStorage.setItem('hiveoil_owner_signatures', JSON.stringify(sigs));
    localStorage.setItem('hiveoil_onboard_' + _onbBizId, '1');
  } catch(e) {}

  // 2. 메모리 동기화
  var biz = businesses.find(function(b){ return String(b.id) === String(_onbBizId); });
  if (biz) {
    biz.owner_signature = sigDataUrl;
    biz.iscc_agreed = true;
    biz.marketing_agreed = !!marketingAgreed;
  }

  // 3. DB 저장
  try {
    var res = await db.from('businesses').update({
      owner_signature: sigDataUrl,
      iscc_agreed: true,
      marketing_agreed: !!marketingAgreed
    }).eq('id', _onbBizId);
    if (res.error) {
      console.warn('온보딩 DB 저장 부분 실패:', res.error.message);
      // 컬럼 누락 등은 무시 — localStorage에는 저장됐으므로
    }
  } catch(e) {
    console.warn('온보딩 DB 저장 실패:', e);
  }

  // 4. 모달 닫고 환영 토스트
  var modal = document.getElementById('ownerOnboardModal');
  if (modal) modal.style.display = 'none';
  if (btn) { btn.disabled = false; btn.textContent = '✅ 동의 + 서명 후 시작하기'; btn.style.opacity = '1'; }

  var bizName = biz ? biz.name : '';
  showToast('t1', '🎉 ' + bizName + ' 가입 완료!', '식용유니버스 가맹점으로 등록되었습니다. 자유롭게 이용해주세요!');

  // 5. owner-dash 새로 렌더 (헤더 등 갱신)
  try { renderOwnerDash && renderOwnerDash(); } catch(e) {}
}

function openSignatureModal(bizId) {
  _sigBizId = bizId;
  var modal = document.getElementById('signatureModal');
  if (!modal) {
    console.error('[서명모달] DOM 미존재');
    showToast('t1','⚠️ 서명 모달 오류','페이지를 새로고침해주세요');
    return;
  }
  // !important로 강제 표시 (다른 CSS에 묻히지 않게)
  modal.setAttribute('style', 'display:flex !important;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;align-items:center;justify-content:center;padding:20px;');

  var canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;

  // 두 번째 이상 호출에 대비해 이벤트 재연결 가능하게 플래그 리셋
  canvas._sigEventsAttached = false;

  // 모달이 화면에 그려진 후 캔버스 크기 측정 — requestAnimationFrame 2번 보장
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var rect = canvas.getBoundingClientRect();
      // 모바일에서 rect가 0이면 부모 width 사용
      var w = rect.width > 0 ? rect.width : (canvas.parentElement ? canvas.parentElement.clientWidth - 4 : 360);
      var h = rect.height > 0 ? rect.height : 180;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      _sigCtx = canvas.getContext('2d');
      _sigCtx.setTransform(1,0,0,1,0,0); // 누적 transform 리셋
      _sigCtx.scale(dpr, dpr);
      _sigCtx.lineWidth = 2.5;
      _sigCtx.lineCap = 'round';
      _sigCtx.lineJoin = 'round';
      _sigCtx.strokeStyle = '#0D0D0D';
      _sigHasContent = false;
      var ph = document.getElementById('signaturePlaceholder');
      if (ph) ph.style.display = 'flex';
      var saveBtn = document.getElementById('signatureSaveBtn');
      if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; }
      var meta = document.getElementById('signatureMeta');
      if (meta) meta.textContent = '서명 후 [등록] 버튼을 눌러주세요';

      attachSignatureEvents();
    });
  });
}

function attachSignatureEvents() {
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;
  // 이미 바인딩됐으면 스킵
  if (canvas._sigEventsAttached) return;
  canvas._sigEventsAttached = true;

  function getPos(e) {
    var rect = canvas.getBoundingClientRect();
    var clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      clientX = e.changedTouches[0].clientX;
      clientY = e.changedTouches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!_sigCtx) return;
    _sigDrawing = true;
    var pos = getPos(e);
    _sigCtx.beginPath();
    _sigCtx.moveTo(pos.x, pos.y);
    if (!_sigHasContent) {
      _sigHasContent = true;
      var ph = document.getElementById('signaturePlaceholder');
      if (ph) ph.style.display = 'none';
      var saveBtn = document.getElementById('signatureSaveBtn');
      if (saveBtn) { saveBtn.disabled = false; saveBtn.style.opacity = '1'; }
      var meta = document.getElementById('signatureMeta');
      if (meta) meta.textContent = '✓ 서명이 입력됐어요';
    }
  }
  function move(e) {
    if (!_sigDrawing || !_sigCtx) return;
    e.preventDefault();
    var pos = getPos(e);
    _sigCtx.lineTo(pos.x, pos.y);
    _sigCtx.stroke();
  }
  function end(e) {
    if (e) e.preventDefault();
    _sigDrawing = false;
  }

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
  canvas.addEventListener('mouseleave', end);
  // 터치는 passive:false 필수 — preventDefault 가능
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });
}

function clearSignature() {
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas || !_sigCtx) return;
  _sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  _sigHasContent = false;
  var ph = document.getElementById('signaturePlaceholder');
  if (ph) ph.style.display = 'flex';
  var saveBtn = document.getElementById('signatureSaveBtn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.style.opacity = '0.5'; }
  var meta = document.getElementById('signatureMeta');
  if (meta) meta.textContent = '서명 후 [등록] 버튼을 눌러주세요';
}

// ===== 회원가입 폼 안의 서명 캔버스 (별도) =====
var _regSigCtx = null, _regSigDrawing = false, _regSigHasContent = false;

function initRegSignatureCanvas() {
  var canvas = document.getElementById('regSignatureCanvas');
  if (!canvas) return;

  // 크기 측정 (모바일에서 안전)
  requestAnimationFrame(function() {
    requestAnimationFrame(function() {
      var rect = canvas.getBoundingClientRect();
      var w = rect.width > 0 ? rect.width : (canvas.parentElement ? canvas.parentElement.clientWidth - 4 : 360);
      var h = rect.height > 0 ? rect.height : 140;
      var dpr = window.devicePixelRatio || 1;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      _regSigCtx = canvas.getContext('2d');
      _regSigCtx.setTransform(1,0,0,1,0,0);
      _regSigCtx.scale(dpr, dpr);
      _regSigCtx.lineWidth = 2.5;
      _regSigCtx.lineCap = 'round';
      _regSigCtx.lineJoin = 'round';
      _regSigCtx.strokeStyle = '#0D0D0D';
      _regSigHasContent = false;
      // 이벤트 1회만 바인딩
      if (!canvas._regSigEventsAttached) {
        canvas._regSigEventsAttached = true;
        var getPos = function(e) {
          var r = canvas.getBoundingClientRect();
          var cx, cy;
          if (e.touches && e.touches.length > 0) { cx = e.touches[0].clientX; cy = e.touches[0].clientY; }
          else if (e.changedTouches && e.changedTouches.length > 0) { cx = e.changedTouches[0].clientX; cy = e.changedTouches[0].clientY; }
          else { cx = e.clientX; cy = e.clientY; }
          return { x: cx - r.left, y: cy - r.top };
        };
        var start = function(e) {
          e.preventDefault();
          if (!_regSigCtx) return;
          _regSigDrawing = true;
          var p = getPos(e);
          _regSigCtx.beginPath();
          _regSigCtx.moveTo(p.x, p.y);
          if (!_regSigHasContent) {
            _regSigHasContent = true;
            var ph = document.getElementById('regSignaturePlaceholder');
            if (ph) ph.style.display = 'none';
            var meta = document.getElementById('regSignatureMeta');
            if (meta) meta.textContent = '✓ 서명이 입력됐어요';
          }
        };
        var move = function(e) {
          if (!_regSigDrawing || !_regSigCtx) return;
          e.preventDefault();
          var p = getPos(e);
          _regSigCtx.lineTo(p.x, p.y);
          _regSigCtx.stroke();
        };
        var end = function(e) { if (e) e.preventDefault(); _regSigDrawing = false; };
        canvas.addEventListener('mousedown', start);
        canvas.addEventListener('mousemove', move);
        canvas.addEventListener('mouseup', end);
        canvas.addEventListener('mouseleave', end);
        canvas.addEventListener('touchstart', start, { passive: false });
        canvas.addEventListener('touchmove', move, { passive: false });
        canvas.addEventListener('touchend', end, { passive: false });
        canvas.addEventListener('touchcancel', end, { passive: false });
      }
    });
  });
}

function clearRegSignature() {
  var canvas = document.getElementById('regSignatureCanvas');
  if (!canvas || !_regSigCtx) return;
  _regSigCtx.clearRect(0, 0, canvas.width, canvas.height);
  _regSigHasContent = false;
  var ph = document.getElementById('regSignaturePlaceholder');
  if (ph) ph.style.display = 'flex';
  var meta = document.getElementById('regSignatureMeta');
  if (meta) meta.textContent = '서명 후 [업체 등록 완료]를 누르면 저장돼요';
}

// 회원가입 시 서명 dataURL 가져오기 — 흰 배경 + JPEG 압축
function getRegSignatureDataUrl() {
  if (!_regSigHasContent) return null;
  var canvas = document.getElementById('regSignatureCanvas');
  if (!canvas) return null;
  // 흰 배경에 합성 (PNG는 투명배경, JPEG는 검정으로 변하므로)
  try {
    var w = canvas.width, h = canvas.height;
    var tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    var tctx = tmp.getContext('2d');
    tctx.fillStyle = '#FFFFFF';
    tctx.fillRect(0, 0, w, h);
    tctx.drawImage(canvas, 0, 0);
    return tmp.toDataURL('image/jpeg', 0.85);
  } catch(e) {
    return canvas.toDataURL('image/png');
  }
}
// ====================================================

function skipSignature() {
  var modal = document.getElementById('signatureModal');
  if (modal) modal.style.display = 'none';
  // 이번 세션에서는 다시 안 묻도록 기록
  try {
    var bid = _sigBizId || ownerBizId;
    if (bid) sessionStorage.setItem('hiveoil_sig_skipped_' + bid, '1');
  } catch(e) {}
  showToast('t1','💡 서명은 나중에 등록 가능','업주 화면 → ✍️ 서명 버튼에서 언제든 추가하실 수 있어요');
}

function saveSignature() {
  if (!_sigHasContent) { showToast('t1','⚠️ 서명을 그려주세요',''); return; }
  var canvas = document.getElementById('signatureCanvas');
  if (!canvas) return;

  var dataUrl = canvas.toDataURL('image/png');

  // localStorage 저장 (bizId별)
  try {
    var sigs = JSON.parse(localStorage.getItem('hiveoil_owner_signatures') || '{}');
    var bizId = _sigBizId || ownerBizId;
    if (bizId) {
      sigs[bizId] = { signature: dataUrl, savedAt: new Date().toISOString() };
      localStorage.setItem('hiveoil_owner_signatures', JSON.stringify(sigs));
      // biz 객체에도 동기화
      var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
      if (biz) biz.owner_signature = dataUrl;
    }
  } catch(e) { console.error('서명 저장 실패:', e); }

  // Supabase DB에도 동기화 (다른 기기에서도 ISCC 서명 자동 인식)
  try {
    var bizIdForDB = _sigBizId || ownerBizId;
    if (bizIdForDB && db && typeof db.from === 'function') {
      db.from('businesses').update({ owner_signature: dataUrl }).eq('id', bizIdForDB).then(function(res) {
        if (res && res.error) {
          var emsg = res.error.message || '';
          if (emsg.indexOf('owner_signature') >= 0) {
            console.warn('💡 Supabase businesses 테이블에 owner_signature TEXT 컬럼이 없어요. SQL: ALTER TABLE businesses ADD COLUMN owner_signature TEXT;');
          } else {
            console.warn('서명 DB 저장 실패:', emsg);
          }
        } else {
          console.log('✅ 서명 DB 저장 완료');
        }
      });
    }
  } catch(e) { console.warn('서명 DB 동기화 실패:', e); }

  var modal = document.getElementById('signatureModal');
  if (modal) modal.style.display = 'none';
  showToast('t1','✅ 서명 등록 완료!','이제 ISCC 자가선언서·수거확인서에 자동 삽입돼요');

  // 헤더 버튼 상태 갱신
  try {
    var statusEl = document.getElementById('ownerSigStatus');
    if (statusEl) statusEl.textContent = '서명 ✓';
  } catch(e) {}
}

function refreshOwnerSigStatus() {
  try {
    var statusEl = document.getElementById('ownerSigStatus');
    if (!statusEl) return;
    if (ownerBizId && hasOwnerSignature(ownerBizId)) {
      statusEl.textContent = '서명 ✓';
    } else {
      statusEl.textContent = '서명';
    }
  } catch(e) {}
}

function getOwnerSignature(bizId) {
  // 1. biz 객체 우선
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (biz && biz.owner_signature) return biz.owner_signature;
  // 2. localStorage 폴백
  try {
    var sigs = JSON.parse(localStorage.getItem('hiveoil_owner_signatures') || '{}');
    if (sigs[bizId] && sigs[bizId].signature) return sigs[bizId].signature;
  } catch(e) {}
  return null;
}

function hasOwnerSignature(bizId) {
  return !!getOwnerSignature(bizId);
}
// ===========================================

// ===== 급식소 ESG 데모 계산기 =====
function schoolDemoCalc() {
  var studentsEl = document.getElementById('schoolDemoStudents');
  var perMonthEl = document.getElementById('schoolDemoPerMonth');
  if (!studentsEl || !perMonthEl) return;
  var students     = parseFloat(studentsEl.value) || 0;
  var monthlyCans  = parseFloat(perMonthEl.value) || 0;
  var monthlyKg    = monthlyCans * 16.5;       // 1캔=16.5kg
  // CO2 감축 (kg)
  var co2          = Math.round(monthlyKg * (PRICES.carbonRate || 0.7));
  // 바이오디젤 환산 (kg × 0.9)
  var bioL         = Math.round(monthlyKg * 0.9);
  // 학교 환경 기금 (캔당 22,000원 = 일반 폐유 매입가)
  var fund         = monthlyCans * 22000;
  // 환경 교육 활용 시간 (캔당 0.7시간 환산)
  var eduHours     = (monthlyCans * 0.7).toFixed(1);

  var co2El  = document.getElementById('schoolDemoCo2');
  var bioEl  = document.getElementById('schoolDemoBio');
  var fundEl = document.getElementById('schoolDemoFund');
  var eduEl  = document.getElementById('schoolDemoEduHours');
  if (co2El)  co2El.textContent  = co2.toLocaleString() + ' kg';
  if (bioEl)  bioEl.textContent  = bioL.toLocaleString() + ' L';
  if (fundEl) fundEl.textContent = fund.toLocaleString() + '원';
  if (eduEl)  eduEl.textContent  = eduHours + ' 시간';
}

// ===== 프랜차이즈 ESG 데모 계산기 (v140: 캔 단위 / 1캔=16.5kg) =====
function franchiseDemoCalc() {
  var storesEl = document.getElementById('franchiseDemoStores');
  var perStoreEl = document.getElementById('franchiseDemoPerStore');
  if (!storesEl) return;
  var stores       = parseFloat(storesEl.value) || 0;
  var perStoreCans = parseFloat(perStoreEl.value) || 0;
  var totalCans    = stores * perStoreCans;
  var totalKg      = totalCans * 16.5;
  var co2          = Math.round(totalKg * (PRICES.carbonRate || 0.7));
  var pts          = Math.round(totalKg * 12.5);     // kg당 12.5pt
  var amt          = Math.round(totalCans * 22000);  // 캔당 22,000원 (폐유 매입가)
  var bioL         = Math.round(totalKg * 0.9);      // kg당 0.9L 바이오디젤
  var co2El = document.getElementById('franchiseDemoCo2');
  var ptsEl = document.getElementById('franchiseDemoPts');
  var amtEl = document.getElementById('franchiseDemoAmt');
  var bioEl = document.getElementById('franchiseDemoBio');
  if (co2El) co2El.textContent = co2.toLocaleString() + ' kg';
  if (ptsEl) ptsEl.textContent = pts.toLocaleString() + ' pts';
  if (amtEl) amtEl.textContent = amt.toLocaleString() + '원';
  if (bioEl) bioEl.textContent = bioL.toLocaleString() + ' L';
}

// 패널 진입 시 자동 계산
window.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    try { schoolDemoCalc(); } catch(e) {}
    try { franchiseDemoCalc(); } catch(e) {}
  }, 500);

  // 🔁 푸시 구독 자동 헬스체크
  // 앱 시작 5초 후 (auth 복원 + supabase 초기화 대기) → 첫 체크
  // 그 후 5분마다 (수면 후 깬 폰에서도 빠르게 복구)
  setTimeout(function() {
    try { pushAutoResync && pushAutoResync(); } catch(e) {}
  }, 5000);
  setInterval(function() {
    try { pushAutoResync && pushAutoResync(); } catch(e) {}
  }, 5 * 60 * 1000);

  // 폰이 절전 모드에서 깨어나거나 백그라운드→포그라운드 전환 시도 즉시 체크
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      setTimeout(function() {
        try { pushAutoResync && pushAutoResync(); } catch(e) {}
      }, 1000);
    }
  });
});

function submitApply() {
  const name    = document.getElementById('apply_name')?.value.trim();
  const type    = document.getElementById('apply_type')?.value;
  const manager = document.getElementById('apply_manager')?.value.trim();
  const phone   = document.getElementById('apply_phone')?.value.trim();
  const addr    = document.getElementById('apply_addr')?.value.trim();
  const pax     = document.getElementById('apply_pax')?.value;
  const waste   = document.getElementById('apply_waste')?.value;
  const note    = document.getElementById('apply_note')?.value.trim();
  const agree   = document.getElementById('apply_agree')?.checked;

  if (!name)    { showToast('t1','⚠️ 입력 오류','급식소명을 입력해주세요'); return; }
  if (!type)    { showToast('t1','⚠️ 입력 오류','급식소 유형을 선택해주세요'); return; }
  if (!manager) { showToast('t1','⚠️ 입력 오류','담당자명을 입력해주세요'); return; }
  if (!phone)   { showToast('t1','⚠️ 입력 오류','연락처를 입력해주세요'); return; }
  if (!addr)    { showToast('t1','⚠️ 입력 오류','주소를 입력해주세요'); return; }
  if (!pax || pax <= 0) { showToast('t1','⚠️ 입력 오류','급식 인원을 입력해주세요'); return; }
  if (!waste || waste <= 0) { showToast('t1','⚠️ 입력 오류','예상 폐유 발생량을 입력해주세요'); return; }
  if (!agree)   { showToast('t1','⚠️ 동의 필요','개인정보 수집·이용에 동의해주세요'); return; }

  const now = new Date();
  const dateStr = now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0');
  const item = {
    id: Date.now(), date: dateStr, rawDate: now.toISOString(),
    name, type, manager, phone, addr,
    pax: parseInt(pax), waste: parseFloat(waste), note,
    status: 'pending',
    co2: (parseFloat(waste) * 0.7).toFixed(1),
    pts: Math.round(parseFloat(waste) * 5),
    amt: Math.round(parseFloat(waste) * (PRICES.waste?.price || 1152))
  };

  applyData.unshift(item);
  saveApply();
  renderApplyList();
  updateApplyKpi();

  // 폼 초기화
  ['apply_name','apply_type','apply_manager','apply_phone','apply_addr','apply_pax','apply_waste','apply_note'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (document.getElementById('apply_agree')) document.getElementById('apply_agree').checked = false;
  if (document.getElementById('applyEsgPreview')) document.getElementById('applyEsgPreview').style.display = 'none';

  showToast('t1','✅ 신청 완료!', name + ' — 담당자가 1영업일 내 연락드릴게요 🙌');

  // 히스토리 기록
  const hItem = {
    date: dateStr, rawDate: now.toISOString(),
    biz: name, bizId: null,
    type: '급식소신청',
    content: '[' + type + '] ' + name + ' — 폐유 ' + waste + 'L/월 · ' + manager,
    qty: 0, amount: item.amt.toLocaleString() + '원/월',
    method: '급식소 직접신청', status: 'pending'
  };
  historyData.unshift(hItem);
  saveHistory();
  updateDashboard();
}

function renderApplyList() {
  const el = document.getElementById('applyList');
  const countEl = document.getElementById('applyListCount');
  if (!el) return;
  if (countEl) countEl.textContent = applyData.length + '건';
  if (applyData.length === 0) {
    el.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);font-size:12px;">📭 아직 신청 내역이 없어요</div>';
    return;
  }
  const statusColor = { pending:'#185FA5', approved:'var(--green-dark)', rejected:'var(--red-accent)' };
  const statusLabel = { pending:'⏳ 검토 중', approved:'✅ 승인', rejected:'❌ 반려' };
  el.innerHTML = applyData.map(a => `
    <div style="padding:12px 16px;border-bottom:1px solid var(--gray-light);display:flex;gap:10px;align-items:flex-start;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
          <div style="font-size:13px;font-weight:700;color:var(--black);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.name}</div>
          <span style="font-size:9px;font-weight:700;padding:2px 7px;border-radius:5px;background:${statusColor[a.status]}20;color:${statusColor[a.status]};flex-shrink:0;">${statusLabel[a.status]||a.status}</span>
        </div>
        <div style="font-size:11px;color:var(--gray);">${a.type} · ${a.manager} · ${a.waste}L/월</div>
        <div style="font-size:10px;color:var(--gray);margin-top:2px;">${a.date} · 🌿 ${a.co2}kg CO₂ · ⭐ +${a.pts}pts</div>
      </div>
      <button onclick="applyApprove(${a.id})" style="font-size:10px;font-weight:700;padding:4px 9px;border-radius:7px;border:1.5px solid var(--green-main);color:var(--green-dark);background:var(--green-pale);cursor:pointer;flex-shrink:0;${a.status!=='pending'?'opacity:0.4;pointer-events:none;':''}">승인</button>
    </div>`).join('');
}

function applyApprove(id) {
  const a = applyData.find(x => x.id === id);
  if (!a || a.status !== 'pending') return;
  a.status = 'approved';
  saveApply();
  renderApplyList();
  updateApplyKpi();
  showToast('t1','✅ 승인 완료!', a.name + ' — 담당자 배정을 진행해주세요');
}

function updateApplyKpi() {
  const totalEl   = document.getElementById('applyKpiTotal');
  const pendingEl = document.getElementById('applyKpiPending');
  const kgEl      = document.getElementById('applyKpiKg');
  const badgeEl   = document.getElementById('sideApplyBadge');
  if (totalEl)   totalEl.textContent   = applyData.length;
  const pending = applyData.filter(a => a.status === 'pending').length;
  if (pendingEl) pendingEl.textContent = pending;
  const kg = applyData.reduce((s, a) => s + (a.waste || 0), 0);
  if (kgEl)      kgEl.textContent      = kg.toLocaleString();
  if (badgeEl) {
    if (pending > 0) { badgeEl.style.display = ''; badgeEl.textContent = pending; }
    else              badgeEl.style.display = 'none';
  }

  // esg-school 미니 위젯도 동시 갱신
  try { renderEsgSchoolMini(); } catch(e) {}
}

// esg-school 패널 안의 미니 신청 접수 위젯
function renderEsgSchoolMini() {
  var miniCard = document.getElementById('esgSchoolApplyMini');
  if (!miniCard) return;
  // 관리자가 아니면 숨김
  if (!isAdminMode) { miniCard.style.display = 'none'; return; }
  miniCard.style.display = 'block';

  var totalEl    = document.getElementById('esgSchoolKpiTotal');
  var pendingEl  = document.getElementById('esgSchoolKpiPending');
  var approvedEl = document.getElementById('esgSchoolKpiApproved');
  if (totalEl)    totalEl.textContent    = applyData.length;
  if (pendingEl)  pendingEl.textContent  = applyData.filter(function(a){ return a.status === 'pending'; }).length;
  if (approvedEl) approvedEl.textContent = applyData.filter(function(a){ return a.status === 'approved'; }).length;

  var listEl = document.getElementById('esgSchoolRecentList');
  if (!listEl) return;
  var recent = applyData.slice(0, 5);
  if (recent.length === 0) {
    listEl.innerHTML = '<div style="text-align:center;padding:18px;color:var(--gray);font-size:12px;">📭 신청 접수 내역 없음</div>';
    return;
  }
  listEl.innerHTML = recent.map(function(a) {
    var statusBadge = a.status === 'approved'
      ? '<span style="background:#E8F5E9;color:#2E7D32;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;">✓ 승인</span>'
      : '<span style="background:#FFF3E0;color:#E65100;font-size:10px;font-weight:700;padding:2px 7px;border-radius:5px;">⏳ 검토중</span>';
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 4px;border-bottom:1px solid #F0F0F0;">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-size:12px;font-weight:700;color:#0D0D0D;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (a.name||'-') + '</div>'
      + '<div style="font-size:10px;color:var(--gray);margin-top:2px;">' + (a.type||'') + ' · ' + (a.manager||'') + ' · ' + (a.date||'') + '</div>'
      + '</div>'
      + statusBadge
      + '</div>';
  }).join('');
}

// ===== 즉시 실행 - localStorage 데이터로 바로 렌더 =====
// Supabase 마이그레이션 안내 (최초 1회)
(function checkMigration() {
  if (!localStorage.getItem('hiveoil_migration_v2')) {
    console.info('📌 [마이그레이션 필요] oil_products 컬럼 추가: ALTER TABLE businesses ADD COLUMN IF NOT EXISTS oil_products jsonb;');
    localStorage.setItem('hiveoil_migration_v2', '1');
  }
})();

(function initUI() {
  // 🔧 빌드 버전 사이드바에 표시
  try {
    var bvEl = document.getElementById('sidebarBuildVer');
    if (bvEl && window.APP_BUILD) bvEl.textContent = 'build: ' + window.APP_BUILD;
  } catch(e) {}
  // CTA 업체등록 버튼 이벤트 리스너 (onclick 대신 안전하게)
  document.addEventListener('click', function(e) {
    if (e.target && e.target.id === 'ctaRegisterBtn') {
      showPanel('register', null);
    }
  });
  // 이력 데이터 마이그레이션: 유종명 → 실제 품목명
  (function migrateHistoryProductNames() {
    var changed = false;
    var typeToDefault = { '대두유': 'soy_wonju', '카놀라유': 'can_grewell', '옥수수유': 'corn_oilers' };
    historyData.forEach(function(h) {
      if (h.type !== '식용유발주') return;
      // content에 유종명이 포함된 경우 실제 품목명으로 교체
      ['대두유','카놀라유','옥수수유'].forEach(function(typeName) {
        if (h.content && h.content.indexOf(typeName + ' ') === 0) {
          // 해당 업체의 품목 찾기
          var biz = businesses.find(function(b){ return b.id === h.bizId; });
          var prodName = typeName; // 기본값 유지
          if (biz) {
            var prods = getBizProducts(biz);
            var matched = prods.find(function(p){
              return getProductInfo(p.key).type === (typeName === '대두유' ? 'soy' : typeName === '카놀라유' ? 'canola' : 'corn');
            });
            if (matched) prodName = getProductInfo(matched.key).label;
          } else if (typeToDefault[typeName]) {
            prodName = getProductInfo(typeToDefault[typeName]).label;
          }
          if (prodName !== typeName) {
            h.content = h.content.replace(typeName + ' ', prodName + ' ');
            changed = true;
          }
        }
      });
    });
    if (changed) { saveHistory(); console.log('✅ 이력 품목명 마이그레이션 완료'); }
  })();

  updateDashboard();
  updateTabBadges();
  renderWasteTable();
  renderWasteHistList && renderWasteHistList();
  renderHistory();
  renderRegBizList();
  renderApplyList();
  updateApplyKpi();
  setTimeout(renderOwnerDash, 0); // PRICES 로드 보장 후 실행
  renderPendingBizList();
  updateRegisterBadge();

  // 세션 복원 비활성화 — 매번 새로 로그인 (보안)
  try { localStorage.removeItem('hiveoil_session'); } catch(e) {}

  updateNavByMode(); // 초기 메뉴 상태 설정
  updateBottomTab(); // 모바일 탭바 초기화
  applyPrices();    // 시세 topbar 갱신
  // 탭바 재초기화 (DOM 완전 로드 보장)
  setTimeout(function(){ updateBottomTab(); }, 100);
  setTimeout(function(){ updateBottomTab(); }, 800);
  // 500ms 후 한번 더 (DOM 완전 로드 후)
  setTimeout(function(){ applyPrices(); renderOwnerDash && renderOwnerDash(); }, 500);
  // 기본 시작 패널: owner-dash (URL 해시 없을 때)
  const hash = location.hash.replace('#','');
  if (!hash) {
    history.replaceState({ panel: 'owner-dash' }, '', '#owner-dash');
  }
})();

// ============================================================
// 사이드바 메뉴 & 탭바 제어
// ============================================================
function updateNavByMode() {
  var isLogged = ownerLoggedIn || isAdminMode || isDriverMode || hqLoggedIn;
  document.querySelectorAll('.owner-only').forEach(el => { el.style.display = ownerLoggedIn ? '' : 'none'; });
  document.querySelectorAll('.driver-only').forEach(el => { el.style.display = isDriverMode ? '' : 'none'; });
  // 🆕 v126: 본사 전용 메뉴
  document.querySelectorAll('.hq-only').forEach(el => { el.style.display = hqLoggedIn ? '' : 'none'; });
  // 시세 조회는 업주/운반자 모두 표시
  const navPV = document.getElementById('navPriceView');
  if (navPV) navPV.style.display = (ownerLoggedIn || isDriverMode) ? '' : 'none';
  document.querySelectorAll('.admin-only').forEach(el => {
    if (el.classList.contains('nav-badge')) return;
    el.style.display = isAdminMode ? '' : 'none';
  });
  // 관리자 OR 운반자
  document.querySelectorAll('.admin-or-driver-only').forEach(el => {
    el.style.display = (isAdminMode || isDriverMode) ? '' : 'none';
  });
  // 일괄 처리 진입 (관리자 + 드라이버)
  document.querySelectorAll('.admin-driver-only').forEach(el => {
    el.style.display = (isAdminMode || isDriverMode) ? '' : 'none';
  });
  // 진행 이력 패널이 열려있으면 체크박스 컬럼 갱신을 위해 재렌더
  var histPanel = document.getElementById('panel-history');
  if (histPanel && histPanel.classList.contains('active')) {
    renderHistory(_currentHistTab);
  }
  ['navOwnerLogin','navDriverLogin','navHqLogin','navFrHqLogin','navFrStoreSignup','navLoginLabel'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.style.display = isLogged ? 'none' : '';
  });
  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.style.display = isLogged ? '' : 'none';
  var roleEl = document.getElementById('sidebarRole');
  if (roleEl) {
    if (isAdminMode)        roleEl.textContent = '관리자';
    else if (isDriverMode)  roleEl.textContent = '운반자';
    else if (hqLoggedIn)    roleEl.textContent = '본사';
    else if (ownerLoggedIn) roleEl.textContent = '업주';
    else roleEl.textContent = '로그인 후 이용';
  }
  // 관리자 로그아웃 시 업체 목록 섹션 즉시 숨기기
  const adminBizSec = document.getElementById('adminBizManageSection');
  if (adminBizSec) adminBizSec.style.display = isAdminMode ? '' : 'none';

  updateBottomTab();
}

function updateBottomTab() {
  const bar = document.getElementById('bottomTabBar');
  if (!bar) return;
  // PC(901px 이상)에서는 숨김, 모바일에서만 표시
  var isMobile = window.innerWidth <= 900;
  bar.style.display = isMobile ? 'flex' : 'none';
  if (!isMobile) return;
  bar.style.position = 'fixed';
  bar.style.bottom = '0';
  bar.style.left = '0';
  bar.style.right = '0';
  bar.style.height = '60px';
  bar.style.background = '#fff';
  bar.style.borderTop = '1px solid #e8ece8';
  bar.style.zIndex = '9999';

  function makeBtn(icon, label, oc) {
    var s = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:none;cursor:pointer;font-family:inherit;';
    return '<button onclick="' + oc + '" style="' + s + '">'
      + '<span style="font-size:20px;">' + icon + '</span>'
      + '<span style="font-size:10px;color:#555;">' + label + '</span>'
      + '</button>';
  }

  const isLogged = ownerLoggedIn || isAdminMode || isDriverMode;
  if (!isLogged) {
    bar.innerHTML = makeBtn('📊','대시보드',"showPanelMobile('owner-dash',this)")
      + makeBtn('🏪','업주',"showPanelMobile('owner-login',this)")
      + makeBtn('🚛','운반자',"showPanelMobile('driver-login',this)")
      + makeBtn('🏢','관리자',"showPanelMobile('hq-login',this)");
  } else if (ownerLoggedIn) {
    bar.innerHTML = makeBtn('📱','재고입력',"showPanelMobile('qr',this)")
      + makeBtn('♻️','수거신청',"showPanelMobile('waste',this)")
      + makeBtn('🫙','발주신청',"showPanelMobile('order',this)")
      + makeBtn('☰','메뉴',"toggleSidebar()");
  } else if (isDriverMode) {
    bar.innerHTML = makeBtn('♻️','수거',"showPanelMobile('waste',this)")
      + makeBtn('🫙','발주',"showPanelMobile('order',this)")
      + makeBtn('🗺️','지도',"showPanelMobile('map',this)")
      + makeBtn('☰','메뉴',"toggleSidebar()");
  } else if (isAdminMode) {
    bar.innerHTML = makeBtn('📊','대시보드',"showPanelMobile('dashboard',this)")
      + makeBtn('🗺️','지도',"showPanelMobile('map',this)")
      + makeBtn('🫙','납품',"showPanelMobile('order',this)")
      + makeBtn('♻️','수거',"showPanelMobile('waste',this)")
      + makeBtn('☰','메뉴',"toggleSidebar()");
  }
}

// ============================================================
// 지도 필터 바텀시트
// ============================================================
function openFilterSheet(filter) {
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  currentFilter = filter;
  renderBizList(filter);

  const labels = { low:'⚠️ 재고부족', waste:'♻️ 폐유대기', action:'🚨 조치필요', all:'전체' };
  let data = businesses;
  if (filter === 'low')    data = data.filter(b => shouldAutoOrder(b));
  if (filter === 'waste')  data = data.filter(b => shouldAutoCollect(b));
  if (filter === 'action') data = data.filter(b => shouldAutoOrder(b) || shouldAutoCollect(b));

  const title = document.getElementById('filterSheetTitle');
  const sub   = document.getElementById('filterSheetSub');
  const list  = document.getElementById('filterSheetList');
  if (title) title.textContent = labels[filter] || '업체 목록';
  if (sub)   sub.textContent   = `총 ${data.length}개 업체`;

  if (list) {
    if (data.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--gray);"><div style="font-size:32px;margin-bottom:10px;">✅</div>해당 조건 업체 없음</div>';
    } else {
      list.innerHTML = data.map(b => {
        const needD = shouldAutoOrder(b), needW = shouldAutoCollect(b);
        return `<div style="display:flex;align-items:center;gap:12px;padding:13px 6px;border-bottom:1px solid var(--gray-light);">
          <div onclick="closeFilterSheet();selectBizFromList(${b.id});" style="width:40px;height:40px;min-width:40px;border-radius:12px;background:${needD?'#FFEBEE':'#FFF8F0'};display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;">${needD?'⚠️':'♻️'}</div>
          <div style="flex:1;min-width:0;cursor:pointer;" onclick="closeFilterSheet();selectBizFromList(${b.id});">
            <div style="font-weight:700;font-size:14px;">${b.name}</div>
            <div style="font-size:11px;color:var(--gray);margin-top:2px;">${b.type}</div>
            <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap;">
              ${needD?`<span style="background:#FFEBEE;color:var(--red-accent);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">재고 ${getBizTotalNewOil(b)}캔</span>`:''}
              ${needW?`<span style="background:#E8F5E9;color:#2E7D32;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">폐유 ${b.wasteOil}캔</span>`:''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px;min-width:44px;">
            ${needW?`<button onclick="closeFilterSheet();window._skipLoginCheck=true;showPanel('waste',null);window._skipLoginCheck=false;" style="background:#FF6B00;color:#fff;border:none;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer;">수거</button>`:''}
            ${needD?`<button onclick="closeFilterSheet();window._skipLoginCheck=true;showPanel('order',null);window._skipLoginCheck=false;" style="background:#185FA5;color:#fff;border:none;border-radius:7px;padding:5px 8px;font-size:11px;font-weight:700;cursor:pointer;">발주</button>`:''}
          </div>
        </div>`;
      }).join('');
    }
  }

  const sheet = document.getElementById('filterSheet');
  const backdrop = document.getElementById('filterSheetBackdrop');
  sheet.style.display = 'flex';
  backdrop.style.display = 'block';
  requestAnimationFrame(() => requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; }));
}

function closeFilterSheet() {
  const sheet = document.getElementById('filterSheet');
  const backdrop = document.getElementById('filterSheetBackdrop');
  if (sheet) sheet.style.transform = 'translateY(100%)';
  setTimeout(() => {
    if (sheet) sheet.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
  }, 300);
}

// ============================================================
// 정산 시스템
// ============================================================
var billingData = JSON.parse(localStorage.getItem('hiveoil_billing')||'{}');
function saveBillingData(){try{localStorage.setItem('hiveoil_billing',JSON.stringify(billingData));}catch(e){}}
function getBillingKey(bizId,month){return bizId+'_'+month;}

function initBillingMonthSel(){
  const sel=document.getElementById('billingMonthSel');if(!sel)return;
  const now=new Date();sel.innerHTML='';
  for(let i=0;i<6;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const val=d.getFullYear()+'.'+String(d.getMonth()+1).padStart(2,'0');
    const opt=document.createElement('option');opt.value=val;opt.textContent=val+(i===0?' (이번달)':' ('+i+'개월 전)');sel.appendChild(opt);
  }
}


// ============================================================
// 고객센터
// ============================================================
var supportAsks = JSON.parse(localStorage.getItem('hiveoil_asks') || '[]');
function saveSupportAsks() { try { localStorage.setItem('hiveoil_asks', JSON.stringify(supportAsks)); } catch(e) {} }

// FAQ 데이터
// 🆕 v108: 식용유 제품 소비자 클레임 10가지 유형 (HIVE 공식 클레임 Q&A 가이드 원문)
var FAQ_DATA = [
  {
    cat:'품질·이물',
    q:'Q1. 기름 색이 너무 어둡거나 탁해요. 불량 아닌가요?',
    a:'식용유의 색상은 원료 품종, 정제 공정, 보관 온도 등에 따라 자연적으로 차이가 날 수 있습니다.<br><br>특히 <b>저온(10°C 이하)</b>에서는 유지 성분이 굳으며 흰색으로 탁해 보이는 현상이 발생합니다.<br>이는 <b>정상적인 물리적 변화</b>로, 실온에 두면 원래 색으로 돌아옵니다.<br><br>단, 개봉 후 장기간 보관으로 인한 <b>산화나 이취가 동반</b>된다면 사용을 중단하고 구입처에 문의해 주세요.<br><br><div style="text-align:center;"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAEjAOkDASIAAhEBAxEB/8QAHAAAAgIDAQEAAAAAAAAAAAAAAgMBBAAFBgcI/8QAQxAAAgECBAMFBQUFBgUFAAAAAQIDABEEEiExBUFRBhMiYXEUMlKBkQdCobHRFSNUcsEIU2KCkuEWJDNDoiVjk/Dx/8QAGwEAAgMBAQEAAAAAAAAAAAAAAgQAAQMFBgf/xAAuEQACAgEDAwIFBAIDAAAAAAAAAQIRAwQhMQUSQVFxEyIyYZEjQoGhFLEVM8H/2gAMAwEAAhEDEQA/AHhYeHcPOCwmBedy1hHHZ1U6HUuPvb2PO9jXQcGWaKWbH4psNHIqJay2BsNSxOptsB+tajAuMdh0BbEQs8Wd42bOim1igZdRZhcfhRPwtZ0STGrMzMufuVZnGZeanYg81Nd2UbVHNi6dm+wXFcTCXed4lVFVkZAMqA6EG415a/StbhcVHPOyYqOeJ8PaTP3asHvpe4vz3G4qkv8A6bgYXlREveNSishKnVVJPuknrpUzRPPLBFHjhhw7FmiKWaRhfNcrsLc/Ss1DtbaDc7VBPFLJxHCEnukVGYQRx27wg6rc7HY705cOJJBA2KfM0Zypn8IN7kNzv1oA8cWItgykqFc7O0tri1iW8/Ogw8eGw8rYgxKz92Y2ZJMzFlO9juQNa0SBHYeLHCKaLFzJiCHEiJIuUi9wQORHT8aTiFKYUMkrM8Tgs0dgsYU9D7rW3A+VFisPh8dwzvBKWhRf3bqMj5eevIE86WBDJP7JDAcTK6q0roxViy7Hoehq3JJWyJNk4xr47uxissqp3inIWaxFgb7W13qcFiscY3hYJCyyeEHRCijWwtc31vWzh7N8Rx7PKII8GWUIpfxWX+X8LVuI+xmGlWM4pi7I/eKV8Nm8qVnq4Rezv2NY6eb52OLjBxMsTLioe7ilIbM5KyqRdQR6belN9nw+JxbnDmQpICjBEOa53JJ2HSvQ4eB4CBbLBHfzWrUcUEYyrEvyFLy10n9K/LNVpl5Z5fFwHHSzvMseMVnUKQVvYA6AfrV4dnMdLMWlwKuM11ZzsPSvRg6DZVFC0o+Fazlq8j4o0WCP3OC4lwXi8kpTB4eNYxbK72Ledh1qu3Z7ijqJHgUyKo2sDmB5fKvQTMAbZR9KzvVJ1VaBavL9vwX8CFnlmO4ZjIZFC8FxAZiMzqpyAjY6bdDU4VeExSS/8TM8MIiyrGmYZzfQHzFeph0O6igkgws65ZIkcHcMAR+NBk1OSUe3j2ChhjF93JxXaftH2bh4Nh4uE4sd+iBFSNgA8dtQ19/1rj3xWKXBricBCiKxBkikFlNepY7sT2f4nD3U3DoFW+YGNchB6grWpxv2bxGAw8PxzwoLZUkGYaee9Xpcix2pPkmeLnXajzrFwyZiJcRB3rlXtKLOqXuRfY2qcbiYExOIxi4kugVUVEa/iFrkr6Vc4z9n/HuH8SOPaOTFR5GDNEc/L4TqK5yB8dhWkfFd1HkYAB1Fx5kcrCn1li90xN42uTaNio8Ksc2HRZRJIc0aqS5vswB5inYeeLCSGOSbDyT5ixzJYrcX+tUcXjoUczLnMEZF8gyrqNbnrSCcVh8RJPFNH3U9nEpW7xgDYjpWikC0bzh+OxbTzmYRMirmaSI2ZwRpr1HSmYzE8Sw8EjYZFbJZi7i4dOY8j5VronhxmGEbNJPE9mMsYym/QdaauOwzTRxxh1jjJJUsdEUdKJS2KoiKJ3wK90vcS97+6++lhrex23IpuFwkJecYGMJLI/hkRlBVT7xQ8xfkaEwYqbFRT4bFqsQYKyItyVOuq8qLCRS4Ny04ZFEueLKoZ0Umx8O4FSyqLmJxjQ4oQke0EJrITcZhoVsNVY/jT/aZP4WX/Sf0pGE4ZBDi2abFSDEzPmZ7AMQPdBtW09mxv8e/+kUSbKoKeTFDDZuHxwsqBWYaMhCgZlO1j0t0JopGbFYhkVwUliWSR4iSI3AurZgbqPlrQwYWfC90sMaO4JErs4WS7D30+6Rb7pGlqNuJrLiJosOyTCNw0hJCLAqjmV1uTyPnyrawQZBNjJo55MRh2jjhD/u5GyynbKx2K3161YgLYSKBcThYI1k/dl72JvuLb7/71TYwS4XDxHGo4z+GGGLwh21GnkNdfU1eE8OJwsuFQGV4T3QEbZnfTr1NZzl27hxVlP2NVxc+KwrxGOWMxWA/doQNMw2saPhkGLxWITCw4JDHEAzOVJGbot9f9q3/AALsg/dq+LvEmUKsY3AHI11cGHgwiBIY1X0FJ5NXW0fyMQwXvI53D9jllIfGMoFrFF2te9q32FwGEwKBcPCqAdBT7k6nQedImxsEOhbO3RaRnklLl2Mxglwh2cgaLUE2F2YAeda1+IyyCyAIv40m7ynUs5rLusOjZNiYV+9c+VB7Up91WPrVePDyEWCgetPXBtza3oKll0T35OyqKwOW3y0Ywajdj9aYuEjG5+pqd8SqYnIG1vWNELaGrK4aLqPrReyIdifrU74F9rKRU1igje9XGwYA0JpDQOvnV7FWQJRttRrIRS7Ee8tSAp2NTtIPWUHQ1quNdk+C9oktj8FE7j3ZVGV1/wAw1q/lPI1KuynUEVTTRDzjjn2XYvDJIeHOuNwrHM0Mg8YI6HY/hXG4323AM0JjVMXmssEgyllG489K9+WaqXFuz/DOPRhcbh0d19yQCzoeoNMw1DW0tzCeFP6Tw4k4LEwN7M6oVLMobQMeQqvhMZCzYjCtC+Hd2succ9wCehrru132ecQ4YoxUOfiWDj8TZTZ1PIsB08q52GBg6vCwkmRFIQMCpHzpyORSVoWlBrkmGeaAHEFjM2RmXDAW8W3hbmPKrGE4jNPw2LFTRTd29lEUY8SqOrHXU0mBZ0aCRcF3YCuGVGvlY9PKpmjxsmHgw+GxMcBtndXIzEE66VomDRcxEhwqy4pcJIgCju7tmdnPT9a0v/Es38LxH/VW7weXCwJHJLJJCWtnUZhmJ0NztarV2/vYfpVsotNPhXwUyqzkx4aK8bRl8oH3lPvEcjzG9bJcRg4DiZ4IYZHMaEsNTJcaZjv8zeky8Qmhw0s65Z5FjXu44U9263947+lB2bwPFO1rLJOpw2HVcpkjXIWF7iw3B8tq0nNRVyKjBt0g+AjHcWnPc4HuoyzEI6+JCTYksNB6V3HB+zuE4PHmRA0rDxSEamr+DwMPDoFihWwG5O5PnTtwWchUG5NczNnc+eB3HjUfcHU6Ckz4qHDDxNmfkoqti+I3vHh/CvNutUArMxJuSeZpWUvQ2URuIxs2I0LZF6ClRwsx0X5mnx4cDxMbetV8RxeDD3WEd646bfWk8+qx4VcmbQxylwi5HhlAu2vrQy8SwWENmcM3wrqa0GIx+JxVw8hC/CugpIUZeQNcLUdda2xL+WNQ0q8s3UvaJtRBB6FzVKXjePk2lCD/AArVMDluelRvrtauPl6rnm95P+NhiOCK8DWxmLkPixMp/wA1KLSOQGkcnzY1IIy66UOupGo3FKy1c3zJmigl4MBYE/vHFv8AEaYJcRHYrPKvoxoAcxFrDr5UWb4gbVS1ORbpk7EWYuK8Ri93FuQOTG/51ai7SY1CO9WOQeljWtJCOAKkDXXU0xi6jnh9Mn+QHhi+UdBB2kwkhCzxPEevvCthDJhcYM0MyP8AynUVxzBQBcX1tUKGRsyMUYbFTY11dP17JHbIk1/ZhPSRf07HamBlPhN6ghl0YfWudwnaPFYWyz2nUddG+tdBgeKYTiS5Y3Ge2sbaMK9DpOp4c+ydP0YnkwShySYw3umx6GhzujWIsae+HIN1+lASGGVhtXQaTMbGRzX0J33rie1n2b4bFSzcT4Mvs+KcEvCjZUlPl8J/A11zK0ZuNV606KbSx1FVGUou0RxUlufPHFo5iFwUrthJ4SF7sMQ6NzJ60eHK4PBGKSfxIcxkKZmdDuPI17J2v7D4LtJE2JiVYcei5UmAsSOStbcflXkc8UnDsbPw3iODVZ4jnseRPMHmPOnsWVT9xTJBr2H4VZIm9qKXgygrh5XsoUbMR1NM9qh/hcH/AKzVdcdhcRBkxLIgYhC5W7Mo2A86s5ODfD/5UwZG14B2Px3Gp40HGcYMNEy98AoHu/c+fUV61gsHBw3CphsOgVEWwH60nhODi4fgYokUA5QWPU2q2XVVLubKPxpHLk7nfgbhDtRDuqIZJDZR+NarF4xsSbC6xjYdanFYhsS920Qe6tRFCWNyPlSspeWbRQlIWfW1hRYieHBJmkN2t4UG5ocdj1wYMUYDTdOS+v6VpmLSszyMWZtya4HUOqrHcce7/wBDmHBe8gsVj58W1m8MfwLt8+tVSBvaw9acwspUa3pOTUk6C23WvK59TKbubtj8IJbIwMqnxA7VDNZM1vepcjEHxeHN16VOe62uFPSkZZWzRRCub9SDuKgm6gi1+dQfBuNdwaxQqsCb3bbpWbmwqCIDRKcwvvpUXICi2p0qRGdQ2hB0tQsACLDff1qd5KGZtr2PpRnKCt/DfSli2UNY/pUkBiCTZbaedD8SyUEAovpc/FREDNcMQba3oCQhHvWNZ4clySfXejUymg1sGIuNdb1h0troaAnKE+7fejJsMxJrVTBaIIBFzyoCCrBkZlcG4INiKZe1y250AoVUW3v51rDK0C4m44b2meEiLG3dOUgHiHr1roVMWKjEkTKysLhl2NcKyg302qzw7ic/DJM0RLxsfFGTofToa9J07rMoNQyu16+UJ5tMnvHk63KyGxoWQr4l1HMUeDxkHEsOJYWuOYO6noahg0Z8q9bCcckVKLtM5zi4umTFNbUHStN2s7JYXtJhxMqIuMiU91Jb/wAT5H8K2rqR402+8KZFNsVNTeLI0pKmfOwweMHFsZh+JYT2Zo/AsTkXBB5Hp50Ps838PF9a9i7e9kIuPYYcRwsa+3YcX0Gsijl69K8g9mm+I/8AwtT2PMmtxWWLc+ioQDEhOihRf6VTxU7TvlX3F286ZPLaGOFT91c30pSIGNhekZOxqKAjhLEEikcT4guDUwQm85Gp+AfrT+I4xeHYcFbGZ9EXp51znidizEszakk7157qvUHD9OD38/Yd0+G/mZAYkkk3vvfrRlgoHn0G1QeRGg59Kxjlvva1eSy5fUfSFy77WGxNLkQkhswsdhRZMxtn0O1Cy92SVta2tztSMp3yapCiLN4wWJ0FzoKyytELDxAHnQSuAoDLm116UGZRIFVmBIOUn8qXeRvgNIaJgAUy3Ci970SZUUEEb7mlBCl3dSrA7jpTHGgAXfQ2Gw60PcyyZHQnPYi+5B1qUkA1FgeYpd41YlWsTpYDc0DTooDMwJOxH9aim7JQ5nspCjfmdqkPdgQfd5Ha/OlRTCS5LaA7gUYFwoRwVqviUTtGhluAcpvqAKW0ik94GJym1rb1ksZupGlt7UYVVABtpqfOiUyqMaRvCpUW3HlUhmtrpa+9R3drknc2PpWILgqVI6WrWMwWjAXdswJUDckb1LvlsLi25NASC2jMbaNapLrKuU3UHa/OtoyspoNSpLFQTfapKWG426UAJEYAU+tEQR7y3JGljfSt4SaAaGYLGzcPxAmhP8y30YdK7HA46DiWHEsZ02ZeanpXFKCy2C2I31pmAx0nDMQsy6qdHT4h+td/pXUpYZds3s/6FM+BTVrk7JrwvvcUmUd2e9T3SfEByp8M0OMw6yIwZXF1IpYJidkcabEHpXtIyjOKa4OY04shJwDfcGqeXC/3a/6RRTr3Llb3U6qa1/eN1qu7t2CNpEpaNWJ1Ki/0p4KYeJ5pDZUFzUwRgxpbXwj8q1vH8VquEQ6L4n9eQpTX6lYcTfnx7mmGHc6NZipnxuIaZ92Og+EchSWGXcb0QBA3rL2BN72rwWfK5NyfLOrCNKkAtwraacqTIWY6nX4etOAYkjlQMwBsoynz50jOVmiBLKRrz2A5UhnKxAsbKfvdafJlBJyrfYgmq7kqApBZA3ugUpNuXBohVlADEkKdDrpaiNu6zDQroCTpapZ2AK92oW+jX3qiS/eMw92/hvqAetAmlsuS6sfPiFWMhiXIBUm+lqRNKyxq2Zs1jqDsKyT95mWUZWvc1VkjVmKrIW15iqik+Q6LCyE5UiKkg6lhfTrVhIV8Iudtdd6zCYZY42kZiWtYeVWhh1srZrk1lOaTpFpALEoQgABhQohQ5tr6WBpr21GoI386lUa5a2g0GtZdzosHvBc6Em3Spzqqnmv3aggK7t10Gm1LuBZQy7jS1XF1wUx+bMMyi19r0Uasrgv4bi5UUK3uoIWwPWidTIDmNiOhrWMwWhZlIDMg8N9L70TDxBwq3O4ttWFQrBmOZibUx9FAAG9NQna2AaFh7qSbgWtvzrDZlSxYMNNedSMODZrFj+VQHQsVUqQDa3Q1vCVbANGEEkC+XWoIzGxNzWMMpsRcfdG9Yui+dMwlTAaNl2f4l7JP7NI37qQ+G591v966ae8seYasv4iuDZbC6+tdXwPiPteFRn1dPC4617Dout7l8Kfjg5+qxfuRab/mIjHuw1X9K01pfhrc4uJsJiBlN0YCRD1Bpf7RX+4j+lei28iVsvqy4fB983upGGP0rlnZppHkc3ZyWNb3jUuTAQQKdZACfQCtJavJdZ1DlNQXC/2dDTRpWBbSgcWFMI50JJv18q81kdjsRdwLAX+fOlyOQACL3HpanNb3tdOVJmBIBvrvSmTgNFeQFpRZQ3Wza2oZJGUBSzkA6Ejxf/lOFtHtZhvyNVTArvmcW18N6VnNJGkVYmaS6k3Y5x9KWM6gK3IbimSKRJYklLWBHKhNrhlbbcEVmuDRIU0JZMtzpv0vUYeNpZcmoHO3OpMuY2KtbmLU7ATxrJ3WUhiSQR0q7aTLpFtELKwcqeimpC+E5b3GhBFrelEiHMxB3orEWJB53pVyLIQWbMSGA5nmamRiGyiwVtzULHlANhmJ+VY8ZXVbEa5gaq1ZACpLALlYHXXpUSgX8KiwtqKZE4ZFAsOWtRJqLKuaw05Xq03ZRB7tUBv4hvUlm08NlPWgAXKVyC9MW+WzW8OwJqcEAOYFfur1trepIKqDmzW0tUSZnZcr5RflUxRWWzAlul96YxSaM2BZkVWEhA2NtdKBUXvSwcH03pphUszAG45cqxlXIWCgMddDuKeg7AYQNmC5l9CaWSqbk9KB0ZjmFrHmd70RYPbMbsv4elMQaAaCIuLC+nlVnguLOE4gqsbJJ4T68qpiTT7x6GgZiCGUWYG4ro6TO8eSMl4MskLi0d9OGxGCBBF8OdOuUn9fzrTVs+DYkYuGMk+GdcjfP/ekfsyf4TX0LDKOSCn6nGknF0L4tJ3mJVRskaqPpVAg2p8r94Sx+9rSmGleD1k++bl6tnWxxpJCjc6dKGxvuaMjWh2PSuTI3QtrjUn5daC2fU6W6U1xyNqEAIp8J3pSe5oitJq5ANzl92hVVy2tmI8qYzESEra3MVADXzVzMkrkaxRXlizEg2H9KoSKYZcraqa2jqSx2pMkSuBmsbbUUJ1yaUa+TMo8JsOV6Ph8D52ma4BFvWriwoCSLWA5impEAMoIAbWjll2pEoJNRe5+m9EvjYZSbHTWjWOwykC3PWheJgFVCoUDS+/1pa02UCXKEq9wdut6jxWO9idF2tRGPQMxZm6mjiysSSNTo16lpEK7BbFgvn6ViMWUkgWIuNdqbJEtyWXwjlfWkyIQtsxysNLflRJplAvdfEX20AtvToFbIQzANbS4pMRZzZlXMNFB+7T2jbKoDFdLH9aL7FMW0V3GZwvWw2rM4UXZbtfl060ljIXBVMxXQ5m1ajjZfeI1tqfh8q2i68AsxmYuArWDHbnUMREL5mIvy1HnRT5Ht3ZF2FxalL3qAKy3A1NulN4ZUBJBSAsCFGYt+VCMqAkC7AWvTGmsoawFtLWquddS22ptTEJbgtBli2xA8hvWEAjpYUtW0zc6MFTa2lqaxugGjouy+IJgeK+qNcV0H7UboPpXJdm5MmOdOTL+R/3rf28q930vJ8TTr7HKzwXezXJ/0kvr4R+VQ1FH/wBBP5R+VQ21ePzvcfgARrQk30NEag6NXOkzZC2UE2oTcaDpRka87UL31AHKk8nDNIlUot8wqQRpfSpYG400qMviuDXKk9zZAybaUn3iATTnGmooNFJAXxcquLoNEBVuVqSoLHXQbVIawvofM1gLHxaX/rVFhCxY7kgXtfSpLZrLfXnQ2LA66moX929iDzubaVCEDVmsbC1tqkBmACsABa4FYxIBHhUk2BHWpZyrKuhbQEGrKYoFs5VjrubcqOdmVgS1/wCUbVgIdiWBBBtWTxEDvEve+vmKl77lC/vd5mNjtfpRhwwAzZQTYE0LlWAY2yi+hpmHyhWBCk7g8zRxVsplWVcMoGaQs19SeVQbzSEEEPbQLzHnVmTIFbvIgxOmYC7Hz+VJVolZhZ1e9gQbXFMRS9QLMVAGzAZPDYqoojIDs1xe2nKpdmy5Vygjc33FKRkyAqSzHcA1rFb7FMxhfxMLgcqWpVmIB22tRElb94Qtyb3N6FQqXK2y9abi6YBGQXHi3ogCbm5JFS9iMygiw2tQMb2K3pmDdgMv8FbJxOLzuPwrp71ynCi37Sgvp4v6V1F/KvXdIk1hfuI518xUjv3Sfyj8qE+lNVCqKvMKAfpQFegrz+dbm8BRHOoOhppFCwrmzRshTCgYHKbk38qaw8qW9/rSc2aIRrpcGoI20sKYynW4Fr0B1Nq5WT6jWPAtgbW5XqFA6Ubi4AI0oVFjf8KFPYNAlbsbWHrQ21I2phuQWUgHagsbg2HW9EmEQVGYFrk0bOuXzvsaDML/AOLl5VCkGQhvePXpUohhYgsH2G5tQNaXUBg5tYH+lS6gi40PXN9L1EhLRKVIVl5XtpRpEDWMIVKmxJ15/KmSSEAgkKKXGLSIbsbgHU1kwZmIy35n0oat7gmMykWNrbai2tC6htVYa6VDLkksbEEbnW1ZZUdbqw8xt8qJL0KZkrlUJXwtfQE7UtZmjtmW6WN7DnRS2kILWVmOhvYWFA6lzYDKOV9K1jfIAGdmLAkqhGptewoEiYKSAFv7rX1pjRrFYyXKkcqXnPeGwNiLKCfypmD3KYQykqz5soBGtKlOZgbKF+JTTNFAVn0LXva1jWFSxuQoXlpr86biAzNVB3YE/SoFiW1FvWjYjNlvdSOlLdCoJGopjHyCy3wizcUgsSbEn8K6m46VzfZ+PPxEHkqk/wBK6WvYdHj+i/cQzv5jMdE0WIZQNLAj5iqzC2lq23G4bDD4hdnjCn1tWqIudNq5HUMXw8kopeQ8MrimKtraoYUw6HSoIrjZIsZTFst1pbAHcedNOmlLdTY2pDImHEBwCoIGopLWBG9M8QOux68qSW1IO4rmZTeJEhvt11ob2vcWFFe4HSlkjfnfSskGYBpc3rGFiTprtUXa+g13oc6rubfKiohDZrixFrVF1a1gVJ5mpBDE2Fr0Bve1m0FxajRdkMxVgMulr3AqQBIPdUsRawoGzIpZtNetCwa2a9gRyNFRQQa5GZbMumQcqZ3hQZmFhcggDWlxhGy5j4mvtr9amWO75gTZRYk8zUdWQLvFGW6gg62BqCzMFA1UEmxP5UCRGSUBgxUfK9NESujKrAkXy+R6VdJOgbFo6yAq11W9ySutYZCJ7HvMoXwi170E03j8Sk2WzXHvX/KhjkbvgYszKuhDtbSto7AgvMXGYkBAwBU0WHmTvAp1kubki4Pp0qWJyysy3zMcpA1/3oFde7IjfOwNmZl2raErYLJnWwVSedyp50DFUH7skldzUyIWObO17VCIoW+YXA3501DcFjFe4IzAAa0DFSCLnyFSpuo00G561DkA6AaU1j5AbNz2YhvJLKeoUfnW8zLVDgMPc4JGI8T3Y/P/AOirFx1/GvfdNw9uBI5eaXzM6HFQe18LMa++iq6/IVzoJIOldRhnyxxNyygH0tWj4phfZMa4UWR/Gv6Ul1nT8ZF7MvTT/aUWGtYaZa+u2m9LO+teTyIeixbDnQNenMNKU2lc/KtzSLFNraq8sbPdl36VaZbrcc+VKkBA0N9NK52WGxrFlQtlsGttWHayi9zepnRiSVW5PKhUEKCSfSlao1TIZLm4axNKlUFlA2vcmmkG9ybjpaoy3Ynl0vRJ0WKbIHvmIPnUyMzZDe196l48wLA2P9KG7gNa3kOlEiCZFYIoLX12IvesZ2PhOhttWOjsLqSSDsTvSyLswY/KtUrJZkRIlUgWUbi9WRMCLKwAO4PKq0d18TAr5Gsa+awHpVSjbITNnjKyLJlF9VU01JGijKqQA33jqPWgDjIFIXMBvvesIZS2XLYL7p6mr+xTQUWIUKGZSMx8R3zDl6VEkRMOdRZyNSTfn+FLKmxjNwOo2JqHLhmVmKhgCLbelGmCCSqvZ5LEDLpzNEhZhZtBuQNL1DZYRnIU2+6TzFZHIZGzWsPLatoPYpkqrIpABCk/KpUC2XN8wKm4IvsDraiIut8tiRTWNUCyLaFQxA6VOHhOJnjhBzZm18hzpbC23zrc9n8LmLYhhv4V9OZrrdPwPLlivHn2Fssu2LZuVIihFhaw0qhmPU1dmYsyryG9VcnpXvYJRVI5MnudZEbxR+aD8qDHYf23ClAP30WqnqOlZg5A+HjN7+EEfSnNe4ZfeWtNRhWSDi+GBCTi7RzQbWzC3KxoW3rZcWwgDe1RL4G98fCetawAb14TWaZ4puLOrjmmrRBIIIpbijPpvWGuVOFbM2TE2tvQMqnlc01l8qW2lJThWwcWJMQB0NvnSmUMLAct6smlsoOmw8qRnh9DWMimwyAEg2J3FLEgDFSdSLirBRlNiug2pTorkNbXkRWK2dM0TBaVQNSppTSKQApsW5iiaMMb3+RpRjY3ubdAN6OKRLBAZQwZy1tjbWoUruQx1ve9MUvY5lJuKA6G5Uk3sRRlkF1Zud+Q5GpIG53535VIUlSqqBfnehdbvZtfSr2JYHtCgsoBPQAVAl7twHDEttY7CjIVAxCgZufWkMMsmW+YncHe1GkmC2QZkRiGLNodL2qDiHIPusCNAeVDHGFjYkAXN7HUg+dQMultCDsRvR0gTFBZiWJvvtVlLCzAWsNT1pMatmvcMb3FtxTsxABXyuK1gtymwwM4BF9OtS2jXPIfWszEja1CxpzHBmbYyKFsRKsa7tueg5muqw0a4XDgKLKosBWt4PgDGudxZ21N+Q6VsJXzsFX3V/Gvb9I0fwcfdJbs5ufLbpcEodS7HzNU/bE+GnYmURxhV1vvWqzHqa7fAqdbwjE5Y0hc/dGU/KtwBpcVz5iMSpbQhRY/KtrgcWJlyt767+daxl4Zm15HugsQQGVtCORrRY/BNhHzLcxMfC3TyNdCbW8jSpI1ZWSVQ0b6G9c/X6FZo158M2w5XFnM6WvQtvVziHD5MGcwu0J2bp5GqVwa8VqdPLHJxkqaOjCakrRBoGHOj+VAxsa504GyYo3FA3kbU1rWpbLYE0rPGg0xbbUlgAdbUxr8qU17HNYXpScDRMBtV2N+VKIJAYaXHOmEXA8ulAW8jtvasXCg0xYBvfQHnSzcC7EX11NNZtdethblSyS1w51q0SzF8VtSbUuQlSSTr5cqlwQdFzDfU0EqliOm5HWiityWYzfdBt4dzrSj4pFbKCt7EnejZfda7elS0HeWJI01t1FaRQLFIV8TW0uaIIrgNsetHdQyqBpasCk+IG2taRi2ymyEuN1A13HIUdl3C6HnQqPMUTEakU1jxgSZl7DUi9bDhWAaaQSupC7qD+dBgOGnEOJHUhdwDzrdM64Zcie/zr1PS+mttZci28L/ANEc+avliMkkWJe6Qi5940KeBcxHpS4lzHM3u8/OonlzGw2HKvVwjQi2KlYubmqVj1q3I4C6DU1RzP1Wioo7vDpDxXhscsC5ZkUBkO50qgC8EmZbgg61peF8Sx2AxwcRhYO7Rc7bOfPpeupxBw+PhXFQkBm95RrrT2pwdr7kLYcl7MbhcUs63+9zFONra6g1prPh3zJWxw+LWYaaNzFLRkmqZs41uhh8KlWUPGdCDWox3CShMuF8ablOY9K3PmNR0pZAGq7flSer0MM0aa/nyjTHlcXscsWsSDoRuKg61v8AGcPhxd2YZH+NR+YrS4rh+IwviZcyfGmo+deR1nS8mLerXqh/HnUisdNaBr0RYHnQki1caeIZUgCRm2oCFbfejYUDDTalpY/UNMUU10OlKcZSTa4ty3ppGmgoG10NYvGn4CUhDJnFxt+NR3fI6gagU3KbWIqCNyDtWbxVwWpCcg1sRflQ5QAMx+lNyAnMRe21ADY8iOlWsJfcCyi+xF+Y3oT0JJY9KPLbUk0JXKLjetI46KcgGXYgW8qhbWB0oySdzvT8Pw+bEFTlyL1I1PypzT6WeR1BWzOWRRVsqgFnsq3J2A3rZ4DhRJEkw21C8hVuLCYfALmkIzHrqxqHxDz+FRkT4Rua9XoOjrHU8m79PAjl1De0RzYhUHdw/NqGNWYjNrehiivoLafQU0sqeEH1avQwhQm5Bs4AtsoqrJMoJIpWJxYvZTpVOIy4uXLECbbnkK1StlDcVikw8Zdz4joqjcmtD+1OJfwQ/wBQroZezeGk/eYvHyM52VVGVT5VV/YmC/iZvoKdx48dfPyLylK9j50g4txJmKtxHGsLc5nP9a6bsb9oPFuyGOWX2iXEYUt+8hkYm/Ui/OuSw65Z2Una96Mq2JlCoCdbAAb0n3uzekfWfZrtTwvtfw9MXw+ZWYjxR38Snparzo0RDISDXzr2UkxvZAftCKVo3IBZL6N5Wr2Xsh9ovD+00Sw4gjD4y1ijH3qp7lo6/D48MQsnhbr1q1mB1B+layaDmPwoI8VLh9D4l6USm1swXG+DZtY67HrSyzL/ALUqPFRy+61j0NGXAPiHzqOMZcFJtFXEcPwuJuxTu3+JP0rXT8Hnju0LLKv0Nbpgri436iksrj3WDetczUdLw5d2qfqthiGeSOdljkja0kbIfMUliK6RnNrOpt5i4pEmGwk3vIgPpauNn6C/2P8AIzHVLyjnyedCxrdNwjDt7pYejUluCKdpG/CufLomdcJP+TWOog/Jp2/CoJuLVtTwQ7d430FYeBrsZHP0rP8A4TO3x/YX+RD1NOTYaGgNtxvW8HB8OurNf1asEGAw7G7JfoBc1vj6Dll9TSBlqorg0qxSS+4jt6CrMfCJpSCxyjy1NbE42FBaGF38zoKW8+LlFgyxL0Qa10sHQscd5u/6MJatv6UQmAwuCUNKygjqbmofHM3hw0eUfG1CuFAN3JZurG5qwuHJFwMo6tv9K7GHTQxqoRpC8puTtsqCLXM7FmPM71ZjgO7eFenM00BYh4RmPxGkyTIGBklyDmaajEzsNmAARRlB2Fa7F4tVLKDZRz60jHY495liYsCbL1NbHhPZfEcRK4nGkxw7hObVpCDfALkka7BYHFcWc9yjCIe9JbSt2mEODVYYYwotqb6tW6mhMWGEGHQIi6C2lasxd3KO+Yk20FNQxqJm5NihhmmBXuST8QNVPYZPgH1rcLil7oxomVrcq1N5ejUdFHzDFg2xGNniAOclrfWuu4JwGLCL38wF12v061W4Rw/uuNY6Zl8Ku6qvmGq7xbiBEYwqE52HityHSkbpWblfiGMbiGI7tL9yhsoH3j1q0eHTcPbDyElHYCRSNCutM7LcM7/ELNKt44yDY8z0ro+0sQMuHYrcZDY9daF8WEvQ7he1h4Jg8OMYxlDhdOYFt632B4ngOLRhsNMpYj3CdRXkOP4jLjsRG0i7KIx0FhTuHtNC6TQyOjeRqOae5FA9ZlhZDcXFYuLli0JzDoa03Y7HcQ41O0M3iijW7SHl0FdBiOGzRklRnXqtFGLa7ogypOmCuLjc63VqYJWAurK486omI3IttUFCOZFV3tck7UXji1HvxuvmNaAy4V/+4oPmLVVEkgGjH51hdj7yqflV9yfKK7WWGgiceFkPo1LODa3hZvk1VmjUm+Sx8jao7pRqrSD/ADGquLJTHNhZvif60psJIdy5/wA1R3XPPIf8xogqhdzfqTVfKWLOBJNyPqaxcEqm/hHpRh7CxepEqjWpSICMOoFwpJ89KMRdSFHRaBsUgOp+VLfFM3urp51Kog8lI9VUA9TSpMSovrc1WllNizPoN+QHzrlu0P2i9n+ziEYjGpLMNooTmY/OrKs6iXElhppVbD8LxnEnzReGMnV22+VeEdqftn4txcvBw1BgcOdMw1cj1rc/Y99r83AscOE8cnabBYhvDK7XMbnz6VpGKb3Acj3zhvCcBwuQd4pmlYau429K3cjpBFnB8IqoUixcaYhCCrgFXU6EHnUmRoIyrLmTanIxSVIybshsUsxuhJB51q8VIBi7tmuOY2p/7ShjYqACPOqi4pJWZkAPkwq2RByTx7KfF61r+8b4hTJiqSnUZm2F6qZZPhX60JZ5KyJFjuLiNwZoJ5CIvvPcnUeQqtwTBmec4qYZsx8ObmetbTjfD44u03F4mUrfEuQw0OoBq9gsKiQZsoC2XKANtSKQStIY4Za4fgvZHEKqBdiR+tFxzFLjpxFEBkgXLm6nnU4nFjDh7E538C+Q61TiQBGtzFBOXg0hHyV4pEmaPKpsjFbnyrbRIqggLa/KqGBwpAGYEHMW3866fstws8X4zFEwvEhzv6CgpykooNPtVs9B7I8LXhnBIgy5ZJh3jnnrtV/i3EoOC8JxXEcQQkGFiaRiTyAvVoZFsoNgNAOleU/2kO0v7J7EJwmJws3FJhGQDr3a+Jv6CuqoqEaXgQlJuVs8OH2wdrIONYviGHxzGPEStIIXF0VSdAPlXa8F/tHMAqcZ4XmPN4T/AErxRm0sNqDnSrimEpNH1Jwr7Y+x3FQoOOOGc/dlFq6bC8d4RjwGwvE8LKDtlkFfGmlHFiJoTeKaRD1ViKFwDUz7VWzi6OjDqDeoZHGtfHuF7V8dwgAg4tjEt/7hrZRfaX2thUBeNYggfEb0PYX3o+qnLqL6Cq0uKynV1r5v4N9rPaeHjGDbF8SabDiVBJG40ZSdRX1fHBgJ8PHiFgiKuocG3Ii9aQwtgudHM+1FjYMT/KKTiuL4Hh4/53FRwaXtI2U12uFSAC8cSKDsQorw3+0/wdEj4VxdZsruzQNHtcb3o5YKV2Ushu+J/az2U4WGBxyzuPuwrm/GuL4z9v4OZeE8N15PM39K8Z0G9Zesu0vvZ0/HPtH7ScfLDE8QkSNv+3Ecq/hXOFmclmYsx3JNzQXqQaJJIGw6zUG9CDRDzqyj2P7I/tql4MYuA8fkaTBEhIZ2NzF5Hyr6DXFLLh1eKRJIpFurqbgg86+GSOY3r1X7I/tdm7PTR8E41K0nDXYLHI5uYSf6VrCdbMpo+gcbg1dDl3+IClJAscJRSLnmatyyHFYZZYWV4nUMrJsw61rnVhIIos3iNySdq3KQC4VA5aV1uD4aT3cP98KtYlREC0gXUWBvWqzx/HQss4ftb4e3GNUaD2hNP8q1kZNsvLMdP8xrKyufH6RmXInEsWxpub7VaGiN61lZWM+TaPBYiOretd79nEaex4yXKM+cLm52tWVlHpP+xA5vpOpkkZXNmI1r5r/tJ4maTtlgIHkZoo8GWVDsDmFZWV08nAiuTx9qE7isrKWCMJ1qDWVlQhIrDtWVlUQhzZlt1r7H7F4mafshwdpJGYthkuTz0rKytcfJTOrwmkK14R/ajlfveCw5j3eV2y8r9aysrTJwCuTwPnUisrKUDJNYKysoiGHepNZWVCBpUSbVlZVkPoz7AOLY7H9lJosVipJkgfJGHN8g6CvR4WPfNrWVlMQ4QLKeLkZpypYkdKoZR0FZWVbKP//Z" alt="저온 보관 시 탁해진 식용유 예시" style="max-width:200px;width:100%;height:auto;border-radius:8px;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,0.08);" loading="lazy" /><div style="color:#666;font-size:11px;font-style:italic;margin-top:8px;letter-spacing:-0.02em;">예시 사진 — 저온 보관 시 탁해진 식용유</div></div>'
  },
  {
    cat:'품질·이물',
    q:'Q2. 기름 안에 검정색 침전물/이물질이 보여요.',
    a:'저온 보관 시 유지 성분(<b>왁스, 포화지방산</b>)이 결정화되어 하얀 침전물이 발생됩니다.<br><br>캔 제품 마개 쪽에서 내려다보면, 마개 부분을 제외한 부분에서 <b>빛이 투과되지 못해 검정색 이물처럼 보일 수 있습니다.</b><br>이는 안전상 문제가 없는 정상적인 현상입니다.<br><br><b>실온(20~25°C)에서 2~3일</b> 두면 자연적으로 녹습니다.<br><br>다만 뚜렷한 이물(검은 점, 섬유질 등)이 확인될 경우,<br>제품 사진 및 소비기한을 확보하여 고객센터에 접수해 주시면 원인 분석 후 조치해 드립니다.<br><br><div style="text-align:center;"><img src="data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAEYAP4DASIAAhEBAxEB/8QAHAAAAQQDAQAAAAAAAAAAAAAABQMEBgcAAggB/8QAPhAAAgEDAgQEBQIFAgQGAwAAAQIDAAQRBSEGEjFBByJRYRMUMnGBQpEjM1KhsRXBFiTR4QglNGJy8UNTkv/EABsBAAIDAQEBAAAAAAAAAAAAAAECAAMEBQYH/8QAJxEAAwACAgICAgIDAQEAAAAAAAECAxEhMQQSBUETIhRRMkJhcaH/2gAMAwEAAhEDEQA/AEoNuXcYA22olb8p8ymhcRblyOgpxC7Ag539KLHQVDBcDY4p1DcA9Rtih9uxlHqc9hRvTeH76+YFYiq+ppGthT0JLyscgbdt6e28TykBFZie2KkthwfDAqtdMDjrnYVvqPEPDfDEfNcXUCEdgQSaHC7LYx3T1KA0HDV9dOG5OQe9G7Xg5QmZnGe4G1QfWPHqzhJj0uzaXGcO/lFQnVPGDijUWZY7hbVD0WNd8fekeSEbI+PyVy+C9l0DSLQc0zxqR/U1Jza5wppwPxb2zUjtzDauZLrXtW1Bua6vrmT1y5x+1MmimdiSGYn3JpH5C+kao+KX+zOmJfFPgy0JHzsZI/pUmmkvjXwjGcCV391jNc7CzmdfobYdMUoNMuCoPw2A9DSfyKLl8ZjXZf58d+F1b6JyBtn4dbxeO3Cr9VmGB3jNUCui3bjyowGf2r0aJdgnlVsZ2o/non8DCdER+MvBtyBmcrnGzJiiNvxxwTqa8ovbMn0fA/zXMjaJdqN0IyfStJNNukbeMnFBZ2voV/G4X0zqU6PwjrK/wjZyZ/oYf7UK1Dwf0K/VjbsYmburZrnCJ760KmOS4jYHIKMR/ijGncf8U6RIGg1W55R2c8wP71YvJ/tGe/iZ/wBWWLrHgVeRZaxnSQAbKdqhGqcCazo0h+YsZOUdWVcipLo/j7rVsFGo2kNyg+oqeVv+lT3RfGXhXXgIrxvlJG2KzLt+9WRnTMeX47JHS2UJe6fGsDl0dX5fLjbB9/Wg6x/AY82+K6o1DgvhXimAyQLAxcZV4mH+1VtxX4HX1urS6W4nUbhSMN/3q5UmYrx1L5RVNu6upDHrk4zsa8SNnYKDgHYH0p5e6JeaJIVuoHjYHBBGKb/EPNzKcYOTRQp5NDK3l5tuhI3pzbQ/DjDA4KnO1aRzNNjBKhT2705i5AGLNuRjrRIJnMu+49DnpTm1LOgCg4BpoyMCeUjB6b0/sm5LZmKsFXbONgfvUBo8EYjICkDPXNalCjczHO3atMtOXdSmEIyCwB/A70oblSoAXzeuKgprcI8qgKuR2xS9vYvybgfiko1Yhidt9jT+O4URqrY29+X/AO6JB+Cy8qhSfQVIdD4Uv9ZYFYykfdmFTDhfw+jt4ln1JVZxghT2p1xV4h6DwVbGJXSS4AwsMeMk+/pVNWkuTXixVkepQ70vg7TtHgEt0UZwMkudqDcS+LOgcOo0Foy3M67ckfQfc1TnFPijrnE0rr8Rre2bYRxnG3uaiiRSyyZJY57+tZbzv/U7Hj/Gpc3yTTiLxY1/XmZY5jaQNsFTrj71EZGnunLvI8zHcszZp3baWSAWP/ajNjorSDZc4NZ6ytvlnWx+OpXC0AILCSXcDeiFtobtjI69xUwseGWKqzLj2xUhs+HETGV60Zx1XSBeTHj/AMnyQK24bLEeQtiittws3dB19Kn1voiJ0jB9MiiEWlquByKvtV8+K/sw5PkZXEog1vwpuDyAfin8XCysB5evU4qZrZqu+BmlVgQHp96unx0jFfyLfREU4YQHPLy+tKf8MxHfkqWhEAxj71nKg6Cn/AjO/OoiTcMpg4XPX80i/Cy8vL8MYx1xUz5U7CvOVewqfgRP51Ffz8JRnb4Ax6YoXd8Fh12Tb7VaohRuqg59RXjafE36R+KV4UWT5zKVuOCmUEKhANArzhq8tGLKpK9xXQMmkREfQp/FDLzh6KVSCgOfaq3g4NEed/0o7Tdb1rh2YSWN5cWxBzhWPKfuOlWTwz4+3kASDXrUTKNjNEMN+Vr3VODY5wcRjf0FQ/VuDJIi5QNnfpVampe0Xu8WZapF52t7wj4h2hVWgnLjdDgOv461AOLvBKa0ElxozGWMbiLv+KqYnUtDuFnhlmidGyrIxB/tVpcEePE9qEs+Il+Og8ouFGGH/wAh3q2MzXFGPP8AG8e2J7K7eyudOmeG5ieJ1OCrLg1o0BchlbB9h1ro/UtA4a8QdOW5tnhdmGVmiI5gfeqc4x4F1PhRzJ8NpLbO0ijIx7+laVSfRybipeqRG4Y/h45jn2I7VvOGlURrI/JzZ5OY8oPrj1pt8xkhhkDvSkXMxypPXemEPUt2jfZds56U7FsCcg/ethIByhvtTmNBGOfGcCoKxulvIzbqFB6Ct5IPhtuO2NxTiK4aaUEKcCnjfClRQwAYdc1ABvj/AMaXuGl03QW5ACUaf/pVRzm5v5Gmmd5JGOWZjkmsjtWlfODn3oxbWSxrsMse1ci8jfLPbYPHmVqUMLTTS5BbAHvRqz00yFVhTPY5FEtK0KW5YMylV9Kl+l6GkXLiMZpIisj46NN1jwLdcsCabw0ThpBg+wqUWWiInLyoAR7UVtNMwAeWikVusYGRsK34vFS7OJ5fyjfEjC203lAyBin0doiHcClDIF22pJrjHcVrUqTj3mqnyxYcq9AK1adRTKW8AB33ppLfdcEmm2V9hJrsdjWhvAO+1B5L5icE4zSDXmD1NDZNB355c4zvWG9A7igIvPff2rT5rfGdjQDokDXy4zzDFYl+p7jeo8bvY4bvW63RG+cfc0Nk0SVb5SO/Wl1vk9xUWW7bOMnPuaXS8P6TkGiDRJ1u1O371sJFc1H4r0nrzdO9PIbwYG+DnpUIEpII5BkqKHXuipMDhRvTyKcHGd6XWUMNxmg5THnJU9Ffa1wik6MAo9elV7rXB8tszOikfiugZbeOUbqKC6noUcynKjzVTWNM3YPMaKO4d4n1ng2+WazmdFBy0ZPkf7iuguDvEPQvECxNlcoiXRXElvJg83uPUVV3EfBo5WZI8GoHPbX2hXS3Fs0kLo2VdCQymqtOGaqnH5C0+y3PEHwilsGk1HRV54G8zQjcqPaqzhPysnI4IddiD61bnhf4zQ60sWjcQMsd0wCRzt9Mp9D6GnniP4XRXYfV9IiAkxzSRINnHqKvi0zj58FYnplSxhZHDH80Rg5WwGUY7U2tbRlykispBwVI3ogiogwoGKs0ZWapFHGTyr07V42M4BwKdrbcygqM4FNpIjznCn8CiTRGLW3UcqovM2e1SnReHWysswBJ3ApXQdCVFWWRfMd8VMtP08eXy4ArjYMFZHuuj3fleXGCfWexKx00ALyqKN2lkE3I2xTm3tljXOMbVksqopya6+PGpR5XyPKrJRsSEGNsUjNchRvimVxqABIBoZLel2yWOKs2ZNbCM17vt+KaSXhJO/XvTFrlvXekGnYnGSfSlGSHr3R65J+9N5JycgHeklDOM5pZLYkdCagRAysdhWBHJ2XrT+KyB3239RTlbZUwSe29TQNgoW7nYk1uLRicZP70XEcOPqXb3rAYAAOZMVCbA7WrAZwcHes+XbPQnbvRfmtzjDLuM1hWI45WBOKgNgYxMDkeleqSuM5/eihhjJ23GK0a3U5GBU0HYzjlbYMTgU6jn5SB0NaNbNjNaGIjfBGahOwlFdMD1zjrT2G7HL1/FAVdk33pxHPjfoPeoTRIY7jPfNOOdGBDYIO29AIbor0J/FEYbkMAaguja+05JkzsR9qgvEnCyyh2VO2+1WLHIGG/Sm93ZpcISBuKWpTLYzOWc361oc2nTM8SspU522xVueDnjF8wYuHuIZcufJb3Eh+r/wBre/vSXE3DK3EbMqDPfFVHruiz6dO00KsnK2SQcYPrWapcvaOlOSc8etHRHiHwGsxfV9MTzYzLGnceoqtBCxxg7jsamngr4rpxHajh/WJF+fjXlidz/OQDp9xTnjzhH/SrhtQtI/8AlpDlgB9Bq+L3wcvPheN6ZCIXeMgbYFOFVZCXwN/Skyq5716gxkYzVhn0SvTbDm5SQAuNhipDBbrCgz1ryztViQEjFe3Eyop60IhSjbn8h5KPJ7hYwd6B3+pAZCnNaanqJXmVTufegxdpG5iCd+tM2Z0hZp3kySa1Zjj3714F5Rk0qkBbAANAIgSzbAE0rFAW3I2PSncdn3Kn81rPcQ2i74GNzvUQdikcCgZZtu9bSXcFuDll2/tUQ13jm109WzKM+marbXvE+e4ZltWOPXNM2kK3ouW84otrZSTKiAHG5qO33iRZ25IM659OaqMveItRviTLcPg9QDQ5pnkbzMzfmkdA90XRc+LFqp8suR3pi/i7FleUGqiZsnl6mtfiebORt0oe7B7suBPFyMHzZzmndv4t2WAXk5c9qpGW45Tk7A0ykmMhyCRRVE92dKWXibY3LqFmUdtzUjseK7W5ICyo3brXJKXc0ZyrsPXei1jxXqNiwZLhzj9JNN7Jh90dc22oW848rAA9zToIjgFTzCucdB8WbiFkW7BI23Bq1OG+PbTU4lZZl37ZqaCtPomjwYz3+1IlCp2yPWlba+iuVBBU/mlWVWG24oDb/sQjcqRnY08gmYbg/emTKVOe2fWt45eUjGR7etDkDDEM/qTmn0UuRg/mgSS5x5t6fQTEipsA4u7VZlyoqA8WcOLPE7KgOeoAqxYnBGDuKaanYrOhwoORQc7Hi2nwcvanb33DOqpfWrvE8TiRXU4KkGumvDjxBsfEvhloLrk+djT4dxEeuf6h7Gqw454YWaKTCbnpVXcO8RalwBxNHdWzMoRsOmdnXuDVLly9o201lnVF567oUmlXslsQeXJKN6rTKOJwvKcbUfm4kseMtGg1G2ZTLgMVzuPUUNIE3mjUKP6Sc4q+X7LZzLly9Mnsrcg+1BdTvhGhwd/QURvpeQE56CopeztcSEk7dKLY6Q3ldpmJYk16qYANbrHsMgU7tbQyuNsioMzy2tWk83LkZ60/WDkXLKAAMnNPo4eRQQAFAqN8W8RRaZbsCyggdM1Ng7Nda1+DT4WzIoCjuaqfirxF5ueK2bzDsPSo9xdxnPqFw6RyNy5x1qGyMzMWLEk0roWq1whzfarc38heaRjn3pmysFVypCPnDY2OOtErTh66uYvjSkW0OM88mxYewp0tvZQEwQwvcN1+JJuM+yjpSbF02BFjkkGVVz9hSiWM2QxwPu1Fplufh5lwiY2H/YUxYrjIY4+1TYHOhu9pzMzK6gFthWjWZBHLIvuPSlWMZIOT770lI0aAjJJ9c/3qbJoY3cLAnlYMo2G9MwrAkCnk5DAkE/mmgJB2OKZEPAcHNek5ArwV5nzZ2qAFA+BkdaJ6Pq11p8qvDMykb9djQnJO3QelOrdejGjsi4Ln4M8SlcpBePyPsAxO1WvpWtRXkasrBlI65rk2JyuGDEEVPeB+OJtPuEtrmQ8jbKxPSimWK98M6JOHGRSTKRQvRdaivYUdWDAj1zRk4deYbg0QiaMQaeQSHIIJpoV327UpExBG33oMgXt5c4H4+1Plw68poTA3K1EoXGBmiQDcQaUtxC2VBOM1QviJw40bPPEuCpztXS9xEJoyMdqrjjfQ1nifydQc0jWy7FWnyUvwFxRPpFx8qzt8Fj9OelXPpssd1F8TmGGGRvXPmr2cmkao4UFQGyD6VavBWufMaauXJKjGxxQh+r0HPj91x2WnrNycMisMmgyoWbJpzdv8a4Y5yAa2SIBcYINWFaE44i7BVHejNratGvQ+5pbSLAEGVgMjYU7vyttas7EAYzmoKRziPXV0u1dudVwO5rnzjXi6bUrl0WRjk+tH/EvitpLiSCKXI5iOtV3Z6fcX08axxtNcztyxR/1e59qRslPXCG9rY3Oo3KW8ETyzSHCoBuff2FTSw4Vt9HAVjBe6lgMwLfw4Pb3NFl02PgmxNlExm1m6AErIASuR9I70vb8ONpdsLrUGcXDech22H47mq6rQ0Y/7Bv8Aw3eXrG5vrtFXqEQ7f9hQnUZrTTVCIqqe4AxvW+vcZx5aG2Bwo5chtjUNvNRnvpCztzZ6Y2xSpN9kppdDi7vhIxwxx6UxM+SQM/vWRW8s7hY1ZnPRUBJP4re5sZbNuW5jeJwASjjBx9qdFLexsztnINJyEk5zmlC2MkAb1oRk7DYUQCZ3GCKRMec7b05xt061oVHripsg2WI4/wA1t8u22R+acIm/UelKDbGT+9HZButv+aWROTalFTJzXpT8UNgMUnHtW8bsr5BII6EUmfTvWL1oohZ3h7xm0MqWc7n0BJ61dunXqzxKwbKsK5Jgu2tblZUYgqe1X34d8SrqNlGrtl1XHWnTLJraLMI2yvTrvWKMHP8AmtbcmSMZwNqUIwaIRxCxzT+BwR13oXG5G2aeQPvtUI+gvEeYYPeg3EFgstuwI7bUUhcbe4r28iEsLZHagSTmXxK0UxM0yrupJO1BeDdYNmZonJG2R+9Wr4h6SssMqleoJ6VRYLWN3ImcEZX+9VUjXL2ls6dQgtzGntqvxZAOWmXm6j80Y0aBmHOR1NXGUNWqfDRcDAUVA/Ezik2Fo8MbAEgirBnAtrF5WOAqkk1zb4n6611cShTkMxAoUxk9ckBuZH1O/kmfLIpzju2+wHuTVp6Nw5DwPw6uvatD/wCb3o/gxsv8lMbAUB8KuFU1jXUmulX5PTl+YnL7KWxlQalV7dXPiDxikDHFhaHHKPp2NU3WuA453+zB9jbxaNps/Fmsl2Zsm3Rl8zHsahXHGuazexWr319EktyPifJRfVCn6S5GwJ9KmfjXqE0ElhaQFUitiCEOCuR0OO9Vvb6fNq9zJdyBpGZwXcjJd2Oyiq50/wBmNe1+qN7Ph7TUskur++e5upf5Vhaglz/827fYb1K9H4A0e1g/1Diq8Fki7rp0B/iEdudv0/5qd6LwDHwfovz940MN68XxJ5nx/wAsmNlTP6vU1S3GPE7a5qMkdqWSzVsLv5pcfqY0ye2I5SW2Hdc8QLHTYWsOFNOtrJcFWuI05n//ALO5NQCaeS4laSV3kkc5ZmOSa9WFmKoqszMcBVGSx9KMNpEthbiLVLqOzjZhIbcAPLzAY3A6fk0y4Km2wFyMc4FYUIGeXBoo02iRDlEV7Oe5Zgn+K8N3orDBtbpMnYiTNTYNAogjsR6Gm80uDyjcjvRa4itZhizvFY//AK5hyt9s9KET28kUhWRGRvQ0UTQmJWzkNg1hlbmyWNa4xt3rwKc4pgDqG6YEKd6e55l5gKFrt+KLWkRkiDb4brS09E1sTbcZxWit5u4FOPg8rYb+1IOvK3vUTBoTlOW+9S/w/wCIDpepIpbCEgb1DpSc5FKWkzQzLIrYKnNOgy9M650TUVuYEdWByOlGSAwzmqt8NdeF7ZRqzZIGDv3q0IG50HemRYYo5TnH2pzEfMDt+9IEHGfSlYjggY60QhS2YEDFOzvHjbPfamFq3KcURjGVNABBuM7ASQM3KDtiubeKrI2eqyYGzGuquKLcPbvt2rm/xCtRHqIbB3Yilo04edovUYJA61KdIgIiTA6iozaxh7hFx1O9TzTbUJGo9qcoYC46vxp+gSgNhnXlFct8R3HzWq4Y5VCXbPtXRnjJMLfSE3wSSPvXNAU3+qMu5+JIsf7mkrsL6LC0iSbQOEILWEBLrVSZZXB35f0g+1TXgvQk0DThM/K88i87vk9T2qHNcR3fE8dkVVoLRVjCk9AoGf71Nr7Wls9LlUBQXXC56/j0rFlp7NMSuCpPE+/Ora8yIeblbkFWF4E8CprUo1q8hU6XpbfwkYfzpv6j64qqpI31PW52VhhMsST36AfeuqbJYPDrwhWU4T5Wzads93I2H74p1xBXXNlB+PfHUt/qs2gWc38GNs3JX9b/ANP2FVVpGjXusajBp1jA091cMERB/knsB3NOUm/1HULjUL5yzO5kYE7u7GukPBHwktI9Bk17U4mEl+h5Y2bzJATsuR/V3PpgVYtpaRVX7PZQupahY8HB9N0gW95qI8tzqLDmCN3SMdgPXvUOlZ5HZ3ZmZjlmY5JPrVgeJ3AtlwbKIrWb4nNf3MR3yVRSpUH3AbFQMoF3pp4K63vQgwGMmk26ddu1OCqk7np0pNkJOBUF0NJt84pS3vsBIbrmlgHb9S/at3iJGMb03aBub3zR2QcTWvKqyqysrk8pHXHvS9tp3zllcSr/ADrcByv9Sfq/bY040a1+LK1pMR8OX6Seiv2p7Hby6bcEqozujDsaprJp6RdOPa2R74ZAzgkCjnDmJWeFlyOXIFMLiHE7oqlRnp6UR0Bxa36M30HytQyVuXokTqlsy/tzFO2dh2NMJlIGakuv2rPAtwFPLnHMKjsqcyHHUVMN+y2DNHq2hgx81bR/3rRickYr0EgYxitCKGWP4W6s1vffALHBO1dD6TJ8WBT2xXKfBV0bbWYDkgFsZrp/hiX4lsuOuB3p5HT4DgG+CD+1bxqAcb7V4dj0FYp3HrRY6HtuAGB9ulEYzgDc70MtySw9qJxYwDUADNeQG2c75wa548RLcG+TqdzXRWtDMDj22rn/AMQhi+UdPMelBmjAW5p//qkOMYNT+xf+Gp9qr6wwLhN+nepxYyD4Y9MU5SyuvHCfm01QD9IJxXPfDTc+v2nlLfxg37VfHjTJzWTDc7Vz7oTldZgG+0uDg1W0RvonPDE3xOILy5c8z8zknPcmivGGqG2sw6sArjlA7g1G+HZVi1W7VWbyqc5270x411v5oJGrNhGO3asuSG2XzWlsccFETcRwW5UFbmdA7Hryhs/7Crv/APEhxGthwCumQuFa7njg5Qd+RRzN/gVQfAWoLDr2n3Ej8oWUbD7iph44ay2sw6bzByiNJIN9idhSOvXSYYn2TpEA0PRX1C6sLe2aOR7mVUKEgchLbZ/FdF8QePOheHuly6DE0mra1aKIvhxJyQKwUYy/dR6DNUDwSFl1e0AVkwwP3NDdR4e1G51C5lWGR2aZx06nNCfImaaph/DWtytjLVtev9dnee/maV5JnnOenOxyxpiyAjoTRFbFIC0d0Qjq2CM7itb6exgYC2JfAwSRViybekVVj0t0wetttnlwK8khAHMBnNKrqCqCDGCD6V491D9Khh/tT7YmpGwhLkrT7TNFe8uAvKeUHc4p9okNjLOWuJURPUnFWJo2gWU0YkspYJFxklTWDy/L/EmtG3xfFWR7bIXc8OPbFJYgcrvygelP9T09ZWifkAMsYfBHcbGple6ZL5FBCqDvkdaY6lazLLbQCEOPhZ5vzXLnzXbWzoV4ylPRXt9YKpRwD5gVY+4pKygVLhGdcqrAkEVJdVslS3DBcfxTt6bU78OdFh1jjPSLK7jV4Li8jjkRtgy5yRXTxZPadHOuPWiX6TwjYa5w6YrtkjMq8yMp6elVBrejPpF5cWsjcwRiFcdGFXR4t6jpvBeu3Wi6LaiGRJjKxRiEjRhkIF6D8VTGp6hJfzO75PNk4qvw8GbFkfs9yw+Tkx3KaXJHnQBz1P3rwqPvS0m5ZsUnnbBrsI5jCOgErqkDDpzCuo+DSWtUBP6RXL/DafE1e3X/ANwrqXgyPltE22CirJDPRI3XYf2pIfVjNOZfKDTcZ5t+1MFDq3HmGOtFIfSh1t1FEIt8HOKGgjLWzi3Y5xtXPviM4F+gBwMnf1q/ddflgbJ/Sdq548RLgC+UMARk43pX0aMBcVqSJUY7CplpzlolJPaoWp5WTHY1KtJmDRgZz6U6ZU0Q3xVsRPYueXt1rmhi1nqeRsUk/wB66241svm7B8Any1yvxZYNZas4YYBY4pX2JXQ6trgxa2SrEiQEEDbORQbXRMl04kYkZON9qXkvAs1vKoHLgFhWuvyLO/Mpz3H2qprkO9rQloU3wL63ZiygOGX3GatDj2xFxw7bTRlcQkndcswYZqqln+LpylVxLauWDdyjYyPw2D+TU+0PiJte0V7a5mKz20fKpBwWXt+1YfLl8VP0bPEpLc19gLhu/W0mguXiLfCkGwG/WpFxpxZPo186WMUSi5jEiyFfpz3FQa8vLyC7k5MKjHA5OnXv70Rvrxtf0yGykUfP2w/hOTjnXuv39Kp/jq7VPkt/O4lzPYBvL9rlRzKObJZnP1MT3zQ5iSd62bmUlWBDA4IPWtcV05lJaRzKp09s8PWvMbZ3rcL6daWhtnmdUUZZjRb0BLfQioYnapFwtrl9o9w3woZpgykKq52PrihZs2hbdssOw3qRaRJq2hxpffKyrCT9Tpsw/NY/JqXLlpPZu8WKVKt6JjoWq69xKskMlnmUqTzheUIo6s1Gri2YyYW9SRIk+GScbFfq/vUbbjM6fZXLWRe3mv1CshG6qN/wM7++1P8AUp7Lhzgm3j5g2ra2Vl5C2Wt7VTnmb0aRt/tiuT/AeRe0rR035Sh6p7GuvWSw20fmQuwLls+tOPDxUsOLtOvnZeSw5r6Yk/SqKTv9zgfmoNJPdahdgs7sudtyQq1KraN9E4UnumDfM6y3wYgeot0OWb7M2B+DWvBgrGkmzHkzK22kA+J9VuuItWvNVunLTXcrSNntk7D9tqjNwRHzEg5zReeeWMMG2A2GBQm5iYrkjzE5roY0/swZGC5nyxxmtFG+/XFLmzkJyBsa9Fu4OOXp61pRnYf4DsWutbiPL5V3NdQ8LwfCskBXqB1qjPCfRWef47L3710PY2wgt0TpgZNNL5HS0jeXIpBcFu1Kzk0nGMnpTk+h7br3p/HjHSmlumw2p2TyoT0oIgA4mnEcD7j6TXNnHt6ZNUIBOxNX1xvffBtZDzdjXNnENwbvVJWBBANCjXiWls6PZSHYHrmjWj3AAC56Ghd3GY5CMHGa8srgwy7HGTURT2SrUYxdWjL7Vzp4p6E8U7Sqv0nriuiLOUTpy56iolx1w7b3lrJlMhhjPejQn/DloNzRFehU5FY7/EjXOcqMUQ4g0xtH1N4uXCkkrt2oYHEbjmGVaqmL0ZaMILgFxzI3lZfVT1pxbXUmkXjBWzy5Hsynp/ams2YzkEEdRW8r/Htlm/UmI29x2/3pKlPhhmmntBCTVY5rRoZFVPNzLyjvWrGa7t42RfNGcLINiB6GhHMCPNT3T7ho8jnblPRarcKVuS6cns9UObrT5LhQ11E0Mx+mUDyv9/8ArQ24065tWHxIjy9mG4NHodWmSIwmP422CHGwFN31KZvKoEaj9GNqEXT7RLxyumBUU56b1IOG7CG51G3S5f4cLMOdvQV7b2F1e5kW3jfHU4AqfaLw0lvBbSTGyaSUgFNsrWfzPJWOHzyX+J47qk/oD6jYW3D+swXFrpklxZoQQ0owJce9ZxLxnea3b/xkSNUOIoI1wka+57mrhvuAtL1qyga7vZ5BFGByK3l6dhUdvvBy1u9LMltcNE7bhMe+1cLF8jgbTy9r7Otk8e9OY4TKRaaSeQszF3b1paVnlfmd3lbA5nZs5x0A9gNqnWo+FN5o8cwe6jfnA5Aq+Z/bPahUHDVzYSKs8bIGPlDDPOfSuxj87FkX6PZzb8XJL/ZD/hLRI7torRso9yOaV2AxFEN2bP2zXvGmsJqOpvc26LDZ26Lb2sA6JEuy7ep6n3NOZ9UbRdBuZnjMN5fMLZCRgrGu7HHucL+9QS81FpnYcxY52Jq/HDb9n9lWW0l6oUu3WViWOMjINNYo2up1jReY+p7Ada0JKrknJI3zUwuNFj4T4Lhvr0curayMQxH6orfuxHYt/itKWujK+SJrArsWxlR0ycZpa108XFwkY6sabiVicdBU14A4fe+vFmZDyg5BNWfQnZZnh7w8ltbwJy4OAW2qxHAUEj8UP0KyFpa85GGI5RT6Q5GATTzwiMbSHfFewIeYE1tyczU6gh9qcDFoFIFe3cnw4Sc4pREC7mhGv3ohhfzdBRDK29FZeJWrLFbyLzdjtmqJlkM0rux3Y5qeeJWtm5uGhVjnODvUGs7R7osFG4GTVVUbpnXB1hq1r5i3eg+4Y9QRUuv4A6kkbGozdQlJNgQe4x0qxmWWEtLvcFQG3B70+1FI7y3YNuSPSozFcGJweu/ejVrerIoBOc+tRPZKRTPiPwq07tMqYZc4xVUTRGMtDIuGU7Zrq3XdHW+ibCglhVJcdcGSRSNPAnnG5wOtV1L2BrZXJPLlG3FJsxiR0/S9LTRsrFZFIcbfakTlfK24pRBEH13reNyjcw2NeFMbjcGtejYqNEJDpuprysJvp5cDAGc0zkkEtwXAAGc4FD0m5Rsf705s7pYpVZhlc7iqvTTbRarbSTCrajcWY5YjyBwCQBvRThq5nmukVpgodsEtkmhBgF3HNdLKq8m4QnfFO9HuoIJImmbHI3MMHqax+QlUta5NeHapc8F5aRqC6daqTMWcAhcnY/imOqcfz6QrOOUITht8gH2FQmPiOS7DLCGZ13AG+fagt/cSyXTPqDHmduaK1Q5Y/f0rz0fHqr/Y7NeRqdyT2TxLSa1zOmGClhJIuAftQngri75zxI0S9vp40s47kMxmI5VXlOSe1V5rVzcvcsL1uVwMLGvRRQ+O7Yty7b7deldvwvj8eF+yRyvJ8ysn6sn/AIzcZ2vF/G15e2BHyMeIocDAYDq2Pc5NQQTomWbc9hSF0whYrkM3+KZmRifWuquTnU+STcLT6YNZiu9aJaytz8V4wN5Su6oPua34t4ru+Ltcn1K58qt5IowfLEg+lRUYWQ96J6Tp0+qXCRRKTvufSmS0I22tBDQtJm1a7WNVJTPmNdA8FcOR2NtGoXBAH71HOB+EFsI0ZkHMQKs+xtltYQBgECmmdk6HhxHGqrsFFJMfSsZ89a03zkCrNEFohk47Cn0QGwptbxkDPeniAKuSagpkzrHGSdsb1X3G2srBbyHm3we9SvXNRWCJgWA2PeqN494gNxM0KN37Ghb0asGP/ZkC4gla9vHlJJ32qQcD6J8xDJOyfUMA47ZoHFbNeTLEoyXbFW1wxpC2liqKADyjIqnTt6RdktQtlsmRZkxnNCNStebsQKT0zURLGo5t8Zok/LMvvV0tNcFGXFWN6ZEpY2iJB7H0re2ujGQM7dqKXtkGyQDmg0sLxt0OAetToRPZIYLpZFIbGKE63oqXsZblBz7UjBctGQCcjNFYLtZVw3Sj2KUfxpwEQ7z2ykMOox1qubu1mtJGjmjKkeorqvUdJhvFOFBzUB4j4Ct7zmb4WG+1JU66I1sokqKTdfapVrfBd7pzsyRs69tqjU0UkLcroyn3FILoakkHBrC3KetbOjHp1pNonUZNQiForlwcA7HqM9afK5QBmUIpGRk0KQMDnmx70vIy8ilpGZ8dOwFV1CZbN6Del6/fQT/CsnRefyh2Awue9GLpl0GynKSx3t5cNj5gjPIMb4qGW8xWQBfLmiqXKy2RWRjzK2VFZcmFbTXX2asWbctPsYyu0jczOzOepJpNWYHAz96WmjIXK1okLdT+1aU1ozUuTJMyKCx8w6Uj0270XtNGu74hYYWIPfFS7h7w2eeRZLleY9cEU00JUkU0Hhu71mVQiMsfdiKufg7geLT1TEY5tskijnDvCENmiBYwuB6VMbe0jtlAVRke1WzO+WLwjywsktUACjNOubcDNaZOT1rNzgDrVoDbJLbHvTiGMk5I71pDCWIyNutEI4wN6GxT2JNht060je3awxnzYxSlxOsCE5FQXi3iZLOFyXxgetTei3HjdsD8ccUpbwuA+Dggb1S17fNd3DSM2cnuac8TcQyandP5jy59aY6NYy6ldpCgJBO59qoujepS4RMOCNG+Zl+akXyr9NWCZ/lgEQbe1NNF0+PTrNY1IHKOwr24kMj4B6Vo8aPVez+zleXl9q9V0jbRtaJwrNgg7jNTLT9RWZAC1VJBcNGwZGwQNxUm0jWzkKxIPcZrieL5mv1o+gfKfEq07hFityyjO29D7uyDg7dqRsdUV1GTRRZFmFdibVLg8ZmwVirTI1cWrRnpXkUrId84o/cWisD5aGXGnlTlahQmbwXeBhqXkSG5TzAEmhZV4m6EUrHOy4NMmRiGo8PRXKnygj7VC9a8Pba7BzCAc9hVjR3WRg0oTHIAGUVHKYCgtT8MpI+Yw8wx7VHr7gjUovKELYGdhXS82mwTDZR+1MpOHIZMjlXJ9utK4IcwzcM6lFnmt2P4pD/QdRJAFu/7V0zJwlCx/lr+1Ijg6HP8pf2pfVg0jm1NA1Ln8ts+QfSiNvwxqjlf4LD710RHwfCDvEP2pxFwpCv6FH4pfxtjJpFHafwBeXJUTEjPYCpPo/hskbDnTn+4q2LfQYY+qjbptRGHT4Y8cqg1FhX2wuyF6TwXFbgBYgB06VKLLRYbcDKgGiwhAXygCsYYG3/3VsxK6EbbNFRY1AVQAK2G53GfSvQDnp70vHDk7CmAxIIcbfvSscB2JG/anUduNvLSyxqN6AprDEFxt2r2adYEOTSVzeJbocsNhUK4l4tjtY3w4BHvU6LseKrekOOKOJY7SJvOOnrVEcZcWyX9w0aOSuTnBrbi/jOS/kaOKQ8pzmoUGaZ98sSf3qqr2blKhes9jmJJLlwq5dnOwq0eDuHl022WaZfO++/ahHBXCpVFvrpcH9KsNxU0mlVFCqcAbYoY493t9GXyM3ovVdsfNhosq24/xTaMhSeYgmmiTPghW60rCC+Sck1ulnKpEPsb5ZVXLANjcZolFKysGVsVE2DRNzKSMelEbLU1JCyEgjvXkMmFrmT6543mKv0vsnGl628ZUO2PzUt0/WVYDzA/mqvjnUgENufTtRKy1WS2I5nJUdN6uweZUcUZ/O+Lx506jstu3u0lAHMCO1LmJJBtvmoHpnEHMF82/epLY60rgEke29djF5E2uzx/l/GZMT6HktiGB8tMpdPIOQBii8N0kg6j3pX4aODgitHDOZUVL5I2YHQ5ArYMydaPPZKcnApvJpyk7CiLsHRzHHXNKrPjpmlm07c4FJtYOOlTZDZZga3Eu3bakhaOOnpW4tJPt96mwCizjHXFY02fetVtXpRLNs79KmyGKxLbdqcRkbZrEszttTiK1+9Eh4dxt3rURs2NjvTtYDtSywAHcDegDY1jtjnJxvTuKEAA9Nq2LRxg5IyKZ3erRRKeVhnFTRFLY9aRYhkkUL1DWY7eNiGAx71HdZ4uht1bLj96rTibxA2ZUcn80KpI2YfEb5rolfFHHMVtG4WQZ371TPEvF9xqUrqkhCH0NCNX16fUJGLM2CaYQQS3MioilmY9Bvmqatvk1NzK9YPVDzN3JNTvg3hBmIvrxcKu6owpzwpwStsq32pKOmVQ9qk8+pQkGGDlATsKEQ7f/DJmzKFpdixuUjHw48KBttTJ2JYljnemoldpMkEDenKcrLzbfmtkpJaRzKbp7Y5jfkAxnPpRnQozczONtkz0z3FAQ2SMVIOGp1heQtgErjBPvViXBWyIcWcD6jwzdOk8LPFnyyKMgiovJARuMg+1dK2HEul6/bmx1WOMOwwQ42NRDi3wd51e90SQOh8xiPp7VxMvjOeZ6PX+L8kr/W+H/ZTkF7NbHc5WittqEcoHmwcdKb3uj3VjM0V1C8TKcFXGKZmBo2ypINYbxJ/+ncweZUdPaJLFM0Z5lYgj3opZa1NCwVjnHeodDfSwjDZI75NEINRQj6uUjqKz+t43uToznw51qv8A6WFYcRggfxMZ7E0etNfVwN96quKdSQVfBPvT2DVJ4WHKxIFasXnVP+Rh8j4fFk5gtuHV4235hj1p3HeRPjJFVVb8RshwxII670Rg4nwNnxXQjzofbODn+CyTzKLJDxNtkVuIo2HaoDFxVgA8/wDencXF6geZh+9apzTXTOZk+Oyz9E0+XXbpXotlx2qJJxhF/WD+aUPF8Q/WMferNr+zO/FyL6JYLdR1xW3wUGTkVETxhEASJB+9IycaRD/8gzR2gfxb/ommEXuK8+YiTckVX8/HUSj+aM56ZoPeeIUar/OH70HUr7Hnw8j+i0pdWhiG7AULu+JYY1JLjb3qoNR8SVXIVyR96i2p+INxMG5Xxn3pHmldGifB1zT0XNqnHEMAb+KFx71BNe8R1UsInGRnvVW33E9zclsyMc+9CZLqWY/UTS1kb6LV+PH/AIrbJRq/Gd1es2Hbf361Hri6muCSWJJ7V7aWE95IscMbO7dABU10Xw6leJLi/cRId+UnBxVDtb19gq6pbrhET0fQLvV51SGJmyd2xsKsvRuGNP4biWacCW4xnfoK8utb03h63+WsURmGxI/zUUu+JLu9kYM+x96tjFVc10YcudJeskn1PiUzuY4zhcbAUPgvGVicbnrQON2aQNkn2olFKo3YgEf2rUnrhGJ88sORT8+DkEU5WRlTB6Gg1rMWblUZBqQ2Ns0wVSDgf4pp5K64PbYMTg5o7aW5EYJ22xTWG2WI4A2FEY+VhgnGK0TJnqhO8nS41EzFTDGxGOXapPa8VS6AiFZjcQEDKM2SKysrIdFBX5vhXjeAxXMcazEYIbCuDUR4g8GZ0DTaTMs6dQjHzD81lZWXNhn+jd43k5Jr1T4K91LhrUNNlaO6tZIyvdl60Je0YHoV/NZWVzX2eix03rZpzTRE4Ykfetl1SVPq3x/esrKl45faLsee10xxHrCsMEYpddSiO/Pg1lZWSoS6Ojj8i2uWbC/38suPzWjX83VZCfzWVlCW10WU0+0Itqd2PpY47HNJNq19k4YmsrK1RkrXZhvHO+jU6nqDEjnAz0y1N5b+9Ay1wq+vmrKyn/JW+zJklLoGXOqyKSDcM59qFT6m7E4Zjnrk1lZWqEcrPmtdMYy3Ush2JpBhIxwc1lZVqMFZKb5HNnpF3fOFihdyfRal+i+HUrcst/IsEY3K58xrKyqqpl8SiRrqPD/CkTLbIs0+N2G+9RvWeN7q/VxzFQ22B6VlZWnDjn19vsweRlp8NkXF7KzEsxOfU0tHIeXmGSe+Kysq9GUK6cJ7gqkUbO32qT6dw7NcMGnBULuRWVlRCsMRabCufhqFCHpROyCxbtsR/esrKvgqroe24WZvKO+1P4bcAnJxtWVlaJM1n//Z" alt="캔 마개 쪽 검정색 침전물 예시" style="max-width:200px;width:100%;height:auto;border-radius:8px;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,0.08);" loading="lazy" /><div style="color:#666;font-size:11px;font-style:italic;margin-top:8px;letter-spacing:-0.02em;">예시 사진 — 캔 마개 쪽에서 보이는 검정색 침전물</div></div>'
  },
  {
    cat:'냄새·맛',
    q:'Q3. 식용유에서 산패취(퀴퀴한 냄새)가 나요.',
    a:'식용유는 개봉 전/후 공기, 빛, 열에 노출되면 <b>산화가 진행</b>되어 특유의 <b>산패취(퀴퀴한 냄새)</b>가 발생할 수 있습니다.<br><br>이는 지방산이 산소와 결합하여 <b>과산화물이 생성</b>되며 생기는 현상입니다. 산패취가 나는 것이 제품에 문제가 있는 것은 아니고, 신선도가 떨어지면서 발생하는 현상입니다.<br><br><b>개봉 후 보관 방법</b>:<br>• 서늘하고(상온) 빛이 없는 곳에 밀봉 보관<br>• <b>2~3개월 이내 사용</b> 권장<br><br>미개봉 상태에서도 이취가 느껴지신다면 소비기한과 보관 상태를 확인 후 고객센터로 접수 부탁드립니다.'
  },
  {
    cat:'냄새·맛',
    q:'Q4. 튀김 시 거품이 너무 많이 나요.',
    a:'거품 발생은 <b>여러 복합적인 요인</b>으로 인한 현상으로, 원인을 특정하기 어렵습니다. 아래 원인 중 해당 항목이 있는지 확인하시고 개선하시는 것을 권장드립니다.<br><br><b>① 수분 과혼입, 튀김제품 성분 유출</b><br>조리 중 물, 재료의 수분에서 <b>단백질, 동물성 지방, 계란의 레시틴(유화제)</b> 등이 같이 유출되어 거품의 점도를 증가시킬 수 있습니다. 낮은 온도의 조리에서 흔히 발생하므로 <b>적정 온도를 유지</b>하는 것을 권장드립니다.<br><br><b>② 이물 혼입</b><br>기름의 찌든 때, <b>금속 성분의 접촉, 세제 오입</b> 등은 거품 발생을 촉진시킵니다. 제품 사용 전 내부 상태와 주변 환경을 반드시 점검하세요.<br><br><b>③ 높은 온도에서의 조리</b><br>식용유의 발연점은 <b>약 230°C</b>로, <b>200°C가 넘으면 연기가 날 수 있으며 산패 속도가 촉진</b>됩니다. <b>적정 온도(170~180°C)</b> 부근에서 사용하시는 것을 권장드립니다.<br><br>위 내용에 해당되지 않으며 <b>제품 사용 직후 거품 문제</b>가 발생하였다면, 소비기한과 발생 영상을 확보하여 고객센터에 접수해 주시길 바랍니다.'
  },
  {
    cat:'포장·용기',
    q:'Q5. 뚜껑 체결 불량 또는 안전캡(씰)이 파손돼 있어요.',
    a:'뚜껑 체결 불량 또는 안전캡(씰) 파손이 확인된 경우, <b>제품 안전성 보장이 어려울 수 있으므로 사용하지 마시고</b> 구입처 또는 고객센터로 <b>즉시 연락</b>해 주세요.<br><br><b>접수 시 준비 사항</b>:<br>• 파손 부위 사진<br>• 구입일<br>• 구입처<br>• 소비기한<br><br>위 정보를 알려주시면 <b>신속히 교환 또는 환불 처리</b>해 드립니다.'
  },
  {
    cat:'포장·용기',
    q:'Q6. 용기가 찌그러져 있거나 누유가 발생했어요.',
    a:'유통 과정 중 <b>충격이나 압력에 의해 용기 변형 및 누유</b>가 발생할 수 있습니다.<br><br><b>대처 방법</b>:<br>① 제품을 사용하지 마세요<br>② 포장 상태를 사진으로 기록해 주세요<br>③ 고객센터에 접수해 주세요<br><br><b>교환 또는 환불 처리</b>해 드리겠습니다.<br><br>📍 <b>대형마트 구입 시에는 해당 매장 고객서비스센터에서도 즉시 교환 가능</b>합니다.'
  },
  {
    cat:'표시·성분',
    q:'Q7. 식용유에 GMO 성분이 포함되어 있나요?',
    a:'당사에서 생산하는 식용유는 <b>GMO 검사 결과 "검사 불능"</b>으로 판정 받았습니다.<br><br>DNA는 단백질로, <b>단백질 성분이 남아있지 않은 유지 100%인 식용유는 GMO 검사 시 성분이 검출되지 않습니다.</b><br><br>따라서 GMO에 의한 변형된 DNA를 섭취하는 걱정은 <b>안심하셔도 되며</b>, 추가 문의는 고객센터를 통해 상세히 안내드립니다.'
  },
  {
    cat:'표시·성분',
    q:'Q8. 트랜스지방 0g이라고 표시되어 있는데 정말 없는 건가요?',
    a:'식품표시기준에 따라 <b>1회 제공량당 트랜스지방이 0.2g 미만인 경우 "0g"으로 표시</b>할 수 있습니다.<br><br>즉, <b>미량은 존재할 수 있으나 건강에 유의미한 영향을 미치는 수준이 아닙니다.</b><br><br>식물성 식용유는 <b>수소첨가 공정을 거치지 않는 한 트랜스지방 함량이 매우 낮으며</b>, 저희 제품은 해당 기준을 충족하여 표기하고 있습니다.'
  },
  {
    cat:'건강·사용',
    q:'Q9. 식용유 섭취 후 복통/구토 등 증상이 생겼어요.',
    a:'식용유 자체로 식중독이 발생하는 경우는 드물지만, <b>산패된 기름 섭취 시 복통, 구토 등의 증상</b>이 나타날 수 있습니다.<br><br><b>증상이 지속된다면 의료기관 진료를 먼저 받으시길 권장</b>합니다.<br><br>제품과의 인과관계 파악을 위해 다음을 보존해 주세요:<br>• 남은 제품<br>• 소비기한<br>• 섭취 상황 (조리법, 보관 환경 등)<br><br>고객센터로 접수해 주시면 <b>검사 및 조치</b>를 안내드립니다.'
  },
  {
    cat:'건강·사용',
    q:'Q10. 표시된 용량보다 적게 들어있는 것 같아요.',
    a:'식용유는 <b>온도에 따라 부피가 변하므로(열팽창/수축)</b>, 기온이 낮을 때는 용량이 실제보다 적어 보일 수 있습니다.<br><br>저희 제품은 <b>중량(g) 기준으로 충전</b>되며, <b>공인 계량기관 검사를 한 분동</b>을 통하여 <b>정기적으로 검교정된 설비</b>에서 생산됩니다.<br><br>그럼에도 의심되신다면 제품을 보존하시고 소비기한과 함께 고객센터로 접수해 주시면 <b>분석 후 안내</b>드리겠습니다.'
  },
];

function switchSupportTab(tab) {
  // 🆕 v107: AI 상담 제거, FAQ + 문의 접수만 활성화
  ['faq','ask'].forEach(function(t) {
    var btn = document.getElementById('stab-' + t);
    var content = document.getElementById('stab-content-' + t);
    if (btn && content) {
      var isActive = t === tab;
      btn.style.background = isActive ? 'var(--green-main)' : 'transparent';
      btn.style.color = isActive ? '#fff' : 'var(--gray)';
      content.style.display = isActive ? 'block' : 'none';
    }
  });
  if (tab === 'faq') renderFAQ();
  if (tab === 'ask') renderAskList();
}

function renderFAQ(filter) {
  var el = document.getElementById('faqList');
  if (!el) return;
  // 🆕 v108: HIVE 공식 클레임 가이드 카테고리 (품질·이물 / 냄새·맛 / 포장·용기 / 표시·성분 / 건강·사용)
  var cats = ['전체','품질·이물','냄새·맛','포장·용기','표시·성분','건강·사용'];
  var cur = filter || window._faqCat || '전체';
  window._faqCat = cur;
  var data = cur === '전체' ? FAQ_DATA : FAQ_DATA.filter(function(f){ return f.cat === cur; });

  el.innerHTML = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">'
    + cats.map(function(c) {
      return '<button data-cat="' + c + '" onclick="renderFAQ(this.getAttribute(\'data-cat\'))" style="border:none;border-radius:20px;padding:7px 13px;font-size:11.5px;font-weight:700;cursor:pointer;font-family:var(--font-body);letter-spacing:-0.02em;background:'
        + (c === cur ? 'var(--green-dark)' : 'var(--gray-light)') + ';color:'
        + (c === cur ? '#fff' : 'var(--gray)') + ';">' + c + '</button>';
    }).join('') + '</div>'
    + data.map(function(f, i) {
      return '<div style="background:var(--white);border-radius:12px;margin-bottom:8px;box-shadow:var(--shadow);overflow:hidden;border-left:3px solid var(--green-dark);">'
        + '<div onclick="toggleFAQ(' + i + ')" style="padding:14px 16px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:10px;">'
        + '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">'
        + '<span style="background:var(--green-pale);color:var(--green-dark);border-radius:6px;padding:3px 9px;font-size:10px;font-weight:700;white-space:nowrap;letter-spacing:-0.02em;">' + f.cat + '</span>'
        + '<span style="font-size:13px;font-weight:700;color:#0F2419;">' + f.q + '</span>'
        + '</div><span id="faq-arrow-' + i + '" style="font-size:12px;color:var(--gray);flex-shrink:0;">▼</span></div>'
        + '<div id="faq-ans-' + i + '" style="display:none;padding:14px 18px 16px;font-size:12.5px;color:#3D3D3D;line-height:1.75;border-top:1px solid #F0F0F0;background:#FAFAFA;">'
        + f.a + '</div></div>';
    }).join('');
}

function toggleFAQ(i) {
  var ans = document.getElementById('faq-ans-' + i);
  var arr = document.getElementById('faq-arrow-' + i);
  if (!ans) return;
  var open = ans.style.display !== 'none';
  ans.style.display = open ? 'none' : 'block';
  if (arr) arr.textContent = open ? '▼' : '▲';
}

function submitAsk() {
  var type = document.getElementById('askType').value;
  var biz  = document.getElementById('askBiz').value.trim();
  var txt  = document.getElementById('askContent').value.trim();
  if (!txt) { showToast('t1','⚠️ 내용 필요','문의 내용을 입력해주세요'); return; }
  var now = new Date();
  var item = {
    id: Date.now(),
    type: type, biz: biz || '미입력',
    content: txt,
    date: now.getFullYear() + '.' + String(now.getMonth()+1).padStart(2,'0') + '.' + String(now.getDate()).padStart(2,'0'),
    status: '접수',
    answer: ''
  };
  supportAsks.unshift(item);
  saveSupportAsks();
  document.getElementById('askContent').value = '';
  document.getElementById('askBiz').value = '';
  showToast('t1','✅ 문의 접수 완료','담당자가 확인 후 연락드릴게요');
  renderAskList();
}

function renderAskList() {
  var section = document.getElementById('askListSection');
  var listEl  = document.getElementById('askList');
  var cntEl   = document.getElementById('askCount');
  if (!section || !listEl) return;
  // 관리자만 전체 목록, 업주는 자기 업체 것만
  var list = supportAsks;
  if (ownerLoggedIn && ownerBizId) {
    var biz = businesses.find(function(b){ return String(b.id) === String(ownerBizId); });
    if (biz) list = list.filter(function(a){ return a.biz === biz.name; });
  }
  section.style.display = (isAdminMode || list.length > 0) ? 'block' : 'none';
  if (cntEl) cntEl.textContent = list.length + '건';
  if (list.length === 0) { listEl.innerHTML = '<div style="text-align:center;padding:30px;color:var(--gray);">접수된 문의가 없어요</div>'; return; }
  listEl.innerHTML = list.map(function(a) {
    var statusColor = a.status === '답변완료' ? 'var(--green-dark)' : a.status === '처리중' ? '#185FA5' : '#D4621A';
    return '<div style="background:var(--white);border-radius:12px;padding:14px 16px;margin-bottom:8px;box-shadow:var(--shadow);border-left:3px solid ' + statusColor + ';">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">'
      + '<span style="background:var(--green-pale);color:var(--green-dark);border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">' + a.type + '</span>'
      + '<span style="font-size:12px;font-weight:700;">' + a.biz + '</span>'
      + '<span style="font-size:11px;color:var(--gray);margin-left:auto;">' + a.date + '</span>'
      + '<span style="background:' + statusColor + ';color:#fff;border-radius:6px;padding:2px 8px;font-size:10px;font-weight:700;">' + a.status + '</span>'
      + '</div>'
      + '<div style="font-size:13px;margin-bottom:' + (a.answer ? '8px' : '0') + ';">' + a.content + '</div>'
      + (a.answer ? '<div style="background:#F0F9F4;border-radius:8px;padding:10px 12px;font-size:12px;color:var(--green-dark);"><strong>💬 답변:</strong> ' + a.answer + '</div>' : '')
      + (isAdminMode ? '<div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap;">'
        + '<textarea id="ans-' + a.id + '" rows="2" placeholder="답변 입력..." style="flex:1;padding:8px;border:1px solid var(--gray-light);border-radius:8px;font-size:12px;font-family:var(--font-body);resize:none;min-width:150px;">' + (a.answer||'') + '</textarea>'
        + '<button onclick="replyAsk(' + a.id + ')" style="background:var(--green-main);border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;color:#fff;font-family:var(--font-body);">답변</button>'
        + '<button onclick="deleteAsk(' + a.id + ')" style="background:#FFEBEE;border:none;border-radius:8px;padding:8px 10px;font-size:12px;font-weight:700;cursor:pointer;color:var(--red-accent);font-family:var(--font-body);">삭제</button>'
        + '</div>' : '')
      + '</div>';
  }).join('');
}

function replyAsk(id) {
  var ans = document.getElementById('ans-' + id);
  if (!ans || !ans.value.trim()) { showToast('t1','⚠️','답변 내용을 입력해주세요'); return; }
  var item = supportAsks.find(function(a){ return a.id === id; });
  if (!item) return;
  item.answer = ans.value.trim();
  item.status = '답변완료';
  saveSupportAsks();
  renderAskList();
  showToast('t1','✅ 답변 완료','문의에 답변이 등록됐어요');
}

function deleteAsk(id) {
  if (!confirm('이 문의를 삭제할까요?')) return;
  supportAsks = supportAsks.filter(function(a){ return a.id !== id; });
  saveSupportAsks();
  renderAskList();
}

// 🆕 v107: AI 상담 기능 제거됨 (식용유 클레임 Q&A FAQ로 대체)

function renderBilling(){
  const sel=document.getElementById('billingMonthSel');if(!sel)return;
  const month=sel.value;const[yr,mo]=month.split('.').map(Number);
  const stats={};
  businesses.forEach(b=>{stats[b.id]={biz:b,deliveryCnt:0,deliveryAmt:0,wasteCnt:0,wasteAmt:0};});
  // 🔧 식용유발주 done은 dedupe (이중 기록 방지)
  var oilDoneRaw = historyData.filter(function(h){ if(h.deleted_at) return false; 
    if (!h.rawDate || h.status!=='done' || h.type!=='식용유발주') return false;
    var d = new Date(h.rawDate);
    return d.getFullYear()===yr && d.getMonth()+1===mo;
  });
  var oilDoneList = dedupeHistoryDone(oilDoneRaw);
  oilDoneList.forEach(function(h){
    var s=stats[h.bizId];if(!s)return;
    var amt=parseInt((h.amount||'0').replace(/[^0-9]/g,''))||0;
    s.deliveryCnt+=h.qty||0;s.deliveryAmt+=amt;
  });
  // 폐유수거는 그대로 (단일 기록)
  historyData.forEach(h=>{
    if(!h.rawDate||h.status!=='done')return;
    if(h.type!=='폐유수거')return;
    const d=new Date(h.rawDate);
    if(d.getFullYear()!==yr||d.getMonth()+1!==mo)return;
    const s=stats[h.bizId];if(!s)return;
    const amt=parseInt((h.amount||'0').replace(/[^0-9]/g,''))||0;
    s.wasteCnt+=h.qty||0;s.wasteAmt+=amt;
  });
  const active=Object.values(stats).filter(s=>s.deliveryAmt>0||s.wasteAmt>0);
  const totalD=active.reduce((a,x)=>a+x.deliveryAmt,0);
  const totalW=active.reduce((a,x)=>a+x.wasteAmt,0);
  const totalN=totalD-totalW;
  const unpaid=active.filter(s=>!(billingData[getBillingKey(s.biz.id,month)]?.paid)).length;
  const kpi=document.getElementById('billingKpi');
  if(kpi)kpi.innerHTML=[['📦 총 납품액',totalD.toLocaleString()+'원','var(--green-dark)'],['♻️ 총 수거액',totalW.toLocaleString()+'원','#FF9500'],['💰 정산 청구액',totalN.toLocaleString()+'원','var(--red-accent)'],['⏳ 미수 업체',unpaid+'곳','#C0392B']].map(([l,v,c])=>`<div style="background:var(--white);border-radius:var(--radius);padding:14px;box-shadow:var(--shadow);text-align:center;"><div style="font-size:11px;color:var(--gray);margin-bottom:4px;">${l}</div><div style="font-family:var(--font-display);font-size:16px;font-weight:800;color:${c};">${v}</div></div>`).join('');
  const listEl=document.getElementById('billingList');if(!listEl)return;
  if(active.length===0){listEl.innerHTML='<div style="text-align:center;padding:60px;color:var(--gray);"><div style="font-size:36px;margin-bottom:12px;">📭</div><div>'+month+' 정산 대상 거래가 없어요</div></div>';return;}
  listEl.innerHTML=active.map(s=>{
    const key=getBillingKey(s.biz.id,month);const bd=billingData[key]||{};
    const net=s.deliveryAmt-s.wasteAmt;const taxIssued=bd.taxInvoice||false,paid=bd.paid||false;
    return`<div style="background:var(--white);border-radius:var(--radius);padding:16px 18px;box-shadow:var(--shadow);margin-bottom:12px;border-left:4px solid ${paid?'var(--green-main)':net>0?'var(--red-accent)':'var(--gray-light)'};">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
        <div style="font-family:var(--font-display);font-size:15px;font-weight:800;">${s.biz.name}</div>
        <div style="font-size:11px;color:var(--gray);">${s.biz.type}</div>
        <div style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
          ${taxIssued?'<span style="background:#E8F5E9;color:#2E7D32;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">✅ 계산서발행</span>':'<span style="background:#FFF8F0;color:#D4621A;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">📄 미발행</span>'}
          ${paid?'<span style="background:#E8F5E9;color:#2E7D32;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">✅ 입금완료</span>':'<span style="background:#FFEBEE;color:#C0392B;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:700;">⏳ 미수</span>'}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="background:#F8FFF8;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:var(--gray);margin-bottom:3px;">📦 납품(${s.deliveryCnt}캔)</div><div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:var(--green-dark);">+${s.deliveryAmt.toLocaleString()}원</div></div>
        <div style="background:#FFF8F0;border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:var(--gray);margin-bottom:3px;">♻️ 수거(${s.wasteCnt}캔)</div><div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:#FF9500;">-${s.wasteAmt.toLocaleString()}원</div></div>
        <div style="background:${net>0?'#FFEBEE':'#E8F5E9'};border-radius:8px;padding:10px;text-align:center;"><div style="font-size:10px;color:var(--gray);margin-bottom:3px;">💰 정산 차액</div><div style="font-family:var(--font-display);font-size:14px;font-weight:800;color:${net>0?'var(--red-accent)':'var(--green-dark)'};">${net>=0?'+':''}${net.toLocaleString()}원</div></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
        <div style="font-size:10px;font-weight:700;color:var(--gray);width:100%;margin-bottom:2px;">📦 식용유 납품 계산서</div>
        <button onclick="showTransactionStatement(${s.biz.id},'${month}')" style="background:#1565C0;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:#fff;font-family:var(--font-body);">📄 거래명세서</button>
        ${!taxIssued?`<button onclick="openHometax(${s.biz.id},'${month}','delivery')" style="background:var(--green-main);border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font-body);">📄 납품 계산서 발행</button>`:`<button onclick="toggleTaxInvoice(${s.biz.id},'${month}',false)" style="background:#F5F5F5;border:1px solid var(--gray-light);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:var(--gray);font-family:var(--font-body);">↩ 납품 발행취소</button>`}
        ${(taxIssued&&!paid)?`<button onclick="markPaid(${s.biz.id},'${month}',true)" style="background:#185FA5;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:#fff;font-family:var(--font-body);">✅ 입금완료</button>`:''}
        ${paid?`<button onclick="markPaid(${s.biz.id},'${month}',false)" style="background:#F5F5F5;border:1px solid var(--gray-light);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:var(--gray);font-family:var(--font-body);">↩ 미수로 변경</button>`:''}
      </div>
      ${s.wasteAmt>0?`<div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:8px;border-top:1px dashed var(--gray-light);">
        <div style="font-size:10px;font-weight:700;color:#D4621A;width:100%;margin-bottom:2px;">♻️ 폐식용유 수거 계산서 (VAT포함)</div>
        ${!(billingData[getBillingKey(s.biz.id,month)]?.wasteTaxIssued)?
          `<button onclick="toggleWasteTaxInvoice(${s.biz.id},'${month}',true)" style="background:#FF6B00;border:none;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:#fff;font-family:var(--font-body);">📄 폐유 계산서 발행</button>`
          :`<span style="background:#FFF3E0;color:#D4621A;border-radius:6px;padding:5px 12px;font-size:11px;font-weight:700;">✅ 폐유 계산서 발행완료</span>
           <button onclick="toggleWasteTaxInvoice(${s.biz.id},'${month}',false)" style="background:#F5F5F5;border:1px solid var(--gray-light);border-radius:8px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;color:var(--gray);font-family:var(--font-body);">↩ 취소</button>`
        }
      </div>`:''}
    </div>`;
  }).join('');
}
// ============================================================
// 📄 거래명세서 (Transaction Statement) — 월별 보기 + 출력
// ============================================================
function showTransactionStatement(bizId, month) {
  var biz = businesses.find(function(b){ return String(b.id) === String(bizId); });
  if (!biz) { showToast('t1','⚠️ 업체 정보 없음',''); return; }

  var parts = String(month).split('.');
  var yr = parseInt(parts[0]);
  var mo = parseInt(parts[1]);

  // 해당 월의 납품(식용유발주 done) — dedupe
  var oilDoneRaw = historyData.filter(function(h){
    if (h.deleted_at) return false;
    if (!h.rawDate || h.status !== 'done' || h.type !== '식용유발주') return false;
    if (String(h.bizId) !== String(bizId)) return false;
    var d = new Date(h.rawDate);
    return d.getFullYear() === yr && (d.getMonth() + 1) === mo;
  });
  var oilDoneList = (typeof dedupeHistoryDone === 'function') ? dedupeHistoryDone(oilDoneRaw) : oilDoneRaw;

  // 해당 월의 수거(폐유수거 done)
  var wasteList = historyData.filter(function(h){
    if (h.deleted_at) return false;
    if (!h.rawDate || h.status !== 'done' || h.type !== '폐유수거') return false;
    if (String(h.bizId) !== String(bizId)) return false;
    var d = new Date(h.rawDate);
    return d.getFullYear() === yr && (d.getMonth() + 1) === mo;
  });

  if (oilDoneList.length === 0 && wasteList.length === 0) {
    showToast('t1','📭 거래 내역 없음', month + ' 거래 내역이 없습니다');
    return;
  }

  // 시간순 정렬 (최신이 위)
  oilDoneList.sort(function(a,b){ return new Date(b.rawDate) - new Date(a.rawDate); });
  wasteList.sort(function(a,b){ return new Date(b.rawDate) - new Date(a.rawDate); });

  // 합계 계산 (VAT 포함가 그대로 사용 — 부가세 별도 분리 X)
  var totalDelivery = 0, deliveryCnt = 0;
  oilDoneList.forEach(function(h){
    var amt = parseInt((h.amount || '0').toString().replace(/[^0-9]/g,'')) || 0;
    totalDelivery += amt;
    deliveryCnt += (h.qty || 0);
  });

  var totalWaste = 0, wasteCnt = 0;
  wasteList.forEach(function(h){
    var amt = parseInt((h.amount || '0').toString().replace(/[^0-9]/g,'')) || 0;
    totalWaste += amt;
    wasteCnt += (h.qty || 0);
  });

  var netAmount = totalDelivery - totalWaste;

  // 발행일 (오늘)
  var today = new Date();
  var todayStr = today.getFullYear() + '. ' + (today.getMonth()+1) + '. ' + today.getDate();
  var docNo = 'HV-' + yr + ('0'+mo).slice(-2) + '-' + biz.id;

  // 포맷 헬퍼
  var fmt = function(n){ return (n||0).toLocaleString(); };
  var dateFmt = function(rawDate){
    if (!rawDate) return '-';
    var d = new Date(rawDate);
    return (d.getMonth()+1) + '/' + d.getDate();
  };

  // 거래명세서 HTML (출력용으로 깔끔하게)
  var oilRows = oilDoneList.map(function(h, i){
    var amt = parseInt((h.amount || '0').toString().replace(/[^0-9]/g,'')) || 0;
    var unit = (h.qty > 0) ? Math.round(amt / h.qty) : 0;
    return '<tr>'
      + '<td class="ts-num">' + (i+1) + '</td>'
      + '<td class="ts-date">' + dateFmt(h.rawDate) + '</td>'
      + '<td class="ts-name">' + (h.productName || h.content || '식용유') + '</td>'
      + '<td class="ts-qty">' + (h.qty || 0) + '캔</td>'
      + '<td class="ts-num">' + fmt(unit) + '</td>'
      + '<td class="ts-num"><strong>' + fmt(amt) + '</strong></td>'
      + '</tr>';
  }).join('');

  var wasteRows = wasteList.map(function(h, i){
    var amt = parseInt((h.amount || '0').toString().replace(/[^0-9]/g,'')) || 0;
    var unit = (h.qty > 0) ? Math.round(amt / h.qty) : 0;
    return '<tr>'
      + '<td class="ts-num">' + (i+1) + '</td>'
      + '<td class="ts-date">' + dateFmt(h.rawDate) + '</td>'
      + '<td class="ts-name">폐식용유' + (h.actual_kg ? ' ('+ h.actual_kg +'kg)' : '') + '</td>'
      + '<td class="ts-qty">' + (h.qty || 0) + '캔</td>'
      + '<td class="ts-num">' + fmt(unit) + '</td>'
      + '<td class="ts-num"><strong>' + fmt(amt) + '</strong></td>'
      + '</tr>';
  }).join('');

  // 모달 컨테이너
  var existing = document.getElementById('txStatementModal');
  if (existing) existing.remove();

  var modal = document.createElement('div');
  modal.id = 'txStatementModal';
  modal.className = 'modal-overlay';
  modal.style.display = 'flex';
  modal.style.zIndex = '10000';
  modal.style.padding = '20px';

  modal.innerHTML = ''
    + '<style>'
    + '#txStatementModal .ts-paper{background:#fff;width:100%;max-width:900px;max-height:92vh;border-radius:10px;display:flex;flex-direction:column;}'
    + '#txStatementModal .ts-toolbar{display:flex;gap:8px;padding:12px 18px;background:#F5F7FA;border-bottom:1px solid #E0E0E0;border-radius:10px 10px 0 0;flex-wrap:wrap;align-items:center;}'
    + '#txStatementModal .ts-content{padding:30px 36px;overflow-y:auto;font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;color:#222;}'
    + '#txStatementModal .ts-h1{font-size:26px;font-weight:800;text-align:center;letter-spacing:6px;margin:0 0 24px 0;border-bottom:3px double #222;padding-bottom:12px;}'
    + '#txStatementModal .ts-meta{display:flex;justify-content:space-between;font-size:11px;color:#666;margin-bottom:14px;}'
    + '#txStatementModal .ts-parties{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;}'
    + '#txStatementModal .ts-party{border:1.5px solid #222;}'
    + '#txStatementModal .ts-party-head{background:#222;color:#fff;text-align:center;padding:6px;font-size:12px;font-weight:700;}'
    + '#txStatementModal .ts-party table{width:100%;border-collapse:collapse;font-size:11px;}'
    + '#txStatementModal .ts-party td{padding:6px 8px;border-bottom:1px solid #DDD;}'
    + '#txStatementModal .ts-party td:first-child{background:#F5F5F5;width:32%;font-weight:600;color:#555;}'
    + '#txStatementModal .ts-section-title{font-size:13px;font-weight:800;margin:18px 0 8px 0;padding-left:6px;border-left:4px solid #1565C0;}'
    + '#txStatementModal .ts-table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:6px;}'
    + '#txStatementModal .ts-table th{background:#1565C0;color:#fff;padding:7px 4px;font-weight:700;border:1px solid #1565C0;}'
    + '#txStatementModal .ts-table td{padding:6px 4px;border:1px solid #DDD;}'
    + '#txStatementModal .ts-num{text-align:right;font-variant-numeric:tabular-nums;}'
    + '#txStatementModal .ts-date{text-align:center;color:#666;}'
    + '#txStatementModal .ts-qty{text-align:center;}'
    + '#txStatementModal .ts-name{text-align:left;}'
    + '#txStatementModal .ts-table tfoot td{background:#F5F7FA;font-weight:800;}'
    + '#txStatementModal .ts-totals{margin-top:18px;border:2px solid #222;padding:14px 18px;background:#FAFCFE;}'
    + '#txStatementModal .ts-totals-row{display:flex;justify-content:space-between;padding:5px 0;font-size:13px;}'
    + '#txStatementModal .ts-totals-row.final{font-size:17px;font-weight:800;border-top:2px solid #222;margin-top:8px;padding-top:10px;color:#C0392B;}'
    + '#txStatementModal .ts-foot{margin-top:24px;font-size:10px;color:#888;text-align:center;border-top:1px solid #DDD;padding-top:10px;}'
    + '#txStatementModal .ts-stamp{margin-top:18px;display:flex;justify-content:flex-end;font-size:12px;}'
    + '#txStatementModal .ts-stamp-box{border:2px solid #C0392B;border-radius:50%;width:70px;height:70px;display:flex;align-items:center;justify-content:center;color:#C0392B;font-weight:800;letter-spacing:1px;}'
    + '@media print {'
    + '  body * { visibility:hidden; }'
    + '  #txStatementModal, #txStatementModal * { visibility:visible; }'
    + '  #txStatementModal { position:absolute !important; left:0; top:0; padding:0 !important; background:#fff !important; }'
    + '  #txStatementModal .ts-toolbar { display:none !important; }'
    + '  #txStatementModal .ts-paper { max-width:none !important; max-height:none !important; box-shadow:none !important; border-radius:0 !important; }'
    + '  #txStatementModal .ts-content { padding:20px !important; }'
    + '}'
    + '</style>'
    + '<div class="ts-paper">'
      + '<div class="ts-toolbar">'
        + '<div style="font-weight:800;font-size:14px;flex:1;">📄 거래명세서 — ' + biz.name + ' (' + month + ')</div>'
        + '<button onclick="window.print()" style="background:#1565C0;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;">🖨️ 출력</button>'
        + '<button onclick="document.getElementById(\'txStatementModal\').remove()" style="background:#888;color:#fff;border:none;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;">✕ 닫기</button>'
      + '</div>'
      + '<div class="ts-content">'
        + '<h1 class="ts-h1">거 래 명 세 서</h1>'
        + '<div class="ts-meta">'
          + '<div>문서번호 : ' + docNo + '</div>'
          + '<div>발행일 : ' + todayStr + '</div>'
          + '<div>거래기간 : ' + yr + '년 ' + mo + '월</div>'
        + '</div>'
        + '<div class="ts-parties">'
          + '<div class="ts-party">'
            + '<div class="ts-party-head">공급자 (Supplier)</div>'
            + '<table>'
              + '<tr><td>상호</td><td><strong>주식회사 하이브 (HIVE Co., Ltd.)</strong></td></tr>'
              + '<tr><td>대표자</td><td>—</td></tr>'
              + '<tr><td>주소</td><td>강원특별자치도 원주시</td></tr>'
              + '<tr><td>업태/종목</td><td>제조업 / 식용유·폐유 자원순환</td></tr>'
              + '<tr><td>담당</td><td>010-9123-7042</td></tr>'
            + '</table>'
          + '</div>'
          + '<div class="ts-party">'
            + '<div class="ts-party-head">공급받는자 (Buyer)</div>'
            + '<table>'
              + '<tr><td>상호</td><td><strong>' + (biz.name || '-') + '</strong></td></tr>'
              + '<tr><td>대표자</td><td>' + (biz.owner || '-') + '</td></tr>'
              + '<tr><td>주소</td><td>' + (biz.addr || '-') + '</td></tr>'
              + '<tr><td>업태/종목</td><td>' + (biz.type || '-') + '</td></tr>'
              + '<tr><td>연락처</td><td>' + (biz.phone || '-') + '</td></tr>'
            + '</table>'
          + '</div>'
        + '</div>'
        + (oilDoneList.length > 0 ? (
          '<div class="ts-section-title">📦 식용유 납품 내역 <span style="font-size:10px;font-weight:500;color:#888;">(VAT 포함가)</span></div>'
          + '<table class="ts-table">'
            + '<thead><tr>'
              + '<th style="width:6%;">No.</th>'
              + '<th style="width:10%;">일자</th>'
              + '<th style="width:38%;">품목</th>'
              + '<th style="width:10%;">수량</th>'
              + '<th style="width:16%;">단가</th>'
              + '<th style="width:20%;">합계</th>'
            + '</tr></thead>'
            + '<tbody>' + oilRows + '</tbody>'
            + '<tfoot><tr>'
              + '<td colspan="3" style="text-align:center;">소계</td>'
              + '<td class="ts-qty">' + deliveryCnt + '캔</td>'
              + '<td></td>'
              + '<td class="ts-num">' + fmt(totalDelivery) + ' 원</td>'
            + '</tr></tfoot>'
          + '</table>'
        ) : '')
        + (wasteList.length > 0 ? (
          '<div class="ts-section-title" style="border-left-color:#FF6B00;">♻️ 폐식용유 수거 내역 <span style="font-size:10px;font-weight:500;color:#888;">(VAT 포함가)</span></div>'
          + '<table class="ts-table">'
            + '<thead><tr style="background:#FF6B00;">'
              + '<th style="width:6%;background:#FF6B00;border-color:#FF6B00;">No.</th>'
              + '<th style="width:10%;background:#FF6B00;border-color:#FF6B00;">일자</th>'
              + '<th style="width:38%;background:#FF6B00;border-color:#FF6B00;">품목</th>'
              + '<th style="width:10%;background:#FF6B00;border-color:#FF6B00;">수량</th>'
              + '<th style="width:16%;background:#FF6B00;border-color:#FF6B00;">단가</th>'
              + '<th style="width:20%;background:#FF6B00;border-color:#FF6B00;">합계</th>'
            + '</tr></thead>'
            + '<tbody>' + wasteRows + '</tbody>'
            + '<tfoot><tr>'
              + '<td colspan="3" style="text-align:center;">소계</td>'
              + '<td class="ts-qty">' + wasteCnt + '캔</td>'
              + '<td></td>'
              + '<td class="ts-num">' + fmt(totalWaste) + ' 원</td>'
            + '</tr></tfoot>'
          + '</table>'
        ) : '')
        + '<div class="ts-totals">'
          + '<div class="ts-totals-row"><span>📦 식용유 납품 합계</span><strong>' + fmt(totalDelivery) + ' 원</strong></div>'
          + (totalWaste > 0 ? '<div class="ts-totals-row"><span>♻️ 폐식용유 수거 합계</span><strong style="color:#FF6B00;">' + fmt(totalWaste) + ' 원</strong></div>' : '')
          + '<div class="ts-totals-row final"><span>💰 정산 청구액</span><span>' + fmt(netAmount) + ' 원</span></div>'
        + '</div>'
        + '<div class="ts-stamp">'
          + '<div class="ts-stamp-box">㈜하이브<br>인</div>'
        + '</div>'
        + '<div class="ts-foot">'
          + '본 거래명세서는 식용유니버스 시스템에서 자동 생성됐습니다 · ' + docNo
          + '<br>※ 모든 금액은 부가세 포함가입니다.'
        + '</div>'
      + '</div>'
    + '</div>';

  document.body.appendChild(modal);
}

function openHometax(bizId,month,type){
  window.open('https://www.hometax.go.kr/websquare/websquare.wss?w2xPath=/ui/pp/index_pp.xml&menuCd=SX0101','_blank');
  showToast('t1','📄 홈택스로 이동','발행 후 아래에서 완료 처리해주세요');
}
function toggleWasteTaxInvoice(bizId,month,issued){
  const key=getBillingKey(bizId,month);billingData[key]=billingData[key]||{};billingData[key].wasteTaxIssued=issued;
  saveBillingData();renderBilling();
  if(issued){
    window.open('https://www.hometax.go.kr/websquare/websquare.wss?w2xPath=/ui/pp/index_pp.xml&menuCd=SX0101','_blank');
    showToast('t1','📄 폐유 계산서 발행','홈택스에서 발행 후 완료 처리해주세요');
  } else {
    showToast('t1','↩ 폐유 계산서 취소','정산 현황 업데이트');
  }
}
function toggleTaxInvoice(bizId,month,issued){
  const key=getBillingKey(bizId,month);billingData[key]=billingData[key]||{};billingData[key].taxInvoice=issued;
  saveBillingData();renderBilling();showToast('t1',issued?'✅ 계산서 발행완료':'↩ 발행취소','정산 현황 업데이트');
}
function markPaid(bizId,month,paid){
  const key=getBillingKey(bizId,month);billingData[key]=billingData[key]||{};billingData[key].paid=paid;
  if(paid)billingData[key].paidDate=new Date().toISOString().slice(0,10);
  saveBillingData();renderBilling();showToast('t1',paid?'✅ 입금완료':'↩ 미수로 변경','정산 현황 업데이트');
}

// ============================================================
// PWA — 구버전 캐시 자동 삭제 + 최신 파일 강제 로드
// ============================================================
// SW 등록 (캐시 없이 항상 네트워크 우선 - sw.js v2.0)
if ('serviceWorker' in navigator) {
  // 기존 SW 모두 해제 후 재등록 (구버전 캐시 완전 제거)
  navigator.serviceWorker.getRegistrations().then(function(regs) {
    return Promise.all(regs.map(function(r) { return r.unregister(); }));
  }).then(function() {
    return caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) { return caches.delete(k); }));
    });
  }).then(function() {
    return navigator.serviceWorker.register('sw.js');
  }).then(function(reg) {
    console.log('[SW] 등록 완료:', reg.scope);
  }).catch(function(err) {
    console.warn('[SW] 등록 실패:', err);
  });
}

// 홈화면 배너 비활성화
function installPWA() {
  var banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('hiveoil_home_banner_dismissed', '1');
  showIOSInstallGuide();
}

function showIOSInstallGuide() {
  var guide = document.getElementById('iosInstallGuide');
  if (guide) { guide.style.display = 'flex'; return; }
  var div = document.createElement('div');
  div.id = 'iosInstallGuide';
  div.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#1F4D30;color:#fff;padding:20px 20px 40px;z-index:10000;border-radius:20px 20px 0 0;box-shadow:0 -4px 20px rgba(0,0,0,0.3);';
  div.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">'
    + '<div style="font-size:15px;font-weight:800;">📱 홈 화면에 추가하기</div>'
    + '<button onclick="this.parentElement.parentElement.remove()" style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:28px;height:28px;color:#fff;font-size:16px;cursor:pointer;">✕</button>'
    + '</div>'
    + '<div style="font-size:13px;line-height:1.9;color:rgba(255,255,255,0.9);">'
    + '① Safari 하단의 <strong style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:5px;">공유 버튼 🔗</strong> 을 탭하세요<br>'
    + '② 스크롤하여 <strong style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:5px;">홈 화면에 추가</strong> 를 탭하세요<br>'
    + '③ 오른쪽 위 <strong style="background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:5px;">추가</strong> 를 탭하면 완료!'
    + '</div>';
  document.body.appendChild(div);
}
function dismissInstallBanner() {
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('hiveoil_home_banner_dismissed', '1');
}

