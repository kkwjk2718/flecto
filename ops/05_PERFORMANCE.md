# 정확도를 유지하는 성능 반복

## 성능의 정의

shell_ms: 반응 화면이 처음 보이는 시간.
ready_ms: 실제 컨트롤이 검증되어 조작 가능한 시간. 사용자 3초 목표는 여기에 적용한다.
source_complete_ms: 원본 작업의 실제 처리 확인까지. 사용자 입력 시간·서버 처리까지 포함되어 ready와 다르다.

cold/warm/vision/timed_out과 첫 프로세스 시작/준비된 프로세스를 분리한다. 알 수 없는 reported token 값은 null이다. SDK turn을 원격 모델 내부 호출1회로 단정하지 않는다.

## 개선 단계

1. 같은 artifact에서 기본 정확성·안전 gate를 먼저 확보.
2. extraction/cache/provider/verification/render 구간을 실제 기록.
3. 가장 큰 병목 하나 선택. 출력량, 중복요청, 불필요 재추출, 캐시재연결, 지원 추론 강도 등을 검토.
4. 하나의 변경만 제한된 티켓으로 구현.
5. 원래 회귀 검사→동일 조건 비교→사용하지 않은 변형 holdout.
6. 정확성을 유지하고 개선이 확인되면 채택; 아니면 이전 artifact로 되돌림.

새로운 transport·클러스터·캐시 플랫폼을 성능 실험이란 이유로 도입하지 않는다. SDK 생성 객체의 생존과 모델의 실제 예열을 구분한다. startup이 실제 병목이면 제한된 prototype을 검토하되 행사 중 검증된 경로를 갈아엎지 않는다.

## 출발 예산

당일 깊은 최적화 실험은 최대2개. 수치들은 자원 상한이며 예상 성능 보장이 아니다. cold 시험3회와 warm 시험의 작은 표본은 진단자료지 대표 p95나 고령자 평균 사용시간이 아니다. 실패·10초 만료를 분모에서 제거하지 않는다.

## 반드시 거부할 최적화

필수 고지/동의 제거, 검증 후처리로 READY를 앞당기기, 캡처 마스킹 생략, 테스트 fixture를 LIVE에 섞기, 두 번째 사이트 하드코딩, cache 불일치를 무시, 광고용 지연 추가.

## 평가 보고

artifact hash, model/capability lock, schema/prompt/cache version, 표본 수, min/median/max, 실패 수, mode와 실제 측정 환경을 남긴다. model 변경 실험 후 이전 모델 LIVE 결과를 합산하지 않는다. 개선이 없으면 그대로 '확인된 개선 없음'이라고 기록한다.
