/**
 * UUID Validation and Regular Expression Utility
 * Lightweight module decoupled from large mock datasets.
 */

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isValidUuid = (val?: string | null): boolean => Boolean(val && UUID_REGEX.test(val));
