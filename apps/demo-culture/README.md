# 한빛 생활문화센터 — FLECTO 독립 원본 B (React SPA)

FLECTO 없이 직접 쓸 수 있는 합성 문화센터 사이트다. 로그인 → 강좌 목록 → 강좌(radio)·시간(select) → 신청자 이름·휴대전화 → 안내·동의 → 검토 → 신청 → 접수 결과·신청 내역. 모든 강좌·계정·주소는 가상이다.

## 서버 팩토리

```ts
import { createCultureServer } from './src/server';
const app = createCultureServer({ dbPath, sessionSecret, namespace: 'QA' | 'DEMO', qaToken?, assetsDir? });
await app.listen({ host: '127.0.0.1', port: 4174 }); // import만으로는 listen하지 않는다
```

- `sessionSecret`·`qaToken`은 16자 이상. `qaToken`이 없으면 `/__qa/*` 경로 자체가 등록되지 않는다.
- DB 파일에 namespace가 기록되며 다른 namespace로 열면 예외를 던진다.
- `assetsDir` 기본값은 `apps/demo-culture/dist`. 없으면 SPA 경로는 503 안내를 반환한다.
- 빌드: 저장소 루트에서 `vite build --config apps/demo-culture/vite.config.ts`.
- 수동 실행: `tsx apps/demo-culture/src/start.ts` (환경변수 `CULTURE_PORT`, `CULTURE_NAMESPACE`, `CULTURE_DB_PATH`, `CULTURE_SESSION_SECRET`, `CULTURE_QA_TOKEN`, `CULTURE_ASSETS_DIR`).

## HTTP 경로

| 경로 | 설명 |
| --- | --- |
| `POST /api/login` `{userId, password}` | 합성 계정 `demo` / `flecto2026!`. 쿠키 `flecto_culture` (서명, HttpOnly, SameSite=Lax, 8시간) |
| `POST /api/logout` | 서버 세션 삭제 |
| `GET /api/session` | `{authenticated, user}` |
| `GET /api/courses` | 강좌·시간·정원·잔여석 (항상 최신 DB 값) |
| `GET /api/reservations` | 로그인 사용자의 신청 내역 |
| `POST /api/reservations` `{submissionId, courseId, timeId, applicantName, phone, consent:true}` | 201 접수. 같은 submissionId 재전송은 200 `duplicate:true`로 같은 접수 반환. 400 `VALIDATION`/`TIME_NOT_FOUND`, 409 `CAPACITY_FULL`(제출 시점 최신 정원, `latest` 포함)/`ALREADY_RESERVED`/`SUBMISSION_REUSED`, 401 `LOGIN_REQUIRED` |
| `GET /__qa/records` | QA 전용. 헤더 `x-flecto-qa-token`. 원본 DB 신청·정원 |
| `POST /__qa/reset` | QA 전용. 합성 신청 삭제·정원 기본값 복원 (로그인 세션 유지) |
| `POST /__qa/capacity` `{courseId|course, timeId|time, capacity}` | QA 전용. 정원 변경 |

토큰이 없거나 틀리면 QA 경로는 404다.

## 합성 fixture

| courseId | timeId | 기본 정원 |
| --- | --- | --- |
| yoga | yoga-tue-thu-1000 / yoga-tue-thu-1900 | 12 / 10 |
| painting | painting-wed-1400 / painting-sat-1000 | 8 / 8 |
| digital | digital-mon-wed-1000 / digital-fri-1400 | 15 / 6 |

접수 번호 형식 `HB-YYYYMMDD-NNNN` (reset 뒤에도 번호는 재사용하지 않음). 결과 화면은 `role="status"` 영역 안의 `<output aria-label="접수 번호">`에 서버 응답 값을 표시한다.

