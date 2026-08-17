"""边界测试：模式切换与提醒窗口。"""

import unittest
from datetime import datetime, timezone

from liang_mode.clock import MODE_FENG, MODE_GU, classify, classify_datetime
from liang_mode.prompt import build_system_prompt, _REMINDER


class TestClassify(unittest.TestCase):
    def test_gu_morning(self):
        # 00:00-09:00 梁文谷
        self.assertEqual(classify(0, 0), (MODE_GU, False))
        self.assertEqual(classify(8, 59), (MODE_GU, True))   # 08:59 在提醒窗
        self.assertEqual(classify(8, 49), (MODE_GU, False))  # 08:49 不在提醒窗

    def test_feng_morning(self):
        # 09:00 进入梁文峰
        self.assertEqual(classify(9, 0), (MODE_FENG, False))
        self.assertEqual(classify(11, 59), (MODE_FENG, False))

    def test_gu_noon(self):
        # 12:00-14:00 梁文谷；13:59 提醒窗
        self.assertEqual(classify(12, 0), (MODE_GU, False))
        self.assertEqual(classify(13, 55), (MODE_GU, True))
        self.assertEqual(classify(14, 0), (MODE_FENG, False))

    def test_feng_afternoon(self):
        self.assertEqual(classify(16, 30), (MODE_FENG, False))
        self.assertEqual(classify(17, 59), (MODE_FENG, False))

    def test_gu_evening(self):
        # 18:00-24:00 梁文谷
        self.assertEqual(classify(18, 0), (MODE_GU, False))
        self.assertEqual(classify(23, 59), (MODE_GU, False))

    def test_reminder_windows(self):
        self.assertEqual(classify(8, 50), (MODE_GU, True))
        self.assertEqual(classify(8, 59), (MODE_GU, True))
        self.assertEqual(classify(13, 50), (MODE_GU, True))
        self.assertEqual(classify(13, 59), (MODE_GU, True))
        # 提醒窗不含端点外
        self.assertEqual(classify(9, 0), (MODE_FENG, False))
        self.assertEqual(classify(14, 0), (MODE_FENG, False))


class TestPrompt(unittest.TestCase):
    _ACTIVE = "当前处于提醒窗口"

    def test_default_feng_when_no_time(self):
        # 未提供时间默认梁文峰
        prompt = build_system_prompt()
        self.assertIn("默认梁文峰模式", prompt)

    def test_explicit_time(self):
        prompt = build_system_prompt("2026-08-16 10:30")
        self.assertIn("2026-08-16 10:30", prompt)

    def test_reminder_appended(self):
        prompt = build_system_prompt("2026-08-16 08:55")
        self.assertIn(self._ACTIVE, prompt)

    def test_no_reminder_outside_window(self):
        prompt = build_system_prompt("2026-08-16 10:30")
        self.assertNotIn(self._ACTIVE, prompt)


class TestDatetime(unittest.TestCase):
    def test_utc_conversion(self):
        # UTC 01:00 = 北京 09:00 -> 梁文峰
        dt = datetime(2026, 8, 16, 1, 0, tzinfo=timezone.utc)
        self.assertEqual(classify_datetime(dt), (MODE_FENG, False))
        # UTC 04:00 = 北京 12:00 -> 梁文谷
        dt = datetime(2026, 8, 16, 4, 0, tzinfo=timezone.utc)
        self.assertEqual(classify_datetime(dt), (MODE_GU, False))


if __name__ == "__main__":
    unittest.main()
