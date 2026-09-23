import type { ToggleGroupOption } from "../../../components/ui/toggle-group";
import { ToggleGroupField } from "../../../components/ui/toggle-group";
import { type ThemePreference } from "../../pwa/theme-preference";
import { useThemePreference } from "../../pwa/use-theme-preference";

const appearanceOptions: ToggleGroupOption<ThemePreference>[] = [
  { label: "Auto", value: "auto" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" }
];

const preferenceDescriptions: Record<ThemePreference, string> = {
  auto: "Funes follows this device's appearance setting.",
  light: "Funes stays light, regardless of the system setting.",
  dark: "Funes stays dark, regardless of the system setting."
};

export function AppearanceSettings() {
  const [preference, updatePreference] = useThemePreference();

  return (
    <section
      className="appearance-settings form-stack"
      aria-labelledby="appearance-title"
    >
      <div>
        <h3 className="profile-section-title" id="appearance-title">
          Appearance
        </h3>
        <p className="setting-help">Choose how Funes looks on this device.</p>
      </div>
      <ToggleGroupField
        ariaLabel="Appearance"
        options={appearanceOptions}
        value={preference}
        onValueChange={updatePreference}
      />
      <p className="setting-help appearance-setting-status" aria-live="polite">
        {preferenceDescriptions[preference]}
      </p>
    </section>
  );
}
