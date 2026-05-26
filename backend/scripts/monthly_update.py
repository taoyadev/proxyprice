#!/usr/bin/env python3
"""
ProxyPrice monthly data refresh control plane.

This script keeps ProxyPrice's local site data connected to the global
proxy-merchant-intel layer without making unsafe price guesses. It can:

1. create/update the project-local site overlay
2. map site providers to global merchant keys
3. flag missing bundles and price deltas for review
4. sync redirect fallbacks from the overlay
5. write a monthly review report
6. optionally run the existing CSV -> JSON pipeline after review

It intentionally does not scrape or infer missing prices. Any price change
candidate must come from structured merchant bundle evidence and is held for
review unless a later workflow explicitly accepts it.
"""
from __future__ import annotations

import argparse
import csv
import json
import logging
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

LOGGER = logging.getLogger(__name__)

DEFAULT_GLOBAL_SKILL_ROOT = Path("/Users/butterfly/.codex/skills/proxy-merchant-intel")
DEFAULT_DELTA_THRESHOLD = 0.50
HTTP_TIMEOUT_SECONDS = 12

PROXY_TYPE_ORDER = ["residential", "datacenter", "mobile", "isp", "other"]


@dataclass
class MerchantProductEvidence:
    merchant_key: str
    proxy_type: str
    pricing_model: str
    amount: Optional[float]
    unit: Optional[str]
    currency: Optional[str]
    source_url: str
    observed_at: Optional[str]


@dataclass
class MappingResult:
    provider_slug: str
    provider_name: str
    merchant_key: Optional[str]
    status: str
    publish_mode: str
    reasons: List[str] = field(default_factory=list)
    price_urls: List[str] = field(default_factory=list)
    evidence_urls: List[str] = field(default_factory=list)
    bundle_state: Optional[str] = None
    bundle_status: Optional[str] = None


@dataclass
class PriceDelta:
    provider_slug: str
    provider_name: str
    proxy_type: str
    current_min_per_gb: Optional[float]
    candidate_amount: Optional[float]
    candidate_unit: Optional[str]
    source_url: str
    observed_at: Optional[str]
    delta_ratio: Optional[float]
    status: str


@dataclass
class UrlCheckResult:
    url: str
    ok: bool
    status_code: Optional[int]
    error: Optional[str] = None


@dataclass
class RunSummary:
    run_date: str
    report_path: Path
    overlay_written: bool
    redirects_synced: bool
    pipeline_ran: bool
    pipeline_ok: bool
    mappings: List[MappingResult]
    deltas: List[PriceDelta]
    url_checks: List[UrlCheckResult]
    url_checks_ran: bool


def project_root_from_script() -> Path:
    return Path(__file__).resolve().parents[2]


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def normalize_token(value: str) -> str:
    return "".join(ch for ch in value.lower() if ch.isalnum())


def domain_from_url(url: str) -> Optional[str]:
    if not url:
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    host = parsed.netloc.lower()
    if not host:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host


def parent_domains(domain: str) -> Iterable[str]:
    parts = domain.split(".")
    for index in range(0, max(len(parts) - 1, 0)):
        yield ".".join(parts[index:])


def load_csv_rows(csv_path: Path) -> List[Dict[str, str]]:
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def provider_price_urls(pricing_rows: Sequence[Dict[str, str]]) -> Dict[str, List[str]]:
    urls_by_provider: Dict[str, List[str]] = {}
    for row in pricing_rows:
        provider = row.get("Name", "").strip()
        url = row.get("Price URL", "").strip()
        if not provider or not url:
            continue
        slug = slug_from_provider_name(provider)
        urls_by_provider.setdefault(slug, [])
        if url not in urls_by_provider[slug]:
            urls_by_provider[slug].append(url)
    return urls_by_provider


def slug_from_provider_name(name: str) -> str:
    cleaned = []
    previous_dash = False
    for char in name.lower():
        if char.isalnum():
            cleaned.append(char)
            previous_dash = False
        elif not previous_dash:
            cleaned.append("-")
            previous_dash = True
    return "".join(cleaned).strip("-")


class GlobalMerchantContext:
    def __init__(self, skill_root: Path):
        self.skill_root = skill_root
        references = skill_root / "references"
        self.index_path = references / "merchants" / "index.json"
        self.universe_path = references / "merchant-universe.v1.json"

        index_data = read_json(self.index_path)
        universe_data = read_json(self.universe_path)

        self.bundle_index: Dict[str, Dict[str, Any]] = {
            item["merchant_key"]: item
            for item in index_data.get("merchants", [])
            if item.get("merchant_key")
        }
        self.universe: Dict[str, Dict[str, Any]] = {
            item["merchant_key"]: item
            for item in universe_data.get("merchants", [])
            if item.get("merchant_key")
        }
        self.name_lookup: Dict[str, str] = {}
        self.domain_lookup: Dict[str, str] = {}
        self.products_by_merchant: Dict[str, List[MerchantProductEvidence]] = {}

        self._build_name_lookup()
        self._build_domain_lookup()
        self._load_bundle_products()

    def _add_name(self, value: Optional[str], merchant_key: str) -> None:
        if not value:
            return
        token = normalize_token(value)
        if token:
            self.name_lookup.setdefault(token, merchant_key)

    def _build_name_lookup(self) -> None:
        for merchant_key, item in self.universe.items():
            self._add_name(merchant_key, merchant_key)
            self._add_name(item.get("display_name"), merchant_key)
            for alias in item.get("aliases", []) or []:
                self._add_name(alias, merchant_key)
            for alias in item.get("legacy_aliases", []) or []:
                self._add_name(alias, merchant_key)

        for merchant_key, item in self.bundle_index.items():
            self._add_name(merchant_key, merchant_key)
            self._add_name(item.get("display_name"), merchant_key)
            for alias in item.get("aliases", []) or []:
                self._add_name(alias, merchant_key)

    def _build_domain_lookup(self) -> None:
        for merchant_key, item in self.bundle_index.items():
            for domain in item.get("domains", []) or []:
                cleaned = domain.lower()
                if cleaned.startswith("www."):
                    cleaned = cleaned[4:]
                self.domain_lookup.setdefault(cleaned, merchant_key)
            for url_key in ("homepage_url", "pricing_url"):
                domain = domain_from_url(item.get(url_key, ""))
                if domain:
                    self.domain_lookup.setdefault(domain, merchant_key)

    def _load_bundle_products(self) -> None:
        for merchant_key, item in self.bundle_index.items():
            merchant_json = item.get("merchant_json")
            if not merchant_json:
                continue
            merchant_path = self.skill_root / merchant_json
            if not merchant_path.exists():
                continue
            try:
                merchant_data = read_json(merchant_path)
            except json.JSONDecodeError:
                continue

            products = []
            for product in merchant_data.get("products", []) or []:
                source_url = product.get("source_url") or ""
                entry_price = product.get("entry_price") or {}
                if not source_url and isinstance(entry_price, dict):
                    source_url = entry_price.get("source_url") or ""
                products.append(
                    MerchantProductEvidence(
                        merchant_key=merchant_key,
                        proxy_type=product.get("proxy_type") or "other",
                        pricing_model=product.get("pricing_model") or "unknown",
                        amount=coerce_float(entry_price.get("amount")),
                        unit=entry_price.get("unit"),
                        currency=entry_price.get("currency"),
                        source_url=source_url,
                        observed_at=entry_price.get("observed_at"),
                    )
                )
            self.products_by_merchant[merchant_key] = products

    def infer_merchant_key(
        self,
        provider: Dict[str, Any],
        redirect_entry: Optional[Dict[str, Any]],
        price_urls: Sequence[str],
    ) -> Tuple[Optional[str], List[str]]:
        reasons: List[str] = []

        provider_id = provider.get("id") or provider.get("slug") or ""
        provider_name = provider.get("name") or provider_id

        if provider_id in self.universe or provider_id in self.bundle_index:
            return provider_id, ["matched provider id"]

        name_key = self.name_lookup.get(normalize_token(provider_name))
        if name_key:
            return name_key, ["matched provider display name or alias"]

        candidate_urls = [provider.get("website_url") or ""]
        if redirect_entry:
            candidate_urls.extend(
                [
                    redirect_entry.get("url") or "",
                    redirect_entry.get("affiliate") or "",
                ]
            )
        candidate_urls.extend(price_urls)

        for url in candidate_urls:
            domain = domain_from_url(url)
            if not domain:
                continue
            for candidate_domain in parent_domains(domain):
                merchant_key = self.domain_lookup.get(candidate_domain)
                if merchant_key:
                    reasons.append(f"matched domain {candidate_domain}")
                    return merchant_key, reasons

        return None, ["no global merchant match"]


def coerce_float(value: Any) -> Optional[float]:
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.replace(",", ""))
        except ValueError:
            return None
    return None


def default_overlay_entry(
    provider: Dict[str, Any],
    redirect_entry: Optional[Dict[str, Any]],
    inferred_key: Optional[str],
    infer_reasons: Sequence[str],
    has_bundle: bool,
) -> Dict[str, Any]:
    slug = provider["slug"]
    publish_mode = "auto" if inferred_key and has_bundle else "hold"
    notes = "; ".join(infer_reasons)
    return {
        "merchant_key": inferred_key,
        "include": True,
        "go_slug": slug,
        "url_override": None,
        "affiliate": redirect_entry.get("affiliate") if redirect_entry else None,
        "publish_mode": publish_mode,
        "notes": notes,
    }


def merge_overlay_entry(current: Dict[str, Any], default: Dict[str, Any]) -> Dict[str, Any]:
    merged = dict(default)
    for key, value in current.items():
        if key in merged:
            merged[key] = value
    return merged


def build_overlay(
    providers: Sequence[Dict[str, Any]],
    redirects: Dict[str, Any],
    price_urls_by_provider: Dict[str, List[str]],
    context: GlobalMerchantContext,
    existing_overlay: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    current_entries = (existing_overlay or {}).get("providers", {})
    overlay = {
        "schema_version": "1.0.0",
        "site_key": "proxyprice",
        "global_merchant_skill": str(context.skill_root),
        "providers": {},
    }

    for provider in providers:
        slug = provider["slug"]
        redirect_entry = redirects.get(slug)
        inferred_key, reasons = context.infer_merchant_key(
            provider,
            redirect_entry,
            price_urls_by_provider.get(slug, []),
        )
        default = default_overlay_entry(
            provider,
            redirect_entry,
            inferred_key,
            reasons,
            bool(inferred_key and inferred_key in context.bundle_index),
        )
        existing = current_entries.get(slug, {})
        overlay["providers"][slug] = merge_overlay_entry(existing, default)

    return overlay


def validate_overlay(overlay: Dict[str, Any], provider_slugs: Sequence[str]) -> List[str]:
    errors: List[str] = []
    if overlay.get("schema_version") != "1.0.0":
        errors.append("overlay schema_version must be 1.0.0")
    if overlay.get("site_key") != "proxyprice":
        errors.append("overlay site_key must be proxyprice")
    providers = overlay.get("providers")
    if not isinstance(providers, dict):
        errors.append("overlay providers must be an object")
        return errors

    expected = set(provider_slugs)
    actual = set(providers)
    for missing in sorted(expected - actual):
        errors.append(f"overlay missing provider entry: {missing}")
    for extra in sorted(actual - expected):
        errors.append(f"overlay references unknown provider: {extra}")

    for slug, entry in providers.items():
        if not isinstance(entry, dict):
            errors.append(f"overlay entry for {slug} must be an object")
            continue
        if entry.get("merchant_key") is not None and not isinstance(entry.get("merchant_key"), str):
            errors.append(f"overlay merchant_key for {slug} must be string or null")
        if not isinstance(entry.get("include"), bool):
            errors.append(f"overlay include for {slug} must be boolean")
        if not isinstance(entry.get("go_slug"), str) or not entry.get("go_slug"):
            errors.append(f"overlay go_slug for {slug} must be a non-empty string")
        if entry.get("publish_mode") not in {"auto", "hold", "manual"}:
            errors.append(f"overlay publish_mode for {slug} must be auto, hold, or manual")
        for url_field in ("url_override", "affiliate"):
            value = entry.get(url_field)
            if value is not None and not isinstance(value, str):
                errors.append(f"overlay {url_field} for {slug} must be string or null")
    return errors


def build_mappings(
    providers: Sequence[Dict[str, Any]],
    pricing_records: Sequence[Dict[str, Any]],
    overlay: Dict[str, Any],
    context: GlobalMerchantContext,
) -> List[MappingResult]:
    pricing_by_provider: Dict[str, List[Dict[str, Any]]] = {}
    for record in pricing_records:
        pricing_by_provider.setdefault(record.get("provider_id", ""), []).append(record)

    results: List[MappingResult] = []
    for provider in providers:
        slug = provider["slug"]
        entry = overlay["providers"].get(slug, {})
        merchant_key = entry.get("merchant_key")
        include = entry.get("include", True)
        publish_mode = entry.get("publish_mode", "hold")
        reasons = []

        if not include:
            status = "excluded"
            reasons.append("overlay include=false")
        elif not merchant_key:
            status = "onboarding_required"
            reasons.append("no merchant_key in overlay")
        elif merchant_key not in context.universe and merchant_key not in context.bundle_index:
            status = "onboarding_required"
            reasons.append("merchant_key missing from global universe and bundle index")
        elif merchant_key not in context.bundle_index:
            status = "mapped_universe_only"
            reasons.append("merchant exists in universe but has no merchant bundle")
        else:
            status = "mapped_with_bundle"
            reasons.append("merchant bundle available")

        if publish_mode != "auto" and status == "mapped_with_bundle":
            reasons.append(f"publish_mode={publish_mode}")

        records = pricing_by_provider.get(slug, [])
        price_urls = sorted(
            {
                record.get("price_url")
                for record in records
                if record.get("price_url")
            }
        )
        evidence_urls = []
        bundle_state = None
        if merchant_key and merchant_key in context.bundle_index:
            bundle = context.bundle_index[merchant_key]
            bundle_state = bundle.get("bundle_state")
            for url_key in ("homepage_url", "pricing_url"):
                if bundle.get(url_key):
                    evidence_urls.append(bundle[url_key])
            for product in context.products_by_merchant.get(merchant_key, []):
                if product.source_url:
                    evidence_urls.append(product.source_url)

        universe_entry = context.universe.get(merchant_key or "", {})
        results.append(
            MappingResult(
                provider_slug=slug,
                provider_name=provider["name"],
                merchant_key=merchant_key,
                status=status,
                publish_mode=publish_mode,
                reasons=reasons,
                price_urls=price_urls,
                evidence_urls=sorted(set(evidence_urls)),
                bundle_state=bundle_state,
                bundle_status=universe_entry.get("bundle_status"),
            )
        )

    return results


def calculate_price_deltas(
    pricing_records: Sequence[Dict[str, Any]],
    mappings: Sequence[MappingResult],
    context: GlobalMerchantContext,
    threshold: float,
) -> List[PriceDelta]:
    mapping_by_slug = {item.provider_slug: item for item in mappings}
    deltas: List[PriceDelta] = []

    for record in pricing_records:
        provider_slug = record.get("provider_id", "")
        mapping = mapping_by_slug.get(provider_slug)
        if not mapping or mapping.status != "mapped_with_bundle" or not mapping.merchant_key:
            continue

        products = [
            product
            for product in context.products_by_merchant.get(mapping.merchant_key, [])
            if product.proxy_type == record.get("proxy_type")
        ]
        if not products:
            continue

        current = coerce_float(record.get("min_price_per_gb"))
        gb_products = [
            product
            for product in products
            if product.unit and product.unit.upper() == "GB" and product.amount is not None
        ]
        if not gb_products:
            for product in products:
                if product.source_url:
                    deltas.append(
                        PriceDelta(
                            provider_slug=provider_slug,
                            provider_name=record.get("provider_name", provider_slug),
                            proxy_type=record.get("proxy_type", "other"),
                            current_min_per_gb=current,
                            candidate_amount=product.amount,
                            candidate_unit=product.unit,
                            source_url=product.source_url,
                            observed_at=product.observed_at,
                            delta_ratio=None,
                            status="hold_unit_mismatch",
                        )
                    )
            continue

        candidate = min(gb_products, key=lambda product: product.amount or 0)
        if current is None or current == 0:
            delta_ratio = None
            status = "hold_new_gb_candidate"
        else:
            delta_ratio = abs((candidate.amount or 0) - current) / current
            status = "large_delta_hold" if delta_ratio > threshold else "candidate_review"

        if current != candidate.amount:
            deltas.append(
                PriceDelta(
                    provider_slug=provider_slug,
                    provider_name=record.get("provider_name", provider_slug),
                    proxy_type=record.get("proxy_type", "other"),
                    current_min_per_gb=current,
                    candidate_amount=candidate.amount,
                    candidate_unit=candidate.unit,
                    source_url=candidate.source_url,
                    observed_at=candidate.observed_at,
                    delta_ratio=delta_ratio,
                    status=status,
                )
            )

    return deltas


def check_url(url: str) -> UrlCheckResult:
    headers = {
        "User-Agent": "ProxyPrice monthly data refresh (+https://proxyprice.com)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    for method in ("HEAD", "GET"):
        try:
            request = Request(url, method=method, headers=headers)
            with urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
                status_code = getattr(response, "status", None)
                ok = status_code is not None and 200 <= status_code < 400
                return UrlCheckResult(url=url, ok=ok, status_code=status_code)
        except HTTPError as exc:
            if method == "HEAD" and exc.code in {403, 405, 406}:
                continue
            return UrlCheckResult(url=url, ok=False, status_code=exc.code, error=str(exc))
        except (URLError, TimeoutError, ValueError) as exc:
            if method == "HEAD":
                continue
            return UrlCheckResult(url=url, ok=False, status_code=None, error=str(exc))
    return UrlCheckResult(url=url, ok=False, status_code=None, error="unreachable")


def run_url_checks(urls: Sequence[str], limit: int) -> List[UrlCheckResult]:
    results = []
    for url in urls[:limit]:
        results.append(check_url(url))
    return results


def sync_redirects(
    project_root: Path,
    providers: Sequence[Dict[str, Any]],
    overlay: Dict[str, Any],
) -> None:
    redirects_path = project_root / "front" / "src" / "data" / "redirects.json"
    current = read_json(redirects_path) if redirects_path.exists() else {}
    current_providers = current.get("providers", {})
    output = {"providers": {}}

    for provider in providers:
        slug = provider["slug"]
        entry = overlay["providers"].get(slug, {})
        current_redirect = current_providers.get(slug, {})
        url = (
            entry.get("url_override")
            or current_redirect.get("url")
            or provider.get("website_url")
        )
        affiliate = entry.get("affiliate")
        if affiliate is None:
            affiliate = current_redirect.get("affiliate")
        output["providers"][slug] = {
            "url": url,
            "affiliate": affiliate,
        }

    output["_comment"] = (
        "Generated from data/site-overlays/proxyprice.json. "
        "Set affiliate in the overlay, not in merchant bundles."
    )
    write_json(redirects_path, output)


def run_pipeline(project_root: Path) -> bool:
    result = subprocess.run(
        [sys.executable, str(project_root / "backend" / "scripts" / "run_pipeline.py")],
        cwd=str(project_root),
        text=True,
    )
    return result.returncode == 0


def report_table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> List[str]:
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |",
    ]
    for row in rows:
        lines.append("| " + " | ".join(cell.replace("\n", " ") for cell in row) + " |")
    return lines


def format_delta(value: Optional[float]) -> str:
    if value is None:
        return "n/a"
    return f"{value:.2%}"


def build_report(
    run_date: str,
    mappings: Sequence[MappingResult],
    deltas: Sequence[PriceDelta],
    url_checks: Sequence[UrlCheckResult],
    overlay_written: bool,
    redirects_synced: bool,
    pipeline_ran: bool,
    pipeline_ok: bool,
    url_checks_ran: bool,
    threshold: float,
) -> str:
    reviewed = len([item for item in mappings if item.status != "excluded"])
    mapped = len([item for item in mappings if item.status == "mapped_with_bundle"])
    missing = [
        item
        for item in mappings
        if item.status in {"onboarding_required", "mapped_universe_only"}
    ]
    held = [
        item
        for item in mappings
        if item.status != "mapped_with_bundle" or item.publish_mode != "auto"
    ]
    failed_fetches = [item for item in url_checks if not item.ok] if url_checks_ran else []
    large_deltas = [item for item in deltas if item.status == "large_delta_hold"]
    changed_providers = sorted({item.provider_slug for item in deltas})

    validation_status = "pass"
    validation_notes = []
    if missing:
        validation_notes.append(f"{len(missing)} providers need onboarding or bundle work")
    if not url_checks_ran:
        validation_notes.append("URL checks were not run")
    if failed_fetches:
        validation_notes.append(f"{len(failed_fetches)} URL checks failed")
    if large_deltas:
        validation_notes.append(f"{len(large_deltas)} large price deltas held")
    if pipeline_ran and not pipeline_ok:
        validation_status = "fail"
        validation_notes.append("pipeline failed")

    lines = [
        f"# ProxyPrice Monthly Data Refresh - {run_date[:7]}",
        "",
        "## Run Summary",
        "",
        f"- run_date: {run_date}",
        f"- providers_reviewed: {reviewed}",
        f"- merchants_mapped_with_bundle: {mapped}",
        f"- changed_providers: {len(changed_providers)}",
        f"- held_for_review: {len(held)}",
        f"- missing_bundles_or_onboarding: {len(missing)}",
        f"- failed_fetches: {len(failed_fetches) if url_checks_ran else 'not_checked'}",
        f"- large_price_deltas: {len(large_deltas)}",
        f"- validation_status: {validation_status}",
        "",
        "## Auto-Published Changes",
        "",
        f"- overlay_written: {str(overlay_written).lower()}",
        f"- redirects_synced: {str(redirects_synced).lower()}",
        f"- pipeline_ran: {str(pipeline_ran).lower()}",
        f"- pipeline_ok: {str(pipeline_ok).lower() if pipeline_ran else 'not_run'}",
        "",
        "## Validation Notes",
        "",
    ]
    if validation_notes:
        lines.extend([f"- {note}" for note in validation_notes])
    else:
        lines.append("- no blocking validation notes")

    lines.extend(
        [
            "",
            "## Changed Providers",
            "",
        ]
    )
    if changed_providers:
        lines.extend([f"- {slug}" for slug in changed_providers])
    else:
        lines.append("- none")

    lines.extend(["", "## Large Price Deltas", ""])
    if large_deltas:
        rows = []
        for item in large_deltas:
            rows.append(
                [
                    item.provider_slug,
                    item.proxy_type,
                    str(item.current_min_per_gb),
                    str(item.candidate_amount),
                    format_delta(item.delta_ratio),
                    item.source_url,
                ]
            )
        lines.extend(
            report_table(
                ["provider", "proxy_type", "current", "candidate", "delta", "source"],
                rows,
            )
        )
        lines.append(f"\nDelta threshold: {threshold:.0%}")
    else:
        lines.append("- none")

    lines.extend(["", "## Held For Review", ""])
    if held:
        rows = []
        for item in held:
            rows.append(
                [
                    item.provider_slug,
                    item.merchant_key or "",
                    item.status,
                    item.publish_mode,
                    "; ".join(item.reasons),
                ]
            )
        lines.extend(
            report_table(
                ["provider", "merchant_key", "status", "publish_mode", "reason"],
                rows,
            )
        )
    else:
        lines.append("- none")

    lines.extend(["", "## Missing Bundles", ""])
    if missing:
        rows = [
            [
                item.provider_slug,
                item.provider_name,
                item.merchant_key or "",
                item.status,
            ]
            for item in missing
        ]
        lines.extend(report_table(["provider", "name", "merchant_key", "status"], rows))
    else:
        lines.append("- none")

    lines.extend(["", "## Official Evidence URLs", ""])
    evidence_rows = []
    for item in mappings:
        if item.evidence_urls:
            evidence_rows.append(
                [
                    item.provider_slug,
                    item.merchant_key or "",
                    "<br>".join(item.evidence_urls[:6]),
                ]
            )
    if evidence_rows:
        lines.extend(report_table(["provider", "merchant_key", "urls"], evidence_rows))
    else:
        lines.append("- none")

    lines.extend(["", "## Failed Fetches", ""])
    if not url_checks_ran:
        lines.append("- not checked; rerun with `--check-urls` for live official-page probes")
    elif failed_fetches:
        rows = [
            [
                item.url,
                str(item.status_code or ""),
                item.error or "",
            ]
            for item in failed_fetches
        ]
        lines.extend(report_table(["url", "status_code", "error"], rows))
    else:
        lines.append("- none")

    lines.extend(["", "## Mapping Snapshot", ""])
    rows = [
        [
            item.provider_slug,
            item.provider_name,
            item.merchant_key or "",
            item.status,
            item.bundle_state or "",
            item.bundle_status or "",
        ]
        for item in mappings
    ]
    lines.extend(
        report_table(
            ["provider", "name", "merchant_key", "status", "bundle_state", "bundle_status"],
            rows,
        )
    )

    lines.append("")
    return "\n".join(lines)


def write_report(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def collect_url_check_targets(mappings: Sequence[MappingResult]) -> List[str]:
    seen = set()
    urls = []
    for item in mappings:
        for url in item.price_urls + item.evidence_urls:
            if url and url not in seen:
                seen.add(url)
                urls.append(url)
    return urls


def run_monthly_update(args: argparse.Namespace) -> RunSummary:
    project_root = args.project_root.resolve()
    run_date = args.run_date or date.today().isoformat()
    report_path = args.report or (project_root / "reports" / "monthly" / f"{run_date[:7]}.md")
    overlay_path = args.overlay or (project_root / "data" / "site-overlays" / "proxyprice.json")
    context = GlobalMerchantContext(args.global_skill_root)

    providers_data = read_json(project_root / "front" / "src" / "data" / "providers.json")
    pricing_data = read_json(project_root / "front" / "src" / "data" / "pricing.json")
    redirects_path = project_root / "front" / "src" / "data" / "redirects.json"
    redirects_data = read_json(redirects_path) if redirects_path.exists() else {"providers": {}}
    price_rows = load_csv_rows(project_root / "docs" / "Price.csv")

    providers = providers_data.get("providers", [])
    pricing_records = pricing_data.get("pricing", [])
    redirects = redirects_data.get("providers", {})
    price_urls = provider_price_urls(price_rows)

    existing_overlay = read_json(overlay_path) if overlay_path.exists() else None
    overlay = build_overlay(providers, redirects, price_urls, context, existing_overlay)
    overlay_errors = validate_overlay(overlay, [provider["slug"] for provider in providers])
    if overlay_errors:
        raise SystemExit("Overlay validation failed:\n- " + "\n- ".join(overlay_errors))

    if args.write_overlay:
        write_json(overlay_path, overlay)

    mappings = build_mappings(providers, pricing_records, overlay, context)
    deltas = calculate_price_deltas(
        pricing_records,
        mappings,
        context,
        threshold=args.delta_threshold,
    )

    url_checks: List[UrlCheckResult] = []
    if args.check_urls:
        url_checks = run_url_checks(
            collect_url_check_targets(mappings),
            limit=args.url_check_limit,
        )

    if args.sync_redirects:
        sync_redirects(project_root, providers, overlay)

    pipeline_ok = False
    if args.run_pipeline:
        pipeline_ok = run_pipeline(project_root)
        if not pipeline_ok and args.fail_on_pipeline_error:
            raise SystemExit("Pipeline failed")

    report = build_report(
        run_date=run_date,
        mappings=mappings,
        deltas=deltas,
        url_checks=url_checks,
        overlay_written=args.write_overlay,
        redirects_synced=args.sync_redirects,
        pipeline_ran=args.run_pipeline,
        pipeline_ok=pipeline_ok,
        url_checks_ran=args.check_urls,
        threshold=args.delta_threshold,
    )
    write_report(report_path, report)

    return RunSummary(
        run_date=run_date,
        report_path=report_path,
        overlay_written=args.write_overlay,
        redirects_synced=args.sync_redirects,
        pipeline_ran=args.run_pipeline,
        pipeline_ok=pipeline_ok,
        mappings=mappings,
        deltas=deltas,
        url_checks=url_checks,
        url_checks_ran=args.check_urls,
    )


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    project_root = project_root_from_script()
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=project_root)
    parser.add_argument("--global-skill-root", type=Path, default=DEFAULT_GLOBAL_SKILL_ROOT)
    parser.add_argument("--overlay", type=Path, default=None)
    parser.add_argument("--report", type=Path, default=None)
    parser.add_argument("--run-date", default=None, help="YYYY-MM-DD; defaults to today")
    parser.add_argument("--write-overlay", action="store_true")
    parser.add_argument("--sync-redirects", action="store_true")
    parser.add_argument("--run-pipeline", action="store_true")
    parser.add_argument("--fail-on-pipeline-error", action="store_true")
    parser.add_argument("--check-urls", action="store_true")
    parser.add_argument("--url-check-limit", type=int, default=120)
    parser.add_argument("--delta-threshold", type=float, default=DEFAULT_DELTA_THRESHOLD)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    args = parse_args(argv)
    summary = run_monthly_update(args)
    print(f"report={summary.report_path}")
    print(f"providers_reviewed={len(summary.mappings)}")
    print(f"price_candidates={len(summary.deltas)}")
    print(f"overlay_written={str(summary.overlay_written).lower()}")
    print(f"redirects_synced={str(summary.redirects_synced).lower()}")
    print(f"pipeline_ran={str(summary.pipeline_ran).lower()}")
    if summary.pipeline_ran:
        print(f"pipeline_ok={str(summary.pipeline_ok).lower()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
