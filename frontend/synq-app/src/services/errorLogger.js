// src/services/errorLogger.js
import { analytics, logEvent, functions, auth } from './firebase';
import { httpsCallable } from 'firebase/functions';
import { isSafariMobile, isDesktopBrowser } from '../utils/browserDetection';

class ErrorLogger {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.deviceInfo = this.getDeviceInfo();
    this.isEnabled = true;
    
    // Initialize Cloud Function
    this.processMobileErrors = functions ? httpsCallable(functions, 'processMobileErrors') : null;
    
    // Set up global error handlers
    this.setupGlobalErrorHandlers();
    
    console.log('🔥 Firebase Error Logger initialized:', {
      sessionId: this.sessionId,
      deviceInfo: this.deviceInfo,
      cloudFunctionAvailable: !!this.processMobileErrors
    });
  }

  generateSessionId() {
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getDeviceInfo() {
    try {
      return {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        cookieEnabled: navigator.cookieEnabled,
        onLine: navigator.onLine,
        screen: {
          width: window.screen.width,
          height: window.screen.height,
          availWidth: window.screen.availWidth,
          availHeight: window.screen.availHeight
        },
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        isMobile: /Mobi|Android/i.test(navigator.userAgent),
        isSafariMobile: isSafariMobile(),
        isDesktop: isDesktopBrowser(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        connection: navigator.connection ? {
          effectiveType: navigator.connection.effectiveType,
          downlink: navigator.connection.downlink,
          rtt: navigator.connection.rtt
        } : null
      };
    } catch (error) {
      return { error: 'Failed to get device info' };
    }
  }

  getEnhancedDeviceInfo() {
    return {
      ...this.deviceInfo,
      currentUrl: window.location.href,
      referrer: document.referrer,
      screenResolution: `${window.screen.width}x${window.screen.height}`,
      connectionType: navigator.connection?.effectiveType || 'unknown',
      isMobile: this.deviceInfo.isMobile,
      isSafari: this.deviceInfo.isSafariMobile
    };
  }

  getCurrentUserInfo() {
    try {
      const currentUser = auth?.currentUser;
      return {
        userId: currentUser?.uid || null,
        email: currentUser?.email || null,
        isAnonymous: currentUser?.isAnonymous || false,
        emailVerified: currentUser?.emailVerified || false
      };
    } catch (error) {
      return {
        userId: null,
        email: null,
        isAnonymous: false,
        emailVerified: false
      };
    }
  }

  setupGlobalErrorHandlers() {
    // Handle unhandled JavaScript errors
    window.addEventListener('error', (event) => {
      this.logError('unhandled_js_error', {
        message: event.message,
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
        stack: event.error?.stack
      });
    });

    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError('unhandled_promise_rejection', {
        reason: event.reason?.toString(),
        stack: event.reason?.stack
      });
    });
  }

  logError(errorType, errorDetails = {}, severity = 'error') {
    if (!this.isEnabled) return;

    const timestamp = new Date().toISOString();
    const errorData = {
      type: errorType,
      message: errorDetails.error_message || errorDetails.message || 'Unknown error',
      code: errorDetails.error_code || errorDetails.code || null,
      stack: errorDetails.stack || errorDetails.error_stack || null,
      severity: severity,
      url: window.location.href,
      component: errorDetails.component || 'unknown',
      action: errorDetails.action || 'unknown',
      details: errorDetails
    };

    // 1. Log to Firebase Analytics (for metrics)
    if (analytics) {
      try {
        logEvent(analytics, 'app_error', {
          error_type: errorType,
          severity: severity,
          session_id: this.sessionId,
          timestamp: timestamp,
          user_agent: this.deviceInfo.userAgent,
          is_mobile: this.deviceInfo.isMobile,
          is_safari_mobile: this.deviceInfo.isSafariMobile,
          page_url: window.location.href,
          page_path: window.location.pathname,
          ...errorDetails
        });
      } catch (error) {
        console.error('❌ Failed to log error to Firebase Analytics:', error);
      }
    }

    // 2. Log to Cloud Function (for debugging)
    if (this.processMobileErrors) {
      try {
        this.processMobileErrors({
          errorData: errorData,
          deviceInfo: this.getEnhancedDeviceInfo(),
          userInfo: this.getCurrentUserInfo(),
          timestamp: timestamp
        }).then((result) => {
          console.log('📱 Error logged to Cloud Function:', result.data);
        }).catch((error) => {
          console.error('❌ Failed to log error to Cloud Function:', error);
        });
      } catch (error) {
        console.error('❌ Failed to call Cloud Function:', error);
      }
    }

    // 3. Console log for immediate debugging
    console.error(`🔥 Error logged (${severity}):`, {
      errorType,
      errorDetails,
      timestamp
    });
  }

  logAuthError(error, context = {}) {
    this.logError('auth_error', {
      error_code: error.code,
      error_message: error.message,
      ...context
    }, 'error');
  }

  logLocationError(error, context = {}) {
    this.logError('location_error', {
      error_code: error.code,
      error_message: error.message,
      ...context
    }, 'warning');
  }

  logDeepLinkError(context = {}) {
    this.logError('deep_link_error', context, 'warning');
  }

  logUserAction(action, context = {}, severity = 'info') {
    if (!this.isEnabled || !analytics) return;

    try {
      logEvent(analytics, 'user_action', {
        action_type: action,
        severity: severity,
        session_id: this.sessionId,
        timestamp: new Date().toISOString(),
        page_url: window.location.href,
        page_path: window.location.pathname,
        ...context
      });
    } catch (error) {
      console.error('❌ Failed to log user action:', error);
    }
  }

  logPerformance(metric, value, context = {}) {
    if (!this.isEnabled || !analytics) return;

    try {
      logEvent(analytics, 'performance_metric', {
        metric_name: metric,
        metric_value: value,
        session_id: this.sessionId,
        timestamp: new Date().toISOString(),
        ...context
      });
    } catch (error) {
      console.error('❌ Failed to log performance metric:', error);
    }
  }

  // Custom events for specific app features
  logRideCreation(rideData) {
    this.logUserAction('ride_created', {
      ride_id: rideData.id,
      destination: rideData.destination?.address,
      pickup_location: rideData.pickupLocation?.address,
      participant_count: rideData.participants?.length || 0
    });
  }

  logRideInvitation(invitationData) {
    this.logUserAction('ride_invitation_sent', {
      ride_id: invitationData.rideId,
      invitation_method: invitationData.method || 'sms',
      recipient_count: invitationData.recipients?.length || 1
    });
  }

  logLocationPermission(granted, method = 'unknown') {
    this.logUserAction('location_permission', {
      permission_granted: granted,
      request_method: method,
      is_safari_mobile: this.deviceInfo.isSafariMobile
    });
  }
}

// Create singleton instance
const errorLogger = new ErrorLogger();

export default errorLogger;
