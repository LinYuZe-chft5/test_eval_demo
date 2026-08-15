const fs = require('fs');
const path = require('path');

// ============ S3分步题正确steps定义 ============
const S3_CORRECT_STEPS = {
  // Day2 Q14 [KP-07.06] AB∥CD拐点题
  'S3-01_D2_Q14': [
    { seq: 1, prompt: '请过点 $E$ 添加一条辅助线，使得 $AB\\parallel CD$ 的平行线性质能够用于求解 $\\angle BED$（请写出辅助线的作法描述）', answer: '', score: 1, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '利用 $AB\\parallel CD$ 和你添加的辅助线，分别求 $\\angle BEF$ 与 $\\angle FED$ 的度数，并各写出一条平行线性质作为依据', answer: '40^{\\circ},30^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 3, prompt: '结合上一步结论，计算 $\\angle BED$ 的度数，并写出完整证明结论', answer: '70^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day2 Q15 [KP-10.03] DE∥BC求∠C
  'S3-01_D2_Q15': [
    { seq: 1, prompt: '观察 $DE\\parallel BC$ 的条件：请指出 $\\angle ADE$ 与 $\\angle C$ 属于哪一种位置关系的角（同位角/内错角/同旁内角），并说明这两个角的大小关系', answer: '同位角相等', score: 1, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '根据平行线的性质和已知条件，求 $\\angle C$ 的度数', answer: '70^{\\circ}', score: 2, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day3 Q9 [KP-07.07] BE平分+DE平分证明垂直
  'S3-01_D3_Q9': [
    { seq: 1, prompt: '由 $AB\\parallel CD$，根据平行线的性质，求 $\\angle ABD + \\angle CDB$ 的和为多少度？并说明依据', answer: '180^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '已知 $BE$ 平分 $\\angle ABD$，$DE$ 平分 $\\angle CDB$，根据角平分线定义，求 $\\angle EBD + \\angle EDB$ 的和', answer: '90^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 3, prompt: '在 $\\triangle BDE$ 中，利用三角形内角和定理求 $\\angle BED$ 的度数，并据此证明 $BE\\perp DE$', answer: '90^{\\circ}', score: 2, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day3 Q10 [KP-10.05] 高+角平分线求∠DAE
  'S3-01_D3_Q10': [
    { seq: 1, prompt: '根据三角形内角和定理，利用已知的 $\\angle B,\\angle C$，计算 $\\angle BAC$ 的度数', answer: '80^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '已知 $AE$ 是 $\\angle BAC$ 的角平分线，根据角平分线定义求 $\\angle CAE$ 的度数', answer: '40^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 3, prompt: '已知 $AD$ 是 $BC$ 边上的高，在 $Rt\\triangle ADC$ 中，利用直角三角形两锐角互余求 $\\angle CAD$ 的度数', answer: '30^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 4, prompt: '观察图形分析 $\\angle DAE$、$\\angle CAE$、$\\angle CAD$ 三者之间的关系，并计算 $\\angle DAE$', answer: '10^{\\circ}', score: 2, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day3 Q11 [KP-13.04] 全等+求CE
  'S3-01_D3_Q11': [
    { seq: 1, prompt: '（1）求证 $\\triangle ABD\\cong\\triangle ACE$：先由 $\\angle BAC=\\angle DAE$ 通过等式性质推导一组对应角相等，再列出三组对应相等的元素并说明全等判定依据（SAS/SSS/ASA/AAS）', answer: 'SAS', score: 2, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（2）根据全等三角形的对应边相等性质，结合已知 $BD=4$，求 $CE$ 的长度', answer: '4', score: 2, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
};

// ============ S6分步题正确steps定义 ============
const S6_CORRECT_STEPS = {
  // Day2 Q9 [KP-32.02] 统计图表三量关系
  'S6-01_D2_Q9': [
    { seq: 1, prompt: '（1）已知"$\\le 0.5$小时"的人数与对应百分比，利用"部分量 $\\div$ 对应百分比 $=$ 总量"求全班总人数', answer: '100', score: 2, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（2）已知"$\\ge 1$小时"所占百分比，根据总人数求该部分的人数', answer: '40', score: 1, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 3, prompt: '（3）用样本百分比估计总体，全校有 1200 名学生时，估计其中"$\\ge 1$小时"的学生人数', answer: '480', score: 2, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day2 Q10 [KP-24.06] 抛物线求b,c+比较大小
  'S6-01_D2_Q10': [
    { seq: 1, prompt: '（1）将点 $(1,0)$ 和 $(3,0)$ 分别代入抛物线解析式 $y=x^2+bx+c$，列出关于 $b,c$ 的方程组并求解', answer: 'b=-4,c=3', score: 2, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（2）先求抛物线对称轴，根据开口方向判断当 $x_1<x_2<1$ 时函数的单调性，再比较 $y_1$ 与 $y_2$ 的大小关系（用 $>、<、=$ 表示）', answer: 'y_1>y_2', score: 2, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day2 Q11 [KP-24.04] 利润最值
  'S6-01_D2_Q11': [
    { seq: 1, prompt: '（1）设涨价 $x$ 元：用含 $x$ 的代数式分别表示"每件实际利润"和"实际销售量"，再写出总利润 $y$ 与 $x$ 的函数关系式（整理为 $y=ax^2+bx+c$ 的一般形式）', answer: 'y=-2x^2+20x+400', score: 2, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（2）用配方法或对称轴公式求利润函数取最大值时的 $x$ 值，再反推"售价多少元"和"最大利润为多少元"两个结果', answer: '售价65元，最大利润450元', score: 3, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day2 Q12 [KP-28.03] 圆-直径勾股+面积法求高
  'S6-01_D2_Q12': [
    { seq: 1, prompt: '（1）由"$AB$ 是直径"这一条件，根据圆周角定理能推出 $\\angle ACB$ 为多少度？请说明理由', answer: '90^{\\circ}', score: 1, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（1）续：在 $Rt\\triangle ABC$ 中，已知两条直角边 $AC=4,BC=3$，利用勾股定理求斜边 $AB$ 的长', answer: '5', score: 2, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 3, prompt: '（2）用面积等积法：$S_{\\triangle ABC}=\\frac{1}{2}\\cdot AC\\cdot BC=\\frac{1}{2}\\cdot AB\\cdot CD$，代入已知量求 $CD$ 的长度（写成分数形式）', answer: '\\frac{12}{5}', score: 2, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day3 Q7 [KP-28.03] 切线+相似求直径
  'S6-01_D3_Q7': [
    { seq: 1, prompt: '（1）连接 $OC$：由 $CD$ 切 $\\odot O$ 于 $C$ 得切线性质 $OC\\perp CD$，结合 $AD\\perp CD$，请判断 $AD$ 与 $OC$ 的位置关系，再利用 $OA=OC$ 等边对等角，推导 $\\angle DAC=\\angle OAC$，完成角平分线证明（写角相等关键等式即可）', answer: '\\angle DAC=\\angle OAC', score: 2, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（2）在 $Rt\\triangle ACD$ 中，已知直角边 $CD=6,AD=8$，先用勾股定理求斜边 $AC$ 的长', answer: '10', score: 2, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 3, prompt: '（2）续：连接 $BC$，证明 $\\triangle ACD\\sim\\triangle ABC$（两组角相等），再利用相似三角形对应边成比例 $\\frac{AD}{AC}=\\frac{AC}{AB}$，求直径 $AB$ 的长度（写成分数或小数）', answer: '\\frac{25}{2}', score: 3, answer_spec: { accept_forms: ['fraction'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
  // Day3 Q8 [KP-26.02] 相似三角形判定+求BC
  'S6-01_D3_Q8': [
    { seq: 1, prompt: '（1）已知 $\\angle BAD=\\angle C$，再找出一组公共角（用三个字母表示该角），然后依据相似三角形判定定理（AA/SAS/SSS），说明判定 $\\triangle ABD\\sim\\triangle CBA$ 的依据', answer: 'AA', score: 2, answer_spec: { accept_forms: ['expression'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
    { seq: 2, prompt: '（2）由 $\\triangle ABD\\sim\\triangle CBA$，写出对应边的比例式（$\\frac{AB}{CB}=\\frac{BD}{BA}$），代入已知 $AB=6,BD=4$，求解 $BC$ 的长', answer: '9', score: 3, answer_spec: { accept_forms: ['integer'], decimal_tolerance: 0.01, allow_pi: true, unit: null }, ec_mapping: [] },
  ],
};

function keyOf(sku, day, seq) { return `${sku}_D${day}_Q${seq}`; }

function fixFile(filePath, correctMap, skuPrefix) {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let fixedCount = 0;
  for (const q of data) {
    if (q.q_type !== 'step') continue;
    const k = keyOf(q.sku_code, q.day_tag, q.seq_no);
    if (!correctMap[k]) {
      console.warn(`⚠️ 未找到修复规则: ${k} (${q.stem.slice(0,30)}...)`);
      continue;
    }
    q.steps = correctMap[k];
    // 更新correct_answer用solution中的，不要用step答案拼接
    fixedCount++;
    console.log(`✅ 已修复 ${k}: ${q.steps.length}步`);
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`\n📝 ${path.basename(filePath)}: 共修复 ${fixedCount} 道分步题`);
}

// 执行修复
fixFile(path.join(__dirname, 'data', 's3_seed.json'), S3_CORRECT_STEPS, 'S3');
fixFile(path.join(__dirname, 'data', 's6_seed.json'), S6_CORRECT_STEPS, 'S6');
console.log('\n🎉 S3/S6 分步题修复完成！');
