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

// ==========================================================
// 🔧 Cloudflare Workers 兼容补丁（M19 新增）
// 目标：解决三种环境下环境变量读不到的问题
//   1. Service Worker Syntax / Vercel / Node.js：变量在 process.env（Text类型100%可用）
//   2. Workers Module Syntax + Text 类型：变量在 globalThis.process?.env
//   3. Workers Module Syntax + Secret 类型：变量在 fetch(req, env, ctx) 的 env 上，
//      部分版本会挂到 globalThis.env / globalThis.__ENV / globalThis[Symbol]
//   4. 兜底：从 .env 文件加载（本地开发 / Codespaces 场景）
// ==========================================================

type EnvRecord = Record<string, string | undefined>;

/**
 * 全方位读取环境变量（兼容 Vercel / Node.js / Cloudflare Workers Module/Service Syntax + Secret/Text）
 */
function readEnvFromEverywhere(): EnvRecord {
  const result: EnvRecord = {};

  // 1. 最常见：Node.js / Vercel / Service Worker Syntax（process.env 全局注入）
  if (typeof process !== 'undefined' && process.env && typeof process.env === 'object') {
    Object.assign(result, process.env as EnvRecord);
  }

  // 2. Workers Module Syntax：从 globalThis 特殊属性读取（Secret/Text 有时挂在这）
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gt = globalThis as any;

    if (gt.process && gt.process.env && typeof gt.process.env === 'object') {
      for (const [k, v] of Object.entries(gt.process.env)) {
        if (typeof v === 'string' && !(k in result)) result[k] = v;
      }
    }

    const cfCandidateKeys: string[] = ['env', '__ENV', 'CF_ENV', '__CF$env$vars'];
    for (const key of cfCandidateKeys) {
      const v = gt[key];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        for (const [k, val] of Object.entries(v)) {
          if (typeof val === 'string' && !(k in result)) result[k] = val;
        }
      }
    }

    // 3. Symbol.for('cloudflare-env') 特殊注入
    try {
      const sym = Symbol.for('cloudflare-env');
      const symEnv = (gt as any)[sym];
      if (symEnv && typeof symEnv === 'object') {
        for (const [k, val] of Object.entries(symEnv)) {
          if (typeof val === 'string' && !(k in result)) result[k] = val;
        }
      }
    } catch { /* ignore */ }
  } catch { /* ignore */ }

  return result;
}

/**
 * 调试用：在 Cloudflare Observability 日志中打印当前能读取到的所有 key 名（只打前3位+末2位，安全）
 * 去 Observability → Live Tail 看输出就能精准知道变量是否真的注入了
 */
function DEBUG_dumpEnvKeys(label: string, env: EnvRecord): void {
  const allKeys = Object.keys(env).sort();
  const masked = allKeys.map(k => {
    const v = env[k];
    if (!v) return `${k}=UNDEFINED`;
    if (v.length > 8) return `${k}=${v.slice(0, 3)}***${v.slice(-2)}`;
    return `${k}=len=${v.length}`;
  }).join(', ');
  console.error(`[supabase:DEBUG:${label}] keys=${allKeys.length} → ${masked || '(empty)'}`);
}

/**
 * 把 env 快照回填到 process.env，确保后续依赖 process.env.XXX 直接读的代码也能取到
 */
function backfillToProcessEnv(env: EnvRecord): void {
  if (typeof process === 'undefined' || !process.env || typeof process.env !== 'object') return;
  for (const [k, v] of Object.entries(env)) {
    if (v != null && !(k in (process.env as EnvRecord))) {
      (process.env as EnvRecord)[k] = v;
    }
  }
}

// 环境变量加载函数（仅在本地开发/Codespaces 环境使用）
// Cloudflare Workers 环境下，环境变量通过 readEnvFromEverywhere() 从全局注入，无需从文件读
async function loadEnvFile(): Promise<void> {
  const envAll = readEnvFromEverywhere();
  DEBUG_dumpEnvKeys('loadEnvFile:start', envAll);

  // 已经读到了 Supabase 所需变量 → 直接跳过
  if (envAll.NEXT_PUBLIC_SUPABASE_URL && envAll.SUPABASE_SERVICE_ROLE_KEY) {
    console.log('[supabase] ✅ 环境变量从全局注入读取成功，跳过 .env 文件加载');
    backfillToProcessEnv(envAll);
    return;
  }

  // --- 尝试本地 .env 文件加载（Node.js/Codespaces 场景）---
  let fsModule: any = null, pathModule: any = null;
  try {
    fsModule = await import('fs');
    pathModule = await import('path');
  } catch (_) {
    // Workers 环境 fs import 会失败 → 正常，我们已通过 readEnvFromEverywhere 读了全局
    console.warn('[supabase] ⚠️ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 在全局中未找到！');
    DEBUG_dumpEnvKeys('loadEnvFile:GLOBAL-MISSING', envAll);
    console.warn('[supabase] 请在 Cloudflare Dashboard → Settings → Environment variables 中添加上述变量（推荐 Text 类型）');
    return;
  }

  let cwd = '/';
  try { cwd = process.cwd(); } catch (_) {}
  const envPaths = [
    pathModule.resolve(cwd, '.env'),
    pathModule.resolve(cwd, '.env.local'),
    pathModule.resolve(cwd, '.env.development'),
    pathModule.resolve(cwd, '.env.production'),
  ];

  console.log(`[supabase] 当前工作目录: ${cwd}`);
  console.log('[supabase] 搜索 .env 文件路径:', envPaths);

  for (const envPath of envPaths) {
    try {
      if (fsModule.existsSync(envPath)) {
        console.log(`[supabase] 找到 .env 文件: ${envPath}`);
        const content = fsModule.readFileSync(envPath, 'utf8') as string;
        const lines = content.split('\n');
        let loadedCount = 0;
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq === -1) continue;
          let key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key && !process.env[key]) {
            process.env[key] = val;
            loadedCount++;
          }
        }
        console.log(`[supabase] 已从 ${envPath} 加载 ${loadedCount} 个环境变量`);
        return;
      }
    } catch (_e) {
      // ignore
    }
  }

  console.warn('[supabase] ⚠️ 未找到 .env 文件，且全局环境中也未找到 Supabase 配置！');
  DEBUG_dumpEnvKeys('loadEnvFile:ALL-MISSING', readEnvFromEverywhere());
  console.warn('[supabase] 请在 Cloudflare Dashboard → Settings → Environment variables 添加 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（Text类型）');
}

let envInitialized = false;
let envInitPromise: Promise<void> | null = null;

async function ensureEnvLoaded(): Promise<void> {
  if (envInitialized) return;

  // 快速路径：全局已注入
  const envSnapshot = readEnvFromEverywhere();
  DEBUG_dumpEnvKeys('ensureEnvLoaded', envSnapshot);
  if (envSnapshot.NEXT_PUBLIC_SUPABASE_URL && envSnapshot.SUPABASE_SERVICE_ROLE_KEY) {
    backfillToProcessEnv(envSnapshot);
    envInitialized = true;
    return;
  }

  if (!envInitPromise) {
    envInitPromise = loadEnvFile();
  }
  await envInitPromise;
  envInitialized = true;
}

function getSupabaseConfig(): { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string } {
  const envAll = readEnvFromEverywhere();
  const SUPABASE_URL =
    envAll.NEXT_PUBLIC_SUPABASE_URL || envAll.SUPABASE_URL
    || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const SUPABASE_SERVICE_ROLE_KEY =
    envAll.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY };
}

// 延迟检查：只有在实际请求时才验证配置
function validateConfig(): { valid: boolean; error?: string } {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getSupabaseConfig();

  if (!SUPABASE_URL) {
    DEBUG_dumpEnvKeys('validateConfig:URL-MISSING', readEnvFromEverywhere());
    return {
      valid: false,
      error: '数据库连接配置缺失（SUPABASE_URL未设置）。请在 Cloudflare Dashboard → Environment variables 添加 NEXT_PUBLIC_SUPABASE_URL（Text类型）',
    };
  }
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    DEBUG_dumpEnvKeys('validateConfig:KEY-MISSING', readEnvFromEverywhere());
    return {
      valid: false,
      error: '数据库连接配置缺失（SUPABASE_SERVICE_ROLE_KEY未设置）。请在 Cloudflare Dashboard → Environment variables 添加 SUPABASE_SERVICE_ROLE_KEY（Text类型）',
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
  await ensureEnvLoaded();
  
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
    publishedAt: 'published_at',
    npsScore: 'nps_score',
    valuableParts: 'valuable_parts',
    willingnessPrice: 'willingness_price',
    retestIntent: 'retest_intent',
    openComment: 'open_comment',
    intentAt: 'intent_at',
    activatedAt: 'activated_at',
    behaviorTag: 'behavior_tag',
    ecCode: 'ec_recommended',
    ecFinal: 'ec_final',
    selfMark: 'self_mark',
    answerEvents: 'answer_events',
    invalidInput: 'invalid_input',
    probeResult: 'probe_result',
    studentAnswer: 'student_answer',
    stepSeq: 'step_seq',
    radarDimensions: 'radar_dimensions',
    kpName: 'kp_name',
    modifyCount: 'modify_count',
    deleteRewriteCount: 'delete_rewrite_count',
    timeSpentMs: 'time_spent_ms',
    firstActionMs: 'first_action_ms',
    revisitCount: 'revisit_count',
    hesitateFlag: 'hesitate_flag',
    isProbe: 'is_probe',
    probeFor: 'probe_for',
    scoreObtained: 'score_obtained',
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
  private static readonly PG_ARRAY_FIELDS: Set<string> = new Set([
    'behavior_tag',
    'ec_recommended',
    'ec_final',
    'option_path',
    'self_mark',
    'confidence_flags',
  ]);

  // JSONB 字段列表（跳过递归键名转换）
  private static readonly JSONB_COLUMNS: Set<string> = new Set([
    'module_mastery',
    'plan_4week',
    'action_checklist',
    'literacy_radar',
    'ec_profile',
    'degraded_texts',
    'degradedTexts',
    'narrative_text',
    'confidence_flags',
    'ec_distribution',
    'radar_dimensions',
    'day_modules',
    'kp_dependencies',
    'report_meta',
    'behavior_data',
  ]);

  /**
   * 将数组转换为 PostgreSQL 数组字面量格式
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
      return obj.map(item => this.keysToSnakeCase(item));
    }
    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const snakeKey = this.toSnakeCase(key);
        if (PrismaTableClient.JSONB_COLUMNS.has(snakeKey)) {
          result[snakeKey] = value;
          continue;
        }
        if (PrismaTableClient.PG_ARRAY_FIELDS.has(snakeKey) && Array.isArray(value)) {
          result[snakeKey] = this.toPgArrayLiteral(value as string[]);
        } else {
          result[snakeKey] = this.keysToSnakeCase(value);
        }
      }
      return result;
    }
    return obj;
  }

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
    return str.replace(/_([a-zA-Z0-9])/g, (_, c) => String(c).toUpperCase());
  }

  private parsePgArrayLiteral(value: string): string[] {
    if (!value || !value.startsWith('{')) return [value];
    try {
      const jsonStr = value.replace(/\{/, '[').replace(/\}/, ']');
      return JSON.parse(jsonStr);
    } catch {
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
        if (PrismaTableClient.JSONB_COLUMNS.has(key)) {
          result[camelKey] = value;
          continue;
        }
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

  private buildQuery(params: Record<string, string>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      const encodedKey = key.replace(/[^a-zA-Z0-9_]/g, (c) => encodeURIComponent(c));
      const encodedValue = value.replace(/\s+/g, '%20');
      parts.push(`${encodedKey}=${encodedValue}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }

  private buildFilters(where: Record<string, any>): Record<string, string> {
    const params: Record<string, string> = {};
    const snakeWhere = this.keysToSnakeCase(where);

    for (const [key, value] of Object.entries(snakeWhere)) {
      if (value === null || value === undefined) {
        params[key] = 'is.null';
      } else if (Array.isArray(value)) {
        params[key] = `in.(${value.join(',')})`;
      } else if (typeof value === 'object' && value !== null) {
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
    const where: Record<string, any> = {};
    if (options.where) {
      for (const [key, value] of Object.entries(options.where)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
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
