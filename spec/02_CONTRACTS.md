# 단일 데이터 계약·버전 관리

스키마와 TS 타입의 원천을 `packages/contracts` 한 곳으로 둔다. 리드/계약 소유자가 관리하고 unknown field·최대 길이·참조 중복·허용 enum을 명시한다. 이 파일의 예시는 앞으로 구현할 계약이며 존재하는 API가 아니다.

## 공개·비공개 데이터 분리

| 계약 | 내용 | 경계 |
|---|---|---|
| PublicPageSnapshot | schemaVersion, requestId, snapshotId, 구조 revision, 정제 목표, 공개 controls/notices/options | 모델에 전달 가능한 허용된 합성·공개 구조만 |
| PrivateBindingRegistry | ref→실제 Element, 현재 사용자 값, 원본 오류·개인 결과, document instance | content memory 내부. 공유 로그/캐시/모델 전송 금지 |
| PagePlan | 여섯 template, 확인된 ref, 안내 원문 ref, 순서, original action ref | 실행 코드·선택자·임의 URL 없음 |
| CachedBlueprint | semantic locator·조건·안내 관계·템플릿·버전 | 현재 ref와 사용자 값을 제거한 재연결 후보 |
| ActionReceipt | actionId/document/target/status/근거 종류 | APPLIED는 DOM 반영일 뿐 원본 서버 성공과 다름 |
| RunMetric | 모드·지연·검증 결과·노출 집계·버전 | 모델 사용량 미확인은 null, 민감 값은 포함 안 함 |

## 참조와 revision

`documentInstanceId`: 새 문서마다 다른 nonce. `semanticRevision`: 필수·동의·form/action·중요고지 변경 때 증가. `optionRevision`: 강좌·정원·선택지 변경. 사용자 입력 변경은 private value revision이며 모델 재호출의 직접 이유가 아니다.

리뷰 확인 토큰은 document+semanticRevision+privateValueRevision에 묶는다. 제출 전에 하나라도 바뀌면 다시 확인하게 한다. fingerprint가 같아도 reference는 새 문서에서 재생성한다.

## 행동 타입을 코드부터 분리

```typescript
// 스키마를 구현할 때의 방향 예시. 지금 존재하는 타입 정의가 아니다.
type UserAction =
  | { kind: 'LOCAL_NEXT'; fromStep: string }
  | { kind: 'LOCAL_BACK'; fromStep: string }
  | { kind: 'SET_TEXT'; ref: string; value: string }
  | { kind: 'SET_CHOICE'; ref: string; optionRef: string }
  | { kind: 'SET_CONSENT_FROM_USER'; ref: string; checked: boolean }
  | { kind: 'INVOKE_SOURCE'; ref: string; intent: 'navigate' | 'submit' };
```

SET_TEXT의 value는 브라우저 내부 명령이다. 동일 타입을 제품 서버 endpoint에 그대로 보내지 않는다. LOCAL_NEXT는 원본 click/submit을 실행할 수 없다. 모델은 마지막 승인을 했다고 표시할 수 없다.

## PagePlan 예시

```json
{
  "schemaVersion": 1,
  "snapshotId": "snapshot-example",
  "steps": [
    {"template": "grouped_form", "title": "주문 정보를 입력해 주세요", "controlRefs": ["e17", "e21"], "noticeRefs": ["n03"]},
    {"template": "consent", "title": "안내 내용을 확인해 주세요", "controlRefs": ["e24"], "noticeRefs": ["n04"]}
  ],
  "sourceActionRef": "e29"
}
```

소스에서 발견되지 않은 참조·중복 필수 입력·다른 form 소속·지원하지 않는 template은 거절한다. 입력 순서와 안내는 모델이 제안하되 required set과 고지 coverage는 코드가 확인한다. 금액·기한·자격·동의 원문은 model paraphrase가 아니라 원문 ref로 표시한다. 의미 동등성을 코드만으로 전부 증명한다는 표현은 쓰지 않는다.

## HTTP 계약안

| 경로 | 입력·출력 | 보호 |
|---|---|---|
| GET /health | 서버·스키마·버전·준비 상태 | 토큰·환경변수·실제 프롬프트 출력 금지 |
| POST /v1/plans | public snapshot, remainingBudgetMs, request nonce → plan/mode/version | 입력 allowlist·크기제한·고정 모델·동시1 |
| DELETE /v1/plans/:id | 자신이 요청한 ID 취소 | 다른 세션·프로세스 취소 금지 |
| POST /v1/blueprints/:id/verify | 현재 검사 상태·revision → 후보 승격 여부 | 인증된 확장 채널, 같은 snapshot/plan 연결 |
| POST /v1/metrics | 허용된 비개인 기록 | 자유 텍스트·값·URL·쿠키 금지 |

서버가 브라우저의 성공 주장을 맹목적으로 신뢰해서 캐시를 안전하다고 인증하지 않는다. 신뢰 범위는 전용 합성 테스트·인증된 확장이고, 매 사용 시 다시 DOM 검사한다. client ACK는 범용 사이트 안전 증명이 아니다.

## 오류 코드

AUTH_REQUIRED, UNSUPPORTED_CONTROL, REQUIRED_MISSING, AMBIGUOUS_TARGET, STALE_DOCUMENT, SCHEMA_INVALID, BUSY, DEADLINE_EXCEEDED, PROVIDER_ERROR, SOURCE_REJECTED, OUTCOME_UNKNOWN, CANCELLED.

사용자에게 내부 스택을 보여주지 않고 안전한 행동을 안내한다. 로그에는 error enum과 근거 ID만 남긴다. local/fixture 오류를 실제 공급자 성공으로 바꾸지 않는다.

## 계약 변경

변경 이유·영향 작업·새 스키마 버전·마이그레이션·재검사 범위를 CHANGE_REQUEST로 기록한다. 한 작성자가 변경한다. 이전 버전 worker 결과는 자동 병합하지 않는다. 모델이 바뀌어도 이 제품 계약은 그대로 지킨다.
