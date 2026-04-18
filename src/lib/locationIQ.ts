const LOCATIONIQ_BASE_URL = 'https://us1.locationiq.com/v1';

export type LocationIQGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

/**
 * Forward geocode: converts an address string into coordinates and a display label.
 */
export const geocodeWithLocationIQ = async (
  apiKey: string,
  addressQuery: string,
): Promise<LocationIQGeocodeResult> => {
  const url = `${LOCATIONIQ_BASE_URL}/search?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(addressQuery)}&format=json&limit=1`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`LocationIQ geocoding failed (${response.status}).`);
  }

  const data = (await response.json()) as Array<{
    lat?: string;
    lon?: string;
    display_name?: string;
  }>;

  const match = data?.[0];
  if (!match?.lat || !match?.lon) {
    throw new Error('No results found for this address.');
  }

  const lat = Number(match.lat);
  const lng = Number(match.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Unable to parse coordinates from LocationIQ response.');
  }

  return {
    lat,
    lng,
    label: (match.display_name || addressQuery).trim(),
  };
};

/**
 * Reverse geocode: converts coordinates into a human-readable address label.
 */
export const reverseGeocodeWithLocationIQ = async (
  apiKey: string,
  lat: number,
  lng: number,
): Promise<string> => {
  const url = `${LOCATIONIQ_BASE_URL}/reverse?key=${encodeURIComponent(apiKey)}&lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&format=json`;

  const response = await fetch(url);
  if (!response.ok) {
    return '';
  }

  const data = (await response.json()) as { display_name?: string };
  return (data.display_name || '').trim();
};
