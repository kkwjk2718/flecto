# 오류·중단·모델 변경·세션 재개

## 상태 기계

WAITING → READY → LEASED → RUNNING → PATCH_READY → CHECKING → INTEGRATED → VERIFIED.
실패는 FAILED/INTERRUPTED/BLOCKED/QUARANTINED/DEFERRED로 구분한다. 검증 뒤 안전결함이 확인되면 REVOKED다.

## 오류별 처리

| 조건 | 자동 행동 | 금지 |
|---|---|---|
| 일반 코드 오류 | 담당 경로의 최소 수정, 동일 원인 수정2회 제한 | 다른 모듈까지 무조건 재작성 |
| 계약 mismatch | 현재 version 확인, 단일 writer migration 또는 기존 계약 유지 | worker가 common 타입 덮기 |
| 설치 실패 | 승인한 동일 버전·공식 경로에서 제한 재시도 | 무차별 latest upgrade, 관리자권한 우회 |
| 일시 rate/network | 공급자가 준 retry-after 우선, bounded backoff | 즉시 무한 재시도 |
| quota 소진 | 확인된 회복 시각이 deadline 전에 있는지 판단, 오프라인 작업 진행 | 계정회전·자동추가구매·미승인 provider |
| auth/model access | 해당 경로 BLOCKED_AUTH/CAPABILITY | 인증파일 추출·자동 로그인 |
| main 세션 압축/종료 | checkpoint와 NEXT_ACTION 보존, supported resume만 | 대화가 종료돼도 계속 돌고 있다고 주장 |
| worker crash | attempt/lease 변경, 미완성 폴더 보존, 필요한 작업만 재배정 | 기존 작업 삭제·늦은 결과 적용 |
| port/profile 점유 | 소유 확인 후 자기 인스턴스만 정리 | killall node/chrome |
| 이미지 실패 | 기본 에셋 유지, late result 미반영 | 핵심 출고 지연 |
| 안전사고 | 관련 전송·캐시·릴리스 격리 | 실패 흔적을 지우고 완료로 표시 |

## 모델이 바뀌어도 유지할 상태

세션의 생각을 이어받는 것이 아니라, 명세·현재 커밋·미완성 diff·테스트·작업 상태를 이어받는다. 새 세션에는 제품 결정, 역할 계약, 현재 task/attempt/base/lease, 실제 실패, 다음 검사만 제공한다. 출처 없는 기존 '완료' 보고는 다시 검증한다.

같은 승인 집합의 모델 교체는 새 capability 확인·attempt로 진행한다. 제품 모델/프롬프트가 바뀌면 실제 모델 성능 근거와 해당 cache version도 갱신한다. 개발 모델 변경은 제품 모델 변경이 아니다.

## supervisor 재시작

MANAGED_LOOP에서만 자동 재시작을 주장한다. 단일 run lock을 확보하고 journal과 실제 프로세스를 대조한다. pid+생성시각+소유 토큰+프로세스 그룹으로 확인하며 pid만으로 종료하지 않는다. 임대 세대가 다른 옛 결과는 격리한다. 이미 통합된 patch hash를 다시 적용하지 않는다.

정상 STOP·codeStop·승인대기는 watchdog 재시작 대상이 아니다. 비정상 crash만 최대2회 재시작하는 출발 정책이다. loop와 watchdog이 서로 재시작하면서 증식하지 않게 하나의 소유자만 둔다. Mac 재부팅·Touch ID·정전까지 자동 해결하는 기능이 아니다.

## 파일 충돌·잠금

realpath 기준으로 작업 범위와 상위·하위 경로 중복을 검사한다. symlink escape·숨겨진 credentials·실행 설정 변경은 차단한다. base SHA 이후 같은 경로가 바뀌었다면 새 기준에서 최소 patch를 다시 만든다. 충돌을 theirs/ours 전체 선택으로 무조건 없애지 않는다.

## 안전한 축소

선택 이미지·장식/영상 추가·성능 실험·추가 변형 수부터 줄인다. 문화센터 C는 목표로 남기되 미완성이면 SINGLE_SITE로 보고한다. 시각 보완이 미검증이면 vision.enabled=false와 제한을 표시하고 DOM의 안전한 경로만 사용한다. 두 경로를 합쳐 모든 기능 검증으로 표시하지 않는다.

인증이 끝까지 막혀도 fixture 동작·원본 연결·코드·테스트를 정직하게 보존할 수 있다. 그 결과는 LIVE 제품이 아니다. 안전한 정상본이 없으면 UNVERIFIED로 마무리한다.
