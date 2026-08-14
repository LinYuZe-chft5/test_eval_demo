/**
 * lib/auth.ts
 * 简单的访问码验证与会话管理工具（不使用 JWT，用 sessions 表管理状态）。
 *
 * 依赖 access_codes / sessions 表（由 prisma db pull 生成模型）。
 */
import { prisma } from './prisma';
import { customAlphabet } from 'nanoid';

const sessionIdGen = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 16);

/** 根据访问码获取或创建学生记录，返回含 BIGINT id 的 student 对象。 */
export async function getOrCreateStudentByAccessCode(accessCode: string) {
  if (!accessCode) return null;
  const accessCodeRecord = await (prisma as any).accessCodes.findUnique({
    where: { code: accessCode.trim().toUpperCase() },
  });
  if (!accessCodeRecord) return null;

  const accessCodeId = accessCodeRecord.id;
  const skuCode = accessCodeRecord.skuCode;

  let student = await (prisma as any).students.findUnique({
    where: { accessCodeId: accessCodeId },
  });

  if (!student) {
    student = await (prisma as any).students.create({
      data: {
        accessCodeId: accessCodeId,
        skuCode: skuCode,
        nickname: '学生',
        grade: '七年级',
      },
    });
  }

  return student;
}

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

  const student = await getOrCreateStudentByAccessCode(code);
  const result: any = { ...record };
  if (student) {
    result.studentId = typeof student.id === 'string' ? BigInt(student.id) : Number(student.id);
  }
  return result;
}

/** 创建诊断会话记录，返回 session。 */
export async function createSession(params: {
  accessCode: string;
  skuCode: string;
  studentId?: string | number | bigint | null;
  dayTag: 1 | 2 | 3;
  timeLimitMin: number;
}) {
  const id = sessionIdGen();

  let realStudentId: number | bigint | null = null;
  if (params.studentId != null && typeof params.studentId !== 'string') {
    realStudentId = params.studentId;
  } else {
    const student = await getOrCreateStudentByAccessCode(params.accessCode);
    if (student) {
      realStudentId = typeof student.id === 'string' ? BigInt(student.id) : Number(student.id);
    }
  }

  if (!realStudentId) {
    throw new Error('无法创建会话：缺少学生记录');
  }

  const timeLimitSec = Math.floor(params.timeLimitMin * 60);

  // 仅写入 DDL 中 test_sessions 真实存在的列
  const session = await (prisma as any).sessions.create({
    data: {
      id,
      // accessCode/accessCodeId 在 DDL 中不存在，需通过 student_id 反查
      studentId: realStudentId,   // BIGINT NOT NULL REFERENCES students(id)
      skuCode: params.skuCode,    // VARCHAR(32) NOT NULL
      dayTag: params.dayTag,      // SMALLINT NOT NULL
      status: 'in_progress',      // locked/available/in_progress/submitted
      timeLimitSec,               // INT NOT NULL
      startedAt: new Date(),      // TIMESTAMPTZ
      optionOrders: {},           // JSONB 默认空对象（题目乱序，我们暂时不需要乱序功能）
      credibilityFlag: null,      // VARCHAR(16) 低信度标记：low_credibility
      deviceInfo: null,           // JSONB {type,ua,screen}
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

/**
 * 获取某访问码已完成的各天会话（用于判断三天是否全部完成）。
 * 由于 test_sessions 表无 access_code 直连列，先通过 access_code → students.access_code_id
 * 找到 student，再用 student_id 查询已提交会话。
 */
export async function getCompletedSessions(accessCode: string) {
  if (!accessCode) return [];
  const trimmedCode = accessCode.trim().toUpperCase();
  const accessCodeRecord = await (prisma as any).accessCodes.findUnique({
    where: { code: trimmedCode },
  });
  if (!accessCodeRecord) return [];

  const student = await (prisma as any).students.findUnique({
    where: { accessCodeId: accessCodeRecord.id },
  });
  if (!student) return [];

  const studentId = typeof student.id === 'string' ? BigInt(student.id) : Number(student.id);
  return (prisma as any).sessions.findMany({
    where: { studentId, status: 'submitted' },
    orderBy: { dayTag: 'asc' },
  });
}
