#!/usr/bin/env python3
"""
Parse Price.csv and extract structured provider and pricing data.
"""
import csv
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from slugify import slugify


def extract_price_per_gb(price_str: str) -> Optional[float]:
    """Extract $/GB from price string like '$5/GB' or '$5.50/GB'"""
    match = re.search(r'\$(\d+\.?\d*)/GB', price_str)
    if match:
        return float(match.group(1))
    return None


def extract_price_per_ip(price_str: str) -> Optional[float]:
    """Extract $/IP from price string like '$2.50/IP'"""
    match = re.search(r'\$(\d+\.?\d*)/IP', price_str)
    if match:
        return float(match.group(1))
    return None


def parse_tier_line(line: str) -> Optional[Dict[str, Any]]:
    """
    Parse a single pricing tier line.
    Examples:
      "1 GB$7/GB$7" -> {gb: 1, price_per_gb: 7, total: 7}
      "10 IPs$2.50/IP$25" -> {ips: 10, price_per_ip: 2.50, total: 25}
      "$100/month for 50GB" -> {gb: 50, total: 100, price_per_gb: 2.0}
    """
    line = line.strip()
    if not line:
        return None

    # Pattern: "X GB$Y/GB$Z"
    match_gb = re.match(r'(\d+(?:,\d{3})*)\s*GB\$(\d+\.?\d*)/GB\$(\d+(?:,\d{3})*(?:\.\d+)?)', line)
    if match_gb:
        gb = float(match_gb.group(1).replace(',', ''))
        price_per_gb = float(match_gb.group(2))
        total = float(match_gb.group(3).replace(',', ''))
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "X IPs$Y/IP$Z"
    match_ip = re.match(r'(\d+(?:,\d{3})*)\s*IPs?\$(\d+\.?\d*)/IP\$(\d+(?:,\d{3})*(?:\.\d+)?)', line)
    if match_ip:
        ips = int(match_ip.group(1).replace(',', ''))
        price_per_ip = float(match_ip.group(2))
        total = float(match_ip.group(3).replace(',', ''))
        return {
            'ips': ips,
            'price_per_ip': price_per_ip,
            'total': total,
            'pricing_model': 'per_ip'
        }

    # Pattern: "$X/Y GB: $Z/GB"
    match_plan_gb = re.match(r'\$(\d+(?:,\d{3})*)/(\d+)\s*GB:\s*\$(\d+\.?\d*)/GB', line)
    if match_plan_gb:
        total = float(match_plan_gb.group(1).replace(',', ''))
        gb = float(match_plan_gb.group(2))
        price_per_gb = float(match_plan_gb.group(3))
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "Pay as you go: $X/GB"
    match_payg = re.match(r'Pay as you go:\s*\$(\d+\.?\d*)/GB', line)
    if match_payg:
        price_per_gb = float(match_payg.group(1))
        return {
            'gb': 1,
            'price_per_gb': price_per_gb,
            'total': price_per_gb,
            'pricing_model': 'per_gb',
            'is_payg': True
        }

    # Pattern: "Monthly Plan: $X/Y GB" or "$X/mo (Y GB)"
    match_monthly = re.search(r'\$(\d+(?:,\d{3})*)/mo.*?(\d+)\s*GB', line)
    if not match_monthly:
        match_monthly = re.search(r'\$(\d+(?:,\d{3})*)/(\d+)\s*GB', line)

    if match_monthly:
        total = float(match_monthly.group(1).replace(',', ''))
        gb = float(match_monthly.group(2))
        price_per_gb = round(total / gb, 2) if gb > 0 else 0
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "X Threads: $Y" or "$Y/X Threads"
    match_thread = re.search(r'(\d+)\s*Threads?.*?\$(\d+\.?\d*)', line)
    if match_thread:
        threads = int(match_thread.group(1))
        total = float(match_thread.group(2))
        return {
            'threads': threads,
            'total': total,
            'pricing_model': 'per_thread'
        }

    # Pattern: "X Proxies: $Y" or "$Y/X Proxies"
    match_proxy = re.search(r'(\d+(?:,\d{3})*)\s*Prox(?:ies|y).*?\$(\d+\.?\d*)', line)
    if match_proxy:
        proxies = int(match_proxy.group(1).replace(',', ''))
        total = float(match_proxy.group(2))
        return {
            'proxies': proxies,
            'total': total,
            'pricing_model': 'per_proxy'
        }

    return None


def parse_price_offers(price_offers: str) -> List[Dict[str, Any]]:
    """Parse multi-line pricing tiers from Price Offers column"""
    if not price_offers or price_offers.strip() == '':
        return []

    tiers = []
    lines = price_offers.split('\n')

    for line in lines:
        tier = parse_tier_line(line)
        if tier:
            tiers.append(tier)

    return tiers


def parse_csv_file(csv_path: Path) -> tuple[List[Dict], List[Dict]]:
    """
    Parse the CSV and return providers and pricing data.
    Returns: (providers, pricing_records)
    """
    providers_dict = {}
    pricing_records = []

    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)

        for row in reader:
            provider_name = row.get('Name', '').strip()
            property_name = row.get('Property Name', '').strip()
            price_url = row.get('Price URL', '').strip()
            price_offers = row.get('Price Offers', '').strip()
            trial_offer = row.get('Trial Offer', '').strip()

            if not provider_name or not property_name:
                continue

            # Create or update provider entry
            provider_slug = slugify(provider_name)
            if provider_slug not in providers_dict:
                providers_dict[provider_slug] = {
                    'id': provider_slug,
                    'name': provider_name,
                    'slug': provider_slug,
                    'website_url': extract_website_from_url(price_url),
                    'trial_offer': trial_offer if trial_offer else None,
                    'proxy_types': []
                }

            # Add proxy type if not already added
            proxy_type = normalize_proxy_type(property_name)
            if proxy_type and proxy_type not in providers_dict[provider_slug]['proxy_types']:
                providers_dict[provider_slug]['proxy_types'].append(proxy_type)

            # Parse pricing tiers
            tiers = parse_price_offers(price_offers)

            if tiers:
                pricing_record = {
                    'provider_id': provider_slug,
                    'provider_name': provider_name,
                    'proxy_type': proxy_type,
                    'price_url': price_url if price_url else None,
                    'tiers': tiers,
                    'has_pricing': True
                }
                pricing_records.append(pricing_record)
            else:
                # No pricing data available
                pricing_record = {
                    'provider_id': provider_slug,
                    'provider_name': provider_name,
                    'proxy_type': proxy_type,
                    'price_url': price_url if price_url else None,
                    'tiers': [],
                    'has_pricing': False
                }
                pricing_records.append(pricing_record)

    providers = list(providers_dict.values())
    return providers, pricing_records


def normalize_proxy_type(property_name: str) -> str:
    """Normalize proxy type names"""
    property_lower = property_name.lower()

    if 'residential' in property_lower:
        return 'residential'
    elif 'datacenter' in property_lower or 'data center' in property_lower:
        return 'datacenter'
    elif 'mobile' in property_lower:
        return 'mobile'
    elif 'isp' in property_lower:
        return 'isp'
    else:
        return 'other'


def extract_website_from_url(url: str) -> str:
    """Extract base website URL from pricing URL"""
    if not url:
        return ''

    match = re.match(r'https?://(?:www\.)?([^/]+)', url)
    if match:
        domain = match.group(1)
        return f'https://{domain}'
    return url


def main():
    """Main execution"""
    project_root = Path(__file__).parent.parent.parent
    csv_path = project_root / 'docs' / 'Price.csv'
    output_dir = project_root / 'data' / 'raw'
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Parsing CSV from: {csv_path}")
    providers, pricing_records = parse_csv_file(csv_path)

    # Save raw parsed data
    providers_output = output_dir / 'providers_raw.json'
    pricing_output = output_dir / 'pricing_raw.json'

    with open(providers_output, 'w', encoding='utf-8') as f:
        json.dump(providers, f, indent=2, ensure_ascii=False)

    with open(pricing_output, 'w', encoding='utf-8') as f:
        json.dump(pricing_records, f, indent=2, ensure_ascii=False)

    print(f"✓ Parsed {len(providers)} providers")
    print(f"✓ Parsed {len(pricing_records)} pricing records")
    print(f"✓ Saved to {output_dir}")

    return providers, pricing_records


if __name__ == '__main__':
    main()
