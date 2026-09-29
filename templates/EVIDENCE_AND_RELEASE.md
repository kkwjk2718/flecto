# 실제 근거·릴리스 기록 양식

## 검사 기록

```json
{
  "status": "NOT_RUN",
  "artifactHash": null,
  "sourceSha": null,
  "gateVersion": null,
  "schemaVersion": null,
  "modelLockRef": null,
  "mode": "UNCONFIGURED",
  "actualCommand": null,
  "exitCode": null,
  "tests": [],
  "sourceOracleEvidence": null,
  "screenshots": [],
  "startedAt": null,
  "finishedAt": null
}
```

tests 항목은 ID별 PASS/FAIL/NOT_RUN/SKIPPED/FLAKY를 구분한다. 실제 없는 경로·숫자를 넣지 않는다. screenshot만으로 원본 DB 저장을 증명하지 않는다. 사용량이 반환되지 않으면 null이며0이 아니다.

## 릴리스 기록

```json
{
  "productTier": "UNVERIFIED",
  "operationsTier": "DOCS_ONLY",
  "artifactHash": null,
  "sourceSha": null,
  "modelLockRef": null,
  "fixtureEvidence": [],
  "liveEvidence": [],
  "visionStatus": "NOT_RUN",
  "manualChromeStatus": "NOT_RUN",
  "manualImeStatus": "NOT_RUN",
  "limitations": ["제품과 실행 환경을 아직 구현·검증하지 않음"],
  "revoked": false,
  "submitted": false
}
```

릴리스 등급은 실제 수용 조건으로 결정한다. fixture를 LIVE로, cold를 warm으로, 소표본을 전체 사용자 효과로 바꾸지 않는다. 비밀정보 제외 검사를 별도 기록한다. 현재 문서 패키지의 정적 검사는 제품 artifactHash가 아니다.
