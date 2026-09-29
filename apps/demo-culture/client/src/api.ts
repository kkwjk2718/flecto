export interface CourseTime {
  id: string;
  label: string;
  capacity: number;
  reserved: number;
  remaining: number;
}

export interface Course {
  id: string;
  title: string;
  category: string;
  summary: string;
  instructor: string;
  fee: string;
  period: string;
  place: string;
  audience: string;
  times: CourseTime[];
}

export interface User {
  id: string;
  displayName: string;
}

export interface Reservation {
  receiptNo: string;
  courseId: string;
  courseTitle: string;
  timeId: string;
  timeLabel: string;
  applicantName: string;
  phone: string;
  status: string;
  createdAt: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
  fields?: Record<string, string>;
  latest?: { timeId: string; capacity: number; reserved: number; remaining: number };
}

export class ApiFailure extends Error {
  constructor(public readonly status: number, public readonly detail: ApiErrorDetail) {
    super(detail.message);
  }
}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      headers: init.body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiFailure(0, { code: 'NETWORK', message: '센터 서버와 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const detail = (data as { error?: ApiErrorDetail } | null)?.error;
    throw new ApiFailure(response.status, detail ?? { code: 'HTTP_' + response.status, message: '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  return data as T;
}

export const api = {
  session: () => request<{ authenticated: boolean; user: User | null }>('/api/session'),
  login: (userId: string, password: string) =>
    request<{ authenticated: boolean; user: User }>('/api/login', { method: 'POST', body: { userId, password } }),
  logout: () => request<{ authenticated: boolean }>('/api/logout', { method: 'POST', body: {} }),
  courses: () => request<{ courses: Course[]; checkedAt: string }>('/api/courses'),
  reservations: () => request<{ reservations: Reservation[] }>('/api/reservations'),
  reserve: (payload: { submissionId: string; courseId: string; timeId: string; applicantName: string; phone: string; consent: boolean }) =>
    request<{ reservation: Reservation; duplicate: boolean }>('/api/reservations', { method: 'POST', body: payload }),
};

export function newSubmissionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
}

export function validateName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name) return '신청자 이름을 입력해 주세요.';
  if (name.length < 2 || name.length > 20 || !/^[가-힣a-zA-Z ]+$/.test(name)) return '이름은 한글 또는 영문 2~20자로 입력해 주세요.';
  return '';
}

export function validatePhone(value: string): string {
  const digits = value.replace(/[\s-]/g, '');
  if (!digits) return '휴대전화 번호를 입력해 주세요.';
  if (!/^01[016789]\d{7,8}$/.test(digits)) return '휴대전화 번호를 010-1234-5678 형식으로 입력해 주세요.';
  return '';
}

export function formatDateTime(iso: string): string {
  return formatDateTimeInner(iso);
}

export function formatPhone(value: string): string {
  const digits = value.replace(/[\s-]/g, '');
  if (digits.length === 11) return digits.slice(0, 3) + '-' + digits.slice(3, 7) + '-' + digits.slice(7);
  if (digits.length === 10) return digits.slice(0, 3) + '-' + digits.slice(3, 6) + '-' + digits.slice(6);
  return value.trim();
}

function formatDateTimeInner(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Seoul' }).format(date);
}
