'use strict';
/**
 * liang-mode-dsh — client 端插件。
 *
 * 在对话输入区（conversation.input.dock 插槽）显示模式提示框：
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ [头像] 梁文峰 · 极简 | 北京时间 10:23 | 开始：梁文峰 10:23 │ [自动（按时间）⇄] │
 *   └──────────────────────────────────────────────────────────────┘
 * 状态每 30 秒从 server（/liang-mode/state）拉取；点击右侧按钮循环切换
 * 自动（按时间）→ 手动梁文峰 → 手动梁文谷 → 自动，切换立即生效并持久化。
 *
 * 对话开始模式记忆：每段对话（按 URL pathname 区分）首次加载时打点
 * （POST /liang-mode/conversation-start，服务端写入 jsonl 长期记录），
 * 开始时的模式存入 sessionStorage，刷新页面不丢、不重复打点，
 * 并在提示框上显示「开始：模式 时间」。
 */

window.__ModuleLoader__.load({
	id: 'liang-mode-dsh',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const React = require('react');
		const h = React.createElement;

		const MODE_COLORS = {
			feng: { bg: '#1a1a2e', border: '#e94560', fg: '#ff6b81', tag: '梁文峰 · 极简' },
			gu: { bg: '#0f2027', border: '#2ecc71', fg: '#4ade80', tag: '梁文谷 · 正常' },
		};
		const MODE_SHORT = { feng: '梁文峰', gu: '梁文谷' };
		const OVERRIDE_LABELS = {
			auto: '自动（按时间）',
			feng: '手动：梁文峰',
			gu: '手动：梁文谷',
		};
		const OVERRIDE_NEXT = { auto: 'feng', feng: 'gu', gu: 'auto' };
		const START_KEY_PREFIX = 'liang-mode-start:';

		async function fetchState() {
			const res = await fetch('/liang-mode/state', { cache: 'no-store' });
			if (!res.ok) throw new Error(`state ${res.status}`);
			return res.json();
		}

		async function postOverride(override) {
			const res = await fetch('/liang-mode/override', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ override }),
			});
			if (!res.ok) throw new Error(`override ${res.status}`);
			return res.json();
		}

		function readStoredStart(key) {
			try {
				const raw = sessionStorage.getItem(START_KEY_PREFIX + key);
				return raw ? JSON.parse(raw) : null;
			} catch {
				return null;
			}
		}

		function writeStoredStart(key, start) {
			try {
				sessionStorage.setItem(START_KEY_PREFIX + key, JSON.stringify(start));
			} catch {
				// sessionStorage 不可用时仅放弃展示，不影响打点
			}
		}

		// 每段对话首次加载打点；已有记录（刷新/重进）直接读取，不重复打点
		async function markConversationStart(key) {
			const stored = readStoredStart(key);
			if (stored) return { start: stored, fresh: false };
			const res = await fetch('/liang-mode/conversation-start', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ key }),
			});
			if (!res.ok) throw new Error(`conversation-start ${res.status}`);
			const data = await res.json();
			const start = data.start || { mode: data.mode, label: data.label, time: data.time };
			writeStoredStart(key, start);
			return { start, fresh: true };
		}

		function ModeBanner() {
			const [s, setS] = React.useState(null);
			const [start, setStart] = React.useState(null);
			const [busy, setBusy] = React.useState(false);
			const lastKeyRef = React.useRef(null);

			React.useEffect(() => {
				let alive = true;
				const pull = () => fetchState().then((data) => alive && setS(data)).catch(() => {});
				const checkStart = () => {
					const key = location.pathname || '/';
					if (key === lastKeyRef.current) return;
					lastKeyRef.current = key;
					markConversationStart(key)
						.then(({ start }) => alive && setStart(start))
						.catch(() => {});
				};
				pull();
				checkStart();
				const id = setInterval(() => {
					pull();
					checkStart(); // SPA 内切换对话（pathname 变化）时重新打点
				}, 30 * 1000);
				return () => {
					alive = false;
					clearInterval(id);
				};
			}, []);

			if (!s) return null;
			const c = MODE_COLORS[s.mode] || MODE_COLORS.gu;
			const remindNote = s.remind ? '  ⚠️ 切换提醒窗口' : '';
			const startNote =
				start && start.mode
					? `| 开始：${MODE_SHORT[start.mode] || start.mode} ${String(start.time || '').slice(11)} `
					: '';

			const cycle = () => {
				if (busy) return;
				setBusy(true);
				postOverride(OVERRIDE_NEXT[s.override] || 'auto')
					.then(setS)
					.catch(() => {})
					.finally(() => setBusy(false));
			};

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
				h('img', {
					src: `/liang-mode/avatar-${s.mode}.jpg`,
					alt: s.label,
					style: {
						width: '28px',
						height: '28px',
						borderRadius: '50%',
						objectFit: 'cover',
						border: `1px solid ${c.border}`,
						flexShrink: 0,
					},
				}),
				h('span', { style: { fontWeight: 700 } }, c.tag),
				h(
					'span',
					{ style: { flex: 1 } },
					`| 北京时间 ${s.time}${remindNote ? ' ' + remindNote : ''} ${startNote}`,
				),
				h(
					'button',
					{
						onClick: cycle,
						disabled: busy,
						title: '点击切换：自动（按时间）→ 手动梁文峰 → 手动梁文谷',
						style: {
							background: 'transparent',
							border: `1px solid ${c.border}`,
							borderRadius: '6px',
							color: c.fg,
							fontSize: '11px',
							fontFamily: 'monospace',
							padding: '2px 8px',
							cursor: busy ? 'wait' : 'pointer',
							opacity: busy ? 0.6 : 1,
							flexShrink: 0,
						},
					},
					`${OVERRIDE_LABELS[s.override]} ⇄`,
				),
			);
		}

		module.exports = {
			name: 'liang-mode-dsh-client',
			inject: ['slots'],
			apply(ctx) {
				// 挂到对话输入区 dock（todo 条同一插槽，order 靠后显示在最下方）
				ctx.slots.inject('conversation.input.dock', () =>
					ctx.slots.register({
						name: 'conversation.input.dock',
						id: 'liang-mode-banner',
						order: 1000,
					}, ModeBanner),
				);
			},
		};
		return module.exports;
	},
});
