// src/components/AccountCreation.jsx
import React, { useState } from 'react';
import { auth } from '../services/firebase';
import { signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup, RecaptchaVerifier } from 'firebase/auth';

const AccountCreation = () => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [isCodeSent, setIsCodeSent] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState(null);

  // Setup reCAPTCHA verifier
  const setupRecaptcha = (container) => {
    const recaptchaVerifier = new RecaptchaVerifier(container, {
      size: 'invisible',
    }, auth);
    recaptchaVerifier.render();
  };

  const handleSendCode = () => {
    const appVerifier = window.recaptchaVerifier;
    signInWithPhoneNumber(auth, phoneNumber, appVerifier)
      .then((confirmationResult) => {
        setConfirmationResult(confirmationResult);
        setIsCodeSent(true);
      })
      .catch((error) => {
        console.error("Error sending code", error);
      });
  };

  const handleVerifyCode = () => {
    confirmationResult.confirm(verificationCode)
      .then((result) => {
        const user = result.user;
        console.log('User signed in:', user);
        // Proceed with user sign-in
      })
      .catch((error) => {
        console.error("Error verifying code", error);
      });
  };

  const handleGoogleSignIn = () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
      .then((result) => {
        const user = result.user;
        console.log('Google user signed in:', user);
        // Proceed with user sign-in
      })
      .catch((error) => {
        console.error("Error signing in with Google:", error);
      });
  };

  return (
    <div className="container-fluid mt-5">
      <div className="row justify-content-center">
        <div className="col-12 col-md-10 col-lg-8">
          <div className="card shadow-lg">
            <div className="card-body p-4">
              <div className="row">
                <div className="col-md-6 p-4">
                  <h2 className="card-title text-center mb-4">Create Account</h2>
                  <div id="recaptcha-container"></div>
                  {!isCodeSent ? (
                    <div>
                      <div className="mb-4">
                        <label htmlFor="phoneNumber" className="form-label fs-5">Phone Number</label>
                        <input
                          id="phoneNumber"
                          type="tel"
                          className="form-control form-control-lg"
                          value={phoneNumber}
                          onChange={(e) => setPhoneNumber(e.target.value)}
                          placeholder="+1 555 555 5555"
                        />
                        <div className="form-text mt-2">Enter your phone number with country code</div>
                      </div>
                      <button 
                        className="btn btn-primary btn-lg w-100 py-3"
                        onClick={() => setupRecaptcha('recaptcha-container')}
                      >
                        Send Verification Code
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-4">
                        <label htmlFor="verificationCode" className="form-label fs-5">Verification Code</label>
                        <input
                          id="verificationCode"
                          type="text"
                          className="form-control form-control-lg"
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          placeholder="Enter 6-digit code"
                        />
                      </div>
                      <button 
                        className="btn btn-success btn-lg w-100 py-3"
                        onClick={handleVerifyCode}
                      >
                        Verify Code
                      </button>
                    </div>
                  )}
                </div>
                <div className="col-md-6 p-4 d-flex flex-column justify-content-center">
                  <div className="text-center mb-4">
                    <h3 className="mb-4">Or sign in with</h3>
                    <button 
                      className="btn btn-outline-primary btn-lg w-100 py-3 mb-3"
                      onClick={handleGoogleSignIn}
                    >
                      <i className="fab fa-google me-2"></i>
                      Sign in with Google
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountCreation;
