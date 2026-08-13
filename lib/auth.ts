/**
 * lib/auth.ts
 * 简单的访问码验证与会话管理工具（不使用 JWT，用 sessions 表管理状态）。
 *
 * 依赖 access_codes / sessions 表（由 prisma db pull 生成模型）。
 */
import { prisma } from './prisma';
import { customAlphabet } from 'nanoid';

const sessionIdGen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

/** 校验访问码：状态为 active 且未过期，返回访问码记录（含 studentId / skuCode）。 */
export async function verifyAccessCode(code: string) {
  if (!code) return null;
  const record = await (prisma as any).accessCodes.findUnique({
    where: { code: code.trim().toUpperCase() },
  });
  if (!record) return null;
  if (record.status !== 'active') return null;
  const now = new Date();
  if (record.expiresAt && new Date(record.expiresAt) <= now) return null;
  return record;
}

/** 创建诊断会话记录，返回 session。 */
export async function createSession(params: {
  accessCode: string;
  skuCode: string;
  studentId?: string | null;
  dayTag: 1 | 2 | 3;
  timeLimitMin: number;
}) {
  const id = sessionIdGen();
  const session = await (prisma as any).sessions.create({
    data: {
      id,
      accessCode: params.accessCode,
      skuCode: params.skuCode,
      studentId: params.studentId ?? null,
      dayTag: params.dayTag,
      status: 'in_progress',
      timeLimitMin: params.timeLimitMin,
      startedAt: new Date(),
    },
  });
  return session;
}

/** 按 id 获取会话。 */
export async function getSession(sessionId: string) {
  return (prisma as any).sessions.findUnique({ where: { id: sessionId } });
}

/** 标记会话为已提交。 */
export async function markSessionSubmitted(sessionId: string, score: number) {
  return (prisma as any).sessions.update({
    where: { id: sessionId },
    data: { status: 'submitted', submittedAt: new Date(), score },
  });
}

/** 获取某访问码已完成的各天会话（用于判断三天是否全部完成）。 */
export async function getCompletedSessions(accessCode: string) {
  return (prisma as any).sessions.findMany({
    where: { accessCode, status: 'submitted' },
    orderBy: { dayTag: 'asc' },
  });
}
