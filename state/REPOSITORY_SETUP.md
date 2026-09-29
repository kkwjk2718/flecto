# GitHub 협업 초기 설정

기준일: 2026-09-29. 사용자가 공개 저장소 생성과 팀원에게 전달할 링크를 요청했다. 팀원 초대 대신 공개 열람·다운로드 경로를 제공한다.

| 항목 | 설정 |
|---|---|
| 저장소 | [kkwjk2718/flecto](https://github.com/kkwjk2718/flecto) — 생성·초기 push 완료 |
| 공개 범위 | PUBLIC — 사용자 명시 선택 |
| 기본 브랜치 | main |
| 개발 환경 기준 | Node.js 24 (`.nvmrc`), npm, 단일 package-lock |
| 제품 상태 | 구현 전. workspace 경로·협업 문서만 준비 |
| CI | Repository checks / Repository integrity — [최초 실행 PASS](https://github.com/kkwjk2718/flecto/actions/runs/36513590713) |
| 병합 | squash merge만 허용, 병합 후 브랜치 삭제, PR 브랜치 갱신 허용 — API 확인 |
| 브랜치 보호 | main: PR·Repository integrity 성공·최신 main 기준·대화 해결 요구; 강제 push/삭제 금지. 관리자 우회 허용, 필수 승인 수 0 |
| 코드 소유자 | 초기 통합 담당 `@kkwjk2718` |
| 팀원 권한 | 초대 없음. 공개 열람·ZIP 다운로드에 로그인 불필요 |
| 라이선스 | 팀 결정 전 미지정; npm private=true |

추가한 기반: README·CONTRIBUTING, 작업 폴더 안내, .gitignore/.gitattributes/.editorconfig, 이슈 폼, PR 템플릿, CODEOWNERS, 최소 권한의 문서 CI. Actions 버전은 공식 태그의 commit SHA로 고정했다.

커밋 이메일은 이 저장소에만 GitHub noreply 주소를 설정했다. 전역 Git 설정은 변경하지 않았다. 개인 컴퓨터 경로와 내부 작업 세션 ID를 공개 문서에서 제거했다. 원본 archive 13개는 그대로 보존한다.

현재 `npm run check`는 저장소 구조, 활성 문서 상대 링크, 기본 credential 패턴, 원문 archive 해시, 검사 ID 보존을 확인한다. 완전한 비밀정보 탐지나 제품 테스트·브라우저 검증은 아니다.

초기 이슈: [#1 공통 계약·빌드](https://github.com/kkwjk2718/flecto/issues/1), [#2 UI/UX](https://github.com/kkwjk2718/flecto/issues/2), [#3 원본 서비스·G0](https://github.com/kkwjk2718/flecto/issues/3), [#4 QA](https://github.com/kkwjk2718/flecto/issues/4). 후속 세 작업은 #1의 공통 계약에 의존한다. 개인 담당자는 아직 지정하지 않았다.

검증: 로컬 `npm ci`, `npm run check`, `git diff --cached --check` 통과. 최초 CI는 Node 24/Linux에서 통과했다. 검사 결과는 tracked 파일 102개, 활성 Markdown 77개, 상대 링크 317개, archive 원본 13개 보존이다. 패키지의 원본 Markdown 82개 외에 협업·계획 문서가 추가된 수치다. 제품 T01–T40/OPER01–OPER15는 NOT_RUN이다.
