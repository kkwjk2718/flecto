// 한빛 생활문화센터 — synthetic catalog and account used only for the demo source site.
// Every value here is fictional. No real people, businesses or personal data.

export interface CourseTimeSeed {
  id: string;
  label: string;
  capacity: number;
}

export interface CourseSeed {
  id: string;
  title: string;
  category: string;
  summary: string;
  instructor: string;
  fee: string;
  period: string;
  place: string;
  audience: string;
  times: CourseTimeSeed[];
}

export const COURSE_SEED: CourseSeed[] = [
  {
    id: 'yoga',
    title: '아침을 여는 순한 요가',
    category: '건강·운동',
    summary: '의자와 매트를 함께 사용해 관절에 무리 없이 몸을 푸는 초급 요가입니다.',
    instructor: '박하늘 강사',
    fee: '월 20,000원',
    period: '2026년 10월 6일 ~ 12월 17일 (10주)',
    place: '2층 다목적실',
    audience: '성인 누구나 · 초급',
    times: [
      { id: 'yoga-tue-thu-1000', label: '화·목 오전 10:00 ~ 11:00', capacity: 12 },
      { id: 'yoga-tue-thu-1900', label: '화·목 저녁 7:00 ~ 8:00', capacity: 10 },
    ],
  },
  {
    id: 'painting',
    title: '처음 그리는 수채화',
    category: '문화·예술',
    summary: '연필 스케치부터 물감 번지기까지, 계절 풍경을 한 장씩 완성해 봅니다.',
    instructor: '이소라 강사',
    fee: '월 30,000원 (재료비 별도)',
    period: '2026년 10월 7일 ~ 12월 16일 (10주)',
    place: '3층 미술실',
    audience: '성인 누구나 · 초급',
    times: [
      { id: 'painting-wed-1400', label: '수 오후 2:00 ~ 4:00', capacity: 8 },
      { id: 'painting-sat-1000', label: '토 오전 10:00 ~ 12:00', capacity: 8 },
    ],
  },
  {
    id: 'digital',
    title: '스마트폰·디지털 기초',
    category: '생활·디지털',
    summary: '문자·사진 보내기, 영상통화, 키오스크 사용까지 천천히 따라 하며 익힙니다.',
    instructor: '정다운 강사',
    fee: '무료',
    period: '2026년 10월 5일 ~ 11월 27일 (8주)',
    place: '1층 디지털배움터',
    audience: '만 60세 이상 우선',
    times: [
      { id: 'digital-mon-wed-1000', label: '월·수 오전 10:00 ~ 11:30', capacity: 15 },
      { id: 'digital-fri-1400', label: '금 오후 2:00 ~ 3:30', capacity: 6 },
    ],
  },
];

export const DEMO_ACCOUNT = {
  userId: 'demo',
  password: 'flecto2026!',
  displayName: '한빛 테스트회원',
} as const;

