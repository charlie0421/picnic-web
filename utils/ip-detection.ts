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

interface IpifyGeoResponse {
  ip: string;
  country_code: string;
  country_name: string;
  region_code: string;
  region_name: string;
  city: string;
  zip_code: string;
  time_zone: string;
  latitude: number;
  longitude: number;
  metro_code: number;
}

interface IpapiCoResponse {
  ip: string;
  country_code: string;
  country_name: string;
  region_code: string;
  region: string;
  city: string;
  postal: string;
  latitude: number;
  longitude: number;
  timezone: string;
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
 * Try to get location from ipify.org (most reliable)
 */
async function tryIpify(): Promise<LocationInfo | null> {
  try {
    const response = await fetch('https://geo.ipify.org/api/v2/country?apiKey=at_free', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Ipify HTTP error! status: ${response.status}`);
    }

    const data: IpifyGeoResponse = await response.json();

    return {
      country: data.country_name,
      countryCode: data.country_code,
      isKorea: data.country_code === 'KR',
      ip: data.ip,
    };
  } catch (error) {
    console.warn('Ipify failed:', error);
    return null;
  }
}

/**
 * Try to get location from ipapi.co
 */
async function tryIpapiCo(): Promise<LocationInfo | null> {
  try {
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Ipapi.co HTTP error! status: ${response.status}`);
    }

    const data: IpapiCoResponse = await response.json();

    return {
      country: data.country_name,
      countryCode: data.country_code,
      isKorea: data.country_code === 'KR',
      ip: data.ip,
    };
  } catch (error) {
    console.warn('Ipapi.co failed:', error);
    return null;
  }
}

/**
 * Try to get location from ip-api.com (fallback)
 */
async function tryIpApi(): Promise<LocationInfo | null> {
  try {
    const response = await fetch('https://ip-api.com/json/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`IP-API HTTP error! status: ${response.status}`);
    }

    const data: IpApiResponse = await response.json();

    if (data.status !== 'success') {
      throw new Error('Failed to get location data from ip-api');
    }

    return {
      country: data.country,
      countryCode: data.countryCode,
      isKorea: data.countryCode === 'KR',
      ip: data.query,
    };
  } catch (error) {
    console.warn('IP-API failed:', error);
    return null;
  }
}

/**
 * Fallback: Detect location based on browser language and timezone
 */
function detectLocationFromBrowser(): LocationInfo | null {
  try {
    const language = navigator.language || (navigator as any).userLanguage;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    
    // Korean language or Korea timezone
    const isKoreanLanguage = language.startsWith('ko');
    const isKoreaTimezone = timezone === 'Asia/Seoul';
    const isKorea = isKoreanLanguage || isKoreaTimezone;

    return {
      country: isKorea ? 'South Korea' : 'Unknown',
      countryCode: isKorea ? 'KR' : 'XX',
      isKorea,
      ip: 'unknown',
    };
  } catch (error) {
    console.warn('Browser detection failed:', error);
    return null;
  }
}

/**
 * Detects user's location based on IP address with multiple fallbacks
 */
export async function detectUserLocation(): Promise<LocationInfo | null> {
  // Return cached location if available
  if (cachedLocation) {
    return cachedLocation;
  }

  // Try multiple IP geolocation services in order of reliability
  const services = [tryIpify, tryIpapiCo, tryIpApi];
  
  for (const service of services) {
    try {
      const result = await service();
      if (result) {
        cachedLocation = result;
        console.log('Location detected:', result);
        return result;
      }
    } catch (error) {
      console.warn('Service failed:', error);
      continue;
    }
  }

  // If all IP services fail, try browser detection
  console.warn('All IP services failed, trying browser detection');
  const browserResult = detectLocationFromBrowser();
  if (browserResult) {
    cachedLocation = browserResult;
    console.log('Location detected from browser:', browserResult);
    return browserResult;
  }

  console.error('All location detection methods failed');
  return null;
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