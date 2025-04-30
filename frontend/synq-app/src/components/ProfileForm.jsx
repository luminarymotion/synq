import React, { useEffect, useRef, useState } from 'react';
import { auth } from '../services/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';

function ProfileForm() {
  const [name, setName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const recaptchaContainer = useRef(null);

  useEffect(() => {
    if (!window.recaptchaVerifier && recaptchaContainer.current) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainer.current, {
        size: 'normal',
        callback: () => console.log('reCAPTCHA resolved'),
        'expired-callback': () => console.warn('reCAPTCHA expired'),
      });

      window.recaptchaVerifier.render().then((widgetId) => {
        window.recaptchaWidgetId = widgetId;
      });
    }
  }, []);

  const formatPhoneNumber = (raw) => {
    const digits = raw.replace(/\D/g, '');
    return digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
  };

  const sendVerificationCode = async () => {
    try {
      const formattedNumber = formatPhoneNumber(phoneNumber);
      const result = await signInWithPhoneNumber(auth, formattedNumber, window.recaptchaVerifier);
      setConfirmationResult(result);
      alert('Verification code sent!');
    } catch (error) {
      console.error('Error sending code:', error);
      alert('Failed to send verification code. Please check the phone number format.');
    }
  };

  const verifyCode = async () => {
    try {
      if (!confirmationResult) {
        alert('No confirmation result. Please send the code first.');
        return;
      }

      const result = await confirmationResult.confirm(verificationCode);
      const user = result.user;
      alert(`Phone number verified for ${user.phoneNumber}`);
    } catch (error) {
      console.error('Error verifying code:', error);
      alert('Invalid verification code.');
    }
  };

  return (
    <div className="container py-5 d-flex justify-content-center">
      <div className="w-100" style={{ maxWidth: '600px' }}>
        <div className="card shadow">
          <div className="card-body p-4">
            <h2 className="text-center mb-4">Profile Setup</h2>

            <div className="mb-4">
              <label htmlFor="name" className="form-label">Your Name</label>
              <input
                id="name"
                type="text"
                className="form-control"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="mb-4">
              <label htmlFor="phone" className="form-label">Phone Number</label>
              <input
                id="phone"
                type="tel"
                className="form-control"
                placeholder="e.g. 4155552671"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            <button
              onClick={sendVerificationCode}
              className="btn btn-primary w-100 mb-4"
            >
              Send Verification Code
            </button>

            <div className="mb-4">
              <label htmlFor="code" className="form-label">Verification Code</label>
              <input
                id="code"
                type="text"
                className="form-control"
                placeholder="Enter verification code"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
              />
            </div>

            <button
              onClick={verifyCode}
              className="btn btn-success w-100"
            >
              Verify Code
            </button>

            <div id="recaptcha-container" ref={recaptchaContainer} className="mt-4"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileForm;
