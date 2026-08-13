/**
 * lib/prisma.ts
 * Prisma 客户端单例，防止 Next.js 热重载时创建多个数据库连接。
 */
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
