#!/usr/bin/env python3
"""Generate public merchant profile sidecar data for ProxyPrice provider pages."""
from __future__ import annotations

import argparse
import json
from datetime import date
from pathlib import Path
from typing import Any, Dict, Optional, Sequence


DEFAULT_GLOBAL_SKILL_ROOT = Path("/Users/butterfly/.codex/skills/proxy-merchant-intel")
FORBIDDEN_OUTPUT_KEYS = {
    "affiliate",
    "go_slug",
    "pretty_link",
    "preferred_tracking_url",
    "rank",
    "ranking",
    "site_rank",
    "sponsor",
    "sponsor_lock",
    "cta",
    "cta_copy",
    "publish_mode",
    "wordpress",
    "site_style",
    "target_domain",
    "url_override",
}
FORBIDDEN_POSITIONING_TERMS = (
    "affiliate",
    "go_slug",
    "go slug",
    "pretty_link",
    "pretty link",
    "sponsor",
    "wordpress",
    "site style",
    "target domain",
)


def project_root_from_script() -> Path:
    return Path(__file__).resolve().parents[2]


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def clean_string(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def clean_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    output = []
    seen = set()
    for item in value:
        cleaned = clean_string(item)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            output.append(cleaned)
    return output


def clean_public_positioning_list(value: Any) -> list[str]:
    return [
        item
        for item in clean_string_list(value)
        if not any(term in item.lower() for term in FORBIDDEN_POSITIONING_TERMS)
    ]


def clean_number(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def clean_entry_price(value: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    amount = clean_number(value.get("amount"))
    source_url = clean_string(value.get("source_url"))
    return {
        "amount": amount,
        "currency": clean_string(value.get("currency")),
        "unit": clean_string(value.get("unit")),
        "billing_model": clean_string(value.get("billing_model")),
        "term": clean_string(value.get("term")),
        "source_url": source_url,
        "observed_at": clean_string(value.get("observed_at")),
    }


def clean_product(product: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(product, dict):
        return None
    product_key = clean_string(product.get("product_key"))
    if not product_key:
        return None
    entry_price = clean_entry_price(product.get("entry_price"))
    source_url = clean_string(product.get("source_url"))
    if entry_price and not entry_price.get("source_url") and source_url:
        entry_price["source_url"] = source_url
    return {
        "product_key": product_key,
        "proxy_type": clean_string(product.get("proxy_type")),
        "product_category": clean_string(product.get("product_category")),
        "pricing_model": clean_string(product.get("pricing_model")) or "unknown",
        "entry_price": entry_price,
        "source_url": source_url or (entry_price or {}).get("source_url"),
    }


def clean_positioning(value: Any) -> Dict[str, list[str]]:
    if not isinstance(value, dict):
        value = {}
    return {
        "strengths": clean_public_positioning_list(value.get("strengths")),
        "weaknesses": clean_public_positioning_list(value.get("weaknesses")),
        "best_for": clean_public_positioning_list(value.get("best_for")),
        "watchouts": clean_public_positioning_list(value.get("watchouts")),
    }


def clean_official_page(value: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(value, dict):
        return None
    url = clean_string(value.get("url"))
    label = clean_string(value.get("label"))
    if not url or not label:
        return None
    return {
        "evidence_key": clean_string(value.get("evidence_key")),
        "kind": clean_string(value.get("kind")) or "official_page",
        "label": label,
        "url": url,
        "observed_at": clean_string(value.get("observed_at")),
    }


def assert_no_forbidden_keys(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in FORBIDDEN_OUTPUT_KEYS:
                raise ValueError(f"forbidden key in merchant profile output: {path}.{key}")
            assert_no_forbidden_keys(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            assert_no_forbidden_keys(child, f"{path}[{index}]")


def load_bundle_index(skill_root: Path) -> Dict[str, Dict[str, Any]]:
    data = read_json(skill_root / "references" / "merchants" / "index.json")
    return {
        item["merchant_key"]: item
        for item in data.get("merchants", [])
        if isinstance(item, dict) and item.get("merchant_key")
    }


def load_universe(skill_root: Path) -> Dict[str, Dict[str, Any]]:
    data = read_json(skill_root / "references" / "merchant-universe.v1.json")
    return {
        item["merchant_key"]: item
        for item in data.get("merchants", [])
        if isinstance(item, dict) and item.get("merchant_key")
    }


def resolve_merchant_json_path(skill_root: Path, bundle: Dict[str, Any]) -> Optional[Path]:
    merchant_json = clean_string(bundle.get("merchant_json"))
    if not merchant_json:
        return None
    path = Path(merchant_json)
    if not path.is_absolute():
        path = skill_root / path
    return path


def base_profile(provider: Dict[str, Any], merchant_key: Optional[str], display: bool) -> Dict[str, Any]:
    return {
        "provider_slug": clean_string(provider.get("slug")) or clean_string(provider.get("id")),
        "provider_name": clean_string(provider.get("name")),
        "merchant_key": merchant_key,
        "display_profile": display,
        "bundle_state": None,
        "bundle_status": None,
    }


def build_provider_profile(
    provider: Dict[str, Any],
    overlay_entry: Dict[str, Any],
    bundle_index: Dict[str, Dict[str, Any]],
    universe: Dict[str, Dict[str, Any]],
    skill_root: Path,
) -> Dict[str, Any]:
    merchant_key = clean_string(overlay_entry.get("merchant_key"))
    display = bool(
        merchant_key
        and overlay_entry.get("publish_mode") == "auto"
        and merchant_key in bundle_index
    )
    profile = base_profile(provider, merchant_key, display)

    if not merchant_key:
        return profile

    universe_entry = universe.get(merchant_key, {})
    profile["bundle_status"] = clean_string(universe_entry.get("bundle_status"))

    bundle = bundle_index.get(merchant_key)
    if not bundle:
        return profile

    profile["bundle_state"] = clean_string(bundle.get("bundle_state"))
    if not display:
        return profile

    merchant_path = resolve_merchant_json_path(skill_root, bundle)
    if not merchant_path or not merchant_path.exists():
        profile["display_profile"] = False
        return profile

    merchant_data = read_json(merchant_path)
    names = merchant_data.get("names") or {}
    official = merchant_data.get("official") or {}
    taxonomy = merchant_data.get("taxonomy") or {}
    evidence = merchant_data.get("evidence") or {}

    products = [
        cleaned
        for cleaned in (clean_product(product) for product in merchant_data.get("products", []) or [])
        if cleaned is not None
    ]
    official_pages = [
        cleaned
        for cleaned in (
            clean_official_page(page)
            for page in evidence.get("official_pages", []) or []
        )
        if cleaned is not None
    ]

    profile.update(
        {
            "names": {
                "display_name": clean_string(names.get("display_name"))
                or clean_string(bundle.get("display_name"))
                or clean_string(provider.get("name")),
                "aliases": clean_string_list(names.get("aliases")),
                "legacy_aliases": clean_string_list(names.get("legacy_aliases")),
            },
            "official": {
                "homepage_url": clean_string(official.get("homepage_url"))
                or clean_string(bundle.get("homepage_url")),
                "pricing_url": clean_string(official.get("pricing_url"))
                or clean_string(bundle.get("pricing_url")),
                "domains": clean_string_list(official.get("domains") or bundle.get("domains")),
            },
            "taxonomy": {
                "proxy_types": clean_string_list(taxonomy.get("proxy_types")),
                "product_categories": clean_string_list(taxonomy.get("product_categories")),
            },
            "products": products,
            "positioning": clean_positioning(merchant_data.get("positioning")),
            "evidence": {
                "official_pages": official_pages,
            },
        }
    )
    return profile


def build_merchant_profiles(
    project_root: Path,
    global_skill_root: Path,
    overlay_path: Optional[Path] = None,
    output_path: Optional[Path] = None,
    generated_at: Optional[str] = None,
) -> Dict[str, Any]:
    project_root = project_root.resolve()
    global_skill_root = global_skill_root.resolve()
    overlay_path = overlay_path or project_root / "data" / "site-overlays" / "proxyprice.json"
    output_path = output_path or project_root / "front" / "src" / "data" / "merchant-profiles.json"

    providers_data = read_json(project_root / "front" / "src" / "data" / "providers.json")
    # The pricing file is part of the freshness contract for this sidecar even
    # though merchant bundle facts remain the source of merchant profile fields.
    pricing_data = read_json(project_root / "front" / "src" / "data" / "pricing.json")
    overlay = read_json(overlay_path)
    bundle_index = load_bundle_index(global_skill_root)
    universe = load_universe(global_skill_root)

    providers = providers_data.get("providers", [])
    overlay_entries = overlay.get("providers", {})
    profiles: Dict[str, Any] = {}
    for provider in providers:
        slug = clean_string(provider.get("slug")) or clean_string(provider.get("id"))
        if not slug:
            continue
        profiles[slug] = build_provider_profile(
            provider,
            overlay_entries.get(slug, {}),
            bundle_index,
            universe,
            global_skill_root,
        )

    output = {
        "schema_version": "1.0.0",
        "source": "proxy-merchant-intel",
        "generated_at": generated_at or date.today().isoformat(),
        "providers_last_updated": providers_data.get("last_updated"),
        "pricing_last_updated": pricing_data.get("last_updated"),
        "total_count": len(profiles),
        "displayable_count": len(
            [profile for profile in profiles.values() if profile.get("display_profile")]
        ),
        "profiles": profiles,
    }
    assert_no_forbidden_keys(output)
    write_json(output_path, output)
    return output


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    project_root = project_root_from_script()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=project_root)
    parser.add_argument("--global-skill-root", type=Path, default=DEFAULT_GLOBAL_SKILL_ROOT)
    parser.add_argument("--overlay", type=Path, default=None)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--generated-at", default=None, help="YYYY-MM-DD; defaults to today")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    output = build_merchant_profiles(
        project_root=args.project_root,
        global_skill_root=args.global_skill_root,
        overlay_path=args.overlay,
        output_path=args.output,
        generated_at=args.generated_at,
    )
    print(f"merchant_profiles={output['total_count']}")
    print(f"displayable_profiles={output['displayable_count']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
