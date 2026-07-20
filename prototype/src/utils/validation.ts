/**
 * Centralized Validation Utilities for Frontend
 */

/**
 * Validates phone numbers.
 * Enforces:
 * - Digits only (after optional leading +)
 * - Optional leading +
 * - Length: 7 to 15 digits
 */
export function validatePhone(phone: string): boolean {
  if (!phone) return false;
  const regex = /^\+?[0-9]{7,15}$/;
  return regex.test(phone.trim());
}

/**
 * Validates email addresses.
 */
export function validateEmail(email: string): boolean {
  if (!email) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Sanitizes email addresses.
 */
export function sanitizeEmail(email: string): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}
