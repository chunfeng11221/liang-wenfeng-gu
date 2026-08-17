'use strict';
/**
 * liang-mode-dsh — client 端插件。
 *
 * 在对话输入区（conversation.input.dock 插槽）显示模式提示框：
 *   ──────────────────────────────────
 *    当前模式：梁文峰（极简） | 北京时间 2026-08-16 10:23
 *   ──────────────────────────────────
 * 北京时间与模式判断在浏览器端自算（每 30 秒刷新），不依赖 server 推送。
 */

const React = require('react');
const { h } = require('@deepseek-ai/cordis');

// ---- 北京时间 + 模式判断（浏览器端，与 server 逻辑一致） ----
const FENG_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
const WARN_WINDOWS = [[8 * 60 + 50, 9 * 60], [13 * 60 + 50, 14 * 60]];

function snapshot() {
  const now = new Date();
  const bj = new Date(now.getTime() + 8 * 3600 * 1000);
  const hour = bj.getUTCHours();
  const minute = bj.getUTCMinutes();
  const t = hour * 60 + minute;
  const feng = FENG_WINDOWS.some(([s, e]) => s <= t && t < e);
  const remind = WARN_WINDOWS.some(([s, e]) => s <= t && t < e);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    mode: feng ? 'feng' : 'gu',
    remind,
    time: `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(hour)}:${pad(minute)}`,
  };
}

const MODE_COLORS = {
  feng: { bg: '#1a1a2e', border: '#e94560', fg: '#ff6b81', tag: '梁文峰 · 极简' },
  gu: { bg: '#0f2027', border: '#2ecc71', fg: '#4ade80', tag: '梁文谷 · 正常' },
};

function ModeBanner() {
  const [s, setS] = React.useState(snapshot);
  React.useEffect(() => {
    const id = setInterval(() => setS(snapshot()), 30 * 1000);
    return () => clearInterval(id);
  }, []);
  const c = MODE_COLORS[s.mode] || MODE_COLORS.gu;
  const remindNote = s.remind ? '  ⚠️ 切换提醒窗口' : '';
  return h(
    'div',
    {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 12px',
        margin: '4px 0',
        borderRadius: '8px',
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.fg,
        fontSize: '12px',
        fontFamily: 'monospace',
      },
    },
    h('span', { style: { fontWeight: 700 } }, c.tag),
    h('span', {}, `| 北京时间 ${s.time}${remindNote}`),
  );
}

module.exports = {
  name: 'liang-mode-dsh-client',
  inject: ['slots'],
  apply(ctx) {
    // 挂到对话输入区 dock（todo 条同一插槽，order 靠后显示在最下方）
    ctx.slots.inject('conversation.input.dock', () =>
      ctx.slots.register({
        name: 'liang-mode-banner',
        component: ModeBanner,
        order: 1000,
      }),
    );
  },
};
