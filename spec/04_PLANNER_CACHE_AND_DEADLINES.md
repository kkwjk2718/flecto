# Codex 계획·재사용·시각 보완·시간 제한

## 두 경로를 일찍 분리한다

Provider interface는 `plan(publicSnapshot, remainingBudget, signal)`이다. fixture 구현은 개발 검사에서만 사용하고, LIVE 실행 구성에서 fallback으로 끼워 넣지 않는다. 제품 API가 인증 실패했을 때 fixture 성공으로 조용히 바꾸는 코드는 금지한다.

실제 Codex 어댑터는 승인된 전용 runtime 설정과 작업 폴더를 사용한다. 개발 repo·Keychain·개인 HOME·브라우저 쿠키 접근 권한을 넘기지 않는다. 기본 도구가 활성화되는지 실제 SDK/CLI 버전에서 검사하고 필요한 schema 계획 외 도구는 제한한다. 읽기 전용 설정 하나만으로 모든 데이터 유출이 차단된다고 가정하지 않는다. [S05–S06]

## 첫 화면과 첫 목표

LLM 없이 원본의 확인된 공개 링크·작업 버튼을 큰 버튼으로 먼저 표시할 수 있다. 표시 가능한 작업이 없으면 원본 유지/목표 입력을 제시한다. `추천 작업`을 과거 사이트 이름에 맞춰 하드코딩하지 않는다.

사용자가 목표를 선택한 순간부터 준비 deadline을 계산한다. native 메뉴 navigation과 same-page local step을 구분한다. 보지 않은 전체 단계 수와 미래 페이지 내용을 모델이 추정해서 확정하지 않는다.

## 캐시의 세 층

- 템플릿: 코드로 만든 레이아웃·상호작용.
- 현재 plan: 현재 document의 ref를 사용하는 일시 제안.
- blueprint: 현재 요소에 다시 연결할 의미·조건·안내 관계와 버전.

DB는 blueprints(CANDIDATE/VERIFIED/QUARANTINED), plan_runs, sponsor_aggregate 정도로 시작한다. 개인정보 입력·쿠키·개인 선택·캡처·다른 사용자 ref는 저장하지 않는다. 의미 hash에 개인값을 넣고 익명이라고 주장하지 않는다.

후보 조회→현재 고유 요소로 재연결→필수·고지·행동 재검사→사용. 같은 이름의 첫 버튼을 선택하지 않는다. 핵심 required/form/action/notice 변경은 무효화한다. 단순 장식 class/광고/타이머는 구조 key에서 제외한다. 가격·정원·선택지·실제 값은 원본에서 최신으로 다시 읽는다.

처음에는 같은 사이트·업무의 정확한 구조 매칭을 우선한다. 두 번째 사이트와 공통인 것은 템플릿 코드이지 첫 사이트의 행동 대상이 아니다. 새 모델·prompt/schema/cache 버전이면 근거와 캐시 재검증 범위를 갱신한다.

## 요청 경합

제품 신규 계획 동시1. 같은 탭·문서·목표·snapshot에 대한 중복 요청은 같은 결과를 기다리되 개인값을 공유하지 않는다. 다른 목표가 오면 사용자 정책에 따라 이전 요청을 취소하고 새 ID를 만든다. 탭마다 혼동 없는 ID를 사용한다. 긴 대기열 대신 BUSY 또는 취소 선택을 제공하며 큐 대기도 10초 안에 포함한다.

서버는 클라이언트가 보낸 무제한 deadline을 신뢰하지 않고 남은 budget을 10초 정책 안에서 clamp한다. 클라이언트는 monotonic elapsed, 서버는 받은 시점의 제한 budget을 각각 관리한다. 벽시계가 바뀌어도 대기를 무한 연장하지 않는다.

## 3초와 10초

- 즉시 shell·취소·원본 보기. 조작은 검증 전 비활성.
- elapsed > 3000ms이고 여전히 PREPARING이면 후원 카드 표시 가능.
- 준비 완료와 타이머가 같은 이벤트 주기에 들어오면 READY가 광고보다 우선이다.
- elapsed >= 10000ms면 TIMED_OUT. 광고·로딩 종료, 취소 시도, 늦은 결과 폐기.
- 탭 전환·숨김·sleep 중 타이머가 제한될 수 있으므로 복귀 때 즉시 기한을 대조한다. 기기 정지 상태에서도 10초 정밀 표시가 보장된다고 하지 않는다.

`requestId/document/semanticRevision/goal/sessionEpoch`와 terminal state를 결과 적용 직전 확인한다. 취소 요청과 원격 계산 중지 성공은 별개다. 아직 끝나지 않은 자기 provider process는 별도 정리하고 무제한 유령 추론을 쌓지 않는다.

## DOM → 시각 보완

사유는 `VISUAL_RELATION_AMBIGUOUS`로 제한한다. network/auth/permission/stale/ref 없음에는 사용하지 않는다. DOM 요소는 실제 존재해야 한다. 텍스트 모델이 이미 제한 시간을 다 사용한 뒤 새 10초를 주며 이미지를 호출하지 않는다.

클라이언트에서 합성 허용 페이지의 필요한 영역만 캡처하고 가림 처리한다. 캡처 직전·직후 활성 탭·document·revision이 같아야 한다. FLECTO·광고를 캡처하지 않는다. 원본 값을 숨겼다가 복구할 때 실제 입력 상태를 바꾸지 않는다. 가림 보장을 확인 못 하면 전송하지 않는다.

이미지 입력 기능은 모델 목록과 실제 합성 이미지 시험으로 확인한다. 남은 budget으로 캡처·호출·최종 검증이 불가능하면 원본으로 보낸다. 시각 보완은 core 제품 차단 조건이 아니지만 미구현일 때 명확히 표시하고 FULL 조건의 추가 VISION 검사 결과를 기록한다.

## 검증된 출력만 표시

모델 stream의 미완성 JSON을 실행하지 않는다. request가 끝나 schema→의미→현재 DOM 검사까지 통과해야 READY다. output 형식 오류는 일반 provider error와 나누어 측정한다. 고정 컴포넌트로 fallback해도 source coverage를 검증하지 않았으면 성공으로 표시하지 않는다.
