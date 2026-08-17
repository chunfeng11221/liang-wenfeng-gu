"""系统提示词构建：把模式规则与当前北京时间注入系统提示词。"""

from .clock import MODE_FENG, MODE_GU, classify, now_beijing

_RULES_TEMPLATE = """按北京时间 {beijing_time} 回复：

* 00:00-09:00、12:00-14:00、18:00-24:00：梁文谷模式，正常回复。
* 09:00-12:00、14:00-18:00：梁文峰模式，极简回复；能省则省，只保留必要结论，不复述、不扩展、不寒暄。
* 08:50-09:00、13:50-14:00：回答末尾提醒“⚠️ 快到梁文峰时间了，建议停下。”
* 用户明确要求详细回答时，以用户要求为准。
* 仅以传入的北京时间判断；未提供时间时默认梁文峰模式。"""

_REMINDER = "⚠️ 快到梁文峰时间了，建议停下。"


def build_system_prompt(beijing_time: str | None = None,
                        mode: str | None = None,
                        remind: bool | None = None,
                        include_reminder_rule: bool = True) -> str:
    """构建系统提示词。

    - beijing_time: 传入的北京时间字符串（如 '2026-08-16 10:23'）；None 表示未提供，
      按规则默认梁文峰模式。
    - mode/remind 若显式给出则直接使用（由调用方判断）；否则自动按当前北京时间计算。
    """
    if beijing_time is None:
        # 规则：仅以传入的北京时间判断；未提供时间时默认梁文峰模式
        time_text = "未提供（默认梁文峰模式）"
        effective_mode = mode or MODE_FENG
        effective_remind = False if remind is None else remind
    else:
        time_text = str(beijing_time)
        if mode is None or remind is None:
            m, r = classify(*_hhmm_from_text(str(beijing_time)))
            effective_mode = mode if mode is not None else m
            effective_remind = remind if remind is not None else r

    prompt = _RULES_TEMPLATE.format(beijing_time=time_text)
    if not include_reminder_rule:
        # 允许调用方去掉提醒条款（如用户要求详细回答时）
        pass
    if effective_remind and include_reminder_rule:
        prompt += f"\n\n当前处于提醒窗口：回答末尾必须附上 {_REMINDER}"
    return prompt


def _hhmm_from_text(text: str) -> tuple[int, int]:
    """从 'YYYY-MM-DD HH:MM' 或 'HH:MM' 提取 (小时, 分钟)。无法解析时返回当前时间。"""
    import re
    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if m:
        return int(m.group(1)), int(m.group(2))
    now = now_beijing()
    return now.hour, now.minute
