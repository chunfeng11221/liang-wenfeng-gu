# liang-mode

**DeepSeek 梁文峰 / 梁文谷 双模式 harness 适配器**

按北京时间自动切换两种回复模式，专为 DeepSeek harness 设计，带模式提示框。

## 模式规则

按北京时间回复：

- **00:00-09:00 / 12:00-14:00 / 18:00-24:00**：梁文谷模式，正常回复。
- **09:00-12:00 / 14:00-18:00**：梁文峰模式，极简回复——能省则省，只保留必要结论，不复述、不扩展、不寒暄。
- **08:50-09:00 / 13:50-14:00**：回答末尾提醒「⚠️ 快到梁文峰时间了，建议停下。」
- 用户明确要求详细回答时，以用户要求为准。
- 仅以传入的北京时间判断；未提供时间时**默认梁文峰模式**。

## 安装

```bash
pip install -e .
# 或直接使用（零第三方依赖，只需 requests）
```

## 快速开始

```bash
export DEEPSEEK_API_KEY=sk-xxx

# 交互模式
python -m liang_mode.cli

# 单轮问答
python -m liang_mode.cli "用一句话总结今天要做什么"

# 指定北京时间（测试模式切换）
python -m liang_mode.cli --time "10:30" "介绍你自己"
python -m liang_mode.cli --time "08:55" "安排一下日程"   # 会带切换提醒

# 要求详细回答（豁免极简）
python -m liang_mode.cli --detailed "详细讲讲这个方案"
```

## 提示框效果

```
问题> 用一句话总结今天要做什么

今天三件事：改 A 股工作台、发日报、迭代内容矩阵。
──────────────────────────────────────────────
  当前模式：梁文峰（极简）
  北京时间：2026-08-16 10:23
──────────────────────────────────────────────
```

## 作为库接入（DeepSeek harness / opencode / 自定义 Agent）

```python
from liang_mode.harness import make_client, run_once, print_banner
from liang_mode.clock import classify, now_beijing

client = make_client()  # 读 DEEPSEEK_API_KEY

# 自动按当前北京时间判断模式并注入系统提示词
reply, info = run_once(client, "你的问题")
print(reply)
print_banner(info)  # 打印模式提示框

# 手动指定时间
m, remind = classify(10, 30)          # -> ('feng', False)
m, remind = classify(8, 55)           # -> ('gu', True)
```

系统提示词通过 `build_system_prompt(beijing_time, mode, remind)` 生成，
可以直接注入任何 OpenAI 兼容 harness（DeepSeek API、opencode、Continue 等）的 system 消息。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 无（必填） | DeepSeek API Key |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` | API 地址（可换中转） |
| `DEEPSEEK_MODEL` | `deepseek-chat` | 模型名 |

## 测试

```bash
python -m unittest discover -s tests
```

覆盖：模式切换边界（09:00/12:00/14:00/18:00）、提醒窗口（08:50-09:00、13:50-14:00）、
未提供时间默认梁文峰、UTC→北京时间换算、详细回答豁免。

## License

MIT
