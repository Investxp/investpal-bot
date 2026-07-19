"""
Integration test: 6 test scenarios for the full InvestPal Polymarket engine.
"""
import unittest, json, os, sys, random
sys.path.insert(0, os.path.dirname(__file__))

class TestIntegration(unittest.TestCase):
    """Integration test for polymarket.py and position_manager.py"""

    @classmethod
    def setUpClass(cls):
        import core.polymarket as pm
        import core.position_manager as posman
        import core.balance_manager as balman
        import core.bot as bot
        cls.pm = pm
        cls.posman = posman
        cls.balman = balman
        cls.bot = bot

    def test_01_tick_rounding(self):
        """Tick rounding: prices are rounded to nearest 0.0025"""
        pairs = [(0.5938, 0.595), (0.5012, 0.500), (0.9987, 0.9975),
                 (0.25, 0.25), (0.1888, 0.190), (0.0031, 0.0025)]
        for raw, expected in pairs:
            rounded = self.pm._round_tick(raw)
            self.assertEqual(rounded, expected,
                             f"_round_tick({raw}) = {rounded}, expected {expected}")

    def test_02_position_manager(self):
        """Position manager: record \u2192 match \u2192 open \u2192 resolve with P&L"""
        posman = self.posman
        import time
        order_id = f"test_order_{int(time.time() * 1000)}"
        token_id = "999999_test"
        # Step 1: record order
        posman.record_order(token_id, "BUY", 0.5, 10.0, order_id)
        orders = posman.get_orders()
        found = any(o["order_id"] == order_id for o in orders)
        self.assertTrue(found, "Order should be recorded")
        # Step 2: mark matched
        posman.mark_matched(order_id, match_amount=10.0)
        matched_orders = [o for o in posman.get_orders() if o["order_id"] == order_id]
        self.assertGreaterEqual(len(matched_orders), 1)
        self.assertEqual(matched_orders[0]["status"], "matched")
        # Step 3: open position
        posman.open_position(order_id, token_id, "BUY", 0.5, 10.0, "mkt_999")
        # Step 4: resolve with P&L
        posman.resolve_position(order_id, won=True, pnl=5.0)
        summary = posman.get_summary()
        self.assertIn("total_pnl", summary)

    def test_03_market_scan(self):
        """Market scanning: fetches live markets from Gamma API"""
        pm = self.pm
        markets = pm.scan_all()
        self.assertIsInstance(markets, list)
        self.assertGreater(len(markets), 500)

    def test_04_balance_manager(self):
        """Balance manager: check and top-up logging"""
        balman = self.balman
        raw_balance = 100_000_000  # 100 pUSD in micro-units
        balman.record_check(raw_balance)
        status = balman.get_status()
        self.assertIsNotNone(status)
        self.assertAlmostEqual(status.get("last_balance", 0.0), raw_balance / 1e6)
        need = balman.need_topup(0.5)
        self.assertTrue(need, "Balance 0.5 below min should need top-up")

    def test_05_poly1271_order_prep(self):
        """POLY_1271 order building (fails on balance, not tick size)"""
        pm = self.pm
        try:
            price = pm._round_tick(0.55)
            self.assertAlmostEqual(price % 0.0025, 0.0,
                                   msg="Price must be valid tick")
            # Build with env mock
            import os
            old_pk = os.environ.get("POLYMARKET_PRIVATE_KEY")
            os.environ["POLYMARKET_PRIVATE_KEY"] = "0x" + "ab" * 32
            try:
                result = pm._build_poly1271_order(
                    token_id="1", side="BUY", price=price, size_usdc=10.0,
                    deposit_wallet="0x" + "cd" * 20,
                )
                self.assertIsNotNone(result)
            finally:
                if old_pk: os.environ["POLYMARKET_PRIVATE_KEY"] = old_pk
                else: os.environ.pop("POLYMARKET_PRIVATE_KEY", None)
        except Exception as e:
            self.fail(f"POLY_1271 order building failed: {e}")

    def test_06_bot_cycle_config(self):
        """Bot config: reads and validates default config"""
        bot = self.bot
        cfg = bot.get_config()
        self.assertIsInstance(cfg, dict)
        required = ["base_stake", "recovery_factor", "max_concurrent",
                     "interval_seconds", "bankroll", "bot_mode", "order_type",
                     "auto_fund", "min_pusd", "bot_enabled", "balance_filter"]
        for key in required:
            self.assertIn(key, cfg, f"Missing bot config key: {key}")
        self.assertIn(cfg.get("bot_mode"), ["demo", "simulation", "live"])
        self.assertIn(cfg.get("order_type"), ["standard", "poly1271"])

    def test_07_server_import(self):
        """Server module imports without errors"""
        try:
            import server
            self.assertTrue(hasattr(server, "Handler"))
        except Exception as e:
            self.fail(f"Server import failed: {e}")

    def test_08_setup_compiles(self):
        """Setup module compiles without errors"""
        import py_compile
        py_compile.compile("setup.py", doraise=True)
        self.assertTrue(True)


if __name__ == "__main__":
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(unittest.TestLoader().loadTestsFromTestCase(TestIntegration))
    sys.exit(0 if result.wasSuccessful() else 1)
