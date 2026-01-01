/**
 * Preset Selector Component for the Proxy Calculator
 */

import { type FunctionalComponent } from "preact";
import type { UseCasePreset } from "./types";

interface PresetIconProps {
  icon: string;
}

const ICONS: Record<string, string> = {
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`,
  download: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
  shoe: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19.8 17.5a1 1 0 0 1-.5.9l-7.8 4.3a1 1 0 0 1-1.1 0L3.1 18.3a1 1 0 0 1-.2-1.4L8 10"></path><path d="M14 15l-3.4-6.8a1 1 0 0 1 .5-1.3l4.1-2a1 1 0 0 1 1.3.5l3.4 6.8"></path><path d="M2 13h5"></path></svg>`,
  verified: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"></path></svg>`,
  trending: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>`,
  group: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`,
};

export const PresetIcon: FunctionalComponent<PresetIconProps> = ({ icon }) => {
  return (
    <span
      class="preset-icon"
      dangerouslySetInnerHTML={{ __html: ICONS[icon] || ICONS.settings }}
    />
  );
};

interface PresetButtonProps {
  preset: UseCasePreset;
  isActive: boolean;
  onClick: () => void;
}

export const PresetButton: FunctionalComponent<PresetButtonProps> = ({
  preset,
  isActive,
  onClick,
}) => {
  return (
    <button
      class={`preset-button ${isActive ? "active" : ""}`}
      onClick={onClick}
      type="button"
      aria-pressed={isActive}
    >
      <PresetIcon icon={preset.icon} />
      <span class="preset-name">{preset.name}</span>
      <span class="preset-desc">{preset.description}</span>
      {preset.id !== "custom" && (
        <span class="preset-bandwidth">{preset.defaultBandwidth} GB</span>
      )}
    </button>
  );
};

interface PresetsProps {
  presets: readonly UseCasePreset[];
  selectedPreset: UseCasePreset;
  onPresetSelect: (preset: UseCasePreset) => void;
}

export const Presets: FunctionalComponent<PresetsProps> = ({
  presets,
  selectedPreset,
  onPresetSelect,
}) => {
  return (
    <div class="input-group">
      <label htmlFor="use-case">
        <span class="label-text">
          <span class="label-title">Use Case</span>
          <span class="label-desc">
            {selectedPreset.id !== "custom" && (
              <span class="recommended-for">
                Recommended for: {selectedPreset.name}
              </span>
            )}
          </span>
        </span>
      </label>
      <div class="preset-grid" role="group" aria-label="Use case presets">
        {presets.map((preset) => (
          <PresetButton
            key={preset.id}
            preset={preset}
            isActive={selectedPreset.id === preset.id}
            onClick={() => onPresetSelect(preset)}
          />
        ))}
      </div>
    </div>
  );
};
