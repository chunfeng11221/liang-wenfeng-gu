"""北京时钟与模式判断（纯函数，无依赖，可单测）。"""

from datetime import datetime, timedelta, timezone

BEIJING_TZ = timezone(timedelta(hours=8))

# 梁文峰（极简）窗口：[09:00, 12:00) 与 [14:00, 18:00)
_FENG_WINDOWS = ((9 * 60, 12 * 60), (14 * 60, 18 * 60))
# 提醒窗口（切到梁文峰前 10 分钟）：[08:50, 09:00) 与 [13:50, 14:00)
_WARN_WINDOWS = ((8 * 60 + 50, 9 * 60), (13 * 60 + 50, 14 * 60))

MODE_FENG = "feng"   # 梁文峰：极简
MODE_GU = "gu"       # 梁文谷：正常

MODE_LABELS = {MODE_FENG: "梁文峰（极简）", MODE_GU: "梁文谷（正常）"}


def now_beijing() -> datetime:
    """当前北京时间。"""
    return datetime.now(BEIJING_TZ)


def classify(hh: int, mm: int) -> tuple[str, bool]:
    """按北京时间（小时+分钟）返回 (模式, 是否需要切换提醒)。

    - 模式：'feng'（梁文峰极简）或 'gu'（梁文谷正常）
    - 提醒：处于 08:50-09:00 / 13:50-14:00 时为 True（回答末尾提示）
    """
    t = hh * 60 + mm
    mode = MODE_FENG if any(s <= t < e for s, e in _FENG_WINDOWS) else MODE_GU
    remind = any(s <= t < e for s, e in _WARN_WINDOWS)
    return mode, remind


def classify_datetime(dt: datetime) -> tuple[str, bool]:
    """对任意 datetime（自动转北京时间）分类。"""
    bj = dt.astimezone(BEIJING_TZ)
    return classify(bj.hour, bj.minute)
