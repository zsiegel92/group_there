import { cn } from "@/lib/utils";

export type SegmentedButtonGroupItem = {
  id: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
};

export function SegmentedButtonGroup({
  items,
  ariaLabel,
  className,
}: {
  items: SegmentedButtonGroupItem[];
  ariaLabel: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex max-w-full overflow-x-auto rounded-full border border-gray-300 bg-white p-0.5",
        className
      )}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={item.onClick}
          disabled={item.disabled}
          aria-pressed={item.selected}
          className={cn(
            "shrink-0 cursor-pointer border-l border-gray-200 px-3 py-1.5 text-sm font-medium transition-colors first:border-l-0",
            "rounded-none first:rounded-l-full last:rounded-r-full",
            "disabled:cursor-not-allowed disabled:opacity-50",
            item.selected
              ? "bg-gray-900 text-white"
              : "text-gray-600 hover:bg-gray-100"
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
