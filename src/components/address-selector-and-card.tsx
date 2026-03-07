"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import {
  createLocation,
  getPlaceDetails,
  useOwnerLocations,
  useSearchPlaces,
} from "@/lib/geo/client";
import type { Location } from "@/lib/geo/schema";
import { useDebounce } from "@/lib/hooks";
import { cn } from "@/lib/utils";

type AddressSelectorAndCardProps = {
  onNewValidatedLocation: (location: Location | null) => void;
  ownerType: "user" | "event";
  ownerId: string;
  selectedLocation?: Location | null;
  disabled?: boolean;
};

export function AddressSelectorAndCard({
  onNewValidatedLocation,
  ownerType,
  ownerId,
  selectedLocation = null,
  disabled = false,
}: AddressSelectorAndCardProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isChanging, setIsChanging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebounce(query, 300);
  const { data: predictions } = useSearchPlaces(debouncedQuery);
  const { data: pastLocations } = useOwnerLocations(ownerType, ownerId);

  // Build suggestion chips: selected location first (if any), then past locations (deduplicated)
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    const result: Location[] = [];

    if (selectedLocation) {
      seen.add(selectedLocation.id);
      result.push(selectedLocation);
    }

    for (const loc of pastLocations ?? []) {
      if (!seen.has(loc.id)) {
        seen.add(loc.id);
        result.push(loc);
      }
    }

    return result;
  }, [selectedLocation, pastLocations]);

  const handleSelectPrediction = useCallback(
    async (placeId: string, mainText: string) => {
      setIsLoading(true);
      setShowDropdown(false);
      setQuery("");

      try {
        const details = await getPlaceDetails(placeId);
        const location = await createLocation({
          googlePlaceId: details.placeId,
          name: mainText,
          addressString: details.formattedAddress,
          street1: details.street1,
          street2: details.street2,
          city: details.city,
          state: details.state,
          zip: details.zip,
          latitude: details.latitude,
          longitude: details.longitude,
          ownerType,
          ownerId,
        });
        onNewValidatedLocation(location);
        setIsChanging(false);
      } catch (error) {
        console.error("Failed to get place details:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [onNewValidatedLocation, ownerType, ownerId]
  );

  const handleSelectSuggested = useCallback(
    (location: Location) => {
      onNewValidatedLocation(location);
      setIsChanging(false);
    },
    [onNewValidatedLocation]
  );

  const handleChange = useCallback(() => {
    setIsChanging(true);
    setQuery("");
  }, []);

  // If a location is selected and we're not in "changing" mode, show the card
  if (selectedLocation && !isChanging) {
    return (
      <div className="rounded-lg border bg-gray-50 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="font-medium">{selectedLocation.name}</div>
            <div className="text-sm text-gray-600">
              {selectedLocation.addressString}
            </div>
            {selectedLocation.city && selectedLocation.state && (
              <div className="text-sm text-gray-500">
                {selectedLocation.city}, {selectedLocation.state}{" "}
                {selectedLocation.zip}
              </div>
            )}
          </div>
          {!disabled && (
            <button
              type="button"
              onClick={handleChange}
              className="text-sm text-blue-600 hover:text-blue-800 shrink-0"
            >
              Change
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {suggestions.length > 0 && (
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {suggestions.map((loc) => {
            const isSelected = selectedLocation?.id === loc.id;
            return (
              <button
                key={loc.id}
                type="button"
                onClick={() => handleSelectSuggested(loc)}
                disabled={disabled}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  isSelected
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "bg-white hover:bg-gray-50"
                )}
              >
                {loc.name}
                {isSelected && (
                  <span className="ml-1.5 inline-flex items-center rounded bg-blue-200 px-1.5 py-0.5 text-xs text-blue-800">
                    current
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <Input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => setShowDropdown(true)}
        onBlur={() => {
          // Delay to allow clicking on dropdown items
          setTimeout(() => setShowDropdown(false), 200);
        }}
        placeholder="Search for an address..."
        disabled={disabled || isLoading}
      />

      {isLoading && (
        <div className="mt-2 text-sm text-gray-500">
          Loading place details...
        </div>
      )}

      {showDropdown && predictions && predictions.length > 0 && !isLoading && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border bg-white shadow-lg">
          {predictions.map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b last:border-b-0"
              onMouseDown={(e) => {
                // Prevent blur from firing before click
                e.preventDefault();
              }}
              onClick={() =>
                handleSelectPrediction(prediction.placeId, prediction.mainText)
              }
            >
              <div className="font-medium text-sm">{prediction.mainText}</div>
              <div className="text-xs text-gray-500">
                {prediction.secondaryText}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
