# 공통 패키지 영역

`contracts`, `core`, `templates`, `design-tokens`를 구현했다. 공개 계획 데이터와 브라우저 안의 비공개 입력 상태를 분리하며, 원본 DOM 검증 후 여섯 공통 템플릿으로 표시한다.

contracts와 root lockfile은 리드가 통합한다. UI는 정해진 ViewModel/action 계약으로 연결하고 원본 DOM 실행·제출 판단을 직접 소유하지 않는다. [구현 계획](../IMPLEMENTATION_PLAN.md)
