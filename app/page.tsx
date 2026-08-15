'use client';

/**
 * app/page.tsx
 * 首页 —— 多身份学科诊断系统入口
 * 支持：身份选择（初一/初二/初三）+ 访问码注册/验证
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IDENTITY_CONFIGS, type Identity } from '@/lib/identity';

interface VerifyResult {
  valid: boolean;
  student_id?: string;
  sku_code?: string;
  identity?: string;
  days_available?: number[];
  completed_days?: number[];
  nickname?: string;
  error?: string;
}

type PageMode = 'landing' | 'register' | 'verify' | 'dashboard';

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<PageMode>('landing');
  const [identity, setIdentity] = useState<Identity | ''>('');
  const [accessCode, setAccessCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [errMsg, setErrMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ===== 注册访问码 =====
  async function handleRegister() {
    setErrMsg('');
    setSuccessMsg('');

    if (!identity) {
      setErrMsg('请先选择身份');
      return;
    }
    if (!accessCode.trim() || accessCode.trim().length < 4) {
      setErrMsg('访问码长度至少4位');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/access/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity,
          access_code: accessCode.trim(),
          nickname: nickname.trim() || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrMsg(json.error || '注册失败');
      } else {
        setSuccessMsg('注册成功！请使用访问码登录');
        setMode('verify');
        // 自动填入访问码
        setAccessCode(json.data.access_code);
      }
    } catch {
      setErrMsg('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  // ===== 验证访问码 =====
  async function handleVerify() {
    setErrMsg('');
    setSuccessMsg('');

    if (!identity) {
      setErrMsg('请先选择身份');
      return;
    }
    if (!accessCode.trim()) {
      setErrMsg('请输入访问码');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/access/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity,
          access_code: accessCode.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrMsg(json.error || '访问码验证失败');
        setVerify(null);
      } else {
        const data = json.data as VerifyResult;
        if (data.valid) {
          setVerify(data);
          setMode('dashboard');
          // 保存到 sessionStorage
          try {
            sessionStorage.setItem('diag_identity', identity);
            sessionStorage.setItem('diag_access_code', accessCode.trim().toUpperCase());
            if (data.student_id) {
              sessionStorage.setItem('diag_student_id', data.student_id);
            }
          } catch { /* ignore */ }
        } else {
          setErrMsg(data.error || '访问码无效');
          setVerify(null);
        }
      }
    } catch {
      setErrMsg('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  // ===== 开始某一天的诊断 =====
  async function handleStart(day: 1 | 2 | 3) {
    setErrMsg('');
    setLoading(true);
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity,
          access_code: accessCode.trim().toUpperCase(),
          day,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setErrMsg(json.error || '会话创建失败');
      } else {
        try {
          sessionStorage.setItem('diag_session', JSON.stringify(json.data));
        } catch { /* ignore */ }
        const { session_id } = json.data;
        router.push(`/diagnostic?session_id=${session_id}`);
      }
    } catch {
      setErrMsg('网络异常，请重试');
    } finally {
      setLoading(false);
    }
  }

  // ===== 切换模式 =====
  function switchMode(newMode: PageMode) {
    setMode(newMode);
    setErrMsg('');
    setSuccessMsg('');
  }

  // ===== 渲染 Landing 页面 =====
  if (mode === 'landing') {
    return (
      <main className="flex min-h-screen flex-col px-5 py-8">
        <div className="space-y-4 pt-4 pb-6 text-center">
          <div className="text-5xl">📚</div>
          <h1 className="text-2xl font-bold text-gray-800">学科诊断系统</h1>
          <p className="text-sm text-gray-500 leading-relaxed">
            三天分阶段诊断 · 精准定位知识薄弱点
            <br />
            生成个性化干预计划
          </p>
        </div>

        {/* 身份选择 */}
        <div className="space-y-3 bg-white rounded-xl p-5 shadow-sm">
          <label className="block text-sm font-medium text-gray-700 mb-2">请选择您的身份</label>
          <div className="grid grid-cols-3 gap-2">
            {(Object.entries(IDENTITY_CONFIGS) as [Identity, typeof IDENTITY_CONFIGS[Identity]][]).map(
              ([key, config]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIdentity(key)}
                  className={`rounded-lg py-3 text-sm font-medium transition ${
                    identity === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 text-gray-700 border border-gray-200 active:scale-[0.97]'
                  }`}
                >
                  {config.label}
                </button>
              )
            )}
          </div>
          {identity && (
            <p className="text-xs text-gray-400 mt-2">
              {IDENTITY_CONFIGS[identity].description}
            </p>
          )}
        </div>

        {/* 操作入口 */}
        {identity && (
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={() => switchMode('verify')}
              className="w-full rounded-lg bg-blue-600 py-3 text-white font-medium active:scale-[0.99]"
            >
              我已有访问码，开始诊断
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className="w-full rounded-lg border-2 border-blue-600 py-3 text-blue-600 font-medium active:scale-[0.99]"
            >
              我是新用户，注册访问码
            </button>
          </div>
        )}

        <div className="mt-auto pt-8 text-center text-xs text-gray-400">
          © 学科诊断 MVP · 仅供验证使用
        </div>
      </main>
    );
  }

  // ===== 渲染 Register 页面 =====
  if (mode === 'register') {
    return (
      <main className="flex min-h-screen flex-col px-5 py-8">
        <div className="space-y-3 pt-4 pb-6 text-center">
          <h1 className="text-xl font-bold">注册访问码</h1>
          <p className="text-sm text-gray-500">创建您的专属访问码，开始三天诊断之旅</p>
        </div>

        <div className="space-y-4 bg-white rounded-xl p-5 shadow-sm">
          {/* 身份展示 */}
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-sm text-gray-500">已选择身份</span>
            <span className="text-sm font-medium text-blue-600">
              {identity ? IDENTITY_CONFIGS[identity].label : '未选择'}
            </span>
          </div>

          {/* 访问码输入 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              设置您的访问码 <span className="text-xs text-gray-400">（4-32位，字母数字）</span>
            </label>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="例如：MYCODE123"
              maxLength={32}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* 昵称输入（可选） */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              昵称（可选）
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="例如：小明"
              maxLength={32}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
          {successMsg && <p className="text-xs text-green-600">{successMsg}</p>}

          <button
            type="button"
            onClick={handleRegister}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 text-white font-medium disabled:opacity-50 active:scale-[0.99]"
          >
            {loading ? '注册中...' : '注册访问码'}
          </button>

          <button
            type="button"
            onClick={() => switchMode('landing')}
            className="w-full text-sm text-gray-500 py-2"
          >
            ← 返回
          </button>
        </div>

        <div className="mt-auto pt-8 text-center text-xs text-gray-400">
          © 学科诊断 MVP · 仅供验证使用
        </div>
      </main>
    );
  }

  // ===== 渲染 Verify 页面 =====
  if (mode === 'verify') {
    return (
      <main className="flex min-h-screen flex-col px-5 py-8">
        <div className="space-y-3 pt-4 pb-6 text-center">
          <h1 className="text-xl font-bold">验证访问码</h1>
          <p className="text-sm text-gray-500">
            身份：{identity ? IDENTITY_CONFIGS[identity].label : '未选择'}
          </p>
        </div>

        <div className="space-y-4 bg-white rounded-xl p-5 shadow-sm">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              请输入您的访问码
            </label>
            <input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.toUpperCase())}
              placeholder="请输入访问码"
              maxLength={32}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center tracking-widest font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>

          {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
          {successMsg && <p className="text-xs text-green-600">{successMsg}</p>}

          <button
            type="button"
            onClick={handleVerify}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 text-white font-medium disabled:opacity-50 active:scale-[0.99]"
          >
            {loading ? '验证中...' : '开始诊断'}
          </button>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => switchMode('landing')}
              className="flex-1 text-sm text-gray-500 py-2"
            >
              ← 返回
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className="flex-1 text-sm text-blue-600 py-2"
            >
              注册新访问码
            </button>
          </div>
        </div>

        <div className="mt-auto pt-8 text-center text-xs text-gray-400">
          © 学科诊断 MVP · 仅供验证使用
        </div>
      </main>
    );
  }

  // ===== 渲染 Dashboard 页面（已验证） =====
  const availableDays: number[] = verify?.days_available ?? [1, 2, 3];
  const completedDays: number[] = verify?.completed_days ?? [];

  return (
    <main className="flex min-h-screen flex-col px-5 py-8">
      {/* 欢迎信息 */}
      <div className="space-y-2 pt-4 pb-4 text-center">
        <div className="text-3xl">🎓</div>
        <h1 className="text-xl font-bold">
          欢迎，{verify?.nickname || '同学'}
        </h1>
        <p className="text-sm text-gray-500">
          {identity ? IDENTITY_CONFIGS[identity].label : ''} · 三天诊断已就绪
        </p>
      </div>

      {/* 诊断日程选择 */}
      <div className="space-y-3 bg-white rounded-xl p-5 shadow-sm">
        <p className="text-sm text-gray-700">请选择今日诊断日程</p>

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

        {/* 查看报告按钮 */}
        {completedDays.length >= 3 && verify?.student_id && (
          <div className="pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={() => router.push(`/report?student_id=${verify.student_id}`)}
              className="w-full rounded-lg bg-green-600 py-3 text-white font-medium active:scale-[0.99]"
            >
              📄 查看诊断报告
            </button>
          </div>
        )}
      </div>

      {/* 退出按钮 */}
      <div className="mt-5">
        <button
          type="button"
          onClick={() => {
            setMode('landing');
            setVerify(null);
            setAccessCode('');
            setIdentity('');
          }}
          className="w-full text-sm text-gray-500 py-2"
        >
          退出登录
        </button>
      </div>

      <div className="mt-auto pt-8 text-center text-xs text-gray-400">
        © 学科诊断 MVP · 仅供验证使用
      </div>
    </main>
  );
}
