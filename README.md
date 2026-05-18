# HIVEOIL 페이지 분리본

## 구조
- `index.html`: 공통 레이아웃, 사이드바, 상단 외부 라이브러리 로드
- `pages/*.html`: 기존 `panel-*` 화면을 페이지별로 분리
- `assets/css/styles.css`: 기존 `<style>` 전체 분리
- `assets/js/app.js`: 기존 인라인 JavaScript 전체 분리
- `assets/js/page-routes.js`: 페이지 조각 목록
- `assets/js/load-pages.js`: `app.js` 실행 전에 페이지 조각을 먼저 삽입

## 실행 방법
브라우저에서 `index.html`을 더블클릭하면 페이지 조각 로딩이 막힐 수 있습니다. 아래처럼 로컬 서버로 실행하세요.

```bash
python -m http.server 5500
```

접속:

```text
http://localhost:5500
```

## 분리 기준
총 33개 패널을 분리했습니다.

- `panel-owner-dash` → `pages/owner-dash.html`
- `panel-owner-login` → `pages/owner-login.html`
- `panel-driver-login` → `pages/driver-login.html`
- `panel-hq-login` → `pages/hq-login.html`
- `panel-fr-hq-login` → `pages/fr-hq-login.html`
- `panel-fr-hq-dashboard` → `pages/fr-hq-dashboard.html`
- `panel-fr-store-signup` → `pages/fr-store-signup.html`
- `panel-dashboard` → `pages/dashboard.html`
- `panel-map` → `pages/map.html`
- `panel-billing` → `pages/billing.html`
- `panel-waste` → `pages/waste.html`
- `panel-order` → `pages/order.html`
- `panel-owner-history` → `pages/owner-history.html`
- `panel-history` → `pages/history.html`
- `panel-price` → `pages/price.html`
- `panel-price-view` → `pages/price-view.html`
- `panel-esg` → `pages/esg.html`
- `panel-owner` → `pages/owner.html`
- `panel-qr` → `pages/qr.html`
- `panel-consumer` → `pages/consumer.html`
- `panel-franchise-admin` → `pages/franchise-admin.html`
- `panel-franchise-brand-detail` → `pages/franchise-brand-detail.html`
- `panel-esg-school` → `pages/esg-school.html`
- `panel-school-admin` → `pages/school-admin.html`
- `panel-esg-franchise` → `pages/esg-franchise.html`
- `panel-support` → `pages/support.html`
- `panel-privacy` → `pages/privacy.html`
- `panel-terms` → `pages/terms.html`
- `panel-apply` → `pages/apply.html`
- `panel-register` → `pages/register.html`
- `panel-admin` → `pages/admin.html`
- `panel-security` → `pages/security.html`
- `panel-schedule` → `pages/schedule.html`
