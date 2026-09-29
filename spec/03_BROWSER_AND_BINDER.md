# 브라우저 세션·원본 요소 연결·오류 복구

## 가장 먼저 확인할 최소 흐름

고정된 작은 테스트 plan을 사용해 FLECTO 입력→원본 native/React 입력→원본 submit handler→원본 DB가 실제로 연결되는지 확인한다. 이 초기 plan은 fixture임을 표시하고 LIVE라고 부르지 않는다. Codex 인증을 기다리지 않고 이 흐름을 개발할 수 있다.

## 원본 보존

원본 DOM을 제거·복제·재생성하지 않는다. body 전체를 숨기지 않는다. 콘텐츠 스크립트의 격리 실행 환경과 원본 JS 상태는 다르므로 framework private state를 직접 읽는 방법을 기본 구현으로 삼지 않는다. [S08]

집중형 UI는 자체 host/shadow 영역에 두어 스타일 충돌을 줄인다. DOM visibility 검사는 덮개 때문에 가려진 것을 원본 hidden으로 오인하지 않게 설계한다. overlay 자체·광고·로딩 변화를 원본 mutation으로 분석하지 않는다.

## 추출

label-for, wrapping label, aria-label/labelledby, legend/fieldset, aria-describedby와 native required/type/min/max/pattern을 우선 읽는다. 숨은 input·password/OTP·비공개 계정 영역은 제외한다. 불필요 주변 HTML을 무한 수집하지 않는다. 필수 정보를 잘라 token budget을 맞추지 않는다. 커버 범위를 확인 못 하면 원본에서 계속하게 한다.

## 입력 어댑터

1. FLECTO 입력값은 즉시 로컬 상태에 저장한다.
2. 한국어 composition 중에는 정규화·단계 이동·강제 화면 재생성을 하지 않는다.
3. 타입별 setter/event 경로로 원본에 반영한다.
4. 원본 다음 렌더와 validation 결과를 다시 읽는다.
5. 표시값만 바뀌고 상태가 되돌아오면 성공으로 처리하지 않는다.

체크박스는 사용자 의도에서만 변경하며 텍스트 setter를 재사용하지 않는다. radio/select는 최신 실제 option을 참조한다. 사라진 시간·마감된 강좌는 선택 불가로 갱신한다. React controlled input에서 DOM 표시값만 바꾸는 것은 충분하지 않을 수 있으므로 실제 handler·재렌더·제출까지 검사한다. [S13]

`isTrusted` 위조·CAPTCHA 우회는 하지 않는다. 합성 이벤트를 거부하는 서비스는 미지원으로 처리한다. MAIN-world bridge가 필요하면 제한된 정적 어댑터만 따로 검토하고 임의 코드 실행 통로를 열지 않는다.

## 동기화와 충돌

MutationObserver는 value property 변화 전부를 관찰하는 수단이 아니다. input/change, 동작 후 재읽기, 중요한 변경의 제한된 관찰을 함께 쓴다. 브라우저 메모리 안의 privateValueRevision을 별도로 둔다.

원본과 FLECTO 양쪽 변화에 version/source marker를 붙여 동기화 무한 루프를 막는다. 원본이 사용자가 입력 중인 값을 바꿨으면 기존 입력을 조용히 덮어쓰지 말고 `원래 화면의 정보가 바뀌었어요`와 선택을 제공한다. 이 값은 서버 로그에 쓰지 않는다.

## 제출

확인은 실제 로컬 값과 원문으로 만든다. 제출 직전 document, semanticRevision, review token, target identity, form 소속, disabled 상태를 검사한다. 즉시 SUBMITTING으로 바꾸고 중복 클릭·Enter를 막는다. 원본 submit 버튼의 정상 경로로 실행하며 native validation을 우회하는 form.submit을 사용하지 않는다.

결과는 `SUCCESS / SOURCE_REJECTED / OUTCOME_UNKNOWN`이다. 결과 페이지의 공개 처리 상태와 전환 근거를 보되 단순 '완료'라는 단어만 찾지 않는다. QA는 원본 DB의 실제 기록과 비교한다. source service마다 내부 API를 외워서 대신 저장하지 않는다.

원본 응답이 늦거나 유실되면 자동 재제출하지 않는다. 테스트 서버의 unique/idempotency는 원본 서비스 기능으로 두고 FLECTO의 범용 exactly-once 보장이라고 하지 않는다.

## 문서 이동과 인증

새 문서에서는 모든 elementRef를 폐기한다. 활성 탭·origin·목표 종류 등 비개인 상태는 필요한 만큼 session 저장소에 두되, background 전역 변수만 믿지 않는다. MV3 service worker는 종료·재시작될 수 있다. [S10]

full navigation, SPA history 변경, pageshow/BFCache를 각각 검사한다. 뒤로가기에서 DOMContentLoaded가 다시 발생한다고 가정하지 않는다. [S14] 다른 origin은 새 사용자 활성화가 필요하다. 인증 폼이 나오면 추출·캡처를 중지하고 원본으로 넘긴다. Touch ID·비밀번호 관리자 데이터 접근을 자동화하지 않는다.

동작 레지스트리에 보낸 source submit이 있다가 worker가 재시작해도 다시 click하지 않는다. 제품 pending 상태 복원과 개발 worker 재시작을 같은 기능으로 만들지 않는다.
