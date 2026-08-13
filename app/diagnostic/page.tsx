'use client';

/**
 * app/diagnostic/page.tsx
 * 诊断作答页 —— 显示题目、选项、填空、分步解答。
 * - 顶部：倒计时、进度条
 * - 中部：题干(KaTeX)、作答区
 * - 底部：上一题/下一题、标记"我猜的"
 * - 行为采集：enter/click/change/submit 的 timestamp
 * - 防作弊：右键禁用、复制禁用、切屏检测(screen_leave/screen_enter)
 * - 回翻只读：已作答题目仅展示，不可修改
 */
import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  QuestionCard,
  type AnswerEvent,
  type QuestionData,
  type QuestionValue,
} from '@/components/QuestionCard';
import Countdown from '@/components/Countdown';

interface SessionPayload {
  session_id: string;
  questions: QuestionData[];
  time_limit_min: number;
}

export default function DiagnosticPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">加载中...</div>}>
      <DiagnosticInner />
    </Suspense>
  );
}

function DiagnosticInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id');

  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionValue>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [selfMarks, setSelfMarks] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{
    score?: number;
    probe_questions?: QuestionData[];
    all_done?: boolean;
    student_id?: string;
  } | null>(null);
  const [errMsg, setErrMsg] = useState('');

  // 行为事件按题目聚合（用 ref 避免 re-render）
  const eventsRef = useRef<Record<string, AnswerEvent[]>>({});
  const currentIdRef = useRef<string>('');
  const submittingRef = useRef(false);
  const answersRef = useRef<Record<string, QuestionValue>>({});
  const selfMarksRef = useRef<Record<string, string | null>>({});
  const submittedRef = useRef<Record<string, boolean>>({});

  // 同步 ref
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    selfMarksRef.current = selfMarks;
  }, [selfMarks]);

  // 加载会话数据
  useEffect(() => {
    if (!sessionId) {
      router.replace('/');
      return;
    }
    let data: SessionPayload | null = null;
    try {
      data = JSON.parse(sessionStorage.getItem('diag_session') || 'null');
    } catch {
      data = null;
    }
    if (!data || data.session_id !== sessionId) {
      router.replace('/');
      return;
    }
    setPayload(data);
    setReady(true);
  }, [sessionId, router]);

  // 跟踪当前题目 id
  useEffect(() => {
    if (payload) currentIdRef.current = payload.questions[idx]?.id ?? '';
  }, [payload, idx]);

  const pushEvent = (qid: string, ev: AnswerEvent) => {
    const arr = eventsRef.current[qid] ?? [];
    arr.push(ev);
    eventsRef.current[qid] = arr;
  };

  // 防作弊 + 切屏检测
  useEffect(() => {
    if (!ready) return;
    const prevent = (e: Event) => e.preventDefault();
    const onVisibility = () => {
      const qid = currentIdRef.current;
      if (!qid) return;
      pushEvent(qid, {
        type: document.hidden ? 'screen_leave' : 'screen_enter',
        ts: Date.now(),
      });
    };
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('copy', prevent);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('copy', prevent);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ready]);

  const handleEvent = (ev: AnswerEvent) => {
    const qid = currentIdRef.current;
    if (qid) pushEvent(qid, ev);
  };

  const handleChange = (v: QuestionValue) => {
    const qid = currentIdRef.current;
    if (!qid) return;
    setAnswers((prev) => ({ ...prev, [qid]: v }));
  };

  const handleSelfMark = (mark: string | null) => {
    const qid = currentIdRef.current;
    if (!qid) return;
    setSelfMarks((prev) => ({ ...prev, [qid]: mark }));
  };

  const lockCurrent = () => {
    const qid = currentIdRef.current;
    if (!qid) return;
    // 幂等：避免重复记录 submit 事件
    if (submittedRef.current[qid]) return;
    submittedRef.current[qid] = true;
    pushEvent(qid, {
      type: 'submit',
      ts: Date.now(),
      self_mark: selfMarksRef.current[qid] ?? null,
    });
    setSubmitted((prev) => ({ ...prev, [qid]: true }));
  };

  const goPrev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  const goNext = () => {
    if (!payload) return;
    lockCurrent();
    if (idx < payload.questions.length - 1) {
      setIdx(idx + 1);
    } else {
      void handleSubmit();
    }
  };

  const handleSubmit = useCallback(async () => {
    if (!payload || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setErrMsg('');
    // 锁定当前题
    lockCurrent();

    const answersArr = payload.questions.map((q) => {
      const v = answersRef.current[q.id] ?? {};
      let answer: string | string[] | Record<number, string> | null = null;
      if (q.q_type === 'choice') answer = v.choice ?? null;
      else if (q.q_type === 'fill') answer = v.fill ?? '';
      else answer = v.step ?? {};
      return {
        question_id: q.id,
        answer,
        answer_events: eventsRef.current[q.id] ?? [],
        self_mark: selfMarksRef.current[q.id] ?? null,
      };
    });

    try {
      const res = await fetch('/api/session/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: payload.session_id, answers: answersArr }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrMsg(json.error || '提交失败');
      } else {
        setResult(json.data);
        setDone(true);
        try {
          sessionStorage.removeItem('diag_session');
        } catch {
          /* ignore */
        }
      }
    } catch {
      setErrMsg('网络异常，提交失败');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload]);

  // ===== 未就绪 =====
  if (!ready || !payload) {
    return <div className="p-8 text-center text-gray-400">加载中...</div>;
  }

  // ===== 完成页 =====
  if (done) {
    return (
      <main className="min-h-screen px-5 py-8 flex flex-col">
        <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-3 mt-6">
          <div className="text-4xl">✅</div>
          <h1 className="text-xl font-bold">本次诊断已提交</h1>
          {typeof result?.score === 'number' && (
            <p className="text-3xl font-bold text-blue-600">{result.score} 分</p>
          )}
          {result?.probe_questions && result.probe_questions.length > 0 && (
            <p className="text-xs text-amber-600">
              系统检测到 {result.probe_questions.length} 道快速作答，已安排二次探测题。
            </p>
          )}
          {result?.all_done ? (
            <div className="space-y-2 pt-2">
              <p className="text-sm text-gray-600">三天诊断全部完成，报告已生成。</p>
              <a
                href={`/report?student_id=${encodeURIComponent(result.student_id ?? '')}`}
                className="inline-block w-full rounded-lg bg-blue-600 py-2.5 text-white font-medium"
              >
                查看诊断报告
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-500">请于次日继续下一阶段诊断。</p>
          )}
          <button
            type="button"
            onClick={() => router.push('/')}
            className="w-full rounded-lg border border-gray-300 py-2.5 text-gray-600"
          >
            返回首页
          </button>
        </div>
      </main>
    );
  }

  // ===== 作答页 =====
  const total = payload.questions.length;
  const q = payload.questions[idx];
  const isLast = idx === total - 1;
  const qid = q.id;
  const readOnly = !!submitted[qid];
  const progress = ((idx + 1) / total) * 100;

  return (
    <main className="min-h-screen flex flex-col anti-cheat">
      {/* 顶部：倒计时 + 进度 */}
      <header className="sticky top-0 z-10 bg-white/95 backdrop-blur px-4 py-2 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">第 {idx + 1}/{total} 题</span>
          <Countdown
            limitSec={payload.time_limit_min * 60}
            onTimeout={() => void handleSubmit()}
          />
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-gray-200">
          <div
            className="progress-bar h-full rounded-full bg-blue-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* 中部：题目 */}
      <div className="flex-1 px-4 py-4">
        <QuestionCard
          question={q}
          index={idx}
          total={total}
          value={answers[qid] ?? {}}
          readOnly={readOnly}
          selfMark={selfMarks[qid] ?? null}
          onEvent={handleEvent}
          onChange={handleChange}
          onSelfMark={handleSelfMark}
        />
        {errMsg && <p className="mt-3 text-xs text-red-500 text-center">{errMsg}</p>}
      </div>

      {/* 底部：导航 */}
      <footer className="sticky bottom-0 bg-white/95 backdrop-blur px-4 py-3 shadow-[0_-1px_4px_rgba(0,0,0,0.05)]">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={goPrev}
            disabled={idx === 0}
            className="flex-1 rounded-lg border border-gray-300 py-2.5 text-gray-600 disabled:opacity-40"
          >
            上一题
          </button>
          <button
            type="button"
            onClick={goNext}
            disabled={submitting}
            className="flex-[2] rounded-lg bg-blue-600 py-2.5 text-white font-medium disabled:opacity-50"
          >
            {submitting ? '提交中...' : isLast ? '提交诊断' : '下一题'}
          </button>
        </div>
      </footer>
    </main>
  );
}
