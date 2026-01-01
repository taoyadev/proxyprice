#!/usr/bin/env python3
"""
Parse Price.csv and extract structured provider and pricing data.
"""
import csv
import json
import re
from pathlib import Path
from typing import List, Dict, Any, Optional
from urllib.parse import urlparse
from slugify import slugify


def _to_float(s: str) -> float:
    return float(s.replace(",", ""))


def _to_int(s: str) -> int:
    return int(s.replace(",", ""))


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

    # Section headers like "Dedicated:", "Pay / GB:", etc.
    if re.fullmatch(r"[A-Za-z0-9\s/()._-]+:", line):
        return None

    # Pattern: "X GB$Y/GB$Z"
    match_gb = re.match(
        r'(\d+(?:,\d{3})*)\s*GB\$(\d+\.?\d*)/(?:GB|G)\$(\d+(?:,\d{3})*(?:\.\d+)?)',
        line,
    )
    if match_gb:
        gb = _to_float(match_gb.group(1))
        price_per_gb = float(match_gb.group(2))
        total = _to_float(match_gb.group(3))
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "X GB$Y$Z" (implied $/GB)
    match_gb_implicit = re.match(
        r'(\d+(?:,\d{3})*)\s*GB\$(\d+\.?\d*)\$(\d+(?:,\d{3})*(?:\.\d+)?)',
        line,
    )
    if match_gb_implicit:
        gb = _to_float(match_gb_implicit.group(1))
        price_per_gb = float(match_gb_implicit.group(2))
        total = _to_float(match_gb_implicit.group(3))
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "X GB: $Y/GB" (total inferred)
    match_gb_colon = re.match(
        r'(\d+(?:,\d{3})*)\s*GB:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_gb_colon:
        gb = _to_float(match_gb_colon.group(1))
        price_per_gb = float(match_gb_colon.group(2))
        total = round(gb * price_per_gb, 2)
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "X GB: $Y/Mo" (monthly total -> $/GB)
    match_gb_colon_monthly = re.match(
        r'(\d+(?:,\d{3})*)\s*GB:\s*\$(\d+\.?\d*)/(?:mo|month)',
        line,
        re.IGNORECASE,
    )
    if match_gb_colon_monthly:
        gb = _to_float(match_gb_colon_monthly.group(1))
        total = float(match_gb_colon_monthly.group(2))
        price_per_gb = round(total / gb, 4) if gb > 0 else 0
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "X GB - Y GB: $Z/GB" (range; treat as PAYG for calculator compatibility)
    match_gb_range = re.match(
        r'(\d+(?:,\d{3})*)\s*GB\s*-\s*(\d+(?:,\d{3})*)\s*GB:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_gb_range:
        min_gb = _to_float(match_gb_range.group(1))
        max_gb = _to_float(match_gb_range.group(2))
        price_per_gb = float(match_gb_range.group(3))
        return {
            'gb': 1,
            'price_per_gb': price_per_gb,
            'total': price_per_gb,
            'pricing_model': 'per_gb',
            'is_payg': True,
            'min_gb': min_gb,
            'max_gb': max_gb,
        }

    # Pattern: "X-Y GB: $Z/GB" (range without repeating GB)
    match_gb_range_compact = re.match(
        r'(\d+(?:,\d{3})*)\s*-\s*(\d+(?:,\d{3})*)\s*GB:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_gb_range_compact:
        min_gb = _to_float(match_gb_range_compact.group(1))
        max_gb = _to_float(match_gb_range_compact.group(2))
        price_per_gb = float(match_gb_range_compact.group(3))
        return {
            'gb': 1,
            'price_per_gb': price_per_gb,
            'total': price_per_gb,
            'pricing_model': 'per_gb',
            'is_payg': True,
            'min_gb': min_gb,
            'max_gb': max_gb,
        }

    # Pattern: "X IPs$Y/IP$Z"
    match_ip = re.match(
        r'(\d+(?:,\d{3})*)\s*IPs?\$(\d+\.?\d*)/IP\$(\d+(?:,\d{3})*(?:\.\d+)?)',
        line,
    )
    if match_ip:
        ips = _to_int(match_ip.group(1))
        price_per_ip = float(match_ip.group(2))
        total = _to_float(match_ip.group(3))
        return {
            'ips': ips,
            'price_per_ip': price_per_ip,
            'total': total,
            'pricing_model': 'per_ip'
        }

    # Pattern: "X IPs$Y$Z" (implied $/IP)
    match_ip_implicit = re.match(
        r'(\d+(?:,\d{3})*)\s*IPs?\$(\d+\.?\d*)\$(\d+(?:,\d{3})*(?:\.\d+)?)',
        line,
    )
    if match_ip_implicit:
        ips = _to_int(match_ip_implicit.group(1))
        price_per_ip = float(match_ip_implicit.group(2))
        total = _to_float(match_ip_implicit.group(3))
        return {
            'ips': ips,
            'price_per_ip': price_per_ip,
            'total': total,
            'pricing_model': 'per_ip'
        }

    # Pattern: "$TOTAL/X IPs" (derive $/IP)
    match_total_over_ips = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*/\s*(\d+(?:,\d{3})*)\s*IPs?',
        line,
        re.IGNORECASE,
    )
    if match_total_over_ips:
        total = _to_float(match_total_over_ips.group(1))
        ips = _to_int(match_total_over_ips.group(2))
        if ips <= 0:
            return None
        price_per_ip = round(total / ips, 4)
        return {
            'ips': ips,
            'price_per_ip': price_per_ip,
            'total': total,
            'pricing_model': 'per_ip'
        }

    # Pattern: "X Days$Y/IP" or "X Day Trial: $Y/IP" (assume price is per IP for the period)
    match_days_per_ip = re.match(
        r'(\d+)\s*Day(?:s)?(?:[^$]*)\s*\$?(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_days_per_ip:
        days = int(match_days_per_ip.group(1))
        price_per_ip = float(match_days_per_ip.group(2))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'period_days': days,
        }

    # Pattern: "X Month: $Y/IP/Mo" or "X Months: $Y/IP"
    match_months_per_ip = re.match(
        r'(\d+)\s*Month(?:s)?(?:[^$]*)\s*\$?(\d+\.?\d*)/IP(?:/Mo)?',
        line,
        re.IGNORECASE,
    )
    if match_months_per_ip:
        months = int(match_months_per_ip.group(1))
        price_per_ip = float(match_months_per_ip.group(2))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'period_months': months,
        }

    # Pattern: "X GB: $Y/IP" (bandwidth bucket but priced per IP; keep $/IP)
    match_gb_bucket_per_ip = re.match(
        r'(\d+(?:,\d{3})*)\s*GB(?:\+)?\s*:\s*\$(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_gb_bucket_per_ip:
        min_gb = _to_float(match_gb_bucket_per_ip.group(1))
        price_per_ip = float(match_gb_bucket_per_ip.group(2))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'min_gb': min_gb,
        }

    # Pattern: "From X TB+: $Y/IP"
    match_tb_bucket_per_ip = re.match(
        r'From\s*(\d+(?:\.\d+)?)\s*TB(?:\+)?\s*:\s*\$(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_tb_bucket_per_ip:
        tb = float(match_tb_bucket_per_ip.group(1))
        price_per_ip = float(match_tb_bucket_per_ip.group(2))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'min_gb': tb * 1000,
            'min_tb': tb,
        }

    # Pattern: "$X/mo (Y IPs): $Z/IP"
    match_monthly_ip_parentheses = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*/\s*mo\s*\((\d+(?:,\d{3})*)\s*IPs?\):\s*\$(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_monthly_ip_parentheses:
        total = _to_float(match_monthly_ip_parentheses.group(1))
        ips = _to_int(match_monthly_ip_parentheses.group(2))
        price_per_ip = float(match_monthly_ip_parentheses.group(3))
        return {
            'ips': ips,
            'price_per_ip': price_per_ip,
            'total': total,
            'pricing_model': 'per_ip',
            'period_months': 1,
        }

    # Pattern: "X Hours$Y/IP" (assume price is per IP for the period)
    match_hours_per_ip = re.match(
        r'(\d+)\s*Hour(?:s)?(?:[^$]*)\s*\$?(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_hours_per_ip:
        hours = int(match_hours_per_ip.group(1))
        price_per_ip = float(match_hours_per_ip.group(2))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'period_hours': hours,
        }

    # Pattern: "$X/Y GB: $Z/GB"
    match_plan_gb = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)/(\d+)\s*GB:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_plan_gb:
        total = _to_float(match_plan_gb.group(1))
        gb = float(match_plan_gb.group(2))
        price_per_gb = float(match_plan_gb.group(3))
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb'
        }

    # Pattern: "$X/mo: $Y/GB" (derive GB from total and $/GB)
    match_month_total_per_gb = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*/\s*mo:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_month_total_per_gb:
        total = _to_float(match_month_total_per_gb.group(1))
        price_per_gb = float(match_month_total_per_gb.group(2))
        gb = round(total / price_per_gb, 4) if price_per_gb > 0 else 0
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb',
        }

    # Pattern: "$X: $Y/GB" (derive GB from total and $/GB)
    match_total_per_gb = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_total_per_gb:
        total = _to_float(match_total_per_gb.group(1))
        price_per_gb = float(match_total_per_gb.group(2))
        gb = round(total / price_per_gb, 4) if price_per_gb > 0 else 0
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb',
        }

    # Pattern: "$X per GB" (simple PAYG)
    match_per_gb_words = re.match(
        r'\$(\d+\.?\d*)\s*per\s*GB',
        line,
        re.IGNORECASE,
    )
    if match_per_gb_words:
        price_per_gb = float(match_per_gb_words.group(1))
        return {
            'gb': 1,
            'price_per_gb': price_per_gb,
            'total': price_per_gb,
            'pricing_model': 'per_gb',
            'is_payg': True,
        }

    # Pattern: "Per Month: $X/IP"
    match_per_month_ip = re.match(
        r'Per\s*Month:\s*\$(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_per_month_ip:
        price_per_ip = float(match_per_month_ip.group(1))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'period_months': 1,
        }

    # Pattern: "X-Y IPs: $Z/IP" (range)
    match_ip_range = re.match(
        r'(\d+(?:,\d{3})*)\s*-\s*(\d+(?:,\d{3})*)\s*IPs?:\s*\$(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_ip_range:
        min_ips = _to_int(match_ip_range.group(1))
        max_ips = _to_int(match_ip_range.group(2))
        price_per_ip = float(match_ip_range.group(3))
        return {
            'ips': 1,
            'price_per_ip': price_per_ip,
            'total': price_per_ip,
            'pricing_model': 'per_ip',
            'min_ips': min_ips,
            'max_ips': max_ips,
        }

    # Pattern: "$TOTAL/COUNT Ports: $X/Port" (treat ports as proxies)
    match_total_over_ports = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*/\s*(\d+(?:,\d{3})*)\s*Ports?:\s*\$(\d+\.?\d*)/Port',
        line,
        re.IGNORECASE,
    )
    if match_total_over_ports:
        total = _to_float(match_total_over_ports.group(1))
        ports = _to_int(match_total_over_ports.group(2))
        return {
            'proxies': ports,
            'total': total,
            'pricing_model': 'per_proxy',
        }

    # Pattern: "$TOTAL/mo: $X/Port" (derive ports; treat as proxies)
    match_month_total_per_port = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*/\s*mo:\s*\$(\d+\.?\d*)/Port',
        line,
        re.IGNORECASE,
    )
    if match_month_total_per_port:
        total = _to_float(match_month_total_per_port.group(1))
        price_per_port = float(match_month_total_per_port.group(2))
        proxies = None
        if price_per_port > 0:
            est = total / price_per_port
            rounded = int(round(est))
            if abs(est - rounded) < 1e-3 and rounded > 0:
                proxies = rounded
        out = {
            'total': total,
            'pricing_model': 'per_proxy',
            'period_months': 1,
        }
        if proxies is not None:
            out['proxies'] = proxies
        return out

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
        total = _to_float(match_monthly.group(1))
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
        proxies = _to_int(match_proxy.group(1))
        total = float(match_proxy.group(2))
        return {
            'proxies': proxies,
            'total': total,
            'pricing_model': 'per_proxy'
        }

    # Pattern: "X Hours$Y" (time-boxed pricing; treat as per-proxy single unit)
    match_hours_total = re.match(
        r'(\d+)\s*Hour(?:s)?\s*\$?(\d+(?:,\d{3})*(?:\.\d+)?)$',
        line,
        re.IGNORECASE,
    )
    if match_hours_total:
        hours = int(match_hours_total.group(1))
        total = _to_float(match_hours_total.group(2))
        return {
            'proxies': 1,
            'total': total,
            'pricing_model': 'per_proxy',
            'period_hours': hours,
        }

    # Pattern: "X Day(s): $Y" (time-boxed pricing; treat as per-proxy single unit)
    match_days_total = re.match(
        r'(\d+)\s*Day(?:s)?(?:[^$]*)\s*\$?(\d+(?:,\d{3})*(?:\.\d+)?)$',
        line,
        re.IGNORECASE,
    )
    if match_days_total:
        days = int(match_days_total.group(1))
        total = _to_float(match_days_total.group(2))
        return {
            'proxies': 1,
            'total': total,
            'pricing_model': 'per_proxy',
            'period_days': days,
        }

    # Pattern: "$X/Mo: $Y/IP" (derive IP count if possible)
    match_total_month_price_ip = re.match(
        r'\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*/\s*mo:\s*\$(\d+\.?\d*)/IP',
        line,
        re.IGNORECASE,
    )
    if match_total_month_price_ip:
        total = _to_float(match_total_month_price_ip.group(1))
        price_per_ip = float(match_total_month_price_ip.group(2))
        ips = None
        if price_per_ip > 0:
            est = total / price_per_ip
            rounded = int(round(est))
            if abs(est - rounded) < 1e-3 and rounded > 0:
                ips = rounded
        out = {
            'price_per_ip': price_per_ip,
            'total': total,
            'pricing_model': 'per_ip',
            'period_months': 1,
        }
        if ips is not None:
            out['ips'] = ips
        return out

    # Pattern: "IPs/GB/$Total: $X/GB" (bundle plans with $/GB shown)
    match_bundle_per_gb = re.match(
        r'(\d+(?:,\d{3})*)\s*IPs?\s*/\s*(\d+(?:,\d{3})*)\s*GB\s*/\s*\$(\d+(?:,\d{3})*(?:\.\d+)?):\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_bundle_per_gb:
        ips = _to_int(match_bundle_per_gb.group(1))
        gb = _to_float(match_bundle_per_gb.group(2))
        total = _to_float(match_bundle_per_gb.group(3))
        price_per_gb = float(match_bundle_per_gb.group(4))
        return {
            'gb': gb,
            'price_per_gb': price_per_gb,
            'total': total,
            'pricing_model': 'per_gb',
            'ips': ips,
        }

    # Pattern: "X GB+: $Y/GB" (treat as range starting at X GB)
    match_gb_plus = re.match(
        r'(\d+(?:,\d{3})*)\s*GB\+\s*:\s*\$(\d+\.?\d*)/(?:GB|G)',
        line,
        re.IGNORECASE,
    )
    if match_gb_plus:
        min_gb = _to_float(match_gb_plus.group(1))
        price_per_gb = float(match_gb_plus.group(2))
        return {
            'gb': 1,
            'price_per_gb': price_per_gb,
            'total': price_per_gb,
            'pricing_model': 'per_gb',
            'is_payg': True,
            'min_gb': min_gb,
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


def parse_csv_file(
    csv_path: Path,
    website_overrides: Optional[Dict[str, str]] = None,
) -> tuple[List[Dict], List[Dict]]:
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
                override_url = (website_overrides or {}).get(provider_slug, "").strip()
                providers_dict[provider_slug] = {
                    'id': provider_slug,
                    'name': provider_name,
                    'slug': provider_slug,
                    'website_url': override_url or extract_website_from_url(price_url),
                    'trial_offer': trial_offer if trial_offer else None,
                    'proxy_types': []
                }
            else:
                # Backfill website_url if it was missing on first encounter.
                if not providers_dict[provider_slug].get('website_url'):
                    override_url = (website_overrides or {}).get(provider_slug, "").strip()
                    providers_dict[provider_slug]['website_url'] = override_url or extract_website_from_url(price_url)

            # Add proxy type if not already added
            proxy_type = normalize_proxy_type(property_name)
            if proxy_type and proxy_type not in providers_dict[provider_slug]['proxy_types']:
                providers_dict[provider_slug]['proxy_types'].append(proxy_type)

            # Parse pricing tiers
            tiers = parse_price_offers(price_offers)
            has_any_pricing = bool(price_offers.strip())

            if tiers or has_any_pricing:
                pricing_record = {
                    'provider_id': provider_slug,
                    'provider_name': provider_name,
                    'proxy_type': proxy_type,
                    'price_url': price_url if price_url else None,
                    'tiers': tiers,
                    'has_pricing': has_any_pricing
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

    try:
        parsed = urlparse(url)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    except Exception:
        pass

    match = re.match(r'https?://([^/]+)', url)
    if match:
        return f"https://{match.group(1)}"

    return url


def main():
    """Main execution"""
    project_root = Path(__file__).parent.parent.parent
    csv_path = project_root / 'docs' / 'Price.csv'
    output_dir = project_root / 'data' / 'raw'
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Parsing CSV from: {csv_path}")

    # Optional website URL overrides sourced from the affiliate redirect map.
    redirects_path = project_root / "front" / "src" / "data" / "redirects.json"
    website_overrides = {}
    if redirects_path.exists():
        try:
            redirects = json.loads(redirects_path.read_text(encoding="utf-8"))
            providers_map = redirects.get("providers", {})
            if isinstance(providers_map, dict):
                for slug, entry in providers_map.items():
                    if isinstance(entry, dict) and isinstance(entry.get("url"), str):
                        website_overrides[slug] = extract_website_from_url(entry["url"])
        except Exception:
            website_overrides = {}

    providers, pricing_records = parse_csv_file(csv_path, website_overrides=website_overrides)

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
