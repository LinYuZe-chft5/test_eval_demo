import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '学科诊断',
  description: 'H5线上学科诊断验证应用',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // 禁止缩放,保持一屏一题体验
  themeColor: '#f9fafb',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        {/* 移动端优先：最大宽度 375px 居中 */}
        <div className="mx-auto w-full max-w-[375px] min-h-screen bg-gray-50 shadow-sm">
          {children}
        </div>
      </body>
    </html>
  );
}
