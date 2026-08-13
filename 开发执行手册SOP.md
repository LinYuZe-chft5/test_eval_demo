# 开发执行手册SOP

> 本文件是全量开发过程的执行标准。每个步骤完成后打勾,上下文丢失时读本文件恢复进度。

## 总流程

```
阶段0 环境初始化 → M1数据基座 → M2作答引擎 → M3判分行为 → M4报告组装 → M5分析师后台 → M6家长端 → 部署Codespaces
```

## 阶段0:环境初始化

### 0.1 项目初始化
- [ ] git init + 初始提交(空仓库+README)
- [ ] Next.js 14+ 项目创建(npx create-next-app@latest,TypeScript+Tailwind+AppRouter)
- [ ] 安装依赖:prisma/@prisma/client/nanoid/react-katex/katex/recharts/zod
- [ ] 创建GitHub仓库并推送
- [ ] **验证**:`npm run dev`能启动localhost:3000
- [ ] **交付物**:可运行的空Next.js项目+GitHub仓库链接
- [ ] **commit**:`[Init] Next.js项目初始化`

### 0.2 数据库准备
- [ ] Supabase项目创建(免费层)
- [ ] 获取DATABASE_URL
- [ ] 创建.env和.env.local(.gitignore中)
- [ ] **验证**:Supabase Dashboard可见项目
- [ ] **交付物**:.env配置完成
- [ ] **commit**:`[Init] 环境变量与Supabase配置`

---

## M1:数据基座

### M1.1 DDL建表
- [ ] 将Codex_03 DDL在Supabase SQL Editor执行
- [ ] **验证**:Supabase Table Editor可见全部13张表+索引
- [ ] **交付物**:13表建表成功截图/确认

### M1.2 Prisma模型生成
- [ ] npx prisma init
- [ ] npx prisma db pull(从DDL反向生成schema.prisma)
- [ ] 校对schema.prisma字段类型与DDL一致(JSONB/数组等)
- [ ] npx prisma generate
- [ ] **验证**:`npx prisma studio`能查看表结构
- [ ] **交付物**:prisma/schema.prisma
- [ ] **commit**:`[M1] Prisma模型生成(由DDL反向)`

### M1.3 规则常量文件
- [ ] 创建domain/config/rules.ts(RULES常量对象)
- [ ] **验证**:import能正常引用
- [ ] **交付物**:domain/config/rules.ts
- [ ] **commit**:`[M1] 规则常量rules.ts`

### M1.4 种子题库导入脚本
- [ ] 将试卷原稿(Day1/2/3)转换为Codex_05 JSON格式
- [ ] 创建scripts/seed_questions.ts
- [ ] 实现Codex_05第7章8条校验规则
- [ ] 导入种子题库(含≥10题3种题型)
- [ ] 故意导入1条错误数据验证Schema拦截
- [ ] **验证**:npx tsx scripts/seed_questions.ts导入成功+错误拦截报告
- [ ] **交付物**:seed脚本+导入结果报告
- [ ] **commit**:`[M1] 种子题库导入脚本与数据`

### M1.5 访问码生成脚本
- [ ] 创建scripts/gen_access_codes.ts(8位随机码)
- [ ] 生成10个测试码
- [ ] **验证**:数据库access_codes表有10条记录
- [ ] **交付物**:生成脚本+访问码清单
- [ ] **commit**:`[M1] 访问码生成脚本`

### M1.6 蓝皮书与依赖数据导入
- [ ] 导入blueprints(S1定位卡+三天模块)
- [ ] 导入kp_dependencies(七上第1-5章+小学前置)
- [ ] 导入method_cards(EC-16对应方法卡)
- [ ] **验证**:三表数据完整
- [ ] **交付物**:导入确认
- [ ] **commit**:`[M1] 蓝皮书/依赖/方法卡数据导入`

---

## M2:学生作答引擎

### M2.1 访问码API
- [ ] POST /api/access/verify(校验码+建档)
- [ ] 错误码/过期码/已用码拦截逻辑
- [ ] **验证**:curl测试4种场景(有效/错误/过期/已用)
- [ ] **交付物**:API接口+测试报告
- [ ] **commit**:`[M2] 访问码校验与建档API`

### M2.2 会话管理API
- [ ] POST /api/session/start(创建/恢复session)
- [ ] GET /api/session/status(查询三天状态)
- [ ] 三天解锁逻辑(locked→available)
- [ ] **验证**:curl测试Day1可用/Day2锁定/手动解锁
- [ ] **交付物**:会话API+状态机测试
- [ ] **commit**:`[M2] 会话状态机与解锁逻辑`

### M2.3 作答页前端
- [ ] /[code] 入口页(须知+建档)
- [ ] /test/[day] 作答页(一屏一题+KaTeX渲染)
- [ ] 一屏一题组件(选择/填空/分步三题型)
- [ ] 回翻只读逻辑
- [ ] "我不会/蒙的"标记按钮
- [ ] 进度条(仅进度无分数)
- [ ] **验证**:浏览器访问,3种题型渲染正确,回翻只读
- [ ] **交付物**:作答页截图
- [ ] **commit**:`[M2] 作答页前端(一屏一题三题型)`

### M2.4 断点续答与限时
- [ ] 中断恢复至最后作答题
- [ ] 每日限时(Day1=30/Day2=35/Day3=40分钟)
- [ ] 超时强制交卷
- [ ] 剩余5分钟提示
- [ ] **验证**:模拟中断重连+模拟超时
- [ ] **交付物**:断点续答+限时测试
- [ ] **commit**:`[M2] 断点续答与限时控制`

### M2.5 完成页与未解锁页
- [ ] /test/[day]/done 中性完成页
- [ ] /test/blocked 未解锁页
- [ ] **验证**:页面源码无分数/对错字样
- [ ] **交付物**:完成页+未解锁页
- [ ] **commit**:`[M2] 完成页与未解锁页`

---

## M3:判分与行为引擎

### M3.1 判分纯函数(grading.ts)
- [ ] gradeChoice(选择精确匹配+选项乱序还原)
- [ ] normalize(填空答案规范化:全角转半角/分数/小数/π/负数)
- [ ] gradeFill(按answer_spec判分)
- [ ] gradeStep(分步独立判分)
- [ ] 单元测试T1-T6
- [ ] **验证**:npm test全部通过
- [ ] **交付物**:grading.ts+测试报告
- [ ] **commit**:`[M3] 判分引擎grading.ts+单元测试T1-T6`

### M3.2 行为分析纯函数(behavior.ts)
- [ ] 事件流→行为字段汇总(time_spent/first_action/modify_count等)
- [ ] 行为标签规则(8种标签+ec_recommended)
- [ ] 单元测试(行为标签场景)
- [ ] **验证**:npm test通过
- [ ] **交付物**:behavior.ts+测试
- [ ] **commit**:`[M3] 行为分析behavior.ts+测试`

### M3.3 作答提交API
- [ ] POST /api/answer/submit(单题判分+行为标签写入)
- [ ] POST /api/answer/events(批量行为事件上报)
- [ ] **验证**:curl测试提交+查询answer_records/events
- [ ] **交付物**:提交API+测试报告
- [ ] **commit**:`[M3] 作答提交与事件批量上报API`

### M3.4 二次探测(probe.ts)
- [ ] onAnswerGraded(秒选答对→选平行题)
- [ ] onProbeGraded(探测判决→confirmed_guess)
- [ ] POST /api/probe/dispatch
- [ ] 单元测试T7-T8
- [ ] **验证**:npm test T7-T8通过
- [ ] **交付物**:probe.ts+测试
- [ ] **commit**:`[M3] 二次探测probe.ts+测试T7-T8`

### M3.5 低信度检测(credibility.ts)
- [ ] 三信号计算(热身错/平均时长/修改率)
- [ ] 三取二判定→session标记
- [ ] 单元测试T12
- [ ] **验证**:npm test T12通过
- [ ] **交付物**:credibility.ts+测试
- [ ] **commit**:`[M3] 低信度检测credibility.ts+测试T12`

---

## M4:报告组装引擎

### M4.1 掌握度判定(mastery.ts)
- [ ] 考点掌握度计算(有效题/排除规则/探测修正)
- [ ] 置信度(配对题规则)
- [ ] 等级映射(green/yellow/red)
- [ ] 单元测试T9-T11
- [ ] **验证**:npm test T9-T11通过
- [ ] **交付物**:mastery.ts+测试
- [ ] **commit**:`[M4] 掌握度mastery.ts+测试T9-T11`

### M4.2 错因分布(ecProfile.ts)
- [ ] 分母计算(已归因错题,排除guess/abandoned/invalid)
- [ ] EC编码占比+首要/次要错因
- [ ] 单元测试T15-T16
- [ ] **验证**:npm test通过
- [ ] **交付物**:ecProfile.ts+测试
- [ ] **commit**:`[M4] 错因分布ecProfile.ts+测试T15-T16`

### M4.3 路径定序(pathEngine.ts)
- [ ] 追根溯源(依赖链下探取最深<0.5节点)
- [ ] 拓扑排序
- [ ] 4周计划分配
- [ ] 依赖链断裂处理
- [ ] 单元测试T13-T14
- [ ] **验证**:npm test T13-T14通过
- [ ] **交付物**:pathEngine.ts+测试
- [ ] **commit**:`[M4] 路径定序pathEngine.ts+测试T13-T14`

### M4.4 报告组装(reportBuilder.ts)
- [ ] 七段式数据契约组装
- [ ] 部分数据报告(三天未完成)
- [ ] 降级文案生成
- [ ] 单元测试T17-T18
- [ ] **验证**:npm test全部T1-T18通过
- [ ] **交付物**:reportBuilder.ts+全量测试报告
- [ ] **commit**:`[M4] 报告组装reportBuilder.ts+全量测试通过`

### M4.5 报告生成API
- [ ] POST /api/report/assemble(Day3提交触发)
- [ ] 生成draft报告+view_token
- [ ] **验证**:curl触发+查询reports表status=draft
- [ ] **交付物**:报告生成API+测试
- [ ] **commit**:`[M4] 报告组装API`

---

## M5:分析师后台

### M5.1 后台布局与登录
- [ ] /admin 布局(桌面端)
- [ ] 单一管理员账号(环境变量)
- [ ] 看板四卡(访问码/完测漏斗/待复核/反馈)
- [ ] **验证**:浏览器访问后台
- [ ] **交付物**:后台首页
- [ ] **commit**:`[M5] 后台布局与看板`

### M5.2 访问码管理
- [ ] /admin/codes 生成/列表/状态
- [ ] **验证**:生成码+查看列表
- [ ] **交付物**:访问码管理页
- [ ] **commit**:`[M5] 访问码管理页`

### M5.3 题库管理
- [ ] /admin/questions 列表/检索
- [ ] JSON导入入口+Schema校验+查重
- [ ] 导入结果报告(行级报错)
- [ ] **验证**:导入含重复考点JSON,报告冲突行号
- [ ] **交付物**:题库管理页
- [ ] **commit**:`[M5] 题库管理与导入`

### M5.4 报告复核工作台
- [ ] /admin/reports 报告列表(待复核置顶)
- [ ] /admin/reports/[id] 复核编辑页(左数据右编辑)
- [ ] 叙述段编辑+错因下拉+建议文本
- [ ] 修改留痕(analyst_edits)
- [ ] 发布按钮→生成家长token链接
- [ ] **验证**:编辑→留痕→发布→链接可访问
- [ ] **交付物**:报告复核工作台
- [ ] **commit**:`[M5] 报告复核工作台`

### M5.5 数据导出
- [ ] /admin/export CSV导出
- [ ] 作答明细/题目汇总/反馈三类
- [ ] **验证**:导出CSV含answer_records全字段
- [ ] **交付物**:导出功能+CSV样本
- [ ] **commit**:`[M5] 数据导出CSV`

---

## M6:家长端与反馈闭环

### M6.1 报告展示页
- [ ] /report/[token] 七段式展示
- [ ] Recharts雷达图(模块+素养)
- [ ] 降级文案位
- [ ] 未发布显示"报告生成中"
- [ ] **验证**:发布前后访问对比
- [ ] **交付物**:报告展示页
- [ ] **commit**:`[M6] 报告展示页(七段式+雷达图)`

### M6.2 反馈问卷
- [ ] /report/[token]/feedback
- [ ] NPS/最有价值/付费意愿/复测意向/开放题
- [ ] POST /api/feedback/submit
- [ ] **验证**:提交问卷+后台可见
- [ ] **交付物**:反馈问卷页+API
- [ ] **commit**:`[M6] 反馈问卷与提交API`

### M6.3 复测意向
- [ ] 行动清单第4项"预约复测"点击记录
- [ ] POST /api/retest/intent
- [ ] **验证**:点击→retest_intents表有记录
- [ ] **交付物**:复测意向收集
- [ ] **commit**:`[M6] 复测意向收集`

---

## 部署:GitHub Codespaces

### D.1 仓库准备
- [ ] 确保所有代码已推送GitHub
- [ ] .env.example文档(不含真实密钥)
- [ ] README含Codespaces启动说明
- [ ] **commit**:`[Deploy] Codespaces部署准备`

### D.2 Codespaces配置
- [ ] 创建.devcontainer/devcontainer.json(Node 20+)
- [ ] 配置端口3000自动公开
- [ ] **验证**:Codespaces能构建启动
- [ ] **交付物**:.devcontainer配置
- [ ] **commit**:`[Deploy] devcontainer配置`

### D.3 部署运行
- [ ] 在GitHub创建Codespace
- [ ] 配置环境变量(SECRET)
- [ ] npm install + npm run dev
- [ ] 端口3000设为Public
- [ ] **验证**:外部设备访问公网URL
- [ ] **交付物**:公网访问URL
- [ ] **commit**:`[Deploy] Codespaces部署完成`

---

## 验收清单(PRD第8章14条)

1.建库(13表+种子导入+Schema拦截) 2.访问码(错误/过期/重复拦截) 3.流程(Day2锁定+解锁) 4.作答(一屏一题+回翻只读+断点续答) 5.限时(超时交卷) 6.反馈红线(源码无分数字样) 7.判分(填空answer_spec含容差) 8.探测(秒选→平行题→confirmed_guess) 9.低信度(三取二+降级文案) 10.报告(七段字段齐全) 11.复核(编辑+留痕+发布+链接) 12.导入(重复考点报冲突行号) 13.问卷(提交+后台可见NPS) 14.导出(CSV含answer_records全字段)

---

## 上下文恢复指引

当上下文变长或丢失时:
1. 读 c:\Users\猪木木\.trae-cn\memory\projects\-d-Agent-Program-test-eval-demo--p2-5f1a5e482306eb4ecf06\project_memory.md
2. 读 d:\Agent Program\test_eval_demo\开发执行手册SOP.md(本文件,查看已完成步骤)
3. git log 查看已提交里程碑
4. 继续未完成的第一个步骤
