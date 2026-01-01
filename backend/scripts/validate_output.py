#!/usr/bin/env python3
"""
Validate raw JSON output against frontend Zod-compatible schemas.

This validation runs at the end of the pipeline to ensure data integrity
before it reaches the frontend. Fails the pipeline if validation fails.
"""
import json
import logging
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, List, Literal, Optional
from urllib.parse import urlparse

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# Validation Errors
class ValidationError(Exception):
    """Base validation error"""
    pass


class SchemaValidationError(ValidationError):
    """Schema validation error with detailed path information"""
    def __init__(self, message: str, path: str = "", value: Any = None):
        self.path = path
        self.value = value
        super().__init__(f"{path}: {message}" if path else message)


# Type Validators (matching Zod schemas)
def validate_nonempty_string(value: Any, field_name: str = "field") -> str:
    """Validate a non-empty string"""
    if not isinstance(value, str):
        raise SchemaValidationError(
            f"Expected string, got {type(value).__name__}",
            field_name,
            value
        )
    if not value.strip():
        raise SchemaValidationError(
            "String cannot be empty",
            field_name,
            value
        )
    return value


def validate_slug(value: Any, field_name: str = "slug") -> str:
    """Validate slug format (lowercase alphanumeric with hyphens)"""
    value = validate_nonempty_string(value, field_name)
    if not re.match(r'^[a-z0-9-]+$', value):
        raise SchemaValidationError(
            "Slug must be lowercase alphanumeric with hyphens",
            field_name,
            value
        )
    return value


def validate_url(value: Any, field_name: str = "url") -> str:
    """Validate URL format"""
    if not isinstance(value, str):
        raise SchemaValidationError(
            f"Expected string URL, got {type(value).__name__}",
            field_name,
            value
        )
    if not value:
        return value  # Allow empty strings (nullable in frontend)
    try:
        result = urlparse(value)
        if not all([result.scheme, result.netloc]):
            raise SchemaValidationError(
                "Invalid URL format",
                field_name,
                value
            )
        if result.scheme not in ('http', 'https'):
            raise SchemaValidationError(
                f"URL must use http or https scheme, got '{result.scheme}'",
                field_name,
                value
            )
    except SchemaValidationError:
        raise
    except Exception:
        raise SchemaValidationError(
            "Invalid URL format",
            field_name,
            value
        )
    return value


def validate_nonnegative_number(value: Any, field_name: str = "number") -> Optional[float]:
    """Validate a non-negative number (int or float), nullable"""
    if value is None:
        return None
    if not isinstance(value, (int, float)):
        raise SchemaValidationError(
            f"Expected number, got {type(value).__name__}",
            field_name,
            value
        )
    if value < 0:
        raise SchemaValidationError(
            "Number must be non-negative",
            field_name,
            value
        )
    return float(value)


def validate_boolean(value: Any, field_name: str = "boolean") -> bool:
    """Validate a boolean value"""
    if not isinstance(value, bool):
        raise SchemaValidationError(
            f"Expected boolean, got {type(value).__name__}",
            field_name,
            value
        )
    return value


def validate_nonnegative_int(value: Any, field_name: str = "integer") -> int:
    """Validate a non-negative integer"""
    if not isinstance(value, int):
        raise SchemaValidationError(
            f"Expected integer, got {type(value).__name__}",
            field_name,
            value
        )
    if value < 0:
        raise SchemaValidationError(
            "Integer must be non-negative",
            field_name,
            value
        )
    return value


def validate_proxy_type(value: Any, field_name: str = "proxy_type", strict: bool = False) -> str:
    """Validate proxy type enum.

    Args:
        value: The proxy type value to validate
        field_name: Name of the field for error messages
        strict: If True, only allow the 4 main types. If False, also allow "other"
    """
    valid_types = {"residential", "datacenter", "mobile", "isp"}
    if not strict:
        valid_types.add("other")  # Allow "other" for uncategorized proxy types
    if not isinstance(value, str):
        raise SchemaValidationError(
            f"Expected string, got {type(value).__name__}",
            field_name,
            value
        )
    if value not in valid_types:
        raise SchemaValidationError(
            f"Must be one of: {', '.join(sorted(valid_types))}",
            field_name,
            value
        )
    return value


def validate_pricing_model(value: Any, field_name: str = "pricing_model") -> str:
    """Validate pricing model enum"""
    valid_models = {"per_gb", "per_ip", "per_proxy", "per_thread", "unknown"}
    if not isinstance(value, str):
        raise SchemaValidationError(
            f"Expected string, got {type(value).__name__}",
            field_name,
            value
        )
    if value not in valid_models:
        raise SchemaValidationError(
            f"Must be one of: {', '.join(sorted(valid_models))}",
            field_name,
            value
        )
    return value


def validate_date_string(value: Any, field_name: str = "date") -> str:
    """Validate YYYY-MM-DD date format"""
    if not isinstance(value, str):
        raise SchemaValidationError(
            f"Expected string date, got {type(value).__name__}",
            field_name,
            value
        )
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', value):
        raise SchemaValidationError(
            "Invalid date format, expected YYYY-MM-DD",
            field_name,
            value
        )
    try:
        date.fromisoformat(value)
    except ValueError:
        raise SchemaValidationError(
            "Invalid date value",
            field_name,
            value
        )
    return value


def validate_nullable_url(value: Any, field_name: str = "url") -> Optional[str]:
    """Validate nullable URL"""
    if value is None or value == "":
        return None
    return validate_url(value, field_name)


def validate_nullable_string(value: Any, field_name: str = "string") -> Optional[str]:
    """Validate nullable string"""
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise SchemaValidationError(
            f"Expected string, got {type(value).__name__}",
            field_name,
            value
        )
    return value if value.strip() else None


# Tier Schema Validation
def validate_tier(tier: Any, index: int) -> dict:
    """Validate a pricing tier object"""
    if not isinstance(tier, dict):
        raise SchemaValidationError(
            f"Expected object, got {type(tier).__name__}",
            f"tiers[{index}]",
            tier
        )
    
    path_prefix = f"tiers[{index}]"
    validated = {}
    
    # Optional numeric fields
    if 'gb' in tier and tier['gb'] is not None:
        validated['gb'] = validate_nonnegative_number(tier['gb'], f"{path_prefix}.gb")
    
    if 'price_per_gb' in tier and tier['price_per_gb'] is not None:
        validated['price_per_gb'] = validate_nonnegative_number(tier['price_per_gb'], f"{path_prefix}.price_per_gb")
    
    if 'total' in tier and tier['total'] is not None:
        validated['total'] = validate_nonnegative_number(tier['total'], f"{path_prefix}.total")
    
    # Required pricing_model
    if 'pricing_model' in tier:
        validated['pricing_model'] = validate_pricing_model(tier['pricing_model'], f"{path_prefix}.pricing_model")
    else:
        validated['pricing_model'] = 'unknown'
    
    # Optional boolean
    if 'is_payg' in tier and tier['is_payg'] is not None:
        validated['is_payg'] = validate_boolean(tier['is_payg'], f"{path_prefix}.is_payg")
    
    # Optional per_ip fields
    if 'price_per_ip' in tier and tier['price_per_ip'] is not None:
        validated['price_per_ip'] = validate_nonnegative_number(tier['price_per_ip'], f"{path_prefix}.price_per_ip")
    
    if 'ips' in tier and tier['ips'] is not None:
        if not isinstance(tier['ips'], int) or tier['ips'] <= 0:
            raise SchemaValidationError(
                "ips must be a positive integer",
                f"{path_prefix}.ips",
                tier['ips']
            )
        validated['ips'] = tier['ips']
    
    # Include all other fields (passthrough behavior like Zod)
    for key, value in tier.items():
        if key not in validated:
            validated[key] = value
    
    return validated


# Provider Schema Validation
def validate_provider(provider: Any, index: int) -> dict:
    """Validate a provider object"""
    if not isinstance(provider, dict):
        raise SchemaValidationError(
            f"Expected object, got {type(provider).__name__}",
            f"providers[{index}]",
            provider
        )
    
    path_prefix = f"providers[{index}]"
    validated = {}
    
    # Required fields
    validated['id'] = validate_nonempty_string(provider.get('id'), f"{path_prefix}.id")
    validated['name'] = validate_nonempty_string(provider.get('name'), f"{path_prefix}.name")
    validated['slug'] = validate_slug(provider.get('slug'), f"{path_prefix}.slug")
    validated['website_url'] = validate_url(provider.get('website_url', ''), f"{path_prefix}.website_url")
    validated['has_pricing_data'] = validate_boolean(provider.get('has_pricing_data', False), f"{path_prefix}.has_pricing_data")
    validated['pricing_count'] = validate_nonnegative_int(provider.get('pricing_count', 0), f"{path_prefix}.pricing_count")
    
    # Nullable fields
    validated['cheapest_price_per_gb'] = validate_nonnegative_number(provider.get('cheapest_price_per_gb'), f"{path_prefix}.cheapest_price_per_gb")
    validated['trial_offer'] = validate_nullable_string(provider.get('trial_offer'), f"{path_prefix}.trial_offer")
    
    # Additional fields
    for key, value in provider.items():
        if key not in validated:
            validated[key] = value
    
    return validated


# Pricing Record Schema Validation
def validate_pricing_record(record: Any, index: int) -> dict:
    """Validate a pricing record object"""
    if not isinstance(record, dict):
        raise SchemaValidationError(
            f"Expected object, got {type(record).__name__}",
            f"pricing[{index}]",
            record
        )
    
    path_prefix = f"pricing[{index}]"
    validated = {}
    
    # Required fields
    validated['provider_id'] = validate_nonempty_string(record.get('provider_id'), f"{path_prefix}.provider_id")
    validated['provider_name'] = validate_nonempty_string(record.get('provider_name'), f"{path_prefix}.provider_name")
    validated['proxy_type'] = validate_proxy_type(record.get('proxy_type'), f"{path_prefix}.proxy_type")
    # pricing_model may be None or empty in raw data (added by normalize.py)
    pricing_model = record.get('pricing_model')
    if pricing_model:
        validated['pricing_model'] = validate_nonempty_string(pricing_model, f"{path_prefix}.pricing_model")
    else:
        validated['pricing_model'] = 'unknown'
    validated['comparable'] = validate_boolean(record.get('comparable', False), f"{path_prefix}.comparable")
    validated['has_pricing'] = validate_boolean(record.get('has_pricing', False), f"{path_prefix}.has_pricing")
    validated['tier_count'] = validate_nonnegative_int(record.get('tier_count', 0), f"{path_prefix}.tier_count")
    
    # Nullable numeric fields
    validated['min_price_per_gb'] = validate_nonnegative_number(record.get('min_price_per_gb'), f"{path_prefix}.min_price_per_gb")
    validated['max_price_per_gb'] = validate_nonnegative_number(record.get('max_price_per_gb'), f"{path_prefix}.max_price_per_gb")
    
    # Optional tiers array
    if 'tiers' in record and record['tiers'] is not None:
        if not isinstance(record['tiers'], list):
            raise SchemaValidationError(
                f"Expected array, got {type(record['tiers']).__name__}",
                f"{path_prefix}.tiers",
                record['tiers']
            )
        validated['tiers'] = [
            validate_tier(tier, i) for i, tier in enumerate(record['tiers'])
        ]
    else:
        validated['tiers'] = []
    
    # Nullable URL
    validated['price_url'] = validate_nullable_url(record.get('price_url'), f"{path_prefix}.price_url")
    
    # Additional fields
    for key, value in record.items():
        if key not in validated:
            validated[key] = value
    
    return validated


# Data File Schema Validation
def validate_providers_data(data: Any) -> dict:
    """Validate the providers data file structure"""
    validated = {}

    # Handle array format (raw providers list)
    if isinstance(data, list):
        validated['providers'] = [
            validate_provider(p, i) for i, p in enumerate(data)
        ]
        return validated

    # Handle object format
    if not isinstance(data, dict):
        raise SchemaValidationError(
            f"Expected object or list, got {type(data).__name__}",
            "providers_data",
            data
        )

    # Check for providers array (raw format) or wrapped format
    if 'providers' in data:
        # Frontend wrapped format
        validated['providers'] = [
            validate_provider(p, i) for i, p in enumerate(data['providers'])
        ]
        validated['last_updated'] = validate_date_string(data.get('last_updated', date.today().isoformat()), "last_updated")
        validated['total_count'] = validate_nonnegative_int(data.get('total_count', len(validated['providers'])), "total_count")
    else:
        raise SchemaValidationError(
            "Data must be an array or object with 'providers' key",
            "providers_data",
            data
        )

    return validated


def validate_pricing_data(data: Any) -> dict:
    """Validate the pricing data file structure"""
    validated = {}

    # Handle array format (raw pricing list)
    if isinstance(data, list):
        validated['pricing'] = [
            validate_pricing_record(p, i) for i, p in enumerate(data)
        ]
        return validated

    # Handle object format
    if not isinstance(data, dict):
        raise SchemaValidationError(
            f"Expected object or list, got {type(data).__name__}",
            "pricing_data",
            data
        )

    # Check for pricing array (raw format) or wrapped format
    if 'pricing' in data:
        # Frontend wrapped format
        validated['pricing'] = [
            validate_pricing_record(p, i) for i, p in enumerate(data['pricing'])
        ]
        validated['last_updated'] = validate_date_string(data.get('last_updated', date.today().isoformat()), "last_updated")
        validated['total_count'] = validate_nonnegative_int(data.get('total_count', len(validated['pricing'])), "total_count")
    else:
        raise SchemaValidationError(
            "Data must be an array or object with 'pricing' key",
            "pricing_data",
            data
        )

    return validated


def load_json_file(path: Path) -> Any:
    """Load JSON file with proper error handling"""
    if not path.exists():
        logger.error(f"File not found: {path}")
        raise FileNotFoundError(f"Required data file not found: {path}")
    
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {path}: {e}")
        raise


def validate_providers_file(providers_path: Path) -> int:
    """Validate providers_raw.json and return count"""
    logger.info(f"Validating: {providers_path}")
    
    try:
        data = load_json_file(providers_path)
        validated = validate_providers_data(data)
        count = len(validated.get('providers', []))
        logger.info(f"  Validated {count} providers")
        return count
    except SchemaValidationError as e:
        logger.error(f"  Validation failed: {e}")
        raise
    except Exception as e:
        logger.error(f"  Unexpected error: {e}")
        raise


def validate_pricing_file(pricing_path: Path) -> int:
    """Validate pricing_raw.json and return count"""
    logger.info(f"Validating: {pricing_path}")
    
    try:
        data = load_json_file(pricing_path)
        validated = validate_pricing_data(data)
        count = len(validated.get('pricing', []))
        logger.info(f"  Validated {count} pricing records")
        return count
    except SchemaValidationError as e:
        logger.error(f"  Validation failed: {e}")
        raise
    except Exception as e:
        logger.error(f"  Unexpected error: {e}")
        raise


def validate_cross_reference_consistency(
    providers_data: Any,
    pricing_data: Any
) -> None:
    """Validate that provider_ids in pricing match providers"""
    logger.info("Validating cross-reference consistency...")
    
    # Extract provider IDs
    provider_ids = set()
    
    if isinstance(providers_data, dict) and 'providers' in providers_data:
        provider_ids = {p['id'] for p in providers_data['providers']}
    elif isinstance(providers_data, list):
        provider_ids = {p['id'] for p in providers_data}
    
    pricing_provider_ids = set()
    if isinstance(pricing_data, dict) and 'pricing' in pricing_data:
        pricing_provider_ids = {p['provider_id'] for p in pricing_data['pricing']}
    elif isinstance(pricing_data, list):
        pricing_provider_ids = {p['provider_id'] for p in pricing_data}
    
    # Check for orphaned pricing records
    orphaned_pricing = pricing_provider_ids - provider_ids
    if orphaned_pricing:
        logger.warning(
            f"  Found pricing records for unknown providers: {', '.join(sorted(orphaned_pricing))}"
        )
    
    # Check for providers without pricing
    providers_without_pricing = provider_ids - pricing_provider_ids
    if providers_without_pricing:
        logger.info(
            f"  Providers without pricing data: {len(providers_without_pricing)}"
        )
    
    logger.info("  Cross-reference validation complete")


def main():
    """Main execution"""
    project_root = Path(__file__).parent.parent.parent
    input_dir = project_root / 'data' / 'raw'
    
    providers_path = input_dir / 'providers_raw.json'
    pricing_path = input_dir / 'pricing_raw.json'
    
    logger.info("=" * 60)
    logger.info("Starting data validation")
    logger.info("=" * 60)
    
    errors = []
    
    # Validate providers
    try:
        providers_count = validate_providers_file(providers_path)
    except Exception as e:
        errors.append(f"Providers validation failed: {e}")
        providers_count = 0
    
    # Validate pricing
    try:
        pricing_count = validate_pricing_file(pricing_path)
    except Exception as e:
        errors.append(f"Pricing validation failed: {e}")
        pricing_count = 0
    
    # Cross-reference validation (if both files loaded successfully)
    if not errors:
        try:
            providers_data = load_json_file(providers_path)
            pricing_data = load_json_file(pricing_path)
            validate_cross_reference_consistency(providers_data, pricing_data)
        except Exception as e:
            errors.append(f"Cross-reference validation failed: {e}")
    
    # Summary
    logger.info("=" * 60)
    if errors:
        logger.error("VALIDATION FAILED")
        for error in errors:
            logger.error(f"  {error}")
        logger.error("=" * 60)
        sys.exit(1)
    else:
        logger.info("VALIDATION PASSED")
        logger.info(f"  Providers: {providers_count}")
        logger.info(f"  Pricing records: {pricing_count}")
        logger.info("=" * 60)
        sys.exit(0)


if __name__ == '__main__':
    main()
