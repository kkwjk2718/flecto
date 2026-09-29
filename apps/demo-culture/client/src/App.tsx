import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiFailure, api, formatDateTime, formatPhone, newSubmissionId, validateName, validatePhone, type ApiErrorDetail, type Course, type Reservation, type User } from './api';
import { Link, RouterProvider, useRouter } from './router';

const SITE_NAME = '한빛 생활문화센터';

export interface Draft {
  courseId: string;
  timeId: string;
  applicantName: string;
  phone: string;
  consent: boolean;
  submissionId: string;
}

const EMPTY_DRAFT: Draft = { courseId: '', timeId: '', applicantName: '', phone: '', consent: false, submissionId: '' };
const PAYLOAD_KEYS = ['courseId', 'timeId', 'applicantName', 'phone'] as const;

interface SessionState {
  status: 'loading' | 'ready';
  user: User | null;
}

const NAV_ITEMS = [
  { to: '/about', label: '센터 소개' },
  { to: '/courses', label: '강좌 안내' },
  { to: '/apply/course', label: '수강 신청', match: '/apply' },
  { to: '/my', label: '신청 내역', match: '/reservations/' },
  { to: '/notices', label: '공지사항' },
];

const APPLY_STEPS = [
  { path: '/apply/course', label: '강좌·시간 선택' },
  { path: '/apply/applicant', label: '신청자 정보' },
  { path: '/apply/notice', label: '안내 확인·동의' },
  { path: '/apply/review', label: '신청 내용 확인' },
];

const NOTICES = [
  {
    date: '2026-09-21',
    title: '2026년 가을학기 수강 신청 안내',
    body: '가을학기 강좌는 9월 28일부터 선착순으로 신청할 수 있습니다. 정원이 차면 신청이 마감되며, 취소석이 생기면 잔여석이 다시 표시됩니다.',
  },
  {
    date: '2026-09-14',
    title: '디지털배움터 이용 시간 변경',
    body: '10월부터 1층 디지털배움터 자유 이용 시간이 평일 오후 1시~5시로 변경됩니다. 강좌 시간에는 수강생만 이용할 수 있습니다.',
  },
  {
    date: '2026-09-01',
    title: '주차장 공사에 따른 이용 안내',
    body: '9월 한 달간 지하 주차장 일부 구역을 보수합니다. 가급적 대중교통을 이용해 주시기 바랍니다.',
  },
];

function PageTitle({ children, lead }: { children: string; lead?: ReactNode }) {
  useEffect(() => {
    document.title = children + ' | ' + SITE_NAME;
  }, [children]);
  return (
    <div className="page-heading">
      <h1 tabIndex={-1}>{children}</h1>
      {lead ? <p className="lead">{lead}</p> : null}
    </div>
  );
}

function ErrorBox({ error, title }: { error: ApiErrorDetail | string | null; title?: string }) {
  if (!error) return null;
  const message = typeof error === 'string' ? error : error.message;
  return (
    <div className="alert alert-error" role="alert">
      {title ? <strong>{title}</strong> : null}
      <p>{message}</p>
    </div>
  );
}

export function App() {
  return (
    <RouterProvider>
      <Site />
    </RouterProvider>
  );
}

function Site() {
  const { path, search, navigate } = useRouter();
  const [session, setSession] = useState<SessionState>({ status: 'loading', user: null });
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [coursesError, setCoursesError] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [lastReservation, setLastReservation] = useState<Reservation | null>(null);
  const firstRender = useRef(true);

  const refreshCourses = useCallback(async () => {
    try {
      const result = await api.courses();
      setCourses(result.courses);
      setCoursesError('');
      return result.courses;
    } catch (error) {
      setCoursesError(error instanceof ApiFailure ? error.message : '강좌 정보를 불러오지 못했습니다.');
      return null;
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.session()
      .then((result) => active && setSession({ status: 'ready', user: result.user }))
      .catch(() => active && setSession({ status: 'ready', user: null }));
    void refreshCourses();
    return () => {
      active = false;
    };
  }, [refreshCourses]);

  const watchesSeats = path === '/courses' || path.startsWith('/apply');
  useEffect(() => {
    if (!watchesSeats) return;
    const timer = window.setInterval(() => void refreshCourses(), 20000);
    return () => window.clearInterval(timer);
  }, [watchesSeats, refreshCourses]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const heading = document.querySelector<HTMLElement>('main h1');
    heading?.focus();
  }, [path]);

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    setDraft((previous) => {
      const next = { ...previous, ...patch };
      if (PAYLOAD_KEYS.some((key) => key in patch && patch[key] !== previous[key])) next.submissionId = patch.submissionId ?? '';
      return next;
    });
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setSession({ status: 'ready', user: null });
      setDraft(EMPTY_DRAFT);
      setLastReservation(null);
      navigate('/');
    }
  };

  const startApplication = (courseId: string) => {
    if (draft.courseId !== courseId) updateDraft({ courseId, timeId: '' });
    navigate('/apply/course');
  };

  const needsLogin = path === '/my' || path === '/apply' || path.startsWith('/apply/') || path.startsWith('/reservations/');
  let page: ReactNode;
  if (needsLogin && session.status === 'loading') page = <p className="loading">로그인 상태를 확인하고 있습니다…</p>;
  else if (needsLogin && !session.user) page = <LoginRequired from={path} />;
  else if (path === '/') page = <HomePage courses={courses} onApply={startApplication} />;
  else if (path === '/about') page = <AboutPage />;
  else if (path === '/notices') page = <NoticesPage />;
  else if (path === '/courses') page = <CoursesPage courses={courses} error={coursesError} onApply={startApplication} />;
  else if (path === '/login') page = <LoginPage search={search} user={session.user} onLogin={(user) => setSession({ status: 'ready', user })} />;
  else if (path === '/my') page = <MyReservationsPage />;
  else if (path.startsWith('/reservations/')) page = <ReservationPage receiptNo={decodeURIComponent(path.slice('/reservations/'.length))} last={lastReservation} />;
  else if (path === '/apply' || path.startsWith('/apply/')) {
    page = (
      <ApplyFlow
        path={path}
        courses={courses}
        coursesError={coursesError}
        draft={draft}
        updateDraft={updateDraft}
        refreshCourses={refreshCourses}
        onSessionExpired={() => setSession({ status: 'ready', user: null })}
        onComplete={(reservation) => {
          setLastReservation(reservation);
          setDraft(EMPTY_DRAFT);
          navigate('/reservations/' + encodeURIComponent(reservation.receiptNo));
        }}
      />
    );
  } else page = <NotFoundPage />;

  return (
    <>
      <a className="skip-link" href="#main">본문 바로가기</a>
      <header className="site-header">
        <div className="utility-bar">
          <div className="container utility-inner">
            <span className="utility-hours">평일 09:00 ~ 21:00 · 토요일 09:00 ~ 13:00 운영</span>
            <div className="account">
              {session.user ? (
                <>
                  <span className="account-name">{session.user.displayName} 님</span>
                  <button type="button" className="link-button" onClick={() => void logout()}>로그아웃</button>
                </>
              ) : (
                <Link to={'/login?next=' + encodeURIComponent(path === '/login' ? '/courses' : path)}>로그인</Link>
              )}
            </div>
          </div>
        </div>
        <div className="container header-main">
          <Link to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">한빛</span>
            <span className="brand-text">
              <strong>{SITE_NAME}</strong>
              <small>이웃과 함께 배우는 동네 배움터</small>
            </span>
          </Link>
          <nav aria-label="주 메뉴" className="main-nav">
            <ul>
              {NAV_ITEMS.map((item) => {
                const active = path === item.to || (item.match ? path.startsWith(item.match) : false);
                return (
                  <li key={item.to}>
                    <Link to={item.to} aria-current={active ? 'page' : undefined}>{item.label}</Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        <div className="container">{page}</div>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <div>
            <strong>{SITE_NAME}</strong>
            <p>한빛시 한빛로 12 (가상 주소) · 문의 000-0000-0000 (시연용)</p>
          </div>
          <p className="footer-note">이 사이트는 시연을 위한 가상 문화센터입니다. 실제 개인정보를 입력하지 마세요.</p>
        </div>
      </footer>
    </>
  );
}

function LoginRequired({ from }: { from: string }) {
  const { navigate } = useRouter();
  const target = '/login?next=' + encodeURIComponent(from);
  return (
    <section className="panel narrow">
      <PageTitle>로그인이 필요합니다</PageTitle>
      <p>수강 신청과 신청 내역 확인은 회원 로그인 후 이용할 수 있습니다.</p>
      <button type="button" className="button primary" onClick={() => navigate(target)}>로그인하러 가기</button>
    </section>
  );
}

function SeatBadge({ remaining }: { remaining: number }) {
  if (remaining <= 0) return <span className="badge badge-closed">마감</span>;
  if (remaining <= 3) return <span className="badge badge-few">잔여 {remaining}석</span>;
  return <span className="badge">잔여 {remaining}석</span>;
}

function HomePage({ courses, onApply }: { courses: Course[] | null; onApply: (id: string) => void }) {
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">2026 가을학기 수강생 모집</p>
          <PageTitle lead="요가, 수채화, 스마트폰 기초까지. 가까운 곳에서 부담 없이 배워 보세요.">한빛 생활문화센터</PageTitle>
          <div className="hero-actions">
            <Link to="/courses" className="button primary">강좌 둘러보기</Link>
            <Link to="/apply/course" className="button secondary">수강 신청하기</Link>
          </div>
        </div>
        <dl className="hero-facts">
          <div><dt>신청 기간</dt><dd>9월 28일 ~ 10월 2일</dd></div>
          <div><dt>개강</dt><dd>10월 5일(월)부터</dd></div>
          <div><dt>신청 방법</dt><dd>로그인 후 온라인 선착순</dd></div>
        </dl>
      </section>
      <section className="section">
        <div className="section-head">
          <h2>이번 학기 강좌</h2>
          <Link to="/courses">전체 강좌 보기</Link>
        </div>
        {courses ? (
          <ul className="card-grid">
            {courses.map((course) => (
              <li key={course.id} className="card">
                <span className="category">{course.category}</span>
                <h3>{course.title}</h3>
                <p>{course.summary}</p>
                <button type="button" className="button secondary small" onClick={() => onApply(course.id)}>
                  <span className="sr-only">{course.title} </span>수강 신청
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="loading">강좌 정보를 불러오는 중입니다…</p>
        )}
      </section>
      <section className="section">
        <div className="section-head">
          <h2>공지사항</h2>
          <Link to="/notices">더 보기</Link>
        </div>
        <ul className="notice-list">
          {NOTICES.map((notice) => (
            <li key={notice.title}>
              <Link to="/notices">{notice.title}</Link>
              <time dateTime={notice.date}>{notice.date}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function AboutPage() {
  return (
    <section className="panel">
      <PageTitle lead="주민 누구나 가까이에서 배우고 어울리는 생활문화 공간입니다.">센터 소개</PageTitle>
      <h2>운영 안내</h2>
      <dl className="info-list">
        <div><dt>운영 시간</dt><dd>평일 09:00 ~ 21:00, 토요일 09:00 ~ 13:00 (일요일·공휴일 휴관)</dd></div>
        <div><dt>시설</dt><dd>1층 디지털배움터, 2층 다목적실, 3층 미술실·소모임실</dd></div>
        <div><dt>오시는 길</dt><dd>한빛역 2번 출구에서 걸어서 5분 (가상 주소)</dd></div>
      </dl>
    </section>
  );
}

function NoticesPage() {
  return (
    <section className="panel">
      <PageTitle>공지사항</PageTitle>
      <ul className="notice-detail">
        {NOTICES.map((notice) => (
          <li key={notice.title}>
            <h2>{notice.title}</h2>
            <time dateTime={notice.date}>{notice.date}</time>
            <p>{notice.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CoursesPage({ courses, error, onApply }: { courses: Course[] | null; error: string; onApply: (id: string) => void }) {
  return (
    <>
      <PageTitle lead="강좌별 시간과 잔여석을 확인한 뒤 신청해 주세요. 잔여석은 신청 시점에 다시 확인합니다.">강좌 안내</PageTitle>
      <ErrorBox error={error || null} />
      {!courses && !error ? <p className="loading">강좌 정보를 불러오는 중입니다…</p> : null}
      <ul className="course-list">
        {courses?.map((course) => (
          <li key={course.id} className="course-card">
            <div className="course-main">
              <span className="category">{course.category}</span>
              <h2>{course.title}</h2>
              <p>{course.summary}</p>
              <dl className="course-meta">
                <div><dt>강사</dt><dd>{course.instructor}</dd></div>
                <div><dt>기간</dt><dd>{course.period}</dd></div>
                <div><dt>장소</dt><dd>{course.place}</dd></div>
                <div><dt>대상</dt><dd>{course.audience}</dd></div>
                <div><dt>수강료</dt><dd>{course.fee}</dd></div>
              </dl>
            </div>
            <div className="course-side">
              <h3>수업 시간</h3>
              <ul className="time-list">
                {course.times.map((time) => (
                  <li key={time.id}>
                    <span>{time.label}</span>
                    <SeatBadge remaining={time.remaining} />
                  </li>
                ))}
              </ul>
              <button type="button" className="button primary" onClick={() => onApply(course.id)}>
                <span className="sr-only">{course.title} </span>수강 신청
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function LoginPage({ search, user, onLogin }: { search: string; user: User | null; onLogin: (user: User) => void }) {
  const { navigate } = useRouter();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nextParam = new URLSearchParams(search).get('next') ?? '';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/login') ? nextParam : '/courses';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userId.trim() || !password) {
      setError('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await api.login(userId, password);
      setPassword('');
      onLogin(result.user);
      navigate(next);
    } catch (failure) {
      setError(failure instanceof ApiFailure ? failure.message : '로그인하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (user) {
    return (
      <section className="panel narrow">
        <PageTitle>로그인</PageTitle>
        <p>{user.displayName} 님으로 로그인되어 있습니다.</p>
        <Link to={next} className="button primary">계속하기</Link>
      </section>
    );
  }

  return (
    <section className="panel narrow">
      <PageTitle lead="센터 회원 아이디로 로그인해 주세요.">로그인</PageTitle>
      <form className="form" onSubmit={submit} method="post" action="/api/login" noValidate>
        {error ? <div className="alert alert-error" role="alert"><p>{error}</p></div> : null}
        <div className="field">
          <label htmlFor="login-id">아이디</label>
          <input id="login-id" name="username" autoComplete="username" value={userId} onChange={(event) => setUserId(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="login-password">비밀번호</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </div>
        <button type="submit" className="button primary block" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
      </form>
    </section>
  );
}

function stepReady(draft: Draft, courses: Course[] | null): number {
  const course = courses?.find((item) => item.id === draft.courseId);
  if (!course || !course.times.some((time) => time.id === draft.timeId)) return 0;
  if (validateName(draft.applicantName) || validatePhone(draft.phone)) return 1;
  if (!draft.consent) return 2;
  return 3;
}

interface ApplyProps {
  path: string;
  courses: Course[] | null;
  coursesError: string;
  draft: Draft;
  updateDraft: (patch: Partial<Draft>) => void;
  refreshCourses: () => Promise<Course[] | null>;
  onSessionExpired: () => void;
  onComplete: (reservation: Reservation) => void;
}

function ApplyFlow(props: ApplyProps) {
  const { navigate } = useRouter();
  const { path, courses, coursesError, draft } = props;
  useEffect(() => {
    if (path === '/apply' || path === '/apply/') navigate('/apply/course', { replace: true });
  }, [path, navigate]);

  const index = APPLY_STEPS.findIndex((step) => step.path === path);
  if (index < 0) return <p className="loading">수강 신청 화면으로 이동합니다…</p>;
  if (!courses) {
    return coursesError ? <ErrorBox error={coursesError} /> : <p className="loading">강좌 정보를 불러오는 중입니다…</p>;
  }
  const ready = stepReady(draft, courses);

  return (
    <div className="apply">
      <PageTitle lead="네 단계로 신청합니다. 마지막 확인 화면에서 [신청하기]를 눌러야 접수됩니다.">수강 신청</PageTitle>
      <ol className="steps" aria-label="신청 단계">
        {APPLY_STEPS.map((step, stepIndex) => (
          <li key={step.path} className={stepIndex === index ? 'current' : stepIndex < index ? 'done' : ''} aria-current={stepIndex === index ? 'step' : undefined}>
            <span className="step-no">{stepIndex + 1}</span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
      <section className="panel" aria-labelledby="step-title">
        <h2 id="step-title">{index + 1}단계 · {APPLY_STEPS[index]!.label}</h2>
        {index > ready ? (
          <div className="alert alert-info">
            <p>앞 단계의 입력이 끝나지 않았습니다. {APPLY_STEPS[ready]!.label} 단계부터 이어서 진행해 주세요.</p>
            <button type="button" className="button primary" onClick={() => navigate(APPLY_STEPS[ready]!.path)}>{APPLY_STEPS[ready]!.label}(으)로 이동</button>
          </div>
        ) : index === 0 ? (
          <CourseStep {...props} courses={courses} />
        ) : index === 1 ? (
          <ApplicantStep {...props} />
        ) : index === 2 ? (
          <NoticeStep {...props} />
        ) : (
          <ReviewStep {...props} courses={courses} />
        )}
      </section>
    </div>
  );
}

function CourseStep({ courses, draft, updateDraft }: ApplyProps & { courses: Course[] }) {
  const { navigate } = useRouter();
  const [errors, setErrors] = useState<{ courseId?: string; timeId?: string }>({});
  const course = courses.find((item) => item.id === draft.courseId);
  const selectedTime = course?.times.find((time) => time.id === draft.timeId);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    if (!course) next.courseId = '강좌를 선택해 주세요.';
    else if (!selectedTime) next.timeId = '수업 시간을 선택해 주세요.';
    else if (selectedTime.remaining <= 0) next.timeId = '선택하신 시간은 마감되었습니다. 다른 시간을 선택해 주세요.';
    setErrors(next);
    if (Object.keys(next).length === 0) navigate('/apply/applicant');
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="choices" aria-describedby={errors.courseId ? 'courseId-error' : undefined}>
        <legend>강좌</legend>
        {courses.map((item) => (
          <label key={item.id} className={'choice' + (draft.courseId === item.id ? ' selected' : '')}>
            <input
              type="radio"
              name="courseId"
              value={item.id}
              checked={draft.courseId === item.id}
              onChange={() => updateDraft(draft.courseId === item.id ? {} : { courseId: item.id, timeId: '' })}
            />
            <span className="choice-body">
              <strong>{item.title}</strong>
              <small>{item.category} · {item.fee} · {item.place}</small>
            </span>
          </label>
        ))}
        {errors.courseId ? <p className="field-error" id="courseId-error">{errors.courseId}</p> : null}
      </fieldset>
      <div className="field">
        <label htmlFor="timeId">수업 시간</label>
        <select
          id="timeId"
          name="timeId"
          value={selectedTime ? draft.timeId : ''}
          onChange={(event) => updateDraft({ timeId: event.target.value })}
          aria-invalid={errors.timeId ? true : undefined}
          aria-describedby={'timeId-help' + (errors.timeId ? ' timeId-error' : '')}
        >
          <option value="">{course ? '수업 시간을 선택하세요' : '먼저 강좌를 선택하세요'}</option>
          {course?.times.map((time) => (
            <option key={time.id} value={time.id} disabled={time.remaining <= 0 && time.id !== draft.timeId}>
              {time.label} ({time.remaining > 0 ? '잔여 ' + time.remaining + '석' : '마감'})
            </option>
          ))}
        </select>
        <p className="help" id="timeId-help">잔여석은 신청 버튼을 누르는 시점에 다시 확인합니다.</p>
        {errors.timeId ? <p className="field-error" id="timeId-error">{errors.timeId}</p> : null}
      </div>
      <div className="form-actions">
        <Link to="/courses" className="button ghost">강좌 안내 보기</Link>
        <button type="submit" className="button primary">다음</button>
      </div>
    </form>
  );
}

function ApplicantStep({ draft, updateDraft }: ApplyProps) {
  const { navigate } = useRouter();
  const [errors, setErrors] = useState<{ applicantName?: string; phone?: string }>({});

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next: typeof errors = {};
    const nameError = validateName(draft.applicantName);
    const phoneError = validatePhone(draft.phone);
    if (nameError) next.applicantName = nameError;
    if (phoneError) next.phone = phoneError;
    setErrors(next);
    if (Object.keys(next).length === 0) navigate('/apply/notice');
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="help">수강하실 분의 정보를 입력해 주세요. 수업 변경 안내 문자를 이 번호로 보내 드립니다.</p>
      <div className="field">
        <label htmlFor="applicantName">신청자 이름</label>
        <input
          id="applicantName"
          name="applicantName"
          autoComplete="name"
          value={draft.applicantName}
          onChange={(event) => updateDraft({ applicantName: event.target.value })}
          aria-invalid={errors.applicantName ? true : undefined}
          aria-describedby={errors.applicantName ? 'applicantName-error' : undefined}
          required
        />
        {errors.applicantName ? <p className="field-error" id="applicantName-error">{errors.applicantName}</p> : null}
      </div>
      <div className="field">
        <label htmlFor="phone">휴대전화 번호</label>
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="010-1234-5678"
          value={draft.phone}
          onChange={(event) => updateDraft({ phone: event.target.value })}
          aria-invalid={errors.phone ? true : undefined}
          aria-describedby={'phone-help' + (errors.phone ? ' phone-error' : '')}
          required
        />
        <p className="help" id="phone-help">숫자만 입력하셔도 됩니다.</p>
        {errors.phone ? <p className="field-error" id="phone-error">{errors.phone}</p> : null}
      </div>
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={() => navigate('/apply/course')}>이전</button>
        <button type="submit" className="button primary">다음</button>
      </div>
    </form>
  );
}

function NoticeStep({ draft, updateDraft }: ApplyProps) {
  const { navigate } = useRouter();
  const [error, setError] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.consent) {
      setError('안내 사항을 확인하고 동의에 체크해 주세요.');
      return;
    }
    setError('');
    navigate('/apply/review');
  };
  return (
    <form className="form" onSubmit={submit} noValidate>
      <section className="important-notice" aria-labelledby="important-notice-title">
        <h3 id="important-notice-title">수강 신청 전 꼭 확인해 주세요</h3>
        <ul>
          <li>수강료는 첫 수업일에 센터 안내데스크에서 납부합니다. 온라인 결제는 없습니다.</li>
          <li>개강 전날까지 취소하면 전액 환불되며, 개강 후에는 남은 회차만큼 환불됩니다.</li>
          <li>수강 인원이 5명 미만이면 강좌가 폐강될 수 있으며, 이 경우 문자로 알려 드립니다.</li>
          <li>개인정보 수집·이용: 이름과 휴대전화 번호를 수강 관리와 안내 문자 발송에만 사용하며 학기 종료 후 6개월 뒤 파기합니다.</li>
        </ul>
      </section>
      <div className="field checkbox-field">
        <input
          id="consent"
          name="consent"
          type="checkbox"
          checked={draft.consent}
          onChange={(event) => updateDraft({ consent: event.target.checked })}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'consent-error' : undefined}
          required
        />
        <label htmlFor="consent">위 안내 사항을 모두 확인했으며, 개인정보 수집·이용에 동의합니다. (필수)</label>
      </div>
      {error ? <p className="field-error" id="consent-error">{error}</p> : null}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={() => navigate('/apply/applicant')}>이전</button>
        <button type="submit" className="button primary">다음</button>
      </div>
    </form>
  );
}

function ReviewStep({ courses, draft, updateDraft, refreshCourses, onSessionExpired, onComplete }: ApplyProps & { courses: Course[] }) {
  const { navigate } = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiErrorDetail | null>(null);
  const course = courses.find((item) => item.id === draft.courseId)!;
  const time = course.times.find((item) => item.id === draft.timeId)!;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const submissionId = draft.submissionId || newSubmissionId();
    if (!draft.submissionId) updateDraft({ submissionId });
    setBusy(true);
    setError(null);
    try {
      const result = await api.reserve({
        submissionId,
        courseId: draft.courseId,
        timeId: draft.timeId,
        applicantName: draft.applicantName,
        phone: draft.phone,
        consent: draft.consent,
      });
      onComplete(result.reservation);
    } catch (failure) {
      const detail = failure instanceof ApiFailure ? failure.detail : { code: 'UNKNOWN', message: '신청을 처리하지 못했습니다.' };
      if (failure instanceof ApiFailure && failure.status === 401) onSessionExpired();
      if (detail.code === 'CAPACITY_FULL') void refreshCourses();
      setError(detail);
      setBusy(false);
    }
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p>아래 내용으로 신청합니다. 내용이 맞는지 확인한 뒤 [신청하기]를 눌러 주세요.</p>
      <dl className="summary">
        <div><dt>강좌</dt><dd>{course.title}</dd><dd className="edit"><Link to="/apply/course">변경</Link></dd></div>
        <div><dt>수업 시간</dt><dd>{time.label} <SeatBadge remaining={time.remaining} /></dd><dd className="edit"><Link to="/apply/course">변경</Link></dd></div>
        <div><dt>수강료</dt><dd>{course.fee}</dd></div>
        <div><dt>신청자 이름</dt><dd>{draft.applicantName.trim()}</dd><dd className="edit"><Link to="/apply/applicant">변경</Link></dd></div>
        <div><dt>휴대전화 번호</dt><dd>{formatPhone(draft.phone)}</dd><dd className="edit"><Link to="/apply/applicant">변경</Link></dd></div>
        <div><dt>안내 확인·동의</dt><dd>동의함</dd></div>
      </dl>
      {error ? (
        <div className="alert alert-error" role="alert">
          <p>{error.message}</p>
          {error.code === 'CAPACITY_FULL' || error.code === 'ALREADY_RESERVED' ? (
            <button type="button" className="button secondary small" onClick={() => navigate('/apply/course')}>수업 시간 다시 고르기</button>
          ) : null}
          {error.code === 'ALREADY_RESERVED' ? <Link to="/my">신청 내역 보기</Link> : null}
          {error.code === 'LOGIN_REQUIRED' ? <Link to={'/login?next=' + encodeURIComponent('/apply/review')}>다시 로그인하기</Link> : null}
        </div>
      ) : null}
      <div className="form-actions">
        <button type="button" className="button ghost" onClick={() => navigate('/apply/notice')}>이전</button>
        <button type="submit" className="button primary large" disabled={busy} aria-busy={busy || undefined}>
          {busy ? '신청하는 중…' : '신청하기'}
        </button>
      </div>
    </form>
  );
}

function ReceiptView({ reservation }: { reservation: Reservation }) {
  return (
    <section className="receipt" role="status" aria-labelledby="receipt-title">
      <h2 id="receipt-title">수강 신청이 접수되었습니다</h2>
      <p className="receipt-number">
        <span>접수 번호</span> <output aria-label="접수 번호">{reservation.receiptNo}</output>
      </p>
      <dl className="summary">
        <div><dt>강좌</dt><dd>{reservation.courseTitle}</dd></div>
        <div><dt>수업 시간</dt><dd>{reservation.timeLabel}</dd></div>
        <div><dt>신청자 이름</dt><dd>{reservation.applicantName}</dd></div>
        <div><dt>휴대전화 번호</dt><dd>{reservation.phone}</dd></div>
        <div><dt>접수 일시</dt><dd>{formatDateTime(reservation.createdAt)}</dd></div>
        <div><dt>상태</dt><dd>{reservation.status}</dd></div>
      </dl>
    </section>
  );
}

function ReservationPage({ receiptNo, last }: { receiptNo: string; last: Reservation | null }) {
  const [reservation, setReservation] = useState<Reservation | null>(last && last.receiptNo === receiptNo ? last : null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (reservation) return;
    let active = true;
    api.reservations()
      .then((result) => {
        if (!active) return;
        const found = result.reservations.find((item) => item.receiptNo === receiptNo);
        if (found) setReservation(found);
        else setError('해당 접수 번호의 신청 내역을 찾을 수 없습니다.');
      })
      .catch((failure) => active && setError(failure instanceof ApiFailure ? failure.message : '신청 내역을 불러오지 못했습니다.'));
    return () => {
      active = false;
    };
  }, [receiptNo, reservation]);

  return (
    <>
      <PageTitle>신청 결과</PageTitle>
      <ErrorBox error={error || null} />
      {reservation ? <ReceiptView reservation={reservation} /> : !error ? <p className="loading">신청 내역을 확인하고 있습니다…</p> : null}
      <div className="form-actions">
        <Link to="/my" className="button secondary">전체 신청 내역</Link>
        <Link to="/courses" className="button ghost">다른 강좌 보기</Link>
      </div>
    </>
  );
}

function MyReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    api.reservations()
      .then((result) => active && setReservations(result.reservations))
      .catch((failure) => active && setError(failure instanceof ApiFailure ? failure.message : '신청 내역을 불러오지 못했습니다.'));
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageTitle>신청 내역</PageTitle>
      <ErrorBox error={error || null} />
      {!reservations && !error ? <p className="loading">신청 내역을 불러오는 중입니다…</p> : null}
      {reservations && reservations.length === 0 ? (
        <div className="panel empty">
          <p>아직 신청하신 강좌가 없습니다.</p>
          <Link to="/courses" className="button primary">강좌 둘러보기</Link>
        </div>
      ) : null}
      {reservations && reservations.length > 0 ? (
        <table className="table">
          <caption className="sr-only">내 수강 신청 목록</caption>
          <thead>
            <tr><th scope="col">접수 번호</th><th scope="col">강좌</th><th scope="col">수업 시간</th><th scope="col">신청자</th><th scope="col">상태</th></tr>
          </thead>
          <tbody>
            {reservations.map((item) => (
              <tr key={item.receiptNo}>
                <td><Link to={'/reservations/' + encodeURIComponent(item.receiptNo)}>{item.receiptNo}</Link></td>
                <td>{item.courseTitle}</td>
                <td>{item.timeLabel}</td>
                <td>{item.applicantName}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}

function NotFoundPage() {
  return (
    <section className="panel narrow">
      <PageTitle>페이지를 찾을 수 없습니다</PageTitle>
      <p>주소가 바뀌었거나 없는 페이지입니다.</p>
      <Link to="/" className="button primary">첫 화면으로</Link>
    </section>
  );
}

