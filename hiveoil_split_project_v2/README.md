# HIVEOIL 분리본 v2

## 실행 방법
`fetch()`로 `pages/*.html`을 불러오기 때문에 `index.html`을 더블클릭하지 말고 로컬 서버에서 실행하세요.

```bash
python -m http.server 5500
```
브라우저에서 `http://localhost:5500` 접속

## 구조
- `index.html`: 공통 레이아웃/사이드바/상단바/페이지 로더
- `pages/*.html`: `panel-*` 기준 페이지 조각 27개
- `assets/css/styles.css`: 기존 CSS 분리
- `assets/js/init.js`: 빌드/전역 에러/모바일 새로고침 방지 초기 스크립트
- `assets/js/boot.js`: 페이지 조각 로딩 후 `app.js` 실행
- `assets/js/app.js`: 기존 기능 JS + 카카오맵 로딩 보강

## 카카오맵 안 되는 주요 원인과 수정
1. 분리 후 `app.js`가 `pages/map.html`보다 먼저 실행되면 `#naverMap`이 없어 지도 초기화가 실패합니다. → `boot.js`가 모든 페이지를 먼저 로드한 뒤 `app.js`를 실행하도록 수정했습니다.
2. 카카오 SDK가 완전히 준비되기 전 `new kakao.maps.Map()`을 호출하면 실패합니다. → SDK를 `autoload=false`로 명시하고, `kakao.maps.load()` 완료 후 지도 생성하도록 보강했습니다.
3. `index.html`을 파일 더블클릭으로 열면 페이지 조각 `fetch()`와 카카오 SDK 도메인 제한 때문에 실패할 수 있습니다. → 서버 실행 필요.
4. 카카오 개발자 콘솔의 JavaScript 키 도메인에 실제 접속 도메인/포트가 등록되어 있어야 합니다. 예: `http://localhost:5500`, GitHub Pages 도메인 등.
