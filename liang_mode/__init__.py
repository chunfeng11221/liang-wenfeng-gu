"""liang-mode: DeepSeek 梁文峰 / 梁文谷 双模式 harness 适配器。"""

from .clock import (MODE_FENG, MODE_GU, MODE_LABELS, BEIJING_TZ,
                    classify, classify_datetime, now_beijing)
from .prompt import build_system_prompt, _REMINDER
from .harness import make_client, run_once, print_banner

__version__ = "0.1.0"
__all__ = [
    "MODE_FENG", "MODE_GU", "MODE_LABELS", "BEIJING_TZ",
    "classify", "classify_datetime", "now_beijing",
    "build_system_prompt", "_REMINDER",
    "make_client", "run_once", "print_banner",
    "__version__",
]
