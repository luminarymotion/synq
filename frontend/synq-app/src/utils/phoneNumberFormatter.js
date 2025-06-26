/**
 * Formats a phone number to E.164 format for SMS compatibility
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - The formatted phone number in E.164 format
 */
export const formatPhoneNumberToE164 = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // If it's a 10-digit US number, add +1 prefix
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  } 
  // If it's 11 digits starting with 1, add + prefix
  else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  } 
  // If it already has a +, use as is
  else if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  } 
  // Default: assume US number and add +1
  else {
    return `+1${digitsOnly}`;
  }
};

/**
 * Formats a phone number for display (e.g., (214) 984-7766)
 * @param {string} phoneNumber - The phone number to format
 * @returns {string} - The formatted phone number for display
 */
export const formatPhoneNumberForDisplay = (phoneNumber) => {
  if (!phoneNumber) return '';
  
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // If it's a 10-digit number, format as (XXX) XXX-XXXX
  if (digitsOnly.length === 10) {
    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6)}`;
  }
  // If it's 11 digits starting with 1, format the last 10 digits
  else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    const lastTen = digitsOnly.slice(1);
    return `(${lastTen.slice(0, 3)}) ${lastTen.slice(3, 6)}-${lastTen.slice(6)}`;
  }
  // If it's in E.164 format, format the last 10 digits
  else if (phoneNumber.startsWith('+1') && phoneNumber.length === 12) {
    const lastTen = phoneNumber.slice(2);
    return `(${lastTen.slice(0, 3)}) ${lastTen.slice(3, 6)}-${lastTen.slice(6)}`;
  }
  
  // Return as is if we can't format it
  return phoneNumber;
};

/**
 * Validates if a phone number is in a valid format
 * @param {string} phoneNumber - The phone number to validate
 * @returns {object} - Object with isValid boolean and error message if invalid
 */
export const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) {
    return { isValid: false, error: 'Phone number is required' };
  }
  
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid US phone number (10 or 11 digits)
  if (digitsOnly.length === 10) {
    return { isValid: true, error: null };
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return { isValid: true, error: null };
  } else if (digitsOnly.length < 10) {
    return { isValid: false, error: `Phone number is too short. Expected 10 digits, got ${digitsOnly.length}` };
  } else if (digitsOnly.length > 11) {
    return { isValid: false, error: `Phone number is too long. Expected 10-11 digits, got ${digitsOnly.length}` };
  } else if (digitsOnly.length === 11 && !digitsOnly.startsWith('1')) {
    return { isValid: false, error: '11-digit numbers must start with 1 (US country code)' };
  } else {
    return { isValid: false, error: 'Invalid phone number format' };
  }
};

/**
 * Validates if a phone number is in a valid format (legacy function for backward compatibility)
 * @param {string} phoneNumber - The phone number to validate
 * @returns {boolean} - True if the phone number is valid
 */
export const isValidPhoneNumber = (phoneNumber) => {
  const validation = validatePhoneNumber(phoneNumber);
  return validation.isValid;
}; 