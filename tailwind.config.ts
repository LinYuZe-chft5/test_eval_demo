import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        // 移动端最小16px红线
        'base': ['16px', '1.6'],
      },
      colors: {
        // 掌握度三色
        'mastery-green': '#16a34a',
        'mastery-yellow': '#ca8a04',
        'mastery-red': '#dc2626',
      },
    },
  },
  plugins: [],
};

export default config;
