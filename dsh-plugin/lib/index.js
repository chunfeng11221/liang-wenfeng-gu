'use strict';
/**
 * liang-mode-dsh — server 端插件。
 *
 * 模式规则：
 *   - 默认按北京时间自动判断梁文峰（极简）/ 梁文谷（正常）模式：
 *       09:00-12:00、14:00-18:00 -> 梁文峰（极简）
 *       其余时间 -> 梁文谷（正常）
 *       08:50-09:00、13:50-14:00 -> 提醒窗口（回答末尾附切换提醒）
 *   - 支持手动锁定模式（auto/feng/gu），持久化到 ~/.dsh/liang-mode.json。
 *
 * HTTP 接口（经 webServer 服务注册，前缀 /liang-mode/）：
 *   GET  /liang-mode/state            -> { override, mode, remind, time, label, rules }
 *   POST /liang-mode/override         -> body { override: 'auto'|'feng'|'gu' }，返回最新 state
 *   POST /liang-mode/conversation-start -> 对话开始打点，body { key }，追加写 ~/.dsh/liang-mode-sessions.jsonl
 *   GET  /liang-mode/avatar-feng.jpg  -> 梁文峰配图（lib/assets/feng.jpg）
 *   GET  /liang-mode/avatar-gu.jpg    -> 梁文谷配图（lib/assets/gu.jpg）
 *
 * 通过 dsh-system-prompt 的 section 注册动态规则段（每分钟刷新）。
 */

const fs = require('node:fs');
const path = require('node:path');

const RULES = [
  '按北京时间回复：',
  '① 00:00-09:00、12:00-14:00、18:00-24:00：梁文谷模式，正常回复。',
  '② 09:00-12:00、14:00-18:00：梁文峰模式，极简回复；能省则省，只保留必要结论，不复述、不扩展、不寒暄。',
  '③ 08:50-09:00、13:50-14:00：回答末尾提醒“⚠️ 快到梁文峰时间了，建议停下。”',
  '④ 用户明确要求详细回答时，以用户要求为准。',
  '⑤ 仅以传入的北京时间判断；未提供时间时默认梁文峰模式。',
].join('\n');

const OVERRIDE_RULES = {
  feng: '用户已手动锁定【梁文峰模式】：极简回复；能省则省，只保留必要结论，不复述、不扩展、不寒暄。用户明确要求详细回答时，以用户要求为准。',
  gu: '用户已手动锁定【梁文谷模式】：正常回复。',
};

const REMINDER = '⚠️ 快到梁文峰时间了，建议停下。';

const FENG_WINDOWS = [[9 * 60, 12 * 60], [14 * 60, 18 * 60]];
const WARN_WINDOWS = [[8 * 60 + 50, 9 * 60], [13 * 60 + 50, 14 * 60]];
const OVERRIDE_VALUES = ['auto', 'feng', 'gu'];

const STATE_FILE = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'liang-mode.json');
// 对话开始模式记录（jsonl，每行一条 { ts, key, override, mode, time }）
const HISTORY_FILE = path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh', 'liang-mode-sessions.jsonl');

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

function loadOverride() {
  try {
    const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return OVERRIDE_VALUES.includes(data.override) ? data.override : 'auto';
  } catch {
    return 'auto';
  }
}

function saveOverride(override) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify({ override }));
  } catch {
    // 持久化失败不阻塞本次切换
  }
}

function buildRulesText({ remind, override }) {
  if (override !== 'auto') return OVERRIDE_RULES[override];
  let text = RULES;
  if (remind) {
    text += `\n\n当前处于提醒窗口：回答末尾必须附上 ${REMINDER}`;
  }
  return text;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100 * 1024) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
  res.end(JSON.stringify(data));
}

module.exports = {
  name: 'liang-mode-dsh',
  inject: ['systemPrompt', 'timer', 'webServer'],
  async apply(ctx) {
    let override = loadOverride();

    const snapshot = () => {
      const { hour, minute, iso } = beijingNow();
      const timed = classify(hour, minute);
      const mode = override === 'auto' ? timed.mode : override;
      const remind = override === 'auto' && timed.remind;
      return {
        override,
        mode,
        remind,
        time: iso,
        label: mode === 'feng' ? '梁文峰（极简）' : '梁文谷（正常）',
        rules: buildRulesText({ remind, override }),
      };
    };

    // 暴露 liangMode service：client 可经 ctx.parallel 拉取快照
    ctx.provide('liangMode', { getSnapshot: snapshot });

    // 注入系统提示词规则段（order 0 与 persona 同区；text 动态按当前状态）
    ctx.systemPrompt.section({
      name: 'liang-mode:rules',
      order: 0,
      text: () => ctx.liangMode.getSnapshot().rules,
    });

    // HTTP 接口：状态查询 / 手动切换 / 配图
    ctx.webServer.register({
      kind: 'prefix',
      path: '/liang-mode',
      handler: async (req, res) => {
        const pathname = new URL(req.url || '/', 'http://x').pathname;

        if (pathname === '/liang-mode/state' && req.method === 'GET') {
          sendJson(res, 200, snapshot());
          return;
        }

        if (pathname === '/liang-mode/override' && req.method === 'POST') {
          const body = await readBody(req);
          let next;
          try {
            next = JSON.parse(body).override;
          } catch {
            // next 保持 undefined，走 400
          }
          if (!OVERRIDE_VALUES.includes(next)) {
            sendJson(res, 400, { error: `override must be one of ${OVERRIDE_VALUES.join('|')}` });
            return;
          }
          override = next;
          saveOverride(override);
          ctx.emit('system-prompt/change');
          sendJson(res, 200, snapshot());
          return;
        }

        // 对话开始打点：client 在每段对话首次加载时调用，追加写入 jsonl 记录
        if (pathname === '/liang-mode/conversation-start' && req.method === 'POST') {
          const body = await readBody(req);
          let key = null;
          try {
            key = String(JSON.parse(body).key || '').slice(0, 200) || null;
          } catch {
            // key 保持 null
          }
          const snap = snapshot();
          const entry = { ts: new Date().toISOString(), key, override: snap.override, mode: snap.mode, time: snap.time };
          try {
            fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
            fs.appendFileSync(HISTORY_FILE, JSON.stringify(entry) + '\n');
          } catch {
            // 记录失败不阻塞返回
          }
          sendJson(res, 200, { start: { mode: snap.mode, label: snap.label, time: snap.time }, ...snap });
          return;
        }

        const avatar = /^\/liang-mode\/avatar-(feng|gu)\.jpg$/.exec(pathname);
        if (avatar && req.method === 'GET') {
          try {
            const body = fs.readFileSync(path.join(__dirname, 'assets', `${avatar[1]}.jpg`));
            res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=3600' });
            res.end(body);
          } catch {
            res.writeHead(404);
            res.end();
          }
          return;
        }

        res.writeHead(404);
        res.end();
      },
    });

    // 每分钟：模式可能切换 -> 刷新 system prompt（client 提示框自行轮询 /liang-mode/state）
    const tick = () => {
      ctx.emit('system-prompt/change');
    };
    tick();
    ctx.setInterval(tick, 60 * 1000);
  },
};
