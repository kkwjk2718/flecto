# 다음 행동

2026-09-29 14:14 KST 체크포인트. 마감 오늘16:00, 기능안정화15:15/최종검증15:45. [실행 설정](RUN_SETTINGS.md).

## 완료된 실제 연결

- 제품 코드 GitHub 공개 개발 브랜치에 push, draft PR #6 생성·연결. main은 아직 초기문서이며 제품ZIP 링크는 README의 feat/flecto-product 기준.
- 두 FIXTURE 흐름 실제 확장→원본처리→DB1건 PASS. LIVE v3 후보에서 두 사이트 각3cold총6회+benefitswarm3회 PASS. 후보312e102 기반 기록이며 이후UI·vision·fast설정 변경 때문에 최종재검증 필요.
- LIVE 첫시도는 ancillary navigation을 task_selection에 넣는 계획으로3FAIL,1PASS,1interrupted,1NOT_RUN. 원인을수정하고실패원본보존. PROMPTv3에서선택폼입력/동의/선택행동만전달, unusabletemplate거절.
- 후보 controlsReady(주요버튼500ms보호포함): LIVEcold5.0–9.1초,benefitswarm0.836–0.840초. 3초cold목표 미달이며 최종실측전홍보수치로쓰지않음.
- Opus UI2커밋 통합. source/localreviewedit구분, 실제결과영수증,Lucide헤더·단계표시,큰글씨버튼유지.
- sourceobserver의STALE/AUTH 예외를 상태로처리, privatebatchreads,옵션동적갱신/원본review변경무효화 통합.
- vision captureprivacy추가검토+guardedprotocol/providerwire 통합. authcapability있는합성허용origin만선택메뉴노출. 실제captureVisibleTab/LIVEimage positive는 아직검사전.
- 최근 단위/통합441개PASS, typecheckPASS. 이후visionprivacy추가분/회귀검사최종확인중.
- fullfixture첫회10PASS3FAIL(동일controlledcheckbox.check 즉시검사결함)로중단. 독립QA가.click+await overlay/source readback으로고침. fixture-v3 실제재실행중.

## 병렬 작성과 남은작업

- QA Zeno: regression/helperfix(d137862/fc25daf) 통합, actualSWrestart검사추가중. flecto-core.
- Vision Harvey: privacy두패치통합, realChromepixel3test미실행에서이번fullrun포함. flecto-culture.
- Vision Avicenna: wire8a7f7f9/capability6256904통합,planTransport표시추가후마무리. flecto-runtime.
- Manual Chandrasekhar: scripts/manual-qa.ts 작성, 실제Chrome툴바capture권한/OSIME/200% 점검에사용할harness. flecto-background.
- Video Opus Erdos: Fable제작프롬프트기반 marketing/remotion/ 편집가능30초광고구현. flecto-benefits. 첫시각preview14:20목표. heavy렌더는mainQA와직렬.

## 오디오·영상

Fable프롬프트 marketing/FLECTO_30S_PRODUCTION_PROMPT.md +audio-script.json통합. ElevenLabsCreator실잔여131000크레딧확인후기존quota만사용. 4VO/4music/16SFX생성완료,실오디오 .flecto/creative/audio/production-manifest.json. VO기본Sara4 약27.77초,영상0.8초시작. music은30초요청이48초결과라최종믹스에서30초로편집. 원음 대안모두보존. 소비약2746크레딧(도구반환실비기준,transcription비용미표시). 추가결제/공개게시없음. 모델audioinput미지원으로실제청취검수확정하지않음; 길이·파형·자막근거만확인.

## 즉시 다음

1. fixture-v3(runwrapper)결과확인→실제결함수정,테스트결함은독립QA검토의미유지.
2. 최종happy2개만FLECTO_CAPTURE=1로재캡처해동일빌드6이미지확보→Opus영상asset교체. 전체fixture중간캡처는holdout이덮어쓸수있으므로영상에바로쓰지않음.
3. actualChrome/IME/200%와실제maskedimageprovider경로확인. 실패범위기록.
4. 모든code/test통합뒤build→qa-report unit/fixture/LIVE새receipt→검토된55IDassertionmap→제한등급/미실행범위포함releaseZIP.
5. runtime/sourcehash가다르면과거LIVE증거출고에사용불가. README/teamhandoff/3분데모안내최종갱신,GitHub최신push. 실제행사제출/영상외부게시별도이며submitted=false.
