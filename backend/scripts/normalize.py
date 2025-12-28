#!/usr/bin/env python3
"""
Normalize pricing data and calculate min/max prices per GB.
"""
import json
from datetime import date
from pathlib import Path
from typing import List, Dict, Any, Optional


def calculate_min_price_per_gb(tiers: List[Dict[str, Any]]) -> Optional[float]:
    """Calculate the minimum $/GB from all tiers"""
    prices = []

    for tier in tiers:
        if tier.get('pricing_model') == 'per_gb' and 'price_per_gb' in tier:
            prices.append(tier['price_per_gb'])

    return min(prices) if prices else None


def calculate_max_price_per_gb(tiers: List[Dict[str, Any]]) -> Optional[float]:
    """Calculate the maximum $/GB from all tiers"""
    prices = []

    for tier in tiers:
        if tier.get('pricing_model') == 'per_gb' and 'price_per_gb' in tier:
            prices.append(tier['price_per_gb'])

    return max(prices) if prices else None


def normalize_pricing_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize a single pricing record by:
    1. Calculating min/max $/GB
    2. Determining pricing model
    3. Flagging records without per-GB pricing
    """
    tiers = record.get('tiers', [])

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
        min_price = calculate_min_price_per_gb(tiers)
        max_price = calculate_max_price_per_gb(tiers)
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


def main():
    """Main execution"""
    project_root = Path(__file__).parent.parent.parent
    input_dir = project_root / 'data' / 'raw'
    output_dir = project_root / 'front' / 'src' / 'data'
    output_dir.mkdir(parents=True, exist_ok=True)

    last_updated = date.today().isoformat()

    # Load raw data
    with open(input_dir / 'providers_raw.json', 'r') as f:
        providers = json.load(f)

    with open(input_dir / 'pricing_raw.json', 'r') as f:
        pricing_records = json.load(f)

    print(f"Normalizing {len(pricing_records)} pricing records...")

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

    with open(providers_output, 'w', encoding='utf-8') as f:
        json.dump({
            'providers': providers_with_metadata,
            'last_updated': last_updated,
            'total_count': len(providers_with_metadata)
        }, f, indent=2, ensure_ascii=False)

    with open(pricing_output, 'w', encoding='utf-8') as f:
        json.dump({
            'pricing': normalized_pricing,
            'last_updated': last_updated,
            'total_count': len(normalized_pricing)
        }, f, indent=2, ensure_ascii=False)

    # Generate summary stats
    comparable_count = len([p for p in normalized_pricing if p.get('comparable', False)])
    print(f"✓ Normalized {len(normalized_pricing)} pricing records")
    print(f"✓ {comparable_count} records have comparable $/GB pricing")
    print(f"✓ {len(normalized_pricing) - comparable_count} records use alternative pricing models")
    print(f"✓ Saved to {output_dir}")

    return providers_with_metadata, normalized_pricing


if __name__ == '__main__':
    main()
