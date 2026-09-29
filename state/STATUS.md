# FLECTO 실행 상태

갱신: 2026-09-29 13:55 KST. 사용자 목표는 제품·UI·검증·30초 광고 완성, 마감은 오늘16:00이다. 자세한 다음 행동은 [NEXT_ACTION](NEXT_ACTION.md)을 따른다.

| 항목 | 실제 상태 |
|---|---|
| 실행 모드 | CONTEST / SESSION_LOOP, native multi-agent v1 |
| 개발 역할 | Astra Ultra 통합·코어·검증, Opus5.5 max UI·영상, Fable5.1 max 독립 검토·광고 구성 |
| 제품 코드 | MV3 확장, 여섯 템플릿, 원본 DOM 연결, local planner/cache, 합성 원본 서비스2개 구현 |
| G0 | PASS — 확장 입력·동의·원본 handler·원본 DB 저장까지 실제 브라우저 확인 |
| 구매 혜택 | FIXTURE 정상 전체 이동·확인·원본 저장1건 확인 |
| 문화센터 | FIXTURE React 단계 이동·입력 유지·원본 예약1건 확인 |
| 모듈 검사 | 현 코드 기준 단위·통합361개 PASS, typecheck PASS |
| 전체 T01–T40 | 아직 전체 실행 전. 안전·holdout·경합 E2E 추가 중 |
| 제품 Codex | 도구 없는 실제 CLI 계획·합성 이미지 probe PASS; 두 사이트 cold각3회는 준비 중 |
| 캐시 | exact/compatible 재연결·검증된 구조만 재사용; 최신 원본값 유지 |
| 시각 보완 | 가림·캡처 모듈 구현, 실제 전송 연결·양성 경로 검증 진행 중 |
| 운영 도구 | doctor/reset/release/guard 모듈 구현·검사; MANAGED_TESTED 아님 |
| Chrome 수동 | 격리 테스트 Chrome 도구 막대 실제 활성화 확인; OS IME/저장 자동완성/200% 최종 확인은 미실행 |
| 광고 영상 | 검증 화면6개 확보; Fable 제작 프롬프트 → Opus30초 영상 제작 진행 |
| ElevenLabs | Creator 계정 UI에서 잔여131000크레딧 확인, 연결된 생성 도구 확인, 추가결제 미승인 |
| GitHub | 공개 kkwjk2718/flecto; feat/flecto-product 제품 개발 브랜치 |
| 출고·제출 | 최종 패키지 미생성, actual submitted=false |

## 실행 기반

- 프로젝트 전용 Node24.21.0/npm11.19.0: `source .flecto/env.sh`. 전역 Node 변경 없음.
- Codex 앱 번들 CLI0.158.0-alpha.2.1과 PATH의 별도CLI0.147.0을 구분한다.
- OpenCodex2.70.0 health/ready 확인, Opus5.5 실제 파일 작업·통합 완료.
- Astra 컨텍스트 설정872000, 현재 대화 가용828400, 자동압축784800 확인. Opus 카탈로그1000000.
- 원본 Markdown82개는 전체 읽었고 archive13개를 보존했다. [검토 목록](DOCUMENT_REVIEW.md).

## 주요 검증과 개선

- UI 보호시간500ms와 disabled 표시 불일치를 Fable 독립 진단으로 찾고 수정했다.
- 브라우저 fetch의 this 바인딩·DELETE 요청 body/header 문제를 실제 설치 확장 시험으로 찾고 수정했다.
- 긴 약관을 자르지 않는 Codex 압축 프롬프트, 짧은 요청별ref별칭, PROMPTv2/CACHEv2를 통합했다.
- 사용자 선택에 따른 의존 선택지 갱신, 원본 확인 내용 변경 시 제출확인 무효화를 추가했다.
- 후원 카드는3초 초과 준비에서만 한 세션 최대1회, 준비완료/취소/기한에 종료한다.

`npm run check`는 문서 검사다. 위 모듈 검사 수는 T01–T40 전체 PASS를 의미하지 않는다. 과거 캡처·LIVE 결과는 새 artifact의 증거로 자동 승격하지 않는다.
