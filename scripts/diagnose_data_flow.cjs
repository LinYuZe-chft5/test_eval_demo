/**
 * 数据流诊断脚本
 * 直接从数据库读取数据，检查关键数据结构
 * 无需走UI流程即可定位问题
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 缺少环境变量');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '已设置' : '未设置');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '已设置' : '未设置');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('========================================');
  console.log(' 数据流诊断脚本');
  console.log('========================================\n');

  // Step 1: 检查初二访问码
  console.log('[Step 1] 检查初二访问码...');
  const { data: accessCodes, error: acError } = await supabase
    .from('access_codes')
    .select('id, code, identity, status')
    .eq('identity', 'grade8');

  if (acError) {
    console.error('  ❌ 查询失败:', acError.message);
  } else {
    console.log(`  找到 ${accessCodes.length} 条访问码:`);
    for (const ac of accessCodes) {
      console.log(`    - code: ${ac.code}, status: ${ac.status}`);
    }
  }

  // Step 2: 检查初二学生
  console.log('\n[Step 2] 检查初二学生...');
  if (accessCodes && accessCodes.length > 0) {
    const acId = accessCodes[0].id;
    const { data: students, error: stError } = await supabase
      .from('students')
      .select('id, nickname, grade, access_code_id')
      .eq('access_code_id', acId);

    if (stError) {
      console.error('  ❌ 查询失败:', stError.message);
    } else {
      console.log(`  找到 ${students.length} 个学生:`);
      for (const s of students) {
        console.log(`    - id: ${s.id}, nickname: ${s.nickname}, grade: ${s.grade}`);

        // Step 3: 检查该学生的答题会话
        console.log(`\n  [Step 3] 检查学生 ${s.nickname} 的答题会话...`);
        const { data: sessions, error: sessError } = await supabase
          .from('test_sessions')
          .select('id, day_tag, status, created_at')
          .eq('student_id', s.id)
          .order('day_tag', { ascending: true });

        if (sessError) {
          console.error('    ❌ 查询失败:', sessError.message);
        } else {
          console.log(`    找到 ${sessions.length} 个会话:`);
          for (const sess of sessions) {
            console.log(`      - Day${sess.day_tag}: status=${sess.status}`);

            // Step 4: 检查答题记录
            console.log(`        [Step 4] 检查会话 ${sess.id} 的答题记录...`);
            const { data: records, error: recError } = await supabase
              .from('answer_records')
              .select('question_id, answer, is_correct, score, time_spent_ms')
              .eq('session_id', sess.id);

            if (recError) {
              console.error('          ❌ 查询失败:', recError.message);
            } else {
              const correctCount = records.filter(r => r.is_correct).length;
              const totalScore = records.reduce((sum, r) => sum + (r.score || 0), 0);
              console.log(`          找到 ${records.length} 条记录:`);
              console.log(`            - 正确: ${correctCount}/${records.length}`);
              console.log(`            - 总分: ${totalScore}`);
              
              if (records.length > 0) {
                console.log(`            - 前3条记录样例:`);
                for (let i = 0; i < Math.min(3, records.length); i++) {
                  const r = records[i];
                  const answer = typeof r.answer === 'string' ? r.answer.substring(0, 30) : JSON.stringify(r.answer).substring(0, 30);
                  console.log(`              [${i}] Q:${r.question_id}, ✓:${r.is_correct}, 得分:${r.score}, 用时:${r.time_spent_ms}ms, 答案:"${answer}"`);
                }
              }
            }
          }
        }

        // Step 5: 检查报告
        console.log(`\n  [Step 5] 检查学生 ${s.nickname} 的报告...`);
        const { data: reports, error: repError } = await supabase
          .from('reports')
          .select('id, status, total_score, module_mastery, plan_4week, action_checklist')
          .eq('student_id', s.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (repError) {
          console.error('    ❌ 查询失败:', repError.message);
        } else if (reports && reports.length > 0) {
          const report = reports[0];
          console.log(`    找到报告 ID: ${report.id}`);
          console.log(`      - 状态: ${report.status}`);
          console.log(`      - 总分: ${report.total_score}`);

          // 检查 module_mastery
          if (report.module_mastery) {
            const mm = report.module_mastery;
            const keys = Object.keys(mm);
            console.log(`      - module_mastery 键数量: ${keys.length}`);
            if (keys.length > 0) {
              console.log(`        前3个知识点:`);
              for (const k of keys.slice(0, 3)) {
                const v = mm[k];
                console.log(`          ${k}: ${JSON.stringify(v).substring(0, 100)}`);
                // 检查内部键名格式
                if (typeof v === 'object' && v !== null) {
                  const innerKeys = Object.keys(v);
                  console.log(`            内部键: [${innerKeys.join(', ')}]`);
                  console.log(`            是否包含 mastery_score: ${innerKeys.includes('mastery_score')}`);
                  console.log(`            是否包含 masteryScore: ${innerKeys.includes('masteryScore')}`);
                }
              }
            }
          } else {
            console.log(`      ❌ module_mastery 为空!`);
          }

          // 检查 plan_4week
          if (report.plan_4week) {
            const pw = report.plan_4week;
            console.log(`      - plan_4week 类型: ${Array.isArray(pw) ? '数组' : typeof pw}`);
            if (Array.isArray(pw)) {
              console.log(`      - plan_4week 长度: ${pw.length}`);
              if (pw.length > 0) {
                const firstWeek = pw[0];
                console.log(`        第1周数据:`);
                console.log(`          键: [${Object.keys(firstWeek).join(', ')}]`);
                console.log(`          是否包含 focus_kps: ${'focus_kps' in firstWeek}`);
                console.log(`          是否包含 focusKps: ${'focusKps' in firstWeek}`);
                console.log(`          是否包含 weekly_content: ${'weekly_content' in firstWeek}`);
                console.log(`          是否包含 weeklyContent: ${'weeklyContent' in firstWeek}`);
              }
            }
          } else {
            console.log(`      ❌ plan_4week 为空!`);
          }

          // 检查 action_checklist
          if (report.action_checklist) {
            const ac = report.action_checklist;
            console.log(`      - action_checklist 类型: ${Array.isArray(ac) ? '数组' : typeof ac}`);
            if (Array.isArray(ac)) {
              console.log(`      - action_checklist 长度: ${ac.length}`);
              if (ac.length > 0) {
                const firstItem = ac[0];
                console.log(`        第1条数据:`);
                console.log(`          键: [${Object.keys(firstItem).join(', ')}]`);
                console.log(`          是否包含 kp_code: ${'kp_code' in firstItem}`);
                console.log(`          是否包含 kpCode: ${'kpCode' in firstItem}`);
                console.log(`          是否包含 name: ${'name' in firstItem}`);
                console.log(`          是否包含 level: ${'level' in firstItem}`);
                console.log(`          是否包含 severity: ${'severity' in firstItem}`);
                console.log(`          是否包含 action: ${'action' in firstItem}`);
              }
            }
          } else {
            console.log(`      ❌ action_checklist 为空!`);
          }
        } else {
          console.log(`    ❌ 没有报告!`);
        }
      }
    }
  }

  // Step 6: 检查题库知识点映射
  console.log('\n[Step 6] 检查题库知识点映射...');
  const { data: questions, error: qError } = await supabase
    .from('questions')
    .select('id, sku_code, day_tag, seq_no, kp_code, knowledge_points')
    .eq('sku_code', 'S3-01')
    .eq('status', 'active')
    .limit(5);

  if (qError) {
    console.error('  ❌ 查询失败:', qError.message);
  } else {
    console.log(`  找到 ${questions.length} 道初二题目:`);
    for (const q of questions) {
      console.log(`    - ID: ${q.id}, Day${q.day_tag}-Q${q.seq_no}, kp_code: ${q.kp_code}`);
      if (q.knowledge_points) {
        console.log(`      knowledge_points: ${JSON.stringify(q.knowledge_points).substring(0, 150)}`);
      } else {
        console.log(`      ❌ knowledge_points 为空!`);
      }
    }
  }

  console.log('\n========================================');
  console.log(' 诊断完成');
  console.log('========================================');
  console.log('\n📋 请将以上输出复制反馈给开发者');
}

main().catch(err => {
  console.error('诊断脚本执行失败:', err);
  process.exit(1);
});
