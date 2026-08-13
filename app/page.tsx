'use client';

/**
 * app/page.tsx
 * 首页 —— 产品介绍 + 开始诊断入口（输入访问码）。
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface VerifyResult {
  valid: boolean;
  student_id?: string;
  sku_code?: string;
  days_available?: number[];
  completed_days?: number[];
  error?: string;
}

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [errMsg, setErrMsg] = useState('');

  async function handleVerify() {
    setErrMsg('');
    if (!code.trim()) {
      setErrMsg('请输入访问码');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: code.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrMsg(json.error || '访问码验证失败');
        setVerify(null);
      } else {
        setVerify(json.data as VerifyResult);
      }
    } catch {
      setErrMsg('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(day: 1 | 2 | 3) {
    setErrMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_code: code.trim(), day }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrMsg(json.error || '会话创建失败');
      } else {
        // 携带会话数据进入作答页（避免再次请求）
        try {
          sessionStorage.setItem('diag_session', JSON.stringify(json.data));
        } catch {
          /* 忽略存储异常 */
        }
        const { session_id } = json.data;
        router.push(`/diagnostic?session_id=${session_id}`);
      }
    } catch {
      setErrMsg('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  const availableDays: number[] = verify?.days_available ?? [1, 2, 3];
  const completedDays: number[] = verify?.completed_days ?? [];

  return (
    <main className="flex min-h-screen flex-col px-5 py-8">
      {/* 产品介绍 */}
      <div className="space-y-3 pt-4 pb-8 text-center">
        <div className="text-4xl">📊</div>
        <h1 className="text-2xl font-bold">学科诊断系统</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          三天分阶段诊断 · 精准定位知识薄弱点
          <br />
          生成个性化干预计划
        </p>
      </div>

      {/* 访问码输入 */}
      <div className="space-y-3 bg-white rounded-xl p-5 shadow-sm">
        <label className="block text-sm font-medium text-gray-700">访问码</label>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="请输入 8 位访问码"
          maxLength={8}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest font-mono focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleVerify}
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-white font-medium disabled:opacity-50 active:scale-[0.99]"
        >
          {loading ? '验证中...' : '验证访问码'}
        </button>
        {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
      </div>

      {/* 诊断天数选择 */}
      {verify?.valid && (
        <div className="mt-5 space-y-3 bg-white rounded-xl p-5 shadow-sm">
          <p className="text-sm text-gray-700">
            验证成功，请选择诊断日程
            {verify.sku_code && (
              <span className="block text-xs text-gray-400 mt-1">SKU：{verify.sku_code}</span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {availableDays.map((d) => {
              const done = completedDays.includes(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={done || loading}
                  onClick={() => handleStart(d as 1 | 2 | 3)}
                  className={`rounded-lg py-3 text-sm font-medium transition ${
                    done
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 active:scale-[0.97]'
                  }`}
                >
                  {done ? '✓ Day' + d : 'Day ' + d}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-gray-400">
            每日独立计时，完成后次日可继续。已完成为 ✓。
          </p>
        </div>
      )}

      <div className="mt-auto pt-8 text-center text-xs text-gray-400">
        © 学科诊断 MVP · 仅供验证使用
      </div>
    </main>
  );
}
