/**
 * lib/supabase.ts
 * Supabase REST API 客户端（完全兼容 Prisma API）
 * 
 * 基于 PostgREST (Supabase REST API) 的数据库操作库
 * 使用 HTTPS 443 端口，完全绕过 PostgreSQL 直连限制
 * 
 * 支持 Prisma 风格的 API：
 *   - prisma.table.findUnique({ where: { code: 'xxx' } })
 *   - prisma.table.findMany({ where: {...}, orderBy: {...} })
 *   - prisma.table.create({ data: {...} })
 *   - prisma.table.update({ where: {...}, data: {...} })
 *   - prisma.table.upsert({ where: {...}, update: {...}, create: {...} })
 */

import 'dotenv/config';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const API_BASE = `${SUPABASE_URL}/rest/v1`;

/**
 * 通用 HTTP 请求
 */
async function request<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: any,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const url = `${API_BASE}${path}`;

  const headers: Record<string, string> = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...extraHeaders,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase API Error (${response.status}): ${errorText}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) as T : {} as T;
}

/**
 * Prisma 兼容的数据库客户端
 * 支持 Prisma 风格的 API 调用方式
 */
class PrismaTableClient {
  private table: string;

  constructor(table: string) {
    this.table = table;
  }

  /**
   * camelCase 转 snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  /**
   * 递归将对象的所有键从 camelCase 转换为 snake_case
   */
  private keysToSnakeCase(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.keysToSnakeCase(item));
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[this.toSnakeCase(key)] = this.keysToSnakeCase(value);
      }
      return result;
    }
    return obj;
  }

  /**
   * 构建 PostgREST 查询字符串
   * 自动将 camelCase 字段名转换为 snake_case
   */
  private buildQuery(params: Record<string, any>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(`{${value.join(',')}}`)}`);
      } else if (typeof value === 'object') {
        for (const [subKey, subValue] of Object.entries(value)) {
          const paramKey = `${key}.${this.toSnakeCase(subKey)}`;
          const paramValue = Array.isArray(subValue)
            ? `{${subValue.join(',')}}`
            : String(subValue);
          parts.push(`${encodeURIComponent(paramKey)}=${encodeURIComponent(paramValue)}`);
        }
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
      }
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  /**
   * Prisma 风格的 findMany
   * 用法：findMany({ where: { status: 'active' }, orderBy: { dayTag: 'asc' } })
   * 自动将 camelCase 字段名转换为 snake_case
   */
  async findMany(options: any = {}): Promise<any[]> {
    const params: Record<string, any> = {};

    // 处理 where 条件（camelCase → snake_case）
    if (options.where) {
      const where = this.keysToSnakeCase(options.where);
      for (const [key, value] of Object.entries(where)) {
        if (value === null || value === undefined) {
          params[`is.${key}`] = 'null';
        } else {
          params[`eq.${key}`] = String(value);
        }
      }
    }

    // 处理 select
    if (options.select && typeof options.select === 'string') {
      params['select'] = options.select;
    }

    // 处理 orderBy（camelCase → snake_case）
    if (options.orderBy) {
      if (typeof options.orderBy === 'string') {
        params['order'] = options.orderBy;
      } else if (typeof options.orderBy === 'object') {
        const orderParts: string[] = [];
        for (const [key, direction] of Object.entries(options.orderBy)) {
          const snakeKey = this.toSnakeCase(key);
          orderParts.push(`${snakeKey}.${direction === 'asc' ? 'asc' : 'desc'}`);
        }
        params['order'] = orderParts.join(',');
      }
    }

    // 处理 take (limit)
    if (options.take !== undefined) {
      params['limit'] = String(options.take);
    }

    // 处理 skip (offset)
    if (options.skip !== undefined) {
      params['offset'] = String(options.skip);
    }

    // 处理 in 条件（camelCase → snake_case）
    if (options.in) {
      for (const [key, values] of Object.entries(options.in)) {
        const snakeKey = this.toSnakeCase(key);
        params[`in.${snakeKey}`] = `{${(values as any[]).join(',')}}`;
      }
    }

    // 处理 notIn 条件（camelCase → snake_case）
    if (options.notIn) {
      for (const [key, values] of Object.entries(options.notIn)) {
        const snakeKey = this.toSnakeCase(key);
        params[`not.${snakeKey}`] = `{${(values as any[]).join(',')}}`;
      }
    }

    const queryStr = this.buildQuery(params);
    return request<any[]>(`/${this.table}${queryStr}`, 'GET');
  }

  /**
   * Prisma 风格的 findUnique
   * 用法：findUnique({ where: { code: 'ABC123' } })
   */
  async findUnique(options: any): Promise<any | null> {
    const where = options.where || options;
    const rows = await this.findMany({ where, take: 1 });
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Prisma 风格的 findFirst
   * 用法：findFirst({ where: { status: 'active' } })
   */
  async findFirst(options: any = {}): Promise<any | null> {
    const rows = await this.findMany({ ...options, take: 1 });
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Prisma 风格的 create
   * 用法：create({ data: { name: 'xxx' } })
   * 自动将 camelCase 字段名转换为 snake_case
   */
  async create(options: any): Promise<any> {
    const data = options.data || options;
    const snakeCaseData = this.keysToSnakeCase(data);
    return request<any>(`/${this.table}`, 'POST', snakeCaseData);
  }

  /**
   * Prisma 风格的 createMany
   * 用法：createMany({ data: [{ name: 'xxx' }, { name: 'yyy' }] })
   * 自动将 camelCase 字段名转换为 snake_case
   */
  async createMany(options: any): Promise<any[]> {
    const dataList = Array.isArray(options) ? options : (options.data || []);
    if (dataList.length === 0) return [];
    const snakeCaseDataList = dataList.map(item => this.keysToSnakeCase(item));
    return request<any[]>(`/${this.table}`, 'POST', snakeCaseDataList);
  }

  /**
   * Prisma 风格的 update
   * 用法：update({ where: { id: 'xxx' }, data: { status: 'active' } })
   * 自动将 camelCase 字段名转换为 snake_case
   */
  async update(options: any): Promise<any> {
    const where = this.keysToSnakeCase(options.where || {});
    const data = this.keysToSnakeCase(options.data || options);
    const params: Record<string, any> = {};

    for (const [key, value] of Object.entries(where)) {
      params[`eq.${key}`] = String(value);
    }

    const queryStr = this.buildQuery(params);
    return request<any>(`/${this.table}${queryStr}`, 'PATCH', data);
  }

  /**
   * Prisma 风格的 upsert
   * 用法：upsert({
   *   where: { skuCode_dayTag_seqNo: { skuCode: 'xxx', dayTag: 1, seqNo: 1 } },
   *   update: { status: 'active' },
   *   create: { ... }
   * })
   * 
   * 简化版：upsert({ where: { id: 'xxx' }, update: {...}, create: {...} })
   * 自动将 camelCase 字段名转换为 snake_case
   */
  async upsert(options: any): Promise<any> {
    let where: Record<string, any> = {};
    
    // 处理 Prisma 复合唯一键格式
    if (options.where) {
      for (const [key, value] of Object.entries(options.where)) {
        if (typeof value === 'object' && value !== null) {
          // 复合键：{ skuCode_dayTag_seqNo: { skuCode: 'xxx', dayTag: 1 } }
          // 转换为 snake_case
          const converted = this.keysToSnakeCase(value);
          Object.assign(where, converted);
        } else {
          where[this.toSnakeCase(key)] = value;
        }
      }
    }

    // 先查找是否存在
    const existing = await this.findUnique({ where });

    if (existing) {
      // 更新
      const updateData = this.keysToSnakeCase(options.update || {});
      return this.update({ where, data: updateData });
    } else {
      // 创建
      const createData = this.keysToSnakeCase(options.create || { ...options.update });
      return this.create({ data: createData });
    }
  }

  /**
   * Prisma 风格的 delete
   * 用法：delete({ where: { id: 'xxx' } })
   * 自动将 camelCase 字段名转换为 snake_case
   */
  async delete(options: any): Promise<any> {
    const where = this.keysToSnakeCase(options.where || options);
    const params: Record<string, any> = {};

    for (const [key, value] of Object.entries(where)) {
      params[`eq.${key}`] = String(value);
    }

    const queryStr = this.buildQuery(params);
    return request<any>(`/${this.table}${queryStr}`, 'DELETE');
  }

  /**
   * Prisma 风格的 deleteMany
   * 用法：deleteMany({ where: { status: 'inactive' } })
   */
  async deleteMany(options: any = {}): Promise<any> {
    return this.delete(options);
  }

  /**
   * 保留方法
   */
  async $disconnect(): Promise<void> {
    // Supabase REST API 不需要显式断开连接
  }

  /**
   * 保留方法
   */
  async $transaction(): Promise<any> {
    console.warn('Supabase REST API 不支持事务，操作将独立执行');
  }

  /**
   * 保留方法
   */
  async $connect(): Promise<void> {
    // Supabase REST API 不需要显式连接
  }

  /**
   * 辅助方法：转换嵌套对象的键名
   * Prisma 复合键格式转换为平铺格式
   */
  private convertKeys(obj: Record<string, any>): Record<string, any> {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[this.toSnakeCase(key)] = value;
    }
    return result;
  }

  /**
   * camelCase 转 snake_case
   */
  private toSnakeCase(str: string): string {
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
  }
}

/**
 * Prisma 兼容客户端 - 支持动态表名访问
 * 
 * 用法：
 *   import { prisma } from '@/lib/supabase';
 *   
 *   // 与 Prisma 完全相同的 API
 *   const records = await prisma.questions.findMany({ where: { status: 'active' } });
 *   const newCode = await prisma.accessCodes.create({ data: { code: 'ABC123' } });
 *   await prisma.sessions.update({ where: { id: 'xxx' }, data: { status: 'submitted' } });
 */
class PrismaClientCompat {
  [key: string]: any;

  constructor() {
    // 预定义常用表（camelCase 映射到 snake_case）
    const tableMap: Record<string, string> = {
      questions: 'questions',
      accessCodes: 'access_codes',
      sessions: 'sessions',
      records: 'answer_records',
      reportDrafts: 'report_drafts',
      blueprints: 'blueprints',
      kpDependencies: 'kp_dependencies',
      methodCards: 'method_cards',
      reports: 'reports',
      students: 'students',
      adminLogs: 'admin_logs',
      retestIntents: 'retest_intents',
      reportFeedback: 'report_feedback',
    };

    for (const [prismaName, tableName] of Object.entries(tableMap)) {
      (this as any)[prismaName] = new PrismaTableClient(tableName);
    }
  }

  /**
   * 动态访问表
   */
  getTable(name: string): PrismaTableClient {
    if (!this[name]) {
      // camelCase 转 snake_case
      const tableName = name.replace(/([A-Z])/g, '_$1').toLowerCase();
      this[name] = new PrismaTableClient(tableName);
    }
    return this[name];
  }

  async $disconnect(): Promise<void> {}
  async $connect(): Promise<void> {}
  async $transaction(): Promise<any> {}
}

// 创建 Proxy 实现动态属性访问
const prismaProxy = new Proxy(new PrismaClientCompat(), {
  get(target, prop: string) {
    if (prop in target) {
      return (target as any)[prop];
    }
    // 动态创建表访问
    return target.getTable(prop);
  },
});

/**
 * 导出 prisma 兼容客户端
 */
export const prisma = prismaProxy;

/**
 * 导出数据库客户端（直接使用）
 */
export const db = prismaProxy;

/**
 * 兼容 lib/prisma.ts 的导出
 */
export default prisma;
