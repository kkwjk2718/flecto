# GitHub 협업 초기 설정

기준일: 2026-09-29. 사용자가 공개 저장소 생성과 팀원에게 전달할 링크를 요청했다. 팀원 초대 대신 공개 열람·다운로드 경로를 제공한다.

| 항목 | 설정 |
|---|---|
| 저장소 | `kkwjk2718/flecto` — 생성·push 확인 후 완료 기록 |
| 공개 범위 | PUBLIC — 사용자 명시 선택 |
| 기본 브랜치 | main |
| 개발 환경 기준 | Node.js 24 (`.nvmrc`), npm, 단일 package-lock |
| 제품 상태 | 구현 전. workspace 경로·협업 문서만 준비 |
| CI | Repository checks / Repository integrity — 원격 실행 확인 전 |
| 병합 | squash merge, 병합 후 브랜치 삭제 — 원격 적용 확인 전 |
| 브랜치 보호 | 미적용. 원격 생성 후 지원 여부와 실제 결과 확인 |
| 코드 소유자 | 초기 통합 담당 `@kkwjk2718` |
| 팀원 권한 | 초대 없음. 공개 열람·ZIP 다운로드에 로그인 불필요 |
| 라이선스 | 팀 결정 전 미지정; npm private=true |

추가한 기반: README·CONTRIBUTING, 작업 폴더 안내, .gitignore/.gitattributes/.editorconfig, 이슈 폼, PR 템플릿, CODEOWNERS, 최소 권한의 문서 CI. Actions 버전은 공식 태그의 commit SHA로 고정했다.

커밋 이메일은 이 저장소에만 GitHub noreply 주소를 설정했다. 전역 Git 설정은 변경하지 않았다. 개인 컴퓨터 경로와 내부 작업 세션 ID를 공개 문서에서 제거했다. 원본 archive 13개는 그대로 보존한다.

현재 `npm run check`는 저장소 구조, 활성 문서 상대 링크, 기본 credential 패턴, 원문 archive 해시, 검사 ID 보존을 확인한다. 완전한 비밀정보 탐지나 제품 테스트·브라우저 검증은 아니다.
