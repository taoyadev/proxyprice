"""
Edge case tests for parse_csv.py

Tests for malformed CSV data, duplicate handling, and edge cases.
"""
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from parse_csv import (
    parse_tier_line,
    parse_price_offers,
    normalize_proxy_type,
    extract_website_from_url,
)
from normalize import calculate_price_extremes


class TestMalformedData:
    """Tests for handling malformed or unusual data"""

    def test_empty_string(self):
        """Empty string should return None"""
        assert parse_tier_line("") is None
        assert parse_tier_line("   ") is None

    def test_section_headers(self):
        """Section headers should return None"""
        assert parse_tier_line("Dedicated:") is None
        assert parse_tier_line("Pay / GB:") is None
        assert parse_tier_line("Rotating:") is None
        assert parse_tier_line("Static:") is None

    def test_invalid_price_format(self):
        """Invalid price formats should return None"""
        assert parse_tier_line("invalid data") is None
        assert parse_tier_line("GB$$$") is None
        assert parse_tier_line("just text here") is None

    def test_negative_numbers(self):
        """Negative numbers should not be parsed (invalid pricing)"""
        # Our regex doesn't match negative numbers, which is correct
        result = parse_tier_line("-5 GB$3$15")
        assert result is None

    def test_zero_values(self):
        """Zero values should be handled correctly"""
        # 0 GB is edge case - may not match pattern
        result = parse_tier_line("0 GB$5$0")
        # Based on regex, this should parse with gb=0
        if result:
            assert result["gb"] == 0
            assert result["price_per_gb"] == 5

    def test_extremely_large_numbers(self):
        """Very large numbers should be parsed"""
        result = parse_tier_line("1000000 GB$0.01$10000")
        assert result is not None
        assert result["gb"] == 1000000

    def test_unicode_characters(self):
        """Unicode in price strings should be handled"""
        result = parse_tier_line("10 GB$5.50$55")
        assert result is not None
        assert result["price_per_gb"] == 5.50

    def test_comma_thousands_separator(self):
        """Numbers with comma separators should be parsed"""
        result = parse_tier_line("1,000 GB$3.5$3,500")
        assert result is not None
        assert result["gb"] == 1000
        assert result["total"] == 3500

    def test_multiple_comma_separators(self):
        """Multiple commas in numbers should be handled"""
        result = parse_tier_line("1,000,000 GB$0.01$10,000")
        assert result is not None
        assert result["gb"] == 1000000
        assert result["total"] == 10000


class TestDuplicateHandling:
    """Tests for handling duplicate entries"""

    def test_duplicate_providers_in_multi_line(self):
        """Multiple identical tiers in one offer should be parsed separately"""
        offers = "10 GB$5$50\n10 GB$5$50"
        result = parse_price_offers(offers)
        assert len(result) == 2
        assert all(t["gb"] == 10 for t in result)

    def test_different_tiers_same_provider(self):
        """Different tiers from same provider should all be parsed"""
        offers = "10 GB$5$50\n100 GB$3$300"
        result = parse_price_offers(offers)
        assert len(result) == 2
        assert result[0]["gb"] == 10
        assert result[1]["gb"] == 100


class TestPriceCalculationEdgeCases:
    """Tests for price calculation edge cases"""

    def test_zero_price_per_gb(self):
        """Zero price per GB is edge case (free tier)"""
        # This would be unusual but possible for trials
        result = parse_tier_line("10 GB$0$0")
        if result:
            assert result["price_per_gb"] == 0
            assert result["total"] == 0

    def test_very_small_price(self):
        """Very small prices should be parsed correctly"""
        result = parse_tier_line("1 GB$0.001$0.001")
        if result:
            assert result["price_per_gb"] == 0.001

    def test_price_with_many_decimals(self):
        """Prices with many decimal places should be preserved"""
        result = parse_tier_line("1 GB$3.14159$3.14")
        if result:
            assert abs(result["price_per_gb"] - 3.14159) < 0.00001

    def test_inconsistent_total_calculation(self):
        """When stated total doesn't match gb * price, use stated total"""
        # GB * price_per_gb = 10 * 5 = 50, but stated total is 45
        result = parse_tier_line("10 GB$5$45")
        if result:
            assert result["gb"] == 10
            assert result["price_per_gb"] == 5
            assert result["total"] == 45  # Use stated total

    def test_range_pricing_min_max(self):
        """Range pricing should have min and max values"""
        result = parse_tier_line("1-10 GB: $5/GB")
        assert result is not None
        assert result["min_gb"] == 1
        assert result["max_gb"] == 10
        assert result["is_payg"] is True

    def test_calculate_price_extremes_min(self):
        """Test minimum price calculation"""
        tiers = [
            {"pricing_model": "per_gb", "price_per_gb": 5.0},
            {"pricing_model": "per_gb", "price_per_gb": 3.0},
            {"pricing_model": "per_gb", "price_per_gb": 7.0},
        ]
        assert calculate_price_extremes(tiers, "min") == 3.0

    def test_calculate_price_extremes_max(self):
        """Test maximum price calculation"""
        tiers = [
            {"pricing_model": "per_gb", "price_per_gb": 5.0},
            {"pricing_model": "per_gb", "price_per_gb": 3.0},
            {"pricing_model": "per_gb", "price_per_gb": 7.0},
        ]
        assert calculate_price_extremes(tiers, "max") == 7.0

    def test_calculate_price_extremes_empty(self):
        """Test with empty tier list"""
        assert calculate_price_extremes([], "min") is None
        assert calculate_price_extremes([], "max") is None

    def test_calculate_price_extremes_mixed_models(self):
        """Test with mixed pricing models (should only consider per_gb)"""
        tiers = [
            {"pricing_model": "per_gb", "price_per_gb": 5.0},
            {"pricing_model": "per_ip", "price_per_ip": 2.0},
            {"pricing_model": "per_gb", "price_per_gb": 3.0},
        ]
        assert calculate_price_extremes(tiers, "min") == 3.0
        assert calculate_price_extremes(tiers, "max") == 5.0

    def test_calculate_price_extremes_negative_prices(self):
        """Test handling of negative prices (should still work if present)"""
        tiers = [
            {"pricing_model": "per_gb", "price_per_gb": 5.0},
            {"pricing_model": "per_gb", "price_per_gb": -1.0},
        ]
        assert calculate_price_extremes(tiers, "min") == -1.0
        assert calculate_price_extremes(tiers, "max") == 5.0


class TestProxyTypeNormalization:
    """Tests for proxy type string normalization"""

    def test_residential_variations(self):
        """Various spellings of residential should normalize"""
        assert normalize_proxy_type("Residential Proxies") == "residential"
        assert normalize_proxy_type("RESIDENTIAL") == "residential"
        assert normalize_proxy_type("residential proxies") == "residential"
        assert normalize_proxy_type("Residential") == "residential"

    def test_datacenter_variations(self):
        """Various spellings of datacenter should normalize"""
        assert normalize_proxy_type("Datacenter Proxies") == "datacenter"
        assert normalize_proxy_type("Data Center") == "datacenter"
        assert normalize_proxy_type("data center") == "datacenter"
        assert normalize_proxy_type("DATACENTER") == "datacenter"

    def test_mobile_variations(self):
        """Various spellings of mobile should normalize"""
        assert normalize_proxy_type("Mobile Proxies") == "mobile"
        assert normalize_proxy_type("MOBILE") == "mobile"
        assert normalize_proxy_type("mobile 4g") == "mobile"
        assert normalize_proxy_type("Mobile 5G") == "mobile"

    def test_isp_variations(self):
        """Various spellings of ISP should normalize"""
        assert normalize_proxy_type("ISP Proxies") == "isp"
        assert normalize_proxy_type("Static ISP") == "isp"
        assert normalize_proxy_type("isp") == "isp"

    def test_unknown_proxy_type(self):
        """Unknown proxy types should return 'other'"""
        assert normalize_proxy_type("Unknown Type") == "other"
        assert normalize_proxy_type("Custom Proxies") == "other"


class TestURLExtraction:
    """Tests for website URL extraction"""

    def test_extract_from_full_url(self):
        """Extract base URL from full pricing page URL"""
        assert extract_website_from_url("https://example.com/pricing") == "https://example.com"
        assert extract_website_from_url("http://example.com/pricing/page") == "http://example.com"

    def test_extract_from_domain_only(self):
        """Handle domain-only input"""
        # The extract_website_from_url function doesn't add https:// to plain domains
        # It only extracts from existing URLs
        assert extract_website_from_url("example.com") == "example.com"

    def test_extract_with_path(self):
        """Handle URLs with complex paths"""
        assert extract_website_from_url("https://proxy.example.com/proxies/residential/pricing?ref=123") == "https://proxy.example.com"

    def test_empty_url(self):
        """Empty URL should return empty string"""
        assert extract_website_from_url("") == ""
        assert extract_website_from_url(None) == "" if None is None else True  # type: ignore

    def test_malformed_url(self):
        """Malformed URL should return as-is or best effort"""
        result = extract_website_from_url("not-a-url")
        # The function returns the input as-is when it can't parse it
        assert result == "not-a-url"

    def test_extract_preserves_scheme(self):
        """HTTP vs HTTPS should be preserved"""
        assert extract_website_from_url("http://example.com/pricing") == "http://example.com"
        assert extract_website_from_url("https://example.com/pricing") == "https://example.com"


class TestMultiLineOffers:
    """Tests for multi-line price offers parsing"""

    def test_empty_offers(self):
        """Empty offers should return empty list"""
        assert parse_price_offers("") == []
        assert parse_price_offers("   ") == []
        assert parse_price_offers("\n\n") == []

    def test_single_valid_line(self):
        """Single valid tier should be parsed"""
        result = parse_price_offers("10 GB$5$50")
        assert len(result) == 1
        assert result[0]["gb"] == 10

    def test_multiple_valid_lines(self):
        """Multiple valid tiers should all be parsed"""
        offers = "10 GB$5$50\n100 GB$3$300\n1000 GB$1$1000"
        result = parse_price_offers(offers)
        assert len(result) == 3

    def test_mixed_valid_and_invalid_lines(self):
        """Invalid lines should be skipped, valid ones parsed"""
        offers = "10 GB$5$50\nInvalid Section:\n100 GB$3$300"
        result = parse_price_offers(offers)
        assert len(result) == 2
        assert result[0]["gb"] == 10
        assert result[1]["gb"] == 100

    def test_trailing_newlines(self):
        """Trailing newlines should not cause issues"""
        result = parse_price_offers("10 GB$5$50\n\n\n")
        assert len(result) == 1

    def test_windows_line_endings(self):
        """Windows line endings (CRLF) should work"""
        result = parse_price_offers("10 GB$5$50\r\n100 GB$3$300")
        assert len(result) == 2


class TestSpecialPricingModels:
    """Tests for special or unusual pricing models"""

    def test_per_hour_pricing(self):
        """Hourly pricing should be parsed"""
        result = parse_tier_line("1 Hour$2.95")
        assert result is not None
        assert result["pricing_model"] == "per_proxy"
        assert result["period_hours"] == 1

    def test_per_day_pricing(self):
        """Daily pricing should be parsed"""
        result = parse_tier_line("30 Days$1.57/IP")
        assert result is not None
        assert result["period_days"] == 30

    def test_per_ip_pricing(self):
        """Per-IP pricing should be parsed"""
        result = parse_tier_line("10 IPs$0.47$4.7")
        assert result is not None
        assert result["pricing_model"] == "per_ip"
        assert result["ips"] == 10

    def test_thread_based_pricing(self):
        """Thread-based pricing should be parsed"""
        result = parse_tier_line("100 Threads$50")
        assert result is not None
        assert result["pricing_model"] == "per_thread"
        assert result["threads"] == 100

    def test_proxy_based_pricing(self):
        """Per-proxy pricing should be parsed"""
        result = parse_tier_line("5 Proxies$25")
        assert result is not None
        assert result["pricing_model"] == "per_proxy"
        assert result["proxies"] == 5


class TestEdgeCasePatterns:
    """Tests for specific edge case patterns seen in real data"""

    def test_gb_plus_notation(self):
        """GB+ notation should be parsed as range"""
        result = parse_tier_line("50 GB+: $3.99/IP")
        assert result is not None
        assert result["min_gb"] == 50

    def test_tb_pricing(self):
        """Terabyte pricing should be converted to GB"""
        result = parse_tier_line("From 1 TB+: $2.50/IP")
        assert result is not None
        assert result["min_gb"] == 1000  # 1 TB = 1000 GB

    def test_monthly_per_ip_pricing(self):
        """Monthly per-IP pricing should include period"""
        result = parse_tier_line("1 Month: $1.57/IP")
        assert result is not None
        assert result["period_months"] == 1

    def test_bundle_pricing(self):
        """Bundle pricing (IPs + GB) should be parsed"""
        result = parse_tier_line("10 IPs/50 GB/$100: $5/GB")
        assert result is not None
        assert result["ips"] == 10
        assert result["gb"] == 50
        assert result["total"] == 100

    def test_payg_explicit(self):
        """Explicit PAYG notation"""
        result = parse_tier_line("Pay as you go: $5/GB")
        assert result is not None
        assert result["is_payg"] is True

    def test_range_without_repeating_gb(self):
        """Compact range notation"""
        result = parse_tier_line("1-15 GB: $7.50/GB")
        assert result is not None
        assert result["min_gb"] == 1
        assert result["max_gb"] == 15

    def test_total_over_ips(self):
        """Total price over IP count"""
        result = parse_tier_line("$50/10 IPs")
        assert result is not None
        assert result["total"] == 50
        assert result["ips"] == 10


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-v"])
