interface BigDataCloudLocalityItem {
  name?: string;
  description?: string;
  order?: number;
  adminLevel?: number;
  isoCode?: string;
}

interface BigDataCloudReverseGeocodeResponse {
  latitude?: number;
  longitude?: number;
  road?: string;
  street?: string;
  neighbourhood?: string;
  suburb?: string;
  locality?: string;
  city?: string;
  district?: string;
  principalSubdivision?: string;
  postcode?: string;
  countryName?: string;
  localityInfo?: {
    administrative?: BigDataCloudLocalityItem[];
    informative?: BigDataCloudLocalityItem[];
  };
}

const cleanAdministrativeName = (name: string): string => {
  return name
    .replace(/\s+(district|taluk|subdivision|circle|zone)\b/gi, '')
    .trim();
};

const normalizeKey = (str: string): string => {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
};

export const extractAddressFromResponse = (data: BigDataCloudReverseGeocodeResponse): string => {
  const admin = data.localityInfo?.administrative || [];
  const info = data.localityInfo?.informative || [];

  // 1. Road / Street (from top-level or informative/administrative)
  let road = data.road || data.street;
  if (!road) {
    const roadItem = [...info, ...admin].find((item) => {
      const desc = item.description?.toLowerCase() || '';
      return (
        desc.includes('road') ||
        desc.includes('street') ||
        desc.includes('thoroughfare') ||
        desc.includes('highway') ||
        desc.includes('avenue')
      );
    });
    if (roadItem?.name) road = roadItem.name;
  }

  // 2. Neighbourhood / Suburb / Village (from top-level or administrative/informative)
  let neighbourhood = data.neighbourhood || data.suburb;
  if (!neighbourhood) {
    const sortedAdminDesc = [...admin].sort((a, b) => (b.order || 0) - (a.order || 0));
    const subItem = sortedAdminDesc.find((item) => {
      const desc = item.description?.toLowerCase() || '';
      return (
        desc.includes('neighborhood') ||
        desc.includes('neighbourhood') ||
        desc.includes('suburb') ||
        desc.includes('village') ||
        item.adminLevel === 9 ||
        item.adminLevel === 10
      );
    });
    if (subItem?.name) neighbourhood = subItem.name;
  }

  // 3. Locality / Town
  let locality = data.locality;
  if (!locality) {
    const locItem = admin.find((item) => {
      const desc = item.description?.toLowerCase() || '';
      return item.adminLevel === 6 || desc.includes('town') || desc.includes('locality');
    });
    if (locItem?.name) locality = locItem.name;
  }

  // 4. City / Taluk
  let city = data.city;
  if (!city) {
    const cityItem = admin.find((item) => item.adminLevel === 6 && item.name !== locality);
    if (cityItem?.name) city = cityItem.name;
  }

  // 5. District
  let district = data.district;
  if (!district) {
    const distItem = admin.find((item) => {
      const desc = item.description?.toLowerCase() || '';
      const name = item.name?.toLowerCase() || '';
      return item.adminLevel === 5 || desc.includes('district') || name.endsWith(' district');
    });
    if (distItem?.name) {
      district = cleanAdministrativeName(distItem.name);
    }
  } else {
    district = cleanAdministrativeName(district);
  }

  // 6. Principal Subdivision (State)
  let principalSubdivision = data.principalSubdivision;
  if (!principalSubdivision) {
    const stateItem = admin.find((item) => item.adminLevel === 4);
    if (stateItem?.name) principalSubdivision = stateItem.name;
  }

  // 7. Postcode
  let postcode = data.postcode;
  if (!postcode || !postcode.trim()) {
    const postItem = info.find((item) => {
      const desc = item.description?.toLowerCase() || '';
      return desc.includes('postal code') || desc.includes('postcode') || /^\d{5,6}$/.test(item.name?.trim() || '');
    });
    if (postItem?.name) postcode = postItem.name.trim();
  }

  // 8. Country
  let countryName = data.countryName;
  if (!countryName) {
    const countryItem = admin.find((item) => item.adminLevel === 2);
    if (countryItem?.name) countryName = countryItem.name;
  }

  // Assemble components avoiding duplicates
  const parts: string[] = [];

  const addPart = (val?: string | null, isAdministrativeHierarchy = false) => {
    if (!val || typeof val !== 'string') return;
    const clean = val.trim();
    if (!clean) return;

    const norm = normalizeKey(clean);
    const cleanBase = normalizeKey(
      clean.replace(/\s+(urban|rural|district|taluk|subdivision|circle|zone)\b/gi, '')
    );

    for (const existing of parts) {
      const existingNorm = normalizeKey(existing);
      const existingBase = normalizeKey(
        existing.replace(/\s+(urban|rural|district|taluk|subdivision|circle|zone)\b/gi, '')
      );
      if (existingNorm === norm) return;
      if (isAdministrativeHierarchy && cleanBase && existingBase && cleanBase === existingBase) {
        return;
      }
    }
    parts.push(clean);
  };

  // Add in logical granularity order (fine to coarse):
  addPart(road);
  addPart(neighbourhood);
  addPart(locality);
  addPart(city, true);
  addPart(district, true);

  // Region (State) & Postcode
  const stateClean = principalSubdivision?.trim();
  const postClean = postcode?.trim();

  if (stateClean) {
    const stateBase = normalizeKey(stateClean);
    const lastPart = parts[parts.length - 1];
    const lastNorm = lastPart ? normalizeKey(lastPart) : '';
    if (lastNorm === stateBase) {
      if (postClean) {
        parts[parts.length - 1] = `${lastPart} - ${postClean}`;
      }
    } else {
      if (postClean) {
        parts.push(`${stateClean} - ${postClean}`);
      } else {
        parts.push(stateClean);
      }
    }
  } else if (postClean) {
    parts.push(postClean);
  }

  // Fallback or non-India country
  if (countryName && countryName.trim()) {
    const cleanCountry = countryName.trim();
    if (parts.length === 0 || cleanCountry.toLowerCase() !== 'india') {
      addPart(cleanCountry);
    }
  }

  return parts.join(', ');
};

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

    const data = (await response.json()) as BigDataCloudReverseGeocodeResponse;
    const address = extractAddressFromResponse(data);
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
