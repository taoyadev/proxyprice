/**
 * Proxy Price Calculator - Main Component
 *
 * A tool to compare proxy provider pricing based on bandwidth needs.
 * Users select use case presets, bandwidth, and proxy type to get recommendations.
 */

import { useSignal, useComputed } from "@preact/signals";
import { useEffect, useRef, useCallback } from "preact/hooks";
import { type FunctionalComponent } from "preact";
import type { ProxyType } from "../../lib/proxy-types";
import type { UseCasePreset } from "./types";
import { USE_CASE_PRESETS } from "./types";
import {
  computeRecommendations,
  computeFallbackProviders,
  getUrlParams,
  buildQueryString,
} from "./compute";
import { Inputs } from "./Inputs";
import { Results } from "./Results";

const Calculator: FunctionalComponent = () => {
  // Component-level signals (initialized with defaults, updated on client)
  const bandwidth = useSignal(50);
  const proxyType = useSignal<ProxyType>("residential");
  const selectedPreset = useSignal<UseCasePreset>(USE_CASE_PRESETS[0]);
  const isLoading = useSignal(false);
  const showShareUrl = useSignal(false);

  // Refs for timeout cleanup
  const bandwidthTimeoutRef = useRef<number | undefined>(undefined);
  const shareUrlTimeoutRef = useRef<number | undefined>(undefined);

  // Computed values using useComputed
  const recommendations = useComputed(() =>
    computeRecommendations(bandwidth.value, proxyType.value),
  );

  const fallbackProviders = useComputed(() =>
    computeFallbackProviders(proxyType.value),
  );

  // Initialize from URL params on client mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const urlParams = getUrlParams();
    if (urlParams.bandwidth) {
      bandwidth.value = parseInt(urlParams.bandwidth, 10);
    }
    if (urlParams.proxyType) {
      proxyType.value = urlParams.proxyType;
    }
    if (urlParams.useCase) {
      const preset = USE_CASE_PRESETS.find((p) => p.id === urlParams.useCase);
      if (preset) {
        selectedPreset.value = preset;
      }
    }
  }, []);

  // Update URL when state changes
  useEffect(() => {
    if (typeof window === "undefined") return;

    const queryString = buildQueryString(
      bandwidth.value,
      proxyType.value,
      selectedPreset.value,
    );

    const newUrl =
      queryString === ""
        ? window.location.pathname
        : `${window.location.pathname}?${queryString}`;

    // Update URL without triggering navigation
    window.history.replaceState({}, "", newUrl);
  }, [bandwidth.value, proxyType.value, selectedPreset.value]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (bandwidthTimeoutRef.current !== undefined) {
        clearTimeout(bandwidthTimeoutRef.current);
      }
      if (shareUrlTimeoutRef.current !== undefined) {
        clearTimeout(shareUrlTimeoutRef.current);
      }
    };
  }, []);

  // Apply preset handler
  const applyPreset = useCallback((preset: UseCasePreset) => {
    selectedPreset.value = preset;
    if (preset.id !== "custom") {
      bandwidth.value = preset.defaultBandwidth;
      if (preset.proxyType) {
        proxyType.value = preset.proxyType;
      }
    }
  }, []);

  // Handle bandwidth input with debouncing
  const handleBandwidthChange = useCallback((value: number) => {
    isLoading.value = true;
    bandwidth.value = value;
    if (selectedPreset.value.id !== "custom") {
      selectedPreset.value = USE_CASE_PRESETS[0]; // Switch to custom
    }

    if (bandwidthTimeoutRef.current !== undefined) {
      clearTimeout(bandwidthTimeoutRef.current);
    }
    bandwidthTimeoutRef.current = window.setTimeout(() => {
      isLoading.value = false;
    }, 300);
  }, []);

  // Copy share URL handler
  const copyShareUrl = useCallback(() => {
    if (typeof window === "undefined") return;
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      showShareUrl.value = true;
      if (shareUrlTimeoutRef.current !== undefined) {
        clearTimeout(shareUrlTimeoutRef.current);
      }
      shareUrlTimeoutRef.current = window.setTimeout(() => {
        showShareUrl.value = false;
      }, 2000);
    });
  }, []);

  return (
    <div class="calculator">
      <Inputs
        bandwidth={bandwidth.value}
        proxyType={proxyType.value}
        selectedPreset={selectedPreset.value}
        presets={USE_CASE_PRESETS}
        isLoading={isLoading.value}
        showCopied={showShareUrl.value}
        onBandwidthChange={handleBandwidthChange}
        onProxyTypeChange={(value) => (proxyType.value = value)}
        onPresetSelect={applyPreset}
        onShareClick={copyShareUrl}
      />

      <Results
        recommendations={recommendations.value}
        fallbackProviders={fallbackProviders.value}
        bandwidth={bandwidth.value}
        proxyType={proxyType.value}
        selectedPreset={selectedPreset.value}
      />
    </div>
  );
};

export default Calculator;
