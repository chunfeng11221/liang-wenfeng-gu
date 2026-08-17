"""交互 CLI：DeepSeek 双模式聊天（梁文峰 / 梁文谷）。

用法：
  python -m liang_mode.cli            # 交互模式（需 DEEPSEEK_API_KEY）
  python -m liang_mode.cli "你的问题"  # 单轮问答
  python -m liang_mode.cli --time "10:00" "你的问题"   # 指定北京时间测试
"""

import argparse
import sys

from .clock import MODE_LABELS
from .harness import make_client, print_banner, run_once


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="DeepSeek 梁文峰/梁文谷双模式聊天")
    p.add_argument("question", nargs="*", help="单轮问题；缺省进入交互模式")
    p.add_argument("--time", default=None, help="指定北京时间（如 10:00 或 2026-08-16 10:00），测试用")
    p.add_argument("--detailed", action="store_true", help="本次要求详细回答")
    args = p.parse_args(argv)

    try:
        client = make_client()
    except RuntimeError as e:
        print(f"错误：{e}", file=sys.stderr)
        return 1

    if args.question:
        q = " ".join(args.question)
        reply, info = run_once(client, q, beijing_time=args.time, detailed=args.detailed)
        print(reply)
        print()
        print_banner(info)
        return 0

    # 交互模式
    print("DeepSeek 双模式聊天（Ctrl+C 退出）。当前默认规则：未提供时间 → 梁文峰模式")
    try:
        while True:
            q = input("\n你> ").strip()
            if not q:
                continue
            detailed = "详细" in q or "展开" in q or "具体一点" in q
            reply, info = run_once(client, q, beijing_time=args.time, detailed=detailed)
            print("\n" + reply)
            print()
            print_banner(info)
    except (KeyboardInterrupt, EOFError):
        print("\n再见。")
        return 0


if __name__ == "__main__":
    sys.exit(main())
