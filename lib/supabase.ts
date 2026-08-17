/**
 * lib/supabase.ts
 * Supabase REST API 客户端（完全兼容 Prisma API）
 * 
 * 基于 PostgREST (Supabase REST API) 的数据库操作库
 * 使用 HTTPS 443 端口，完全绕过 PostgreSQL 直连限制
 * 
 * PostgREST filter 格式: ?column=operator.value
 *   - ?sku_code=eq.S1_XIAOSHENGCHU_MATH
 *   - ?day_tag=eq.1
 *   - ?status=is.null
 *   - ?or=(col1.eq.1,col2.eq.2)
 *   - ?status=in.(v1,v2,v3)
 */

import fs from 'fs';
import path from 'path';

// 手动加载 .env 文件（兼容 Next.js 和独立脚本环境）
// 支持多种路径查找，确保在不同运行环境下都能正确加载
function loadEnvFile(): void {
  const cwd = process.cwd();
  
  // 扩展搜索路径列表，覆盖不同运行场景
  const envPaths = [
    path.resolve(cwd, '.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env.development'),
    // Next.js 可能使用的其他路径
    path.resolve(cwd, '.env.production'),
  ];
  
  // 还要检查当前已有的环境变量是否已经包含必要的配置
  const hasEnvVars = process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (hasEnvVars) {
    console.log('[supabase] 环境变量已存在于系统中，跳过 .env 文件加载');
    return;
  }
  
  console.log(`[supabase] 当前工作目录: ${cwd}`);
  console.log(`[supabase] 搜索 .env 文件路径:`, envPaths);
  
  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        console.log(`[supabase] 找到 .env 文件: ${envPath}`);
        const content = fs.readFileSync(envPath, 'utf8');
        const lines = content.split('\n');
        let loadedCount = 0;
        
        for (const line of lines) {
          const trimmedLine = line.trim();
          // 跳过注释和空行
          if (!trimmedLine || trimmedLine.startsWith('#')) continue;
          
          const equalIndex = trimmedLine.indexOf('=');
          if (equalIndex === -1) continue;
          
          const key = trimmedLine.substring(0, equalIndex).trim();
          let value = trimmedLine.substring(equalIndex + 1).trim();
          
          // 移除引号
          if ((value.startsWith('"') && value.endsWith('"')) || 
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.substring(1, value.length - 1);
          }
          
          // 只在未设置时添加（避免覆盖系统环境变量）
          if (!process.env[key]) {
            process.env[key] = value;
            loadedCount++;
          }
        }
        console.log(`[supabase] 已从 ${envPath} 加载 ${loadedCount} 个环境变量`);
        return;
      }
    } catch (err) {
      console.warn(`[supabase] 无法读取 ${envPath}:`, err);
    }
  }
  
  // 如果没有找到 .env 文件，但系统环境变量已存在，则继续
  if (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL) {
    console.log('[supabase] 未找到 .env 文件，但系统环境变量已配置，继续使用系统环境变量');
  } else {
    console.warn('[supabase] ⚠️ 未找到 .env 文件，且系统环境变量也未配置！');
    console.warn('[supabase] 请确保 .env 文件存在于项目根目录，或在 Vercel/部署平台配置环境变量');
  }
}

// 使用 Symbol 标记环境变量是否已初始化
let envInitialized = false;

function ensureEnvLoaded(): void {
  if (!envInitialized) {
    loadEnvFile();
    envInitialized = true;
  }
}

// 初始化时加载一次
ensureEnvLoaded();

function getSupabaseConfig() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
}

// 延迟检查：只有在实际请求时才验证配置
function validateConfig(): { valid: boolean; error?: string } {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
  
  if (!SUPABASE_URL) {
    return { 
      valid: false, 
      error: '数据库连接配置缺失（SUPABASE_URL未设置）。请在 .env 文件中配置 NEXT_PUBLIC_SUPABASE_URL' 
    };
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    return { 
      valid: false, 
      error: '数据库连接配置缺失（SUPABASE_SERVICE_ROLE_KEY未设置）。请在 .env 文件中配置 SUPABASE_SERVICE_ROLE_KEY' 
    };
  }
  return { valid: true };
}

// 错误类型定义，用于区分不同的错误场景
export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseConfigError';
  }
}

async function request<T = any>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: any,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  // 确保环境变量已加载
  ensureEnvLoaded();
  
  // 检查配置
  const configCheck = validateConfig();
  if (!configCheck.valid) {
    // 抛出特定类型的错误，让调用方可以捕获并返回友好提示
    throw new SupabaseConfigError(configCheck.error || '数据库配置缺失');
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();
  const API_BASE = `${SUPABASE_URL}/rest/v1`;

  const url = `${API_BASE}${path}`;
  
  // 调试日志（开发环境）
  if (process.env.NODE_ENV === 'development') {
    console.log('[supabase] request:', {
      method,
      url: url,
      hasBody: !!body,
      env: {
        hasUrl: !!SUPABASE_URL,
        hasKey: !!SUPABASE_SERVICE_ROLE_KEY,
      },
    });
  }

  const headers: Record<string, string> = {
    'apikey': SUPABASE_SERVICE_ROLE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation,resolution=merge-duplicates,profile=public',
    ...extraHeaders,
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[supabase] API错误 (${response.status}):`, errorText);
      
      if (response.status === 404) {
        // 404 通常表示资源不存在
        throw new Error('访问码不存在或已被删除');
      } else if (response.status === 409) {
        // 409 冲突
        throw new Error('数据冲突：访问码可能已被注册');
      } else if (response.status === 401 || response.status === 403) {
        throw new Error('权限错误：请检查服务密钥配置');
      } else {
        throw new Error(`数据库操作失败 (${response.status})`);
      }
    }

    const text = await response.text();
    return text ? JSON.parse(text) as T : {} as T;
  } catch (fetchErr: any) {
    // 网络错误或URL错误
    if (fetchErr.code === 'ERR_INVALID_URL' || fetchErr.message?.includes('Invalid URL')) {
      console.error('[supabase] URL格式错误:', url);
      throw new Error('服务器配置错误：数据库连接地址格式不正确');
    } else if (fetchErr.message?.includes('fetch')) {
      console.error('[supabase] 网络请求失败:', fetchErr.message);
      throw new Error('网络连接失败：无法连接到数据库服务器，请检查网络');
    }
    throw fetchErr;
  }
}

class PrismaTableClient {
  private table: string;

  // 特殊字段名映射（Prisma camelCase ↔ 数据库 snake_case）
  // 用于不规则命名无法通过规则转换的字段
  private static readonly SPECIAL_FIELD_MAP: Record<string, string> = {
    path4week: 'path_4week',
    ecCategory: 'ec_category',
    ecDescription: 'ec_description',
    verificationMetric: 'verification_metric',
    expectedTimeSec: 'expected_time_sec',
    kpCode: 'kp_code',
    kpRelated: 'kp_related',
    qType: 'q_type',
    isWarmup: 'is_warmup',
    isAnchor: 'is_anchor',
    imageUrl: 'image_url',
    correctAnswer: 'correct_answer',
    answerSpec: 'answer_spec',
    cognitiveLevel: 'cognitive_level',
    literacyCodes: 'literacy_codes',
    ecMapping: 'ec_mapping',
    difficultyEst: 'difficulty_est',
    discriminationEst: 'discrimination_est',
    pairingId: 'pairing_id',
    parallelGroupId: 'parallel_group_id',
    variantOf: 'variant_of',
    improvementTip: 'improvement_tip',
    variantStem: 'variant_stem',
    variantAnswer: 'variant_answer',
    stemHash: 'stem_hash',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    expiresAt: 'expires_at',
    reviewedBy: 'reviewed_by',
    timeLimitSec: 'time_limit_sec',
    optionOrders: 'option_orders',
    credibilityFlag: 'credibility_flag',
    deviceInfo: 'device_info',
    skuCode: 'sku_code',
    dayTag: 'day_tag',
    seqNo: 'seq_no',
    dayModules: 'day_modules',
    methodName: 'method_name',
    methodContent: 'method_content',
    methodCard: 'method_card',
    studentId: 'student_id',
    accessCodeId: 'access_code_id',
    sessionId: 'session_id',
    questionId: 'question_id',
    answerText: 'answer_text',
    stepScores: 'step_scores',
    ecDistribution: 'ec_distribution',
    answerSpecMatch: 'answer_spec_match',
    timeTakenSec: 'time_taken_sec',
    subAnswerText: 'sub_answer_text',
    subStepScores: 'sub_step_scores',
    subEcDistribution: 'sub_ec_distribution',
    subAnswerSpecMatch: 'sub_answer_spec_match',
    retestReason: 'retest_reason',
    contactPhone: 'contact_phone',
    reportId: 'report_id',
    adminId: 'admin_id',
    actionType: 'action_type',
    targetSku: 'target_sku',
    ecCodes: 'ec_codes',
    plan4week: 'plan_4week',
    viewToken: 'view_token',
    totalScore: 'total_score',
    adaptiveLevel: 'adaptive_level',
    moduleMastery: 'module_mastery',
    literacyRadar: 'literacy_radar',
    ecProfile: 'ec_profile',
    confidenceFlags: 'confidence_flags',
    actionChecklist: 'action_checklist',
    degradedTexts: 'degraded_texts',
    narrativeText: 'narrative_text',
    analystEdits: 'analyst_edits',
    reviewedBy: 'reviewed_by',
    publishedAt: 'published_at',
    accessCodeId: 'access_code_id',
    npsScore: 'nps_score',
    valuableParts: 'valuable_parts',
    willingnessPrice: 'willingness_price',
    retestIntent: 'retest_intent',
    openComment: 'open_comment',
    intentAt: 'intent_at',
    activatedAt: 'activated_at',
    timeLimitSec: 'time_limit_sec',
    optionOrders: 'option_orders',
    credibilityFlag: 'credibility_flag',
    deviceInfo: 'device_info',
    behaviorTag: 'behavior_tag',
    ecCode: 'ec_recommended',
    ecFinal: 'ec_final',
    selfMark: 'self_mark',
    answerEvents: 'answer_events',
    invalidInput: 'invalid_input',
    probeResult: 'probe_result',
    answerText: 'answer_text',
    stepScores: 'step_scores',
    modifyCount: 'modify_count',
    deleteRewriteCount: 'delete_rewrite_count',
    timeSpentMs: 'time_spent_ms',
    firstActionMs: 'first_action_ms',
    revisitCount: 'revisit_count',
    hesitateFlag: 'hesitate_flag',
    isProbe: 'is_probe',
    probeFor: 'probe_for',
    scoreObtained: 'score_obtained',
    studentAnswer: 'student_answer',
    stepSeq: 'step_seq',
    radarDimensions: 'radar_dimensions',
    kpName: 'kp_name',
  };

  constructor(table: string) {
    this.table = table;
  }

  private toSnakeCase(str: string): string {
    // 先查特殊映射表
    if (PrismaTableClient.SPECIAL_FIELD_MAP[str]) {
      return PrismaTableClient.SPECIAL_FIELD_MAP[str];
    }
    return str.replace(/([A-Z])/g, '_$1').toLowerCase();
  }

  // PostgreSQL 数组字段列表（需特殊格式处理）
  // 这些字段在 DDL 中定义为 VARCHAR(n)[] 或 TEXT[] 等数组类型
  private static readonly PG_ARRAY_FIELDS: Set<string> = new Set([
    'behavior_tag',
    'ec_recommended',
    'ec_final',
    'option_path',
    'self_mark',
    'confidence_flags',
  ]);

  // JSONB 字段列表（跳过递归键名转换）
  // 这些字段在数据库中存储为 JSONB 类型，包含嵌套的 snake_case 键名
  // 必须保持原始结构，不能递归转换为 camelCase/snake_case
  private static readonly JSONB_COLUMNS: Set<string> = new Set([
    'module_mastery',      // 模块掌握度 - 包含 mastery_score, kp_name 等
    'plan_4week',          // 4周计划 - 包含 focus_kps, weekly_content 等
    'action_checklist',    // 行动清单 - 包含 kp_code, severity 等
    'literacy_radar',      // 素养雷达 - 包含 score, level 等
    'ec_profile',          // 错因画像 - 包含 primary, distribution 等
    'degraded_texts',      // 降级文案
    'degradedTexts',       // camelCase 别名
    'narrative_text',      // 叙述文案
    'confidence_flags',    // 置信度标记
    'ec_distribution',     // 错因分布
    'radar_dimensions',    // 雷达维度
    'day_modules',         // 日模块
    'kp_dependencies',     // 知识点依赖
    'report_meta',         // 报告元数据
    'behavior_data',       // 行为数据
  ]);

  /**
   * 将数组转换为 PostgreSQL 数组字面量格式
   * 例如: ["normal_correct"] → '{"normal_correct"}'
   * PostgREST 需要此格式才能正确写入 PG 数组字段
   */
  private toPgArrayLiteral(arr: string[]): string | null {
    if (!arr || arr.length === 0) return null;
    const escaped = arr.map(s => `"${String(s).replace(/"/g, '\\"')}"`).join(',');
    return `{${escaped}}`;
  }

  private keysToSnakeCase(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) {
      // 注意：这里的数组可能是普通数组（如选项列表），也可能是 PG 数组字段
      // 我们先递归处理每个元素，然后在 create/update 时再转换 PG 数组字段
      return obj.map(item => this.keysToSnakeCase(item));
    }
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const snakeKey = this.toSnakeCase(key);
        // 检查是否为 JSONB 字段 - 跳过递归转换，保持原始结构
        if (PrismaTableClient.JSONB_COLUMNS.has(snakeKey)) {
          // JSONB 字段保持原始结构，不递归转换内部键名
          result[snakeKey] = value;
          continue;
        }
        // 检查是否为 PG 数组字段
        if (PrismaTableClient.PG_ARRAY_FIELDS.has(snakeKey) && Array.isArray(value)) {
          // 转换为 PostgreSQL 数组字面量格式
          result[snakeKey] = this.toPgArrayLiteral(value as string[]);
        } else {
          result[snakeKey] = this.keysToSnakeCase(value);
        }
      }
      return result;
    }
    return obj;
  }

  // ---------- snake_case → camelCase（读取响应时用）----------
  private static readonly REVERSE_FIELD_MAP: Record<string, string> = (() => {
    const reverse: Record<string, string> = {};
    for (const [camel, snake] of Object.entries(PrismaTableClient.SPECIAL_FIELD_MAP || {})) {
      reverse[snake] = camel;
    }
    return reverse;
  })();

  private toCamelCase(str: string): string {
    if (PrismaTableClient.REVERSE_FIELD_MAP && PrismaTableClient.REVERSE_FIELD_MAP[str]) {
      return PrismaTableClient.REVERSE_FIELD_MAP[str];
    }
    // sku_code → skuCode, path_4week → path4week
    return str.replace(/_([a-zA-Z0-9])/g, (_, c) => String(c).toUpperCase());
  }

  /**
   * 解析 PostgreSQL 数组字面量格式为 JSON 数组
   * 例如: '{"normal_correct","fast_wrong"}' → ["normal_correct", "fast_wrong"]
   */
  private parsePgArrayLiteral(value: string): string[] {
    if (!value || !value.startsWith('{')) return [value];
    try {
      // 将 PG 数组格式转换为 JSON 数组
      // {"a","b"} → ["a","b"]
      const jsonStr = value.replace(/\{/, '[').replace(/\}/, ']');
      return JSON.parse(jsonStr);
    } catch {
      // 如果解析失败，尝试手动解析
      const inner = value.slice(1, -1);
      if (!inner.trim()) return [];
      return inner.split(',').map(s => s.replace(/^"|"$/g, '').replace(/\\"/g, '"'));
    }
  }

  private keysToCamelCase(obj: any): any {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(item => this.keysToCamelCase(item));
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const camelKey = this.toCamelCase(key);
        // 检查是否为 JSONB 字段 - 跳过递归转换，保持原始结构
        // 注意：仍然需要转换外层键名（snake_case → camelCase）
        if (PrismaTableClient.JSONB_COLUMNS.has(key)) {
          // JSONB 字段：只转换键名，不递归转换值的内部结构
          result[camelKey] = value;
          continue;
        }
        // 检查是否为 PG 数组字段（读取时转换回数组格式）
        if (typeof value === 'string' && PrismaTableClient.PG_ARRAY_FIELDS.has(key)) {
          result[camelKey] = this.parsePgArrayLiteral(value);
        } else {
          result[camelKey] = this.keysToCamelCase(value);
        }
      }
      return result;
    }
    return obj;
  }

  /**
   * 构建 PostgREST 查询字符串
   * 关键：filter 格式为 ?column=operator.value
   * 注意：不要编码 = 和 .，因为它们是 PostgREST filter 格式的关键字符
   */
  private buildQuery(params: Record<string, string>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      // 只编码 key 和 value 中的特殊字符，保留 = 和 .
      // key 是列名，通常不需要编码，但以防万一
      const encodedKey = key.replace(/[^a-zA-Z0-9_]/g, (c) => encodeURIComponent(c));
      // value 是 filter 值，如 "eq.123456"，需要保留 = 和 .
      // 但要编码空格和其他特殊字符
      const encodedValue = value.replace(/\s+/g, '%20');
      parts.push(`${encodedKey}=${encodedValue}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  /**
   * 构建 PostgREST filter 参数
   * Prisma where → PostgREST ?column=operator.value
   */
  private buildFilters(where: Record<string, any>): Record<string, string> {
    const params: Record<string, string> = {};
    const snakeWhere = this.keysToSnakeCase(where);

    for (const [key, value] of Object.entries(snakeWhere)) {
      if (value === null || value === undefined) {
        params[key] = 'is.null';
      } else if (Array.isArray(value)) {
        params[key] = `in.(${value.join(',')})`;
      } else if (typeof value === 'object' && value !== null) {
        // 处理特殊操作符：{ not: 'xxx' } → not.eq.xxx, { in: [...] } → in.(...)
        if ('not' in value) {
          const notVal = value.not;
          if (notVal === null || notVal === undefined) {
            params[key] = 'not.is.null';
          } else if (Array.isArray(notVal)) {
            params[key] = `not.in.(${notVal.join(',')})`;
          } else {
            params[key] = `not.eq.${notVal}`;
          }
        } else if ('in' in value) {
          const inVal = value.in;
          if (Array.isArray(inVal)) {
            params[key] = `in.(${inVal.join(',')})`;
          } else if (typeof inVal === 'number' || typeof inVal === 'string') {
            params[key] = `in.(${inVal})`;
          }
        } else if ('notIn' in value) {
          const notInVal = value.notIn;
          if (Array.isArray(notInVal)) {
            params[key] = `not.in.(${notInVal.join(',')})`;
          }
        }
      } else {
        params[key] = `eq.${value}`;
      }
    }
    return params;
  }

  /**
   * Prisma 风格的 findMany
   */
  async findMany(options: any = {}): Promise<any[]> {
    const params: Record<string, string> = {};

    if (options.where) {
      Object.assign(params, this.buildFilters(options.where));
    }

    if (options.select && typeof options.select === 'string') {
      params['select'] = options.select.split(',').map(col => this.toSnakeCase(col.trim())).join(',');
    }

    if (options.orderBy) {
      if (typeof options.orderBy === 'string') {
        params['order'] = options.orderBy;
      } else if (Array.isArray(options.orderBy)) {
        const orderParts: string[] = [];
        for (const orderObj of options.orderBy) {
          for (const [key, direction] of Object.entries(orderObj)) {
            const snakeKey = this.toSnakeCase(key);
            orderParts.push(`${snakeKey}.${direction === 'asc' ? 'asc' : 'desc'}`);
          }
        }
        params['order'] = orderParts.join(',');
      } else if (typeof options.orderBy === 'object') {
        const orderParts: string[] = [];
        for (const [key, direction] of Object.entries(options.orderBy)) {
          const snakeKey = this.toSnakeCase(key);
          orderParts.push(`${snakeKey}.${direction === 'asc' ? 'asc' : 'desc'}`);
        }
        params['order'] = orderParts.join(',');
      }
    }

    if (options.take !== undefined) {
      params['limit'] = String(options.take);
    }

    if (options.skip !== undefined) {
      params['offset'] = String(options.skip);
    }

    if (options.in) {
      for (const [key, values] of Object.entries(options.in)) {
        const snakeKey = this.toSnakeCase(key);
        params[snakeKey] = `in.(${(values as any[]).join(',')})`;
      }
    }

    if (options.notIn) {
      for (const [key, values] of Object.entries(options.notIn)) {
        const snakeKey = this.toSnakeCase(key);
        params[snakeKey] = `not.in.(${(values as any[]).join(',')})`;
      }
    }

    const queryStr = this.buildQuery(params);
    const rows = await request<any[]>(`/${this.table}${queryStr}`, 'GET');
    return this.keysToCamelCase(rows);
  }

  async findUnique(options: any): Promise<any | null> {
    const where = options.where || options;
    const rows = await this.findMany({ where, take: 1 });
    return rows.length > 0 ? rows[0] : null;
  }

  async findFirst(options: any = {}): Promise<any | null> {
    const rows = await this.findMany({ ...options, take: 1 });
    return rows.length > 0 ? rows[0] : null;
  }

  async create(options: any): Promise<any> {
    const data = options.data || options;
    const snakeCaseData = this.keysToSnakeCase(data);
    const result = await request<any>(`/${this.table}`, 'POST', snakeCaseData);
    // PostgREST POST 可能返回数组（批量）或单个对象
    if (Array.isArray(result)) {
      const camel = this.keysToCamelCase(result);
      return camel[0] ?? null;
    }
    return this.keysToCamelCase(result);
  }

  async createMany(options: any): Promise<any[]> {
    const dataList = Array.isArray(options) ? options : (options.data || []);
    if (dataList.length === 0) return [];
    const snakeCaseDataList = dataList.map(item => this.keysToSnakeCase(item));
    const result = await request<any[]>(`/${this.table}`, 'POST', snakeCaseDataList);
    return this.keysToCamelCase(result) as any[];
  }

  async update(options: any): Promise<any> {
    const where = options.where || {};
    const data = options.data || options;
    const snakeData = this.keysToSnakeCase(data);
    const params = this.buildFilters(where);
    const queryStr = this.buildQuery(params);
    const result = await request<any>(`/${this.table}${queryStr}`, 'PATCH', snakeData);
    if (Array.isArray(result)) {
      const camel = this.keysToCamelCase(result);
      return camel[0] ?? camel;
    }
    return this.keysToCamelCase(result);
  }

  async upsert(options: any): Promise<any> {
    // 展平 where 条件，支持复合唯一键如 { skuCode_dayTag_seqNo: { skuCode, dayTag, seqNo } }
    const where: Record<string, any> = {};
    if (options.where) {
      for (const [key, value] of Object.entries(options.where)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // 复合键：展开嵌套对象
          for (const [subKey, subValue] of Object.entries(value)) {
            where[subKey] = subValue;
          }
        } else {
          where[key] = value;
        }
      }
    }

    const existing = await this.findUnique({ where });

    if (existing) {
      const updateData = options.update || {};
      return this.update({ where, data: updateData });
    } else {
      const createData = options.create || { ...options.update };
      return this.create({ data: createData });
    }
  }

  async delete(options: any): Promise<any> {
    const where = options.where || {};
    const params = this.buildFilters(where);
    const queryStr = this.buildQuery(params);
    const result = await request<any>(`/${this.table}${queryStr}`, 'DELETE');
    return this.keysToCamelCase(result);
  }

  async deleteMany(options: any = {}): Promise<any> {
    return this.delete(options);
  }

  async $disconnect(): Promise<void> {}
  async $transaction(): Promise<any> {}
  async $connect(): Promise<void> {}
}

class PrismaClientCompat {
  [key: string]: any;

  constructor() {
    const tableMap: Record<string, string> = {
      questions: 'questions',
      accessCodes: 'access_codes',
      sessions: 'test_sessions',
      records: 'answer_records',
      answerRecords: 'answer_records',
      reportDrafts: 'reports',
      reports: 'reports',
      answerEvents: 'answer_events',
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

  getTable(name: string): PrismaTableClient {
    if (!this[name]) {
      const tableName = name.replace(/([A-Z])/g, '_$1').toLowerCase();
      this[name] = new PrismaTableClient(tableName);
    }
    return this[name];
  }

  async $disconnect(): Promise<void> {}
  async $connect(): Promise<void> {}
  async $transaction(): Promise<any> {}
}

const prismaProxy = new Proxy(new PrismaClientCompat(), {
  get(target, prop: string) {
    if (prop in target) {
      return (target as any)[prop];
    }
    return target.getTable(prop);
  },
});

export const prisma = prismaProxy;
export const db = prismaProxy;
export default prisma;
