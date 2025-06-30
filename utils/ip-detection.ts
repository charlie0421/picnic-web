interface LocationInfo {
  country: string;
  countryCode: string;
  isKorea: boolean;
  ip: string;
  source: 'browser' | 'ip-service';
}

// Cache location info for the session
let cachedLocation: LocationInfo | null = null;

/**
 * Primary method: Detect location based on browser language and timezone
 * This is more reliable and doesn't require external API calls
 */
function detectLocationFromBrowser(): LocationInfo {
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
      source: 'browser'
    };
  } catch (error) {
    console.warn('Browser detection failed, defaulting to international:', error);
    // Safe fallback: assume international user
    return {
      country: 'Unknown',
      countryCode: 'XX',
      isKorea: false,
      ip: 'unknown',
      source: 'browser'
    };
  }
}

/**
 * Optional: Try to get more precise location from IP service (only if needed)
 * This is completely optional and won't block the main functionality
 */
async function tryIpServiceOptional(): Promise<LocationInfo | null> {
  try {
    // Only try one reliable service with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null; // Silently fail
    }

    const data = await response.json();

    if (data.country_code) {
      return {
        country: data.country_name || 'Unknown',
        countryCode: data.country_code,
        isKorea: data.country_code === 'KR',
        ip: data.ip || 'unknown',
        source: 'ip-service'
      };
    }

    return null;
  } catch (error) {
    // Silently fail - this is optional
    return null;
  }
}

/**
 * Detects user's location with browser-first approach
 * Browser detection is primary, IP service is optional enhancement
 */
export async function detectUserLocation(): Promise<LocationInfo> {
  // Return cached location if available
  if (cachedLocation) {
    return cachedLocation;
  }

  // Primary method: Browser-based detection (always works)
  const browserResult = detectLocationFromBrowser();
  cachedLocation = browserResult;

  // Optional enhancement: Try to get more precise location from IP service
  // This runs in the background and doesn't block the main functionality
  if (browserResult.source === 'browser') {
    tryIpServiceOptional().then(ipResult => {
      if (ipResult) {
        // Update cache with more precise location if available
        cachedLocation = ipResult;
        console.log('Enhanced location with IP service:', ipResult);
      }
    }).catch(() => {
      // Silently ignore IP service failures
    });
  }

  console.log('Location detected:', browserResult);
  return browserResult;
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