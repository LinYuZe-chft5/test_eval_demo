'use client';

/**
 * components/Countdown.tsx
 * 倒计时组件 —— 显示剩余时间，临近结束时高亮，时间到自动触发提交。
 */
import { useEffect, useRef, useState } from 'react';

interface Props {
  /** 倒计时总秒数 */
  limitSec: number;
  /** 是否运行 */
  running?: boolean;
  /** 剩余多少分钟时进入告警（默认 5） */
  warnBeforeMin?: number;
  /** 时间到回调 */
  onTimeout?: () => void;
}

function format(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function Countdown({
  limitSec,
  running = true,
  warnBeforeMin = 5,
  onTimeout,
}: Props) {
  const [remain, setRemain] = useState(limitSec);
  const firedRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setRemain((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          clearInterval(timer);
          if (!firedRef.current) {
            firedRef.current = true;
            onTimeoutRef.current?.();
          }
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [running]);

  const isWarn = remain <= warnBeforeMin * 60;
  const isCritical = remain <= 60;

  return (
    <div
      className={`px-3 py-1 rounded-full text-sm font-mono font-semibold tabular-nums ${
        isCritical
          ? 'bg-red-100 text-red-700 animate-pulse'
          : isWarn
            ? 'bg-amber-100 text-amber-700'
            : 'bg-gray-100 text-gray-700'
      }`}
      aria-label="剩余时间"
    >
      ⏱ {format(remain)}
    </div>
  );
}
