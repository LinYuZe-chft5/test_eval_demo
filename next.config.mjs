/** @type {import('next').NextConfig} */
const nextConfig = {
  // 移动端H5优化
  compress: true,
  poweredByHeader: false,
  // 允许KaTeX资源
  experimental: {
    optimizePackageImports: ['katex', 'recharts'],
  },
};

export default nextConfig;
