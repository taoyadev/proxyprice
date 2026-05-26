#!/usr/bin/env python3
"""Tests for ProxyPrice monthly update control-plane helpers."""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from monthly_update import (  # noqa: E402
    GlobalMerchantContext,
    build_mappings,
    build_overlay,
    build_report,
    calculate_price_deltas,
    provider_price_urls,
    validate_overlay,
)


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_skill_root(tmp_path: Path) -> Path:
    skill_root = tmp_path / "proxy-merchant-intel"
    references = skill_root / "references"
    merchant_dir = references / "merchants" / "decodo"

    write_json(
        references / "merchants" / "index.json",
        {
            "schema_version": "1.0.0",
            "merchants": [
                {
                    "merchant_key": "decodo",
                    "display_name": "Decodo",
                    "bundle_state": "verified",
                    "domains": ["decodo.com"],
                    "homepage_url": "https://decodo.com/",
                    "pricing_url": "https://decodo.com/pricing",
                    "aliases": ["Smartproxy"],
                    "merchant_json": "/".join(
                        ["references", "merchants", "decodo", "merchant.json"]
                    ),
                }
            ],
        },
    )
    write_json(
        references / "merchant-universe.v1.json",
        {
            "schema_version": "1.0.0",
            "merchants": [
                {
                    "merchant_key": "decodo",
                    "display_name": "Decodo",
                    "aliases": [],
                    "legacy_aliases": ["Smartproxy"],
                    "bundle_status": "onboarded",
                },
                {
                    "merchant_key": "unbundled",
                    "display_name": "Unbundled",
                    "aliases": [],
                    "legacy_aliases": [],
                    "bundle_status": "tracked_not_onboarded",
                },
            ],
        },
    )
    write_json(
        merchant_dir / "merchant.json",
        {
            "schema_version": "1.0.0",
            "merchant_key": "decodo",
            "products": [
                {
                    "product_key": "residential-proxies",
                    "proxy_type": "residential",
                    "pricing_model": "per_gb",
                    "source_url": "https://decodo.com/residential",
                    "entry_price": {
                        "amount": 2.0,
                        "currency": "USD",
                        "unit": "GB",
                        "source_url": "https://decodo.com/residential",
                        "observed_at": "2026-04-08",
                    },
                },
                {
                    "product_key": "isp-proxies",
                    "proxy_type": "isp",
                    "pricing_model": "per_ip",
                    "source_url": "https://decodo.com/isp",
                    "entry_price": {
                        "amount": 0.27,
                        "currency": "USD",
                        "unit": "IP",
                        "source_url": "https://decodo.com/isp",
                        "observed_at": "2026-04-08",
                    },
                },
            ],
        },
    )
    return skill_root


def test_build_overlay_matches_by_domain_and_preserves_existing_values(tmp_path):
    context = GlobalMerchantContext(build_skill_root(tmp_path))
    providers = [
        {
            "id": "smartproxy",
            "slug": "smartproxy",
            "name": "Smartproxy",
            "website_url": "https://example.com",
        }
    ]
    redirects = {
        "smartproxy": {
            "url": "https://decodo.com",
            "affiliate": "https://decodo.com/?ref=keep",
        }
    }
    existing = {
        "schema_version": "1.0.0",
        "site_key": "proxyprice",
        "providers": {
            "smartproxy": {
                "merchant_key": "decodo",
                "include": True,
                "go_slug": "decodo",
                "url_override": None,
                "affiliate": "https://decodo.com/?ref=existing",
                "publish_mode": "manual",
                "notes": "operator override",
            }
        },
    }

    overlay = build_overlay(
        providers,
        redirects,
        {"smartproxy": ["https://decodo.com/pricing"]},
        context,
        existing,
    )

    entry = overlay["providers"]["smartproxy"]
    assert entry["merchant_key"] == "decodo"
    assert entry["affiliate"] == "https://decodo.com/?ref=existing"
    assert entry["publish_mode"] == "manual"
    assert validate_overlay(overlay, ["smartproxy"]) == []


def test_build_mappings_marks_missing_bundle(tmp_path):
    context = GlobalMerchantContext(build_skill_root(tmp_path))
    providers = [
        {
            "id": "unbundled",
            "slug": "unbundled",
            "name": "Unbundled",
            "website_url": "https://unbundled.example",
        }
    ]
    overlay = {
        "schema_version": "1.0.0",
        "site_key": "proxyprice",
        "providers": {
            "unbundled": {
                "merchant_key": "unbundled",
                "include": True,
                "go_slug": "unbundled",
                "url_override": None,
                "affiliate": None,
                "publish_mode": "auto",
                "notes": "",
            }
        },
    }

    mappings = build_mappings(providers, [], overlay, context)

    assert mappings[0].status == "mapped_universe_only"
    assert "no merchant bundle" in "; ".join(mappings[0].reasons)


def test_calculate_price_deltas_flags_large_delta(tmp_path):
    context = GlobalMerchantContext(build_skill_root(tmp_path))
    providers = [
        {
            "id": "decodo",
            "slug": "decodo",
            "name": "Decodo",
            "website_url": "https://decodo.com",
        }
    ]
    overlay = build_overlay(providers, {}, {}, context, None)
    mappings = build_mappings(providers, [], overlay, context)
    pricing = [
        {
            "provider_id": "decodo",
            "provider_name": "Decodo",
            "proxy_type": "residential",
            "min_price_per_gb": 7.0,
        }
    ]

    deltas = calculate_price_deltas(pricing, mappings, context, threshold=0.50)

    assert len(deltas) == 1
    assert deltas[0].status == "large_delta_hold"
    assert deltas[0].candidate_amount == 2.0


def test_report_contains_required_monthly_sections():
    report = build_report(
        run_date="2026-05-25",
        mappings=[],
        deltas=[],
        url_checks=[],
        overlay_written=True,
        redirects_synced=True,
        pipeline_ran=False,
        pipeline_ok=False,
        url_checks_ran=False,
        threshold=0.50,
    )

    for heading in [
        "Run Summary",
        "Changed Providers",
        "Official Evidence URLs",
        "Held For Review",
        "Missing Bundles",
        "Failed Fetches",
        "validation_status",
    ]:
        assert heading in report


def test_provider_price_urls_uses_provider_slug():
    rows = [
        {"Name": "Bright Data", "Price URL": "https://brightdata.com/pricing"},
        {"Name": "Bright Data", "Price URL": "https://brightdata.com/pricing"},
        {"Name": "Proxy Seller", "Price URL": "https://proxy-seller.com/"},
    ]

    urls = provider_price_urls(rows)

    assert urls["bright-data"] == ["https://brightdata.com/pricing"]
    assert urls["proxy-seller"] == ["https://proxy-seller.com/"]
