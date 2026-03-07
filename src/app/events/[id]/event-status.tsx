"use client";

const steps = ["Unscheduled", "Scheduled", "Confirmed"] as const;

const stepTextColors = [
  "text-red-600",
  "text-yellow-600",
  "text-green-600",
] as const;

export function EventStatus({
  scheduled,
  locked,
}: {
  scheduled: boolean;
  locked: boolean;
}) {
  const currentStep = locked ? 2 : scheduled ? 1 : 0;

  return (
    <div className="inline-flex items-baseline gap-2">
      {steps.map((label, i) => {
        const isCurrent = i === currentStep;
        const isCompleted = i < currentStep;

        return (
          <div key={label} className="flex items-baseline gap-2">
            <span
              className={
                isCurrent
                  ? `text-lg font-semibold ${stepTextColors[currentStep]}`
                  : isCompleted
                    ? "text-xs text-gray-500"
                    : "text-xs text-gray-300"
              }
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <span className="text-xs text-gray-300">&rarr;</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
