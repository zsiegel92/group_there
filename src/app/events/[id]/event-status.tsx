"use client";

const allSteps = ["Unscheduled", "Scheduled", "Confirmed"] as const;

const allStepTextColors = [
  "text-red-600",
  "text-yellow-600",
  "text-green-600",
] as const;

export function EventStatus({
  scheduled,
  locked,
  compact = false,
  hideUnscheduled = false,
}: {
  scheduled: boolean;
  locked: boolean;
  compact?: boolean;
  hideUnscheduled?: boolean;
}) {
  const fullIndex = locked ? 2 : scheduled ? 1 : 0;

  const steps = hideUnscheduled ? allSteps.slice(1) : allSteps;
  const stepTextColors = hideUnscheduled
    ? allStepTextColors.slice(1)
    : allStepTextColors;
  const currentStep = hideUnscheduled ? fullIndex - 1 : fullIndex;

  return (
    <div
      className={`inline-flex items-baseline ${compact ? "gap-1" : "gap-2"}`}
    >
      {steps.map((label, i) => {
        const isCurrent = i === currentStep;
        const isCompleted = i < currentStep;

        const currentClass = compact
          ? `text-xs font-semibold ${stepTextColors[currentStep]}`
          : `text-lg font-semibold ${stepTextColors[currentStep]}`;

        return (
          <div
            key={label}
            className={`flex items-baseline ${compact ? "gap-1" : "gap-2"}`}
          >
            <span
              className={
                isCurrent
                  ? currentClass
                  : isCompleted
                    ? `${compact ? "text-[10px]" : "text-xs"} text-gray-500`
                    : `${compact ? "text-[10px]" : "text-xs"} text-gray-300`
              }
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span
                className={`${compact ? "text-[10px]" : "text-xs"} text-gray-300`}
              >
                &rarr;
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
