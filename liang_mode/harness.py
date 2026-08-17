"""DeepSeek harness 接入：OpenAI 兼容调用 + 模式注入 + 提示框横幅。

零第三方依赖（只用标准库 requests），模型默认 deepseek-chat。
可通过环境变量配置：
  DEEPSEEK_API_KEY  必填
  DEEPSEEK_BASE_URL 默认 https://api.deepseek.com
  DEEPSEEK_MODEL    默认 deepseek-chat
"""

import os
import sys

from .clock import MODE_LABELS, classify, now_beijing
from .prompt import _REMINDER, build_system_prompt

DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-chat"

_BANNER_TOP = "━" * 46
_BANNER_BOTTOM = "━" * 46


def make_client(api_key: str | None = None,
                base_url: str | None = None,
                model: str | None = None):
    """构造一个最小 OpenAI 兼容客户端（requests 实现）。"""
    api_key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
    base_url = (base_url or os.environ.get("DEEPSEEK_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    model = model or os.environ.get("DEEPSEEK_MODEL") or DEFAULT_MODEL
    if not api_key:
        raise RuntimeError("缺少 DEEPSEEK_API_KEY（环境变量或参数）")

    import requests

    class _Client:
        def __init__(self):
            self.model = model

        def chat(self, messages, **kwargs):
            resp = requests.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}",
                         "Content-Type": "application/json"},
                json={"model": model, "messages": messages, **kwargs},
                timeout=kwargs.pop("timeout", 180),
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]

    return _Client()


def run_once(client, user_text: str,
             beijing_time: str | None = None,
             detailed: bool = False) -> str:
    """单轮问答：按北京时间选模式注入提示词，返回 (回复文本, 模式信息)。

    - detailed=True 表示用户明确要求详细回答，按规则以用户要求为准（不强制极简）。
    """
    now = now_beijing()
    bj_text = beijing_time if beijing_time is not None else now.strftime("%Y-%m-%d %H:%M")
    if beijing_time is not None:
        m, r = _classify_from_text(beijing_time)
    else:
        m, r = classify(now.hour, now.minute)

    if detailed:
        # 用户要求详细时，以用户为准：仍注入规则但附上“本次用户要求详细”豁免
        system = build_system_prompt(bj_text, mode=m, remind=r) + "\n\n注意：用户本次明确要求详细回答，按规则以用户要求为准，不受极简限制。"
    else:
        system = build_system_prompt(bj_text, mode=m, remind=r)

    reply = client.chat([{"role": "system", "content": system},
                         {"role": "user", "content": user_text}])

    if r:
        reply = (reply.rstrip() + "\n\n" + _REMINDER).strip() if _REMINDER not in reply else reply

    return reply, {"mode": m, "label": MODE_LABELS[m], "remind": r,
                   "beijing_time": bj_text}


def print_banner(info: dict, stream=sys.stdout) -> None:
    """在回答下方打印模式提示框。"""
    remind_note = "  ⚠️ 切换提醒窗口" if info["remind"] else ""
    print(_BANNER_TOP, file=stream)
    print(f"  当前模式：{info['label']}{remind_note}", file=stream)
    print(f"  北京时间：{info['beijing_time']}", file=stream)
    print(_BANNER_BOTTOM, file=stream)


def _classify_from_text(text: str):
    from .prompt import _hhmm_from_text
    hh, mm = _hhmm_from_text(text)
    return classify(hh, mm)
