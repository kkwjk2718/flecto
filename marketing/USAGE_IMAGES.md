# 실제 사용 화면 이미지 팩 (USAGE-IMAGES)

설치된 FLECTO Chrome 확장을 시연용 합성 서비스(구매 혜택 '온담', '한빛 생활문화센터')에서 실제로 사용하며 찍은 레티나 캡처 8장을 공유용 팩으로 묶었다. AI 목업이나 편집 이미지가 아니며, 원본 PNG가 기준 자료다. 모든 개인 정보처럼 보이는 값(김하늘, 010-1234-5678, FLECTO-2026-001 등)은 시연 데이터다. 실제 사용자·운영 배포·실제 신청을 주장하지 않는다.

생성 파일은 git에 넣지 않는다(`.flecto/`는 ignore 대상). 로컬 위치:

- 폴더: `.flecto/usage-images/FLECTO_실제사용화면_초안/` (png/, capture-metadata/, README.md, index.html, MANIFEST.json, SHA256SUMS.txt)
- ZIP: `.flecto/usage-images/FLECTO_실제사용화면_초안.zip`
- 원본: 메인 체크아웃 `.flecto/creative/assets/` (2026-09-29 14:51 KST, 2880×2200, 뷰포트 1440×1100, DPR 2)
- 확장 빌드 SHA-256: `e92c7003e7d14e013968a1bf94c08f9225744f7df24c5a3966667eb32069f9ea`

| 순서 | 팩 파일 | 원본 | SHA-256 |
|---|---|---|---|
| 1 사용 전 원래 화면 | flecto-01-before-original-benefits-form.png | 01-source-benefits.png | f556c601…43db792 |
| 2 입력 전 | flecto-02-easy-screen-input-empty.png | 02-flecto-input.png | 7cbb7618…8a67b42 |
| 3 직접 입력 | flecto-03-easy-screen-input-filled.png | 02-flecto-input-filled.png | 1dff1432…1d28d1b3b8d |
| 4 선택 전 | flecto-04-easy-screen-choice-empty.png | 03-flecto-choice-empty.png | e3f7408a…c89d63 |
| 5 직접 선택(가전) | flecto-05-easy-screen-choice-selected.png | 03-flecto-choice.png | c46d263d…b122e5 |
| 6 제출 전 확인 | flecto-06-easy-screen-review-before-submit.png | 04-flecto-review.png | 7d60a28a…d2ce56 |
| 7 구매 혜택 접수 결과 | flecto-07-receipt-benefits-original-site.png | 05-flecto-success.png | 68f46e9d…6148a |
| 8 문화센터 접수 결과 | flecto-08-receipt-culture-center-original-site.png | 06-culture-success.png | 3941eae5…e09b2 |

알려진 한계: 3번 화면의 구매일 '2026'에 실제 입력 포커스의 파란 선택 강조가 남아 있다. 지우지 않았다. 더 깔끔한 컷이 필요하면 입력 후 칸 밖을 실제로 클릭해 포커스를 뺀 상태로 재캡처한다. 외부 공개·게시는 별도 승인 대상이다.
