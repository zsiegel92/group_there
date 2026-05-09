"use client";

const allSteps = ["Unscheduled", "Scheduled", "Confirmed"] as const;

const allStepTextColors = [
  "text-red-600",
  "text-yellow-600",
  "text-green-600",
] as const;

export type EventStatusSize = "small" | "medium" | "large";

const gapClassNames = {
  small: "gap-0.5",
  medium: "gap-1",
  large: "gap-2",
} satisfies Record<EventStatusSize, string>;

const currentTextClassNames = {
  small: "text-[10px]",
  medium: "text-[11px]",
  large: "text-lg",
} satisfies Record<EventStatusSize, string>;

const secondaryTextClassNames = {
  small: "text-[8px]",
  medium: "text-[9px]",
  large: "text-xs",
} satisfies Record<EventStatusSize, string>;

export function EventStatus({
  scheduled,
  locked,
  eventStatusSize = "large",
  hideUnscheduled = false,
}: {
  scheduled: boolean;
  locked: boolean;
  eventStatusSize?: EventStatusSize;
  hideUnscheduled?: boolean;
}) {
  const fullIndex = locked ? 2 : scheduled ? 1 : 0;

  const steps = hideUnscheduled ? allSteps.slice(1) : allSteps;
  const stepTextColors = hideUnscheduled
    ? allStepTextColors.slice(1)
    : allStepTextColors;
  const currentStep = hideUnscheduled ? fullIndex - 1 : fullIndex;
  const gapClassName = gapClassNames[eventStatusSize];
  const currentTextClassName = currentTextClassNames[eventStatusSize];
  const secondaryTextClassName = secondaryTextClassNames[eventStatusSize];

  return (
    <div className={`inline-flex items-baseline ${gapClassName}`}>
      {steps.map((label, i) => {
        const isCurrent = i === currentStep;
        const isCompleted = i < currentStep;

        const currentClass = `${currentTextClassName} font-semibold ${stepTextColors[currentStep]}`;

        return (
          <div key={label} className={`flex items-baseline ${gapClassName}`}>
            <span
              className={
                isCurrent
                  ? currentClass
                  : isCompleted
                    ? `${secondaryTextClassName} text-gray-500`
                    : `${secondaryTextClassName} text-gray-300`
              }
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className={`${secondaryTextClassName} text-gray-300`}>
                &rarr;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
