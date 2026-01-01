#!/usr/bin/env python3
"""
Normalize pricing data and calculate min/max prices per GB.
"""
import json
import logging
from datetime import date
from pathlib import Path
from typing import List, Dict, Any, Optional, Literal

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def validate_and_fix_tiers(tiers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Validate and fix pricing tiers by recalculating price_per_gb from total/gb.

    When both 'gb' and 'total' are present for a per_gb tier, recalculate
    price_per_gb to ensure accuracy. This fixes data source errors.

    Args:
        tiers: List of pricing tier dictionaries

    Returns:
        List of validated/fixed tier dictionaries
    """
    fixed_tiers = []
    for tier in tiers:
        tier_copy = tier.copy()

        # For per_gb tiers with both gb and total, recalculate price_per_gb
        if (tier_copy.get('pricing_model') == 'per_gb' and
                'gb' in tier_copy and
                'total' in tier_copy and
                tier_copy['gb'] > 0):
            calculated = tier_copy['total'] / tier_copy['gb']
            tier_copy['price_per_gb'] = round(calculated, 4)

        fixed_tiers.append(tier_copy)

    return fixed_tiers


def calculate_price_extremes(
    tiers: List[Dict[str, Any]],
    extreme: Literal["min", "max"]
) -> Optional[float]:
    """
    Calculate the minimum or maximum $/GB from all tiers.

    Args:
        tiers: List of pricing tier dictionaries
        extreme: Either "min" for minimum or "max" for maximum price

    Returns:
        The calculated price value, or None if no valid prices found
    """
    prices = []

    for tier in tiers:
        if tier.get('pricing_model') == 'per_gb' and 'price_per_gb' in tier:
            prices.append(tier['price_per_gb'])

    if not prices:
        return None

    return min(prices) if extreme == "min" else max(prices)


def normalize_pricing_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a single pricing record by:
    1. Validating and fixing tier prices
    2. Calculating min/max $/GB
    3. Determining pricing model
    4. Flagging records without per-GB pricing
    """
    # Fix price_per_gb values before processing
    tiers = validate_and_fix_tiers(record.get('tiers', []))

    if not tiers:
        return {
            **record,
            'min_price_per_gb': None,
            'max_price_per_gb': None,
            'pricing_model': 'unknown',
            'comparable': False,
            'tier_count': 0
        }

    # Check if we have per-GB pricing
    has_per_gb = any(t.get('pricing_model') == 'per_gb' for t in tiers)

    if has_per_gb:
        min_price = calculate_price_extremes(tiers, "min")
        max_price = calculate_price_extremes(tiers, "max")
        pricing_model = 'per_gb'
        comparable = True
    else:
        # Non-GB pricing (per-IP, per-thread, etc.)
        min_price = None
        max_price = None
        # Determine primary pricing model
        models = [t.get('pricing_model', 'unknown') for t in tiers]
        pricing_model = max(set(models), key=models.count) if models else 'unknown'
        comparable = False

    return {
        **record,
        'tiers': tiers,  # Include fixed tiers with recalculated price_per_gb
        'min_price_per_gb': min_price,
        'max_price_per_gb': max_price,
        'pricing_model': pricing_model,
        'comparable': comparable,
        'tier_count': len(tiers)
    }


def add_provider_metadata(providers: List[Dict], pricing_records: List[Dict]) -> List[Dict]:
    """
    Add metadata to providers based on pricing data:
    - Cheapest proxy type
    - Average pricing
    - Pricing availability
    """
    for provider in providers:
        provider_id = provider['id']

        # Find all pricing for this provider
        provider_pricing = [p for p in pricing_records if p['provider_id'] == provider_id]

        # Calculate cheapest per-GB across all proxy types
        min_prices = [
            p['min_price_per_gb']
            for p in provider_pricing
            if p.get('min_price_per_gb') is not None
        ]

        provider['cheapest_price_per_gb'] = min(min_prices) if min_prices else None
        provider['has_pricing_data'] = len([p for p in provider_pricing if p.get('has_pricing', False)]) > 0
        provider['pricing_count'] = len(provider_pricing)

    return providers


def load_json_file(path: Path) -> Any:
    """
    Load JSON file with proper error handling.

    Args:
        path: Path to the JSON file

    Returns:
        Parsed JSON data

    Raises:
        FileNotFoundError: If file doesn't exist
        json.JSONDecodeError: If file contains invalid JSON
    """
    if not path.exists():
        logger.error(f"File not found: {path}")
        raise FileNotFoundError(f"Required data file not found: {path}")

    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in {path}: {e}")
        raise


def save_json_file(path: Path, data: Any) -> None:
    """
    Save data to JSON file with proper error handling.

    Args:
        path: Path to save the file
        data: Data to serialize to JSON

    Raises:
        IOError: If file cannot be written
    """
    try:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved: {path}")
    except IOError as e:
        logger.error(f"Failed to write {path}: {e}")
        raise


def main():
    """Main execution"""
    project_root = Path(__file__).parent.parent.parent
    input_dir = project_root / 'data' / 'raw'
    output_dir = project_root / 'front' / 'src' / 'data'
    output_dir.mkdir(parents=True, exist_ok=True)

    last_updated = date.today().isoformat()

    # Load raw data with error handling
    providers_path = input_dir / 'providers_raw.json'
    pricing_path = input_dir / 'pricing_raw.json'

    logger.info(f"Loading providers from: {providers_path}")
    providers = load_json_file(providers_path)

    logger.info(f"Loading pricing from: {pricing_path}")
    pricing_records = load_json_file(pricing_path)

    logger.info(f"Normalizing {len(pricing_records)} pricing records...")

    # Normalize pricing records
    normalized_pricing = [normalize_pricing_record(r) for r in pricing_records]

    # Add metadata to providers
    providers_with_metadata = add_provider_metadata(providers, normalized_pricing)

    # Sort providers by cheapest price
    providers_with_metadata.sort(
        key=lambda p: (p['cheapest_price_per_gb'] is None, p.get('cheapest_price_per_gb', float('inf')))
    )

    # Save normalized data
    providers_output = output_dir / 'providers.json'
    pricing_output = output_dir / 'pricing.json'

    providers_data = {
        'providers': providers_with_metadata,
        'last_updated': last_updated,
        'total_count': len(providers_with_metadata)
    }
    save_json_file(providers_output, providers_data)

    pricing_data = {
        'pricing': normalized_pricing,
        'last_updated': last_updated,
        'total_count': len(normalized_pricing)
    }
    save_json_file(pricing_output, pricing_data)

    # Generate summary stats
    comparable_count = len([p for p in normalized_pricing if p.get('comparable', False)])
    logger.info(f"Normalized {len(normalized_pricing)} pricing records")
    logger.info(f"{comparable_count} records have comparable $/GB pricing")
    logger.info(f"{len(normalized_pricing) - comparable_count} records use alternative pricing models")
    logger.info(f"Output saved to: {output_dir}")

    return providers_with_metadata, normalized_pricing


if __name__ == '__main__':
    main()
