"use client";

const steps = ["Unscheduled", "Scheduled", "Confirmed"] as const;

const stepColors = ["bg-red-500", "bg-yellow-500", "bg-green-500"] as const;

export function EventStatus({
  scheduled,
  locked,
}: {
  scheduled: boolean;
  locked: boolean;
}) {
  const currentStep = locked ? 2 : scheduled ? 1 : 0;
  const activeColor = stepColors[currentStep]!;

  return (
    <div className="inline-flex items-start">
      {steps.map((label, i) => {
        const filled = i <= currentStep;
        const lineFilled = i < currentStep;

        return (
          <div key={label} className="flex items-center">
            {/* Circle + label stacked */}
            <div className="flex flex-col items-center">
              <div
                className={`w-3 h-3 rounded-full ${filled ? activeColor : "bg-gray-300"}`}
              />
              <span
                className={`text-xs mt-1 whitespace-nowrap ${filled ? "text-gray-900" : "text-gray-400"}`}
              >
                {label}
              </span>
            </div>
            {/* Connecting line */}
            {i < steps.length - 1 && (
              <div
                className={`w-16 h-0.5 mb-4 mx-1 ${lineFilled ? activeColor : "bg-gray-300"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
