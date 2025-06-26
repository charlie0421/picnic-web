interface IpApiResponse {
  status: string;
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  zip: string;
  lat: number;
  lon: number;
  timezone: string;
  isp: string;
  org: string;
  as: string;
  query: string;
}

interface LocationInfo {
  country: string;
  countryCode: string;
  isKorea: boolean;
  ip: string;
}

// Cache location info for the session
let cachedLocation: LocationInfo | null = null;

/**
 * Detects user's location based on IP address
 * Uses ip-api.com free service (no API key required)
 */
export async function detectUserLocation(): Promise<LocationInfo | null> {
  // Return cached location if available
  if (cachedLocation) {
    return cachedLocation;
  }

  try {
    // Use ip-api.com for IP geolocation (free, no API key required)
    const response = await fetch('https://ip-api.com/json/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: IpApiResponse = await response.json();

    if (data.status !== 'success') {
      throw new Error('Failed to get location data');
    }

    const locationInfo: LocationInfo = {
      country: data.country,
      countryCode: data.countryCode,
      isKorea: data.countryCode === 'KR',
      ip: data.query,
    };

    // Cache the location info
    cachedLocation = locationInfo;

    return locationInfo;
  } catch (error) {
    console.error('Error detecting user location:', error);
    return null;
  }
}

/**
 * Clears the cached location info
 */
export function clearLocationCache() {
  cachedLocation = null;
}

/**
 * Determines the payment method based on location
 */
export function getPaymentMethodByLocation(location: LocationInfo | null): 'portone' | 'paypal' {
  // Default to PayPal for international users or if location detection fails
  if (!location) {
    return 'paypal';
  }

  // Use Port One for Korean users
  return location.isKorea ? 'portone' : 'paypal';
}

/**
 * Gets the currency based on payment method
 */
export function getCurrencyByPaymentMethod(paymentMethod: 'portone' | 'paypal'): 'KRW' | 'USD' {
  return paymentMethod === 'portone' ? 'KRW' : 'USD';
}