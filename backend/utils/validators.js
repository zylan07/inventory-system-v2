/**
 * Centralized Validation Utilities for Backend
 */

/**
 * Validates phone numbers.
 * Enforces:
 * - Digits only (after optional leading +)
 * - Optional leading +
 * - Length: 7 to 15 digits
 * @param {string} phone
 * @returns {boolean}
 */
function validatePhone(phone) {
  if (!phone) return false;
  const regex = /^\+?[0-9]{7,15}$/;
  return regex.test(phone.trim());
}

/**
 * Validates email addresses.
 * Enforces standard email formats.
 * @param {string} email
 * @returns {boolean}
 */
function validateEmail(email) {
  if (!email) return false;
  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return regex.test(email.trim());
}

/**
 * Sanitizes email addresses.
 * Trims whitespace and converts to lowercase.
 * @param {string} email
 * @returns {string}
 */
function sanitizeEmail(email) {
  if (!email) return '';
  return email.trim().toLowerCase();
}

module.exports = {
  validatePhone,
  validateEmail,
  sanitizeEmail
};
