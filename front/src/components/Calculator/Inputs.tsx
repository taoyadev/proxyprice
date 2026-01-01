/**
 * Input Controls Component for the Proxy Calculator
 */

import { type FunctionalComponent } from "preact";
import type { ProxyType } from "../../lib/proxy-types";
import type { UseCasePreset } from "./types";
import { Presets } from "./Presets";

interface BandwidthSliderProps {
  value: number;
  isLoading: boolean;
  onChange: (value: number) => void;
}

const QUICK_SELECT_VALUES = [10, 50, 100, 500, 1000] as const;

export const BandwidthSlider: FunctionalComponent<BandwidthSliderProps> = ({
  value,
  isLoading,
  onChange,
}) => {
  return (
    <div class="input-group">
      <label htmlFor="bandwidth">
        <span class="label-text">
          <span class="label-title">Monthly Bandwidth</span>
          <span class="input-value">{value} GB</span>
        </span>
      </label>
      <div class="slider-container">
        <input
          type="range"
          id="bandwidth"
          min="1"
          max="1000"
          step="1"
          value={value}
          onInput={(e) =>
            onChange(parseInt((e.target as HTMLInputElement).value))
          }
          disabled={isLoading}
          class={isLoading ? "loading" : ""}
          aria-label="Monthly bandwidth in gigabytes"
          aria-describedby="bandwidth-description"
        />
        <span id="bandwidth-description" class="sr-only">
          Select your estimated monthly bandwidth usage from 1 to 1000 gigabytes
        </span>
        <div
          class="quick-select"
          role="group"
          aria-label="Quick select bandwidth"
        >
          {QUICK_SELECT_VALUES.map((gb) => (
            <button
              key={gb}
              type="button"
              onClick={() => onChange(gb)}
              class={value === gb ? "active" : ""}
              aria-pressed={value === gb}
            >
              {gb === 1000 ? "1 TB" : `${gb} GB`}
            </button>
          ))}
        </div>
      </div>
      <div class="range-labels">
        <span>1 GB</span>
        <span>1000 GB</span>
      </div>
    </div>
  );
};

interface ProxyTypeOption {
  value: ProxyType;
  label: string;
  desc: string;
}

const PROXY_TYPE_OPTIONS: readonly ProxyTypeOption[] = [
  {
    value: "residential",
    label: "Residential",
    desc: "Real IP addresses",
  },
  {
    value: "datacenter",
    label: "Datacenter",
    desc: "Fast & affordable",
  },
  {
    value: "mobile",
    label: "Mobile",
    desc: "3G/4G/5G IPs",
  },
  {
    value: "isp",
    label: "ISP",
    desc: "Static residential",
  },
] as const;

interface ProxyTypeSelectorProps {
  value: ProxyType;
  onChange: (value: ProxyType) => void;
}

export const ProxyTypeSelector: FunctionalComponent<ProxyTypeSelectorProps> = ({
  value,
  onChange,
}) => {
  return (
    <div class="input-group">
      <label>Proxy Type</label>
      <div class="proxy-type-grid" role="group" aria-label="Proxy types">
        {PROXY_TYPE_OPTIONS.map((typeOption) => (
          <button
            key={typeOption.value}
            class={`proxy-type-button ${value === typeOption.value ? "active" : ""}`}
            onClick={() => onChange(typeOption.value)}
            type="button"
            aria-pressed={value === typeOption.value}
          >
            <span class="proxy-type-label">{typeOption.label}</span>
            <span class="proxy-type-desc">{typeOption.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface ShareButtonProps {
  showCopied: boolean;
  onClick: () => void;
}

export const ShareButton: FunctionalComponent<ShareButtonProps> = ({
  showCopied,
  onClick,
}) => {
  return (
    <div class="share-section">
      <button
        type="button"
        class={`share-button ${showCopied ? "copied" : ""}`}
        onClick={onClick}
        aria-live="polite"
      >
        {showCopied ? (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
          </>
        ) : (
          <>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <circle cx="18" cy="5" r="3"></circle>
              <circle cx="6" cy="12" r="3"></circle>
              <circle cx="18" cy="19" r="3"></circle>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
            </svg>
            Share Calculator Results
          </>
        )}
      </button>
    </div>
  );
};

interface InputsProps {
  bandwidth: number;
  proxyType: ProxyType;
  selectedPreset: UseCasePreset;
  presets: readonly UseCasePreset[];
  isLoading: boolean;
  showCopied: boolean;
  onBandwidthChange: (value: number) => void;
  onProxyTypeChange: (value: ProxyType) => void;
  onPresetSelect: (preset: UseCasePreset) => void;
  onShareClick: () => void;
}

export const Inputs: FunctionalComponent<InputsProps> = ({
  bandwidth,
  proxyType,
  selectedPreset,
  presets,
  isLoading,
  showCopied,
  onBandwidthChange,
  onProxyTypeChange,
  onPresetSelect,
  onShareClick,
}) => {
  return (
    <div class="calculator-inputs">
      <Presets
        presets={presets}
        selectedPreset={selectedPreset}
        onPresetSelect={onPresetSelect}
      />

      <BandwidthSlider
        value={bandwidth}
        isLoading={isLoading}
        onChange={onBandwidthChange}
      />

      <ProxyTypeSelector value={proxyType} onChange={onProxyTypeChange} />

      <ShareButton showCopied={showCopied} onClick={onShareClick} />
    </div>
  );
};
