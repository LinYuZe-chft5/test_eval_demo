/**
 * lib/identity.ts
 * 身份与题库映射配置
 */

export type Identity = 'grade7' | 'grade8' | 'grade9';

export interface IdentityConfig {
  identity: Identity;
  label: string;
  skuCode: string;
  description: string;
}

export const IDENTITY_CONFIGS: Record<Identity, IdentityConfig> = {
  grade7: {
    identity: 'grade7',
    label: '初一',
    skuCode: 'S1_XIAOSHENGCHU_MATH',
    description: '小升初衔接适应期诊断（七年级数学，冀教版）',
  },
  grade8: {
    identity: 'grade8',
    label: '初二',
    skuCode: 'S3-01',
    description: '七升八衔接诊断（八年级数学）',
  },
  grade9: {
    identity: 'grade9',
    label: '初三',
    skuCode: 'S6-01',
    description: '中考一轮复习诊断（九年级数学）',
  },
};

export function getSkuByIdentity(identity: Identity): string | null {
  return IDENTITY_CONFIGS[identity]?.skuCode ?? null;
}

export function getIdentityConfig(identity: Identity): IdentityConfig | null {
  return IDENTITY_CONFIGS[identity] ?? null;
}

export function isValidIdentity(value: string): value is Identity {
  return value === 'grade7' || value === 'grade8' || value === 'grade9';
}

/**
 * 验证访问码格式（安全校验，防止SQL注入）
 * - 长度4-32位
 * - 只允许字母、数字、下划线、连字符
 */
export function validateAccessCodeFormat(code: string): { valid: boolean; error?: string } {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: '访问码不能为空' };
  }
  const trimmed = code.trim();
  if (trimmed.length < 4 || trimmed.length > 32) {
    return { valid: false, error: '访问码长度需在4-32位之间' };
  }
  // 只允许字母、数字、下划线、连字符（防止SQL注入）
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { valid: false, error: '访问码只能包含字母、数字、下划线和连字符' };
  }
  return { valid: true };
}
