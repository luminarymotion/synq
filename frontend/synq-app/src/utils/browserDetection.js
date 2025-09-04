/**
 * Browser detection utilities
 * Shared functions for detecting browser types and capabilities
 */

/**
 * Check if the current browser is Safari on mobile
 * @returns {boolean} True if Safari on mobile device
 */
export function isSafariMobile() {
  try {
    const userAgent = navigator.userAgent.toLowerCase();
    const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
    const isMobile = /iphone|ipad|ipod/.test(userAgent);
    return isSafari && isMobile;
  } catch (error) {
    return false;
  }
}

/**
 * Check if the current browser is a desktop browser
 * @returns {boolean} True if desktop browser
 */
export function isDesktopBrowser() {
  try {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    const isTablet = /ipad|android(?=.*\b(?!.*mobile))/i.test(userAgent);
    
    // Consider it desktop if not mobile and not tablet
    const isDesktop = !isMobile && !isTablet;
    
    return isDesktop;
  } catch (error) {
    return false; // Default to mobile
  }
}

/**
 * Check if the current browser is Safari (any platform)
 * @returns {boolean} True if Safari browser
 */
export function isSafari() {
  try {
    const userAgent = navigator.userAgent.toLowerCase();
    return /safari/.test(userAgent) && !/chrome/.test(userAgent);
  } catch (error) {
    return false;
  }
}

/**
 * Check if the current browser is mobile (any browser)
 * @returns {boolean} True if mobile device
 */
export function isMobile() {
  try {
    const userAgent = navigator.userAgent.toLowerCase();
    return /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  } catch (error) {
    return false;
  }
} 