#!/usr/bin/env python3
"""
Tests for data validation against frontend Zod schemas.

These tests ensure that the Python validation logic matches
the TypeScript Zod schemas in the frontend.
"""
import pytest
import sys
from pathlib import Path

# Add scripts directory to path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from validate_output import (
    validate_nonempty_string,
    validate_slug,
    validate_url,
    validate_nonnegative_number,
    validate_boolean,
    validate_nonnegative_int,
    validate_proxy_type,
    validate_pricing_model,
    validate_date_string,
    validate_nullable_url,
    validate_nullable_string,
    validate_tier,
    validate_provider,
    validate_pricing_record,
    validate_providers_data,
    validate_pricing_data,
    SchemaValidationError,
)


class TestStringValidators:
    """Tests for string validation functions"""
    
    def test_validate_nonempty_string_valid(self):
        """Valid strings pass validation"""
        assert validate_nonempty_string("hello") == "hello"
        assert validate_nonempty_string("hello world") == "hello world"
        assert validate_nonempty_string("test-with-dashes") == "test-with-dashes"
    
    def test_validate_nonempty_string_invalid_type(self):
        """Non-string types raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="Expected string"):
            validate_nonempty_string(123)
        
        with pytest.raises(SchemaValidationError, match="Expected string"):
            validate_nonempty_string(None)
        
        with pytest.raises(SchemaValidationError, match="Expected string"):
            validate_nonempty_string([])
    
    def test_validate_nonempty_string_empty(self):
        """Empty strings raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="cannot be empty"):
            validate_nonempty_string("")
        
        with pytest.raises(SchemaValidationError, match="cannot be empty"):
            validate_nonempty_string("   ")
    
    def test_validate_slug_valid(self):
        """Valid slugs pass validation"""
        assert validate_slug("valid-slug") == "valid-slug"
        assert validate_slug("lowercase123") == "lowercase123"
        assert validate_slug("test-with-123-numbers") == "test-with-123-numbers"
    
    def test_validate_slug_invalid_chars(self):
        """Invalid characters raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_slug("Invalid_Slug")
        
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_slug("UPPERCASE")
        
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_slug("with spaces")
        
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_slug("with.dots")
        
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_slug("with_underscores")


class TestUrlValidators:
    """Tests for URL validation functions"""
    
    def test_validate_url_valid(self):
        """Valid URLs pass validation"""
        assert validate_url("https://example.com") == "https://example.com"
        assert validate_url("http://example.com") == "http://example.com"
        assert validate_url("https://example.com/path") == "https://example.com/path"
        assert validate_url("https://example.com/path?query=value") == "https://example.com/path?query=value"
    
    def test_validate_url_invalid_scheme(self):
        """Non-http/https schemes raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="http or https"):
            validate_url("ftp://example.com")
    
    def test_validate_url_invalid_format(self):
        """Invalid URL formats raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="Invalid URL"):
            validate_url("not a url")

        with pytest.raises(SchemaValidationError, match="Invalid URL"):
            validate_url("https://")
    
    def test_validate_nullable_url(self):
        """Nullable URL validator accepts None and empty strings"""
        assert validate_nullable_url(None) is None
        assert validate_nullable_url("") is None
        assert validate_nullable_url("https://example.com") == "https://example.com"


class TestNumberValidators:
    """Tests for number validation functions"""
    
    def test_validate_nonnegative_number_valid(self):
        """Valid non-negative numbers pass validation"""
        assert validate_nonnegative_number(0) == 0.0
        assert validate_nonnegative_number(1) == 1.0
        assert validate_nonnegative_number(1.5) == 1.5
        assert validate_nonnegative_number(1000) == 1000.0
    
    def test_validate_nonnegative_number_negative(self):
        """Negative numbers raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="non-negative"):
            validate_nonnegative_number(-1)
        
        with pytest.raises(SchemaValidationError, match="non-negative"):
            validate_nonnegative_number(-0.1)
    
    def test_validate_nonnegative_number_nullable(self):
        """None is allowed (nullable)"""
        assert validate_nonnegative_number(None) is None
    
    def test_validate_nonnegative_number_invalid_type(self):
        """Non-numeric types raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="Expected number"):
            validate_nonnegative_number("1.5")
        
        with pytest.raises(SchemaValidationError, match="Expected number"):
            validate_nonnegative_number([])
    
    def test_validate_nonnegative_int_valid(self):
        """Valid non-negative integers pass validation"""
        assert validate_nonnegative_int(0) == 0
        assert validate_nonnegative_int(1) == 1
        assert validate_nonnegative_int(1000) == 1000
    
    def test_validate_nonnegative_int_float(self):
        """Float values are rejected"""
        with pytest.raises(SchemaValidationError, match="Expected integer"):
            validate_nonnegative_int(1.5)
    
    def test_validate_nonnegative_int_negative(self):
        """Negative integers raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="non-negative"):
            validate_nonnegative_int(-1)


class TestEnumValidators:
    """Tests for enum validation functions"""
    
    def test_validate_proxy_type_valid(self):
        """Valid proxy types pass validation"""
        assert validate_proxy_type("residential") == "residential"
        assert validate_proxy_type("datacenter") == "datacenter"
        assert validate_proxy_type("mobile") == "mobile"
        assert validate_proxy_type("isp") == "isp"
    
    def test_validate_proxy_type_invalid(self):
        """Invalid proxy types raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="Must be one of"):
            validate_proxy_type("invalid")
        
        with pytest.raises(SchemaValidationError, match="Must be one of"):
            validate_proxy_type("Residential")  # Case sensitive
    
    def test_validate_pricing_model_valid(self):
        """Valid pricing models pass validation"""
        assert validate_pricing_model("per_gb") == "per_gb"
        assert validate_pricing_model("per_ip") == "per_ip"
        assert validate_pricing_model("per_proxy") == "per_proxy"
        assert validate_pricing_model("per_thread") == "per_thread"
        assert validate_pricing_model("unknown") == "unknown"
    
    def test_validate_pricing_model_invalid(self):
        """Invalid pricing models raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="Must be one of"):
            validate_pricing_model("invalid_model")


class TestDateValidator:
    """Tests for date string validation"""
    
    def test_validate_date_string_valid(self):
        """Valid date strings pass validation"""
        assert validate_date_string("2024-01-01") == "2024-01-01"
        assert validate_date_string("2024-12-31") == "2024-12-31"
        assert validate_date_string("2020-02-29") == "2020-02-29"  # Leap year
    
    def test_validate_date_string_invalid_format(self):
        """Invalid formats raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="YYYY-MM-DD"):
            validate_date_string("01-01-2024")
        
        with pytest.raises(SchemaValidationError, match="YYYY-MM-DD"):
            validate_date_string("2024/01/01")
        
        with pytest.raises(SchemaValidationError, match="YYYY-MM-DD"):
            validate_date_string("2024-1-1")
    
    def test_validate_date_string_invalid_date(self):
        """Invalid date values raise SchemaValidationError"""
        with pytest.raises(SchemaValidationError, match="Invalid date"):
            validate_date_string("2024-13-01")  # Invalid month
        
        with pytest.raises(SchemaValidationError, match="Invalid date"):
            validate_date_string("2024-02-30")  # Invalid day


class TestTierValidation:
    """Tests for tier object validation"""
    
    def test_validate_tier_valid(self):
        """Valid tier passes validation"""
        tier = {
            "gb": 10,
            "price_per_gb": 1.5,
            "total": 15.0,
            "pricing_model": "per_gb"
        }
        result = validate_tier(tier, 0)
        assert result["gb"] == 10
        assert result["pricing_model"] == "per_gb"
    
    def test_validate_tier_with_optional_fields(self):
        """Tier with optional fields passes validation"""
        tier = {
            "gb": 10,
            "price_per_gb": 1.5,
            "total": 15.0,
            "pricing_model": "per_gb",
            "is_payg": True
        }
        result = validate_tier(tier, 0)
        assert result["is_payg"] is True
    
    def test_validate_tier_per_ip(self):
        """Per-IP tier passes validation"""
        tier = {
            "ips": 100,
            "price_per_ip": 0.5,
            "total": 50.0,
            "pricing_model": "per_ip"
        }
        result = validate_tier(tier, 0)
        assert result["ips"] == 100
    
    def test_validate_tier_invalid_ips(self):
        """Invalid ips value raises SchemaValidationError"""
        tier = {
            "ips": 0,
            "price_per_ip": 0.5,
            "total": 0,
            "pricing_model": "per_ip"
        }
        with pytest.raises(SchemaValidationError, match="positive integer"):
            validate_tier(tier, 0)
    
    def test_validate_tier_passthrough(self):
        """Extra fields are preserved (passthrough behavior)"""
        tier = {
            "gb": 10,
            "price_per_gb": 1.5,
            "total": 15.0,
            "pricing_model": "per_gb",
            "custom_field": "custom_value"
        }
        result = validate_tier(tier, 0)
        assert result["custom_field"] == "custom_value"


class TestProviderValidation:
    """Tests for provider object validation"""
    
    def test_validate_provider_valid(self):
        """Valid provider passes validation"""
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "test-provider",
            "website_url": "https://example.com",
            "has_pricing_data": True,
            "pricing_count": 5,
            "cheapest_price_per_gb": 1.5,
            "trial_offer": None
        }
        result = validate_provider(provider, 0)
        assert result["id"] == "test-provider"
        assert result["slug"] == "test-provider"
    
    def test_validate_provider_with_trial_offer(self):
        """Provider with trial offer passes validation"""
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "test-provider",
            "website_url": "https://example.com",
            "has_pricing_data": True,
            "pricing_count": 5,
            "cheapest_price_per_gb": 1.5,
            "trial_offer": "7-day free trial"
        }
        result = validate_provider(provider, 0)
        assert result["trial_offer"] == "7-day free trial"
    
    def test_validate_provider_invalid_slug(self):
        """Provider with invalid slug raises SchemaValidationError"""
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "Invalid_Slug",
            "website_url": "https://example.com",
            "has_pricing_data": True,
            "pricing_count": 0
        }
        with pytest.raises(SchemaValidationError, match="lowercase alphanumeric"):
            validate_provider(provider, 0)
    
    def test_validate_provider_invalid_url(self):
        """Provider with invalid URL raises SchemaValidationError"""
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "test-provider",
            "website_url": "not-a-url",
            "has_pricing_data": True,
            "pricing_count": 0
        }
        with pytest.raises(SchemaValidationError, match="Invalid URL"):
            validate_provider(provider, 0)
    
    def test_validate_provider_negative_price(self):
        """Provider with negative price raises SchemaValidationError"""
        provider = {
            "id": "test-provider",
            "name": "Test Provider",
            "slug": "test-provider",
            "website_url": "https://example.com",
            "has_pricing_data": True,
            "pricing_count": 0,
            "cheapest_price_per_gb": -1.5
        }
        with pytest.raises(SchemaValidationError, match="non-negative"):
            validate_provider(provider, 0)


class TestPricingRecordValidation:
    """Tests for pricing record validation"""
    
    def test_validate_pricing_record_valid(self):
        """Valid pricing record passes validation"""
        record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "residential",
            "pricing_model": "per_gb",
            "min_price_per_gb": 1.5,
            "max_price_per_gb": 3.0,
            "comparable": True,
            "has_pricing": True,
            "tier_count": 2,
            "tiers": [
                {"gb": 1, "price_per_gb": 3.0, "total": 3.0, "pricing_model": "per_gb"},
                {"gb": 10, "price_per_gb": 1.5, "total": 15.0, "pricing_model": "per_gb"}
            ],
            "price_url": "https://example.com/pricing"
        }
        result = validate_pricing_record(record, 0)
        assert result["provider_id"] == "test-provider"
        assert result["proxy_type"] == "residential"
        assert result["comparable"] is True
    
    def test_validate_pricing_record_nullable_url(self):
        """Pricing record with null URL passes validation"""
        record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "residential",
            "pricing_model": "unknown",
            "min_price_per_gb": None,
            "max_price_per_gb": None,
            "comparable": False,
            "has_pricing": False,
            "tier_count": 0,
            "tiers": [],
            "price_url": None
        }
        result = validate_pricing_record(record, 0)
        assert result["price_url"] is None
    
    def test_validate_pricing_record_invalid_proxy_type(self):
        """Invalid proxy_type raises SchemaValidationError"""
        record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "invalid",
            "pricing_model": "unknown",
            "comparable": False,
            "has_pricing": False,
            "tier_count": 0,
            "tiers": []
        }
        with pytest.raises(SchemaValidationError, match="Must be one of"):
            validate_pricing_record(record, 0)
    
    def test_validate_pricing_record_negative_tier_count(self):
        """Negative tier_count raises SchemaValidationError"""
        record = {
            "provider_id": "test-provider",
            "provider_name": "Test Provider",
            "proxy_type": "residential",
            "pricing_model": "unknown",
            "comparable": False,
            "has_pricing": False,
            "tier_count": -1,
            "tiers": []
        }
        with pytest.raises(SchemaValidationError, match="non-negative"):
            validate_pricing_record(record, 0)


class TestDataStructureValidation:
    """Tests for full data structure validation"""
    
    def test_validate_providers_data_array_format(self):
        """Validate providers data in array format (raw)"""
        data = [
            {
                "id": "test-1",
                "name": "Test 1",
                "slug": "test-1",
                "website_url": "https://example.com",
                "has_pricing_data": True,
                "pricing_count": 1,
                "cheapest_price_per_gb": 2.0,
                "trial_offer": None
            },
            {
                "id": "test-2",
                "name": "Test 2",
                "slug": "test-2",
                "website_url": "https://example2.com",
                "has_pricing_data": False,
                "pricing_count": 0,
                "cheapest_price_per_gb": None,
                "trial_offer": None
            }
        ]
        result = validate_providers_data(data)
        assert len(result["providers"]) == 2
    
    def test_validate_providers_data_wrapped_format(self):
        """Validate providers data in wrapped format (frontend)"""
        data = {
            "providers": [
                {
                    "id": "test-1",
                    "name": "Test 1",
                    "slug": "test-1",
                    "website_url": "https://example.com",
                    "has_pricing_data": True,
                    "pricing_count": 1,
                    "cheapest_price_per_gb": 2.0,
                    "trial_offer": None
                }
            ],
            "last_updated": "2024-01-01",
            "total_count": 1
        }
        result = validate_providers_data(data)
        assert len(result["providers"]) == 1
        assert result["last_updated"] == "2024-01-01"
        assert result["total_count"] == 1
    
    def test_validate_pricing_data_array_format(self):
        """Validate pricing data in array format (raw)"""
        data = [
            {
                "provider_id": "test-1",
                "provider_name": "Test 1",
                "proxy_type": "residential",
                "pricing_model": "per_gb",
                "min_price_per_gb": 1.5,
                "max_price_per_gb": 3.0,
                "comparable": True,
                "has_pricing": True,
                "tier_count": 2,
                "tiers": [
                    {"gb": 1, "price_per_gb": 3.0, "total": 3.0, "pricing_model": "per_gb"}
                ]
            }
        ]
        result = validate_pricing_data(data)
        assert len(result["pricing"]) == 1
    
    def test_validate_pricing_data_wrapped_format(self):
        """Validate pricing data in wrapped format (frontend)"""
        data = {
            "pricing": [
                {
                    "provider_id": "test-1",
                    "provider_name": "Test 1",
                    "proxy_type": "residential",
                    "pricing_model": "per_gb",
                    "min_price_per_gb": 1.5,
                    "max_price_per_gb": 3.0,
                    "comparable": True,
                    "has_pricing": True,
                    "tier_count": 2,
                    "tiers": []
                }
            ],
            "last_updated": "2024-01-01",
            "total_count": 1
        }
        result = validate_pricing_data(data)
        assert len(result["pricing"]) == 1
        assert result["last_updated"] == "2024-01-01"
    
    def test_validate_invalid_data_structure(self):
        """Invalid data structure raises SchemaValidationError"""
        data = "invalid"
        with pytest.raises(SchemaValidationError):
            validate_providers_data(data)


class TestCrossValidation:
    """Tests for cross-validation between data files"""
    
    def test_provider_id_consistency(self):
        """Provider IDs should be consistent between files"""
        providers_data = {
            "providers": [
                {
                    "id": "provider-1",
                    "name": "Provider 1",
                    "slug": "provider-1",
                    "website_url": "https://example.com",
                    "has_pricing_data": True,
                    "pricing_count": 1,
                    "cheapest_price_per_gb": 2.0,
                    "trial_offer": None
                }
            ]
        }
        
        pricing_data = {
            "pricing": [
                {
                    "provider_id": "provider-1",
                    "provider_name": "Provider 1",
                    "proxy_type": "residential",
                    "pricing_model": "per_gb",
                    "min_price_per_gb": 2.0,
                    "max_price_per_gb": 2.0,
                    "comparable": True,
                    "has_pricing": True,
                    "tier_count": 1,
                    "tiers": []
                }
            ]
        }
        
        # Both should validate successfully
        providers_valid = validate_providers_data(providers_data)
        pricing_valid = validate_pricing_data(pricing_data)
        
        assert providers_valid["providers"][0]["id"] == "provider-1"
        assert pricing_valid["pricing"][0]["provider_id"] == "provider-1"


if __name__ == '__main__':
    pytest.main([__file__, '-v'])
