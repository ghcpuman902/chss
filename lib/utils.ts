import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function parseUrlSegment(ambiguousUrlSegment: string | string[] | undefined): string {
  if (typeof ambiguousUrlSegment === 'string') {
    return ambiguousUrlSegment;
  } else if (Array.isArray(ambiguousUrlSegment)) {
    return ambiguousUrlSegment.join('/');
  } else {
    return '';
  }
}
