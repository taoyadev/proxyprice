#!/usr/bin/env python3
"""Tests for merchant profile sidecar generation."""

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from generate_merchant_profiles import (  # noqa: E402
    assert_no_forbidden_keys,
    build_merchant_profiles,
)


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def build_project_root(tmp_path: Path) -> Path:
    project_root = tmp_path / "proxyprice"
    write_json(
        project_root / "front" / "src" / "data" / "providers.json",
        {
            "last_updated": "2026-05-25",
            "total_count": 3,
            "providers": [
                {
                    "id": "decodo",
                    "name": "Decodo",
                    "slug": "decodo",
                    "website_url": "https://decodo.com",
                    "trial_offer": "3-day free trial",
                    "proxy_types": ["residential", "isp"],
                    "cheapest_price_per_gb": 2.0,
                    "has_pricing_data": True,
                    "pricing_count": 2,
                },
                {
                    "id": "held",
                    "name": "Held Merchant",
                    "slug": "held",
                    "website_url": "https://held.example",
                    "trial_offer": None,
                    "proxy_types": ["residential"],
                    "cheapest_price_per_gb": None,
                    "has_pricing_data": False,
                    "pricing_count": 0,
                },
                {
                    "id": "missing",
                    "name": "Missing Merchant",
                    "slug": "missing",
                    "website_url": "https://missing.example",
                    "trial_offer": None,
                    "proxy_types": ["datacenter"],
                    "cheapest_price_per_gb": None,
                    "has_pricing_data": False,
                    "pricing_count": 0,
                },
            ],
        },
    )
    write_json(
        project_root / "front" / "src" / "data" / "pricing.json",
        {
            "last_updated": "2026-05-25",
            "total_count": 0,
            "pricing": [],
        },
    )
    write_json(
        project_root / "data" / "site-overlays" / "proxyprice.json",
        {
            "schema_version": "1.0.0",
            "site_key": "proxyprice",
            "providers": {
                "decodo": {
                    "merchant_key": "decodo",
                    "include": True,
                    "go_slug": "decodo",
                    "url_override": None,
                    "affiliate": "https://decodo.com/?ref=private",
                    "publish_mode": "auto",
                    "notes": "mapped",
                },
                "held": {
                    "merchant_key": "decodo",
                    "include": True,
                    "go_slug": "held",
                    "url_override": None,
                    "affiliate": None,
                    "publish_mode": "hold",
                    "notes": "held locally",
                },
                "missing": {
                    "merchant_key": None,
                    "include": True,
                    "go_slug": "missing",
                    "url_override": None,
                    "affiliate": None,
                    "publish_mode": "hold",
                    "notes": "missing",
                },
            },
        },
    )
    return project_root


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
                    "merchant_json": "references/merchants/decodo/merchant.json",
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
                }
            ],
        },
    )
    write_json(
        merchant_dir / "merchant.json",
        {
            "schema_version": "1.0.0",
            "merchant_key": "decodo",
            "names": {
                "display_name": "Decodo",
                "aliases": ["Smartproxy"],
                "legacy_aliases": ["Old Smartproxy"],
            },
            "official": {
                "homepage_url": "https://decodo.com/",
                "pricing_url": "https://decodo.com/pricing",
                "domains": ["decodo.com"],
            },
            "taxonomy": {
                "proxy_types": ["residential", "isp"],
                "product_categories": ["proxy-network"],
            },
            "products": [
                {
                    "product_key": "residential-proxies",
                    "proxy_type": "residential",
                    "product_category": "proxy-network",
                    "pricing_model": "per_gb",
                    "source_url": "https://decodo.com/residential",
                    "affiliate": "must-not-leak",
                    "entry_price": {
                        "amount": 2.0,
                        "currency": "USD",
                        "unit": "GB",
                        "source_url": "https://decodo.com/residential",
                        "observed_at": "2026-05-25",
                    },
                },
                {
                    "product_key": "isp-proxies",
                    "proxy_type": "isp",
                    "product_category": "proxy-network",
                    "pricing_model": "per_ip",
                    "source_url": "https://decodo.com/isp",
                    "entry_price": {
                        "amount": 0.27,
                        "currency": "USD",
                        "unit": "IP",
                        "source_url": "https://decodo.com/isp",
                        "observed_at": "2026-05-25",
                    },
                },
                {
                    "product_key": "web-unlocker",
                    "proxy_type": None,
                    "product_category": "unblocker",
                    "pricing_model": "quote_based",
                    "source_url": "https://decodo.com/unblocker",
                    "entry_price": None,
                },
            ],
            "positioning": {
                "strengths": ["Large public product catalog."],
                "best_for": ["Teams comparing public proxy plans."],
                "watchouts": ["Confirm plan terms on the official page."],
                "weaknesses": ["Some SKUs use non-GB pricing."],
                "ranking": {"rank": 1},
            },
            "evidence": {
                "official_pages": [
                    {
                        "evidence_key": "pricing-2026-05-25",
                        "kind": "pricing",
                        "label": "Decodo pricing",
                        "url": "https://decodo.com/pricing",
                        "observed_at": "2026-05-25",
                        "notes": ["Do not export notes in v1."],
                    }
                ]
            },
        },
    )
    return skill_root


def test_build_merchant_profiles_outputs_public_displayable_profile(tmp_path):
    output = build_merchant_profiles(
        project_root=build_project_root(tmp_path),
        global_skill_root=build_skill_root(tmp_path),
        generated_at="2026-05-29",
    )

    assert output["total_count"] == 3
    assert output["displayable_count"] == 1
    profile = output["profiles"]["decodo"]
    assert profile["display_profile"] is True
    assert profile["bundle_state"] == "verified"
    assert profile["bundle_status"] == "onboarded"
    assert profile["names"]["aliases"] == ["Smartproxy"]
    assert profile["official"]["pricing_url"] == "https://decodo.com/pricing"
    assert profile["products"][1]["entry_price"]["unit"] == "IP"
    assert profile["products"][2]["pricing_model"] == "quote_based"
    assert profile["products"][2]["entry_price"] is None
    assert profile["evidence"]["official_pages"][0] == {
        "evidence_key": "pricing-2026-05-25",
        "kind": "pricing",
        "label": "Decodo pricing",
        "url": "https://decodo.com/pricing",
        "observed_at": "2026-05-25",
    }
    assert_no_forbidden_keys(output)
    assert "affiliate" not in json.dumps(output)
    assert "publish_mode" not in json.dumps(output)


def test_build_merchant_profiles_hides_hold_and_missing_profiles(tmp_path):
    output = build_merchant_profiles(
        project_root=build_project_root(tmp_path),
        global_skill_root=build_skill_root(tmp_path),
        generated_at="2026-05-29",
    )

    held = output["profiles"]["held"]
    missing = output["profiles"]["missing"]
    assert held == {
        "provider_slug": "held",
        "provider_name": "Held Merchant",
        "merchant_key": "decodo",
        "display_profile": False,
        "bundle_state": "verified",
        "bundle_status": "onboarded",
    }
    assert missing == {
        "provider_slug": "missing",
        "provider_name": "Missing Merchant",
        "merchant_key": None,
        "display_profile": False,
        "bundle_state": None,
        "bundle_status": None,
    }


def test_assert_no_forbidden_keys_rejects_leaks():
    with pytest.raises(ValueError, match="forbidden key"):
        assert_no_forbidden_keys({"profiles": {"x": {"go_slug": "x"}}})
