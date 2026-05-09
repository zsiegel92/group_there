"use client";

import { SegmentedButtonGroup } from "@/components/ui/segmented-button-group";

const RIDESHARE_MULTIPLIER_OPTIONS = [10, 5, 3, 2, 1.5];

export function RideshareMultiplierControl({
  allowRideshare,
  costMultiplier,
  disabled = false,
  onChange,
}: {
  allowRideshare: boolean;
  costMultiplier: number;
  disabled?: boolean;
  onChange: (value: {
    allowRideshare: boolean;
    costMultiplier: number;
  }) => void;
}) {
  return (
    <div className="space-y-3 rounded border p-3">
      <div className="block text-sm font-medium">Rideshare cost multiplier</div>
      <SegmentedButtonGroup
        ariaLabel="Rideshare cost multiplier"
        items={[
          {
            id: "off",
            label: "∞X (off)",
            selected: !allowRideshare,
            disabled,
            onClick: () =>
              onChange({
                allowRideshare: false,
                costMultiplier,
              }),
          },
          ...RIDESHARE_MULTIPLIER_OPTIONS.map((multiplier) => ({
            id: String(multiplier),
            label: `${multiplier}X`,
            selected: allowRideshare && costMultiplier === multiplier,
            disabled,
            onClick: () =>
              onChange({
                allowRideshare: true,
                costMultiplier: multiplier,
              }),
          })),
        ]}
      />
    </div>
  );
}
