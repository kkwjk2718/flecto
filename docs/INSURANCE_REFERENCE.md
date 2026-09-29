# 보험금청구 시연 화면 참고 기록 (INSURANCE_REFERENCE)

온담보험 시연센터(`/insurance`)는 실제 보험사 청구 화면의 **구조와 밀도**만 참고한 가상 포털이다. 실제 보험사 로고·상품·약관 문구·지급 기준을 쓰지 않으며, 청구·계약·보험금 지급은 일어나지 않는다. 폼 처리는 자체 서버(`apps/demo-benefits/src/server.ts`)의 로컬 핸들러가 맡는다.

## 참고한 공개 자료 (2026-09-29 열람)

| 자료 | 확인한 구조 | 시연 화면 반영 |
|---|---|---|
| 삼성화재 보험금 청구서 PDF (https://www.samsungfire.com/download/claim/claim_new.pdf, 9쪽) | 1. 인적 사항·보상 안내 받으실 분 → 2. 사고 사항(사고유형, 사고일, 병원명, 청구 담보) → 3. 보험금 수령 계좌 → 이후 쪽은 수집·이용·제공 상세 동의서 | 청구인 정보 / 사고·진료 정보 / 수령 계좌 / 필수 동의 2개의 4구역 순서 |
| 삼성화재 보험금 청구 절차 안내 (https://www.samsungfire.com/vh/page/VH.HPCLD003.do) | 보험금 청구(사고내용, 서류/수령계좌 등록) → 심사 또는 사고조사 → 보험금 확정 및 지급 | 단계 표시줄(청구인·사고 → 서류 안내 → 수령 계좌 → 검토·직접 제출)과 우측 "청구 처리 단계" 표 |

사실 확인은 항목 **종류와 순서**(인적 사항·사고·계좌·동의)까지만 사용했다. 법적 동의 문구 전문, 보유 기간, 제공 대상 기관, 지급 기준은 복사하지 않았다.

## 12개 필드 계약 (이름 고정, 서버 검증은 백엔드 담당)

| name | 라벨 | 컨트롤 | 공개 시연 값(힌트) |
|---|---|---|---|
| policyNumber | 보험증권번호 | text | INS-2026-001 |
| applicantName | 청구인 이름 | text | 김하늘 |
| phone | 휴대전화 번호 | tel, numeric | 01012345678 |
| treatmentDate | 진료일 | date | 2026-09-01 |
| claimType | 청구 유형 | select (빈 값, 통원, 입원, 약제비) | 통원 |
| hospitalName | 의료기관명 | text | 시연의원 |
| claimAmount | 청구 금액 | number min=1 | 85000 |
| paymentBank | 수령 은행 | select (빈 값, 시연은행, 가상은행) | 시연은행 |
| accountHolder | 예금주 | text | 김하늘 |
| accountNumber | 계좌번호 | text, numeric | 1002003004 |
| privacyConsent | 시연 정보 저장에 동의합니다 (필수) | checkbox value=yes | — |
| accuracyConsent | 입력한 시연 내용을 확인했습니다 (필수) | checkbox value=yes | — |

모든 필드는 네이티브 컨트롤, `<label for>`, `required`, `aria-describedby="{name}-hint"`(오류 시 `{name}-error` 추가)를 가진다. 힌트는 화면에 보이는 공개 시연 값이며 `data-*` 정답 속성은 두지 않는다. 폼은 `POST /insurance/apply`에 hidden `csrf`, `formToken`을 보내고 제출 버튼 라벨은 "청구 내용 확인"이다.

## 실제 사이트처럼 보이게 한 요소

본문 14px, 보조 12px, 입력 15px의 촘촘한 2열 폼, 상단 유틸 바·주 메뉴·하위 메뉴, 좌측 청구 메뉴와 유형·상담 표, 우측 공지·처리 단계·입력 형식 표, 서비스 정보 표를 둔다. 청구 유형별 필요 서류(진료비 영수증, 진료비 세부내역서, 입·퇴원 확인서, 약제비 영수증) 표는 **안내만** 하고 "시연 처리: 제출 없음"으로 적는다. 업로드 완료 같은 가짜 상태는 없다.

## 제외한 것

주민등록번호, 카드, OTP, 파일 업로드, 캡차, iframe, 사용자 정의 컨트롤, 실제 보험사 브랜드, 로그아웃과 청구서 외의 추가 폼, 보험금 지급 약속 문구. 모든 링크는 `/insurance`, `/insurance/apply`, `/insurance/history`, `/insurance/guide`, `/login`이며 로그아웃은 기존 `POST /logout` + csrf를 쓴다.

## 검증 (이 커밋 기준)

- Node 24.21 + 저장소 TypeScript로 `insurance-views.ts` 단독 `tsc --noEmit --strict` 종료 코드 0.
- esbuild 번들 렌더 확인: 폼 2개(로그아웃, 청구서), `<dl>` 1개, `required` 12개, 값 이스케이프 확인, 안내문 123자, `data-` 속성·iframe·file 입력 없음.
- 브라우저 검사, 서버 연결, T01–T26 실행은 이 커밋에서 하지 않았다(백엔드 통합 후 별도 검증).
