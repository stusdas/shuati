const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const statePath = path.join(projectRoot, '题库数据备份', '当前题库与学习记录.json');
const outputPath = path.join(projectRoot, '题目预览_前两章.html');
const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
const course = saved.state.courses.find(item => Array.isArray(item.question_bank) && item.question_bank.length);
if (!course) throw new Error('当前硬盘备份中没有可预览的题目。');

const chapters = (course.chapters || []).slice(0, 2).map(item => item.title);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const questionType = { single_choice: '单选题', true_false: '判断题', short_answer: '简答题' };
const cleanStem = (stem, hasOptions) => {
  const text = String(stem || '').trim();
  if (!hasOptions) return text;
  return text.split(/\r?\n/).filter(line => !/^[A-DＡ-Ｄ][\.．、]\s*/.test(line.trim())).join('\n').trim();
};
const renderQuestion = (question, index) => {
  const options = Array.isArray(question.options) ? question.options : [];
  const stem = cleanStem(question.stem, options.length);
  const optionHtml = options.length ? `<ol class="options">${options.map((option, optionIndex) => {
    const key = typeof option === 'object' ? option.key : String.fromCharCode(65 + optionIndex);
    const text = typeof option === 'object' ? option.text : option;
    return `<li><b>${escapeHtml(key)}.</b> ${escapeHtml(text)}</li>`;
  }).join('')}</ol>` : '';
  return `<article class="question"><div class="question-head"><span>第 ${index + 1} 题</span><em>${escapeHtml(questionType[question.question_type] || '题目')}</em></div><div class="stem">${escapeHtml(stem).replace(/\n/g, '<br>')}</div>${optionHtml}</article>`;
};

const sections = chapters.map(chapter => {
  const questions = course.question_bank.filter(question => question.chapter === chapter);
  return `<section><h2>${escapeHtml(chapter)} <small>（${questions.length} 题）</small></h2>${questions.map(renderQuestion).join('')}</section>`;
}).join('');

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(course.course_name)}｜前两章题目预览</title>
<style>body{margin:0;background:#f4f2eb;color:#171717;font-family:"Microsoft YaHei",sans-serif}.wrap{max-width:920px;margin:auto;padding:32px 18px 60px}header{background:#ffcc00;border:3px solid #111;padding:22px 26px;box-shadow:7px 7px 0 #111;margin-bottom:32px}h1{margin:0;font-size:30px}header p{margin:9px 0 0;font-weight:700}h2{font-size:25px;margin:38px 0 18px;border-left:8px solid #00d9e8;padding-left:12px}h2 small{font-size:15px}.question{background:#fff;border:2px solid #111;margin:14px 0;padding:17px 19px;box-shadow:4px 4px 0 #111}.question-head{display:flex;justify-content:space-between;font-weight:900;margin-bottom:12px}.question-head em{font-style:normal;background:#e9e9e9;padding:2px 7px;font-size:13px}.stem{font-size:18px;font-weight:700;line-height:1.65}.options{list-style:none;padding:0;margin:14px 0 0}.options li{border:1.5px solid #222;padding:10px 12px;margin:8px 0;line-height:1.5;background:#fcfcfc}@media(max-width:600px){.wrap{padding:18px 12px}.stem{font-size:16px}h1{font-size:24px}}</style></head>
<body><main class="wrap"><header><h1>${escapeHtml(course.course_name)}：前两章题目预览</h1><p>仅展示题干与选项，不展示答案、解析或审核信息。共 ${chapters.reduce((sum, chapter) => sum + course.question_bank.filter(question => question.chapter === chapter).length, 0)} 题。</p></header>${sections}</main></body></html>`;

fs.writeFileSync(outputPath, html, 'utf8');
console.log(`已生成：${outputPath}`);
