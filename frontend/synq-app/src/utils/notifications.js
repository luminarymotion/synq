// notifications.js - Simple notification utility
import toast from 'react-hot-toast';

/**
 * Show a notification using react-hot-toast
 * @param {string} message - The message to display
 * @param {string} type - The type of notification ('success', 'error', 'warning', 'info')
 */
export const showNotification = (message, type = 'info') => {
  switch (type) {
    case 'success':
      toast.success(message);
      break;
    case 'error':
      toast.error(message);
      break;
    case 'warning':
      toast(message, {
        icon: '⚠️',
        style: {
          background: '#fff3cd',
          color: '#856404',
          border: '1px solid #ffeaa7'
        }
      });
      break;
    default:
      toast(message);
      break;
  }
};

/**
 * Show a success notification
 * @param {string} message - The success message
 */
export const showSuccess = (message) => {
  showNotification(message, 'success');
};

/**
 * Show an error notification
 * @param {string} message - The error message
 */
export const showError = (message) => {
  showNotification(message, 'error');
};

/**
 * Show a warning notification
 * @param {string} message - The warning message
 */
export const showWarning = (message) => {
  showNotification(message, 'warning');
}; 