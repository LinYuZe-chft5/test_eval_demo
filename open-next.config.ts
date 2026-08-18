/**
 * OpenNext Cloudflare 配置文件
 * 用于 @opennextjs/cloudflare 适配器构建 Cloudflare Pages/Workers 部署包
 * 文档：https://opennext.js.org/cloudflare
 */
import { defineCloudflareConfig } from '@opennextjs/cloudflare';

export default defineCloudflareConfig({
  // Next.js build output configuration
  // 由于使用 Next.js 14.2.x（已超过官方支持期），构建时需要配合
  // --dangerouslyUseUnsupportedNextVersion 参数使用

  // Node.js 兼容性配置（Cloudflare Workers Node.js runtime）
  nodejsCompat: true,

  // 构建配置
  build: {
    // 跳过生成阶段的 API 路由静态化检查
    // 我们的应用使用动态路由（依赖 request.url、searchParams、cookies 等）
  },

  // 路由配置
  router: {
    // 所有路由默认走 SSR，不预渲染静态页面
    // （应用需要学生身份、访问码等动态数据）
  },
});
