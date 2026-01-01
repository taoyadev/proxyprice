import sys
from pathlib import Path

# Add scripts directory to path (repo uses script-style imports in tests)
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from parse_csv import parse_tier_line


def test_parse_tier_line_gb_implicit():
    tier = parse_tier_line("25 GB$3.6$90")
    assert tier is not None
    assert tier["pricing_model"] == "per_gb"
    assert tier["gb"] == 25.0
    assert tier["price_per_gb"] == 3.6
    assert tier["total"] == 90.0


def test_parse_tier_line_ip_implicit():
    tier = parse_tier_line("10 IPs$0.47$4.7")
    assert tier is not None
    assert tier["pricing_model"] == "per_ip"
    assert tier["ips"] == 10
    assert tier["price_per_ip"] == 0.47
    assert tier["total"] == 4.7


def test_parse_tier_line_gb_monthly_colon():
    tier = parse_tier_line("1GB: $7.00/Mo")
    assert tier is not None
    assert tier["pricing_model"] == "per_gb"
    assert tier["gb"] == 1.0
    assert tier["total"] == 7.0
    assert tier["price_per_gb"] == 7.0


def test_parse_tier_line_days_per_ip():
    tier = parse_tier_line("30 Days$1.57/IP")
    assert tier is not None
    assert tier["pricing_model"] == "per_ip"
    assert tier["ips"] == 1
    assert tier["price_per_ip"] == 1.57
    assert tier["period_days"] == 30


def test_parse_tier_line_gb_range_compact():
    tier = parse_tier_line("1-15 GB: $7.50/GB")
    assert tier is not None
    assert tier["pricing_model"] == "per_gb"
    assert tier["is_payg"] is True
    assert tier["min_gb"] == 1.0
    assert tier["max_gb"] == 15.0
    assert tier["price_per_gb"] == 7.5


def test_parse_tier_line_days_total():
    tier = parse_tier_line("1 Day: $2.95")
    assert tier is not None
    assert tier["pricing_model"] == "per_proxy"
    assert tier["period_days"] == 1
    assert tier["total"] == 2.95


def test_parse_tier_line_decimal_total_plan_gb():
    tier = parse_tier_line("$49.95/10 GB: $5/GB")
    assert tier is not None
    assert tier["pricing_model"] == "per_gb"
    assert tier["gb"] == 10.0
    assert tier["price_per_gb"] == 5.0
    assert tier["total"] == 49.95


def test_parse_tier_line_month_total_per_gb():
    tier = parse_tier_line("$50/Mo: $25/GB")
    assert tier is not None
    assert tier["pricing_model"] == "per_gb"
    assert tier["price_per_gb"] == 25.0
    assert tier["total"] == 50.0


def test_parse_tier_line_gb_bucket_per_ip():
    tier = parse_tier_line("50 GB+: $3.99/IP")
    assert tier is not None
    assert tier["pricing_model"] == "per_ip"
    assert tier["price_per_ip"] == 3.99
    assert tier["min_gb"] == 50.0
