import type { ErrorCode, PlanMode, Template, UiPhase } from '@flecto/contracts';

export const DIALOG_NAME = 'FLECTO 쉬운 화면';
export const SPONSOR_LABEL = 'FLECTO 후원 광고';
export const SPONSOR_NOTE = '시연용 광고 · 실제 후원 계약 없음';

export const LOADING = {
  initial: '사용하기 쉬운 화면을 준비하고 있어요.',
  slow: '필요한 입력과 버튼을 정리하고 있어요. 준비되면 바로 열어드릴게요.',
  timeout: '지금은 화면을 준비하지 못했어요. 원래 화면에서 계속하거나 다시 시도할 수 있어요.',
} as const;

export const TEMPLATE_TITLE: Record<Template, string> = {
  task_selection: '무엇을 하시겠어요?',
  grouped_form: '정보를 입력해 주세요',
  item_selection: '원하는 항목을 골라 주세요',
  consent: '안내를 읽고 동의해 주세요',
  final_review: '신청 전에 내용을 확인해 주세요',
  result: '원래 사이트의 처리 결과',
};

export const TEMPLATE_INTRO: Record<Template, { brief: string; detailed: string }> = {
  task_selection: {
    brief: '원래 사이트에서 찾은 일만 보여드려요.',
    detailed: '원래 사이트에서 실제로 찾은 일만 크게 보여드려요. 원하는 일이 없으면 원래 화면에서 계속할 수 있어요.',
  },
  grouped_form: {
    brief: '칸마다 원래 사이트의 설명을 함께 보여드려요.',
    detailed: '칸마다 원래 사이트의 이름과 설명을 그대로 보여드려요. 입력한 내용은 신청 전에 한 번 더 확인할 수 있어요.',
  },
  item_selection: {
    brief: '직접 골라 주세요. 미리 골라 두지 않아요.',
    detailed: '원하는 항목을 직접 눌러 골라 주세요. FLECTO가 대신 골라 두지 않아요. 고른 항목에는 체크 표시와 “선택됨”이 붙어요.',
  },
  consent: {
    brief: '필수와 선택을 원래 사이트 그대로 나눠 보여드려요.',
    detailed: '필수와 선택을 원래 사이트 그대로 나눠 보여드려요. 체크는 직접 눌러야만 바뀌어요. 원문은 위에 그대로 있어요.',
  },
  final_review: {
    brief: '지금 원래 사이트에 들어간 실제 값이에요.',
    detailed: '지금 원래 사이트에 실제로 들어간 값이에요. 맞으면 아래 신청 버튼을 눌러 주세요. 버튼을 누르기 전에는 신청되지 않아요.',
  },
  result: {
    brief: '원래 사이트가 알려준 결과만 보여드려요.',
    detailed: '원래 사이트가 알려준 결과만 그대로 보여드려요. 자세한 내역은 원래 화면에서 확인할 수 있어요.',
  },
};

export type Tone = 'success' | 'danger' | 'warning' | 'info';
export type StatusAction = { label: string; action: 'RETRY' | 'SHOW_ORIGINAL' | 'CLOSE' | 'CANCEL' | 'BACK'; primary?: boolean };
export type StatusCopy = { tone: Tone; badge: string; title: string; body: string; actions: StatusAction[] };

export const STATUS: Partial<Record<UiPhase, StatusCopy>> = {
  SUBMITTING: {
    tone: 'info', badge: '처리 중', title: '원래 사이트에서 처리하고 있어요',
    body: '버튼을 다시 누르지 않으셔도 돼요. 결과가 나오면 바로 알려드릴게요.', actions: [],
  },
  SUCCESS: {
    tone: 'success', badge: '완료', title: '원래 사이트에서 처리되었어요',
    body: '아래는 원래 사이트가 보여준 안내예요.',
    actions: [{ label: '원래 화면에서 내역 보기', action: 'SHOW_ORIGINAL' }, { label: '쉬운 화면 닫기', action: 'CLOSE', primary: true }],
  },
  SOURCE_REJECTED: {
    tone: 'danger', badge: '수정 필요', title: '원래 사이트가 고칠 부분을 알려줬어요',
    body: '아직 신청되지 않았어요. 아래 내용을 고친 뒤 다시 확인해 주세요.',
    actions: [{ label: '원래 화면 보기', action: 'SHOW_ORIGINAL' }, { label: '고치러 가기', action: 'BACK', primary: true }],
  },
  OUTCOME_UNKNOWN: {
    tone: 'warning', badge: '결과 확인 필요', title: '신청 결과를 확인하지 못했어요',
    body: '두 번 신청되지 않도록, 다시 신청하기 전에 원래 사이트의 신청 내역을 먼저 확인해 주세요.',
    actions: [{ label: '쉬운 화면 닫기', action: 'CLOSE' }, { label: '원래 화면에서 결과 확인하기', action: 'SHOW_ORIGINAL', primary: true }],
  },
  AUTH_REQUIRED: {
    tone: 'warning', badge: '로그인 필요', title: '원래 사이트에 로그인이 필요해요',
    body: '로그인은 원래 화면에서 직접 해 주세요. 로그인한 뒤 다시 준비할 수 있어요.',
    actions: [{ label: '다시 준비하기', action: 'RETRY' }, { label: '원래 화면에서 로그인하기', action: 'SHOW_ORIGINAL', primary: true }],
  },
  UNSUPPORTED: {
    tone: 'warning', badge: '찾지 못했어요', title: '이 화면에서 도와드릴 방법을 찾지 못했어요',
    body: '원래 화면에서 그대로 계속하실 수 있어요.',
    actions: [{ label: '쉬운 화면 닫기', action: 'CLOSE' }, { label: '원래 화면에서 계속하기', action: 'SHOW_ORIGINAL', primary: true }],
  },
  TIMED_OUT: {
    tone: 'warning', badge: '준비 시간 초과', title: '화면을 준비하지 못했어요', body: LOADING.timeout,
    actions: [{ label: '원래 화면에서 계속하기', action: 'SHOW_ORIGINAL' }, { label: '다시 시도하기', action: 'RETRY', primary: true }],
  },
  CANCELLED: {
    tone: 'info', badge: '멈춤', title: '준비를 멈췄어요', body: '원래 화면은 그대로 있어요. 원하시면 다시 준비할 수 있어요.',
    actions: [{ label: '쉬운 화면 닫기', action: 'CLOSE' }, { label: '다시 준비하기', action: 'RETRY', primary: true }],
  },
  STALE_DOCUMENT: {
    tone: 'warning', badge: '화면 바뀜', title: '원래 화면이 바뀌었어요',
    body: '바뀐 화면에 맞춰 다시 준비해야 해요. 이미 원래 사이트에 들어간 값은 원래 화면에서 확인할 수 있어요.',
    actions: [{ label: '원래 화면 보기', action: 'SHOW_ORIGINAL' }, { label: '다시 준비하기', action: 'RETRY', primary: true }],
  },
  CONFLICT: {
    tone: 'warning', badge: '다시 확인 필요', title: '내용이 바뀌어 다시 확인이 필요해요',
    body: '확인한 뒤에 값이나 조건이 바뀌었어요. 최신 값으로 다시 확인해 주세요.',
    actions: [{ label: '원래 화면 보기', action: 'SHOW_ORIGINAL' }, { label: '최신 내용으로 다시 확인하기', action: 'RETRY', primary: true }],
  },
};

export const ERROR_BANNER: Partial<Record<ErrorCode, string>> = {
  REQUIRED_MISSING: '아직 입력하지 않은 필수 항목이 있어요.',
  BUSY: '앞의 요청을 처리하고 있어요. 잠시만 기다려 주세요.',
  AMBIGUOUS_TARGET: '원래 화면에서 이 항목을 정확히 찾지 못했어요. 원래 화면에서 확인해 주세요.',
  UNSUPPORTED_CONTROL: '이 항목은 원래 화면에서 직접 입력해 주세요.',
  SOURCE_REJECTED: '원래 사이트가 고칠 부분을 알려줬어요.',
  VISUAL_RELATION_AMBIGUOUS: '화면의 항목 관계가 분명하지 않아요. 원래 화면에서 확인해 주세요.',
  PROVIDER_ERROR: '화면을 정리하는 중 문제가 생겼어요.',
};

export const MODE_LABEL: Record<PlanMode, string> = {
  FIXTURE: '고정 예시 계획 (FIXTURE)',
  LIVE_CODEX: '실시간 Codex 계획 (LIVE_CODEX)',
  CACHE: '검증된 저장 계획 (CACHE)',
};

