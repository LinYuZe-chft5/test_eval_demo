/** @type {import('next').NextConfig} */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const nextConfig = {
  // 移动端H5优化
  compress: true,
  poweredByHeader: false,
  // TypeScript配置
  typescript: {
    ignoreBuildErrors: false,
  },
  // 允许KaTeX资源
  experimental: {
    optimizePackageImports: ['katex', 'recharts'],
  },
  // 关键：显式配置webpack路径别名，确保Vercel环境下正常工作
  webpack: (config) => {
    config.resolve.alias['@'] = path.resolve(__dirname);
    return config;
  },
};

export default nextConfig;
