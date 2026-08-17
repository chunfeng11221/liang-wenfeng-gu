'use strict';
/**
 * liang-mode-dsh — server 端插件。
 *
 * 按北京时间判断梁文峰（极简）/ 梁文谷（正常）模式：
 *   - 09:00-12:00、14:00-18:00 -> 梁文峰（极简）
 *   - 其余时间 -> 梁文谷（正常）
 *   - 08:50-09:00、13:50-14:00 -> 提醒窗口（回答末尾附切换提醒）
 *
 * 通过 dsh-system-prompt 的 section 注册动态规则段（每分钟刷新），
 * 并向 client 推送 'liang-mode/update' 事件驱动提示框。
 */

const RULES = [
  '按北京时间回复：',
  '① 00:00-09:00、12:00-14:00、18:00-24:00：梁文谷模式，正常回复。',
  '② 09:00-12:00、14:00-18:00：梁文峰模式，极简回复；能省则省，只保留必要结论，不复述、不扩展、不寒暄。',
  '③ 08:50-09:00、13:50-14:00：回答末尾提醒“⚠️ 快到梁文峰时间了，建议停下。”',
  '④ 用户明确要求详细回答时，以用户要求为准。',
  '⑤ 仅以传入的北京时间判断；未提供时间时默认梁文峰模式。',
].join('\n');

const REMINDER = '⚠️ 快到梁文峰时间了，建议停下。';

const FENG_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
const WARN_WINDOWS = [[8 * 60 + 50, 9 * 60], [13 * 60 + 50, 14 * 60]];

function beijingNow() {
  const now = new Date();
  // 北京时间 = UTC+8（用 UTC 字段直接偏移，避免依赖本机时区）
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  return {
    hour: bj.getUTCHours(),
    minute: bj.getUTCMinutes(),
    iso: bj.toISOString().replace('T', ' ').slice(0, 16),
  };
}

function classify(hour, minute) {
  const t = hour * 60 + minute;
  const feng = FENG_WINDOWS.some(([s, e]) => s <= t && t < e);
  const remind = WARN_WINDOWS.some(([s, e]) => s <= t && t < e);
  return { mode: feng ? 'feng' : 'gu', remind };
}

function buildRulesText(snapshot) {
  let text = RULES;
  if (snapshot.remind) {
    text += `\n\n当前处于提醒窗口：回答末尾必须附上 ${REMINDER}`;
  }
  return text;
}

module.exports = {
  name: 'liang-mode-dsh',
  inject: ['systemPrompt', 'timer'],
  async apply(ctx) {
    // 暴露 liangMode service：client 可经 ctx.parallel 拉取快照
    ctx.provide('liangMode', {
      getSnapshot() {
        const { hour, minute, iso } = beijingNow();
        const { mode, remind } = classify(hour, minute);
        return {
          mode,
          remind,
          time: iso,
          label: mode === 'feng' ? '梁文峰（极简）' : '梁文谷（正常）',
          rules: buildRulesText({ remind }),
        };
      },
    });

    // 注入系统提示词规则段（order 0 与 persona 同区；text 动态按当前时间）
    ctx.systemPrompt.section({
      name: 'liang-mode:rules',
      order: 0,
      text: () => ctx.liangMode.getSnapshot().rules,
    });

    // 每分钟：模式可能切换 -> 刷新 system prompt（client 提示框自算时间，不依赖推送）
    const tick = () => ctx.emit('system-prompt/change');
    tick();
    ctx.interval(tick, 60 * 1000);
  },
};
