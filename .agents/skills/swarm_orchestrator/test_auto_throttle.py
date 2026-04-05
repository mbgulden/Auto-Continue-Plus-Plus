"""
Unit tests for the Auto-Throttle Engine.

Validates: usage recording, percentage calculations, threshold detection,
model cascade logic, throttle event logging, and quota reset calculation.
"""

import os
import sqlite3
import time
import unittest

# Point to a temp DB so we don't pollute the real one
TEST_DB = os.path.join(os.path.dirname(__file__), "test_swarm_state.db")

# Patch the module's DB_PATH before importing
import auto_throttle
auto_throttle.DB_PATH = TEST_DB


class TestAutoThrottle(unittest.TestCase):
    """Test suite for the auto_throttle module."""

    def setUp(self) -> None:
        """Create a fresh test database before each test."""
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
        auto_throttle.init_usage_table()

    def tearDown(self) -> None:
        """Clean up the test database after each test."""
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)

    def test_record_usage_increments(self) -> None:
        """Verify that record_usage increments count correctly."""
        result1 = auto_throttle.record_usage("gemini-3.1-pro", tokens=100)
        self.assertEqual(result1["count"], 1)
        self.assertEqual(result1["tokens_used"], 100)

        result2 = auto_throttle.record_usage("gemini-3.1-pro", tokens=200)
        self.assertEqual(result2["count"], 2)
        self.assertEqual(result2["tokens_used"], 300)

    def test_percentage_calculation(self) -> None:
        """Verify percentage is correctly calculated against daily limit."""
        # Pro 3.1 has 500/day limit on Ultra
        result = auto_throttle.record_usage("gemini-3.1-pro", tokens=0)
        expected_pct = round(1 / 500 * 100, 1)
        self.assertEqual(result["percentage"], expected_pct)

    def test_warn_threshold_at_85_percent(self) -> None:
        """Verify should_warn fires at 85% of daily limit."""
        # Pro 3.1 limit = 500, 85% = 425
        for _ in range(424):
            auto_throttle.record_usage("gemini-3.1-pro", tokens=0)

        result = auto_throttle.record_usage("gemini-3.1-pro", tokens=0)
        # Now at 425/500 = 85%
        self.assertTrue(result["should_warn"])
        self.assertFalse(result["should_switch"])

    def test_switch_threshold_at_95_percent(self) -> None:
        """Verify should_switch fires at 95% of daily limit."""
        # Pro 3.1 limit = 500, 95% = 475
        for _ in range(474):
            auto_throttle.record_usage("gemini-3.1-pro", tokens=0)

        result = auto_throttle.record_usage("gemini-3.1-pro", tokens=0)
        # Now at 475/500 = 95%
        self.assertTrue(result["should_switch"])

    def test_cascade_order(self) -> None:
        """Verify the model cascade follows the correct fallback order."""
        self.assertEqual(
            auto_throttle.get_next_model("gemini-3.1-pro"),
            "gemini-thinking"
        )
        self.assertEqual(
            auto_throttle.get_next_model("gemini-thinking"),
            "gemini-3-flash"
        )
        self.assertEqual(
            auto_throttle.get_next_model("gemini-3-flash"),
            "gemini-2.5-flash"
        )
        self.assertEqual(
            auto_throttle.get_next_model("gemini-2.5-flash"),
            "gemini-2.5-flash-lite"
        )
        # End of cascade — no further fallback
        self.assertIsNone(
            auto_throttle.get_next_model("gemini-2.5-flash-lite")
        )

    def test_cascade_unknown_model(self) -> None:
        """Verify unknown models return None for cascade."""
        self.assertIsNone(auto_throttle.get_next_model("fake-model-9000"))

    def test_throttle_event_logging(self) -> None:
        """Verify throttle events are persisted and retrievable."""
        auto_throttle.log_throttle_event(
            "gemini-3.1-pro", "gemini-thinking", "Usage at 96%"
        )
        history = auto_throttle.get_throttle_history()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["from_model"], "gemini-3.1-pro")
        self.assertEqual(history[0]["to_model"], "gemini-thinking")
        self.assertIn("96%", history[0]["reason"])

    def test_get_all_usage_includes_all_models(self) -> None:
        """Verify get_all_usage returns entries for every defined model."""
        all_usage = auto_throttle.get_all_usage()
        model_ids = [m["model"] for m in all_usage]

        for model_id in auto_throttle.ULTRA_LIMITS:
            self.assertIn(
                model_id, model_ids,
                f"Model {model_id} missing from get_all_usage response"
            )

    def test_unlimited_models_show_zero_pct(self) -> None:
        """Verify models with 99999 limit show near-zero percentage."""
        auto_throttle.record_usage("gemini-3-flash", tokens=0)
        all_usage = auto_throttle.get_all_usage()
        flash = next(m for m in all_usage if m["model"] == "gemini-3-flash")
        self.assertLess(flash["percentage"], 0.1)

    def test_quota_reset_seconds_positive(self) -> None:
        """Verify reset timer returns a positive number of seconds."""
        seconds = auto_throttle.get_quota_reset_seconds()
        self.assertGreater(seconds, 0)
        # Should be less than 24 hours
        self.assertLessEqual(seconds, 86400)

    def test_independent_model_tracking(self) -> None:
        """Verify that usage for one model doesn't affect another."""
        auto_throttle.record_usage("gemini-3.1-pro", tokens=500)
        auto_throttle.record_usage("deep-research", tokens=0)

        all_usage = auto_throttle.get_all_usage()
        pro = next(m for m in all_usage if m["model"] == "gemini-3.1-pro")
        dr = next(m for m in all_usage if m["model"] == "deep-research")

        self.assertEqual(pro["count"], 1)
        self.assertEqual(dr["count"], 1)
        self.assertEqual(pro["tokens_used"], 500)
        self.assertEqual(dr["tokens_used"], 0)


if __name__ == "__main__":
    unittest.main()
