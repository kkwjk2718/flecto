# 실행 설정 양식 — 실제 실행 전에 채울 것

현재 상태는 모두 제안 또는 미확인이다. 이 파일을 생성했다고 실행을 승인한 것이 아니다.

| 키 | 초기값 | 의미 |
|---|---|---|
| mode | PREPARE | 환경 점검·승인된 준비. 코드 개발은 규정·사용자 시작 지시 후 |
| timezone | Asia/Seoul | 실제 Mac 시각과 함께 기록 |
| event_date | 2026-09-29 (기존 계획) | 현장 안내 확인 전 실행 확정 값 아님 |
| development_client | UNSELECTED | 현재 실행한 승인 클라이언트 기록 |
| development_model | UNSELECTED | 특정 이름 기본값 없음 |
| orchestration | UNVERIFIED | SESSION/NATIVE/MANAGED 실제 지원 확인 |
| initial_workers | 2 | 환경·통합 준비 뒤4, 조건충족 때 최대8 |
| max_workers | 8 | 최적값이나 실제 계정 허용량 아님 |
| heavy_slots | 1 | 설치·build·E2E·영상 전체 |
| product_slots | 1 | 제품 신규 설계 |
| image_slots | 1 | 선택 에셋 |
| product_runtime | Codex, UNCONFIGURED | 기존 제품 결정, 모델 ID 미선정 |
| image_route | OPTIONAL_UNVERIFIED | 미확인 시 기본 에셋 |
| spending_approval | UNAPPROVED | 실제 사용자가 승인한 범위 필요 |
| packaging_submitted | false | 외부 제출 확인 전 변경 금지 |

## 내부 CONTEST 일정안

- 13:30 신규 이미지 종료
- 14:20 큰 신규 기능 티켓 시작 종료
- 14:45 기능 동결
- 15:35 개발 코드·개발 LLM 호출 종료
- 16:05 패키지 확정
- 16:30 제출 목표

공식 규정이 변경되면 실제 실행 전에 근거와 함께 조정한다. 시작이 늦었다고 자동으로 연장하지 않는다. REHEARSAL은 별도 시작/종료를 기록하고 실제 대회 날짜를 실행 타이머로 무조건 사용하지 않는다.

## 예산

지원 구독/API의 실제 제한·청구경로·현재 승인 한도·소진 시 동작을 기록한다. 확인하지 못한 잔여 토큰은 UNKNOWN이다. 무제한·자동 충전·계정회전은 기본값이 아니다. 제품 시연과 이미지가 같은 계정이면 사용량을 공유할 수 있으므로 별도 폴더가 한도를 늘려 준다고 생각하지 않는다.

## 미래 머신 설정 파일

실행기가 필요하면 이 양식의 실제 확인값으로 `.flecto/run-settings.json`을 만든다. 예시 값과 승인·실측값을 구분하고 schema로 검증한다. 없는 JSON을 이미 있다고 가정하지 않는다.
