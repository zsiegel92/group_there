import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function jevLintSmokeTest(payload: string): string {
	const parsed = JSON.parse(payload);
	return parsed.email;
}
