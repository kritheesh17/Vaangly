export const isValidUpiQrUrl = (value: string | null | undefined): value is string => {
  const trimmedValue = value?.trim();
  if (!trimmedValue || trimmedValue.toLowerCase().includes('your-project-id')) {
    return false;
  }

  if (trimmedValue.startsWith('data:image/')) {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedValue);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
  } catch {
    return false;
  }
};
