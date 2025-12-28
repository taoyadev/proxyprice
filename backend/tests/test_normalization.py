#!/usr/bin/env python3
"""
Test suite for data normalization and parsing.
"""
import pytest
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / 'scripts'))

from parse_csv import parse_tier_line, extract_price_per_gb, normalize_proxy_type
from normalize import calculate_min_price_per_gb, calculate_max_price_per_gb


class TestParsing:
    """Test CSV parsing functions"""

    def test_extract_price_per_gb(self):
        assert extract_price_per_gb('$5/GB') == 5.0
        assert extract_price_per_gb('$5.50/GB') == 5.5
        assert extract_price_per_gb('$10/IP') is None
        assert extract_price_per_gb('invalid') is None

    def test_normalize_proxy_type(self):
        assert normalize_proxy_type('Residential Proxy') == 'residential'
        assert normalize_proxy_type('Datacenter Proxy') == 'datacenter'
        assert normalize_proxy_type('Mobile Proxy') == 'mobile'
        assert normalize_proxy_type('ISP Proxy') == 'isp'

    def test_parse_tier_line_per_gb(self):
        result = parse_tier_line('1 GB$7/GB$7')
        assert result is not None
        assert result['gb'] == 1.0
        assert result['price_per_gb'] == 7.0
        assert result['total'] == 7.0
        assert result['pricing_model'] == 'per_gb'

    def test_parse_tier_line_with_commas(self):
        result = parse_tier_line('1,000 GB$3/GB$3,000')
        assert result is not None
        assert result['gb'] == 1000.0
        assert result['price_per_gb'] == 3.0
        assert result['total'] == 3000.0

    def test_parse_tier_line_per_ip(self):
        result = parse_tier_line('100 IPs$0.035/IP$3.5')
        assert result is not None
        assert result['ips'] == 100
        assert result['price_per_ip'] == 0.035
        assert result['total'] == 3.5
        assert result['pricing_model'] == 'per_ip'

    def test_parse_tier_line_payg(self):
        result = parse_tier_line('Pay as you go: $8/GB')
        assert result is not None
        assert result['price_per_gb'] == 8.0
        assert result['is_payg'] is True

    def test_parse_tier_line_monthly(self):
        result = parse_tier_line('$600/50GB: $12/GB')
        assert result is not None
        assert result['gb'] == 50.0
        assert result['price_per_gb'] == 12.0


class TestNormalization:
    """Test normalization functions"""

    def test_calculate_min_price_per_gb(self):
        tiers = [
            {'pricing_model': 'per_gb', 'price_per_gb': 5.0},
            {'pricing_model': 'per_gb', 'price_per_gb': 3.0},
            {'pricing_model': 'per_gb', 'price_per_gb': 7.0}
        ]
        assert calculate_min_price_per_gb(tiers) == 3.0

    def test_calculate_max_price_per_gb(self):
        tiers = [
            {'pricing_model': 'per_gb', 'price_per_gb': 5.0},
            {'pricing_model': 'per_gb', 'price_per_gb': 3.0},
            {'pricing_model': 'per_gb', 'price_per_gb': 7.0}
        ]
        assert calculate_max_price_per_gb(tiers) == 7.0

    def test_empty_tiers(self):
        assert calculate_min_price_per_gb([]) is None
        assert calculate_max_price_per_gb([]) is None

    def test_mixed_pricing_models(self):
        tiers = [
            {'pricing_model': 'per_gb', 'price_per_gb': 5.0},
            {'pricing_model': 'per_ip', 'price_per_ip': 2.0},
            {'pricing_model': 'per_gb', 'price_per_gb': 3.0}
        ]
        assert calculate_min_price_per_gb(tiers) == 3.0
        assert calculate_max_price_per_gb(tiers) == 5.0


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
