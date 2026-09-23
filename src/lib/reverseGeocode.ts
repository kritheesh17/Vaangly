interface BigDataCloudReverseGeocodeResponse {
  locality?: string;
  city?: string;
  principalSubdivision?: string;
  countryName?: string;
  postcode?: string;
}

export const reverseGeocodeCoordinates = async (lat: number, lng: number): Promise<string> => {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=en`,
      { signal: controller.signal }
    );

    if (response.status === 429) {
      throw new Error('Address lookup is temporarily rate-limited. Please enter the address manually.');
    }
    if (!response.ok) {
      throw new Error('Unable to detect an address from this location.');
    }

    const data = await response.json() as BigDataCloudReverseGeocodeResponse;
    const parts = [
      data.locality || data.city,
      data.principalSubdivision,
      data.postcode,
      data.countryName,
    ].filter((part): part is string => Boolean(part?.trim()));
    const address = parts.join(', ');
    if (!address) {
      throw new Error('No readable address was returned for this location.');
    }
    return address;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Address lookup timed out. Please enter the address manually.');
    }
    throw error instanceof Error ? error : new Error('Unable to detect an address from this location.');
  } finally {
    window.clearTimeout(timeoutId);
  }
};
