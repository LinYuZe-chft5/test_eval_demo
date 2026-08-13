# Codespaces 部署指南

## 步骤1: 打开Codespaces
1. 访问 https://github.com/LinYuZe-chft5/test_eval_demo
2. 点击绿色 "Code" 按钮 → "Codespaces" 标签 → "Create codespace on main"
3. 等待环境构建(约2-3分钟,会自动npm install)

## 步骤2: 配置Supabase
1. 访问 https://supabase.com 注册/登录
2. 创建新项目(选择免费套餐)
3. 在项目设置 → Database → Connection string
4. 复制URI,格式如: `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
5. 在Codespaces终端创建.env文件:
```bash
cp .env.example .env
# 编辑.env,填入:
DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres"
```

## 步骤3: 执行DDL建表
1. 在Supabase Dashboard → SQL Editor
2. 复制 `初始资料/codex诊断应用文档包/Codex_03_数据库DDL.sql` 全部内容
3. 粘贴到SQL Editor并执行

## 步骤4: 运行配置脚本
```bash
# 在Codespaces终端执行
npx prisma db pull    # 从数据库生成Prisma模型
npx prisma generate   # 生成Prisma Client

# 导入种子数据
npx tsx scripts/seed_questions.ts
npx tsx scripts/seed_blueprints.ts
npx tsx scripts/seed_kp_dependencies.ts
npx tsx scripts/seed_method_cards.ts

# 生成测试访问码
npx tsx scripts/gen_access_codes.ts -- --sku=S1_XIAOSHENGCHU_MATH --count=5
```

## 步骤5: 启动应用
```bash
npm run dev
```
应用将在 http://localhost:3000 运行,Codespaces会自动转发端口。

## 步骤6: 测试验证
1. 访问 http://localhost:3000
2. 输入生成的访问码
3. 开始诊断作答
4. 查看诊断报告

## API测试 (可选)
用curl测试API:
```bash
# 验证访问码
curl -X POST http://localhost:3000/api/access/verify \
  -H "Content-Type: application/json" \
  -d '{"access_code":"YOUR_CODE"}'
```
