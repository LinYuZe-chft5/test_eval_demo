/**
 * lib/prisma.ts
 * Prisma 兼容层 - 实际使用 Supabase REST API（通过 lib/supabase.ts）
 * 
 * 此文件保持对原有 Prisma API 的兼容，底层实现使用 Supabase PostgREST
 * 通过 HTTPS 443 端口访问数据库，完全绕过 PostgreSQL 直连限制
 */
export { prisma } from './supabase';
export { prisma as default } from './supabase';
