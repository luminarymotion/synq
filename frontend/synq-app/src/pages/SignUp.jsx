// // src/pages/SignUp.jsx
// import { useState } from 'react';
// import { auth, db, RecaptchaVerifier } from '../firebase';
// import {
//   signInWithPhoneNumber,
//   onAuthStateChanged,
// } from 'firebase/auth';
// import {
//   doc,
//   setDoc,
// } from 'firebase/firestore';

// function SignUp() {
//   const [step, setStep] = useState(1); // 1 = phone, 2 = code, 3 = name/role
//   const [phone, setPhone] = useState('');
//   const [code, setCode] = useState('');
//   const [confirmationResult, setConfirmationResult] = useState(null);

//   const [userData, setUserData] = useState({
//     name: '',
//     role: 'passenger',
//   });

//   const handlePhoneSubmit = async (e) => {
//     e.preventDefault();

//     window.recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', {
//       size: 'invisible',
//       callback: () => {},
//     }, auth);

//     try {
//       const confirmation = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
//       setConfirmationResult(confirmation);
//       setStep(2);
//     } catch (err) {
//       alert('Failed to send code. Check number format.');
//       console.error(err);
//     }
//   };

//   const handleCodeVerify = async (e) => {
//     e.preventDefault();
//     try {
//       await confirmationResult.confirm(code);
//       setStep(3);
//     } catch (err) {
//       alert('Invalid code');
//       console.error(err);
//     }
//   };

//   const handleFinalSubmit = async (e) => {
//     e.preventDefault();

//     const user = auth.currentUser;
//     if (!user) return alert('User not signed in');

//     await setDoc(doc(db, 'users', user.uid), {
//       phone: user.phoneNumber,
//       name: userData.name,
//       role: userData.role,
//       createdAt: Date.now(),
//     });

//     alert('Account created!');
//     // TODO: redirect to profile or dashboard
//   };

//   return (
//     <div className="container mt-5" style={{ maxWidth: '400px' }}>
//       <h2 className="mb-4">Create Account</h2>

//       {step === 1 && (
//         <form onSubmit={handlePhoneSubmit}>
//           <input
//             type="tel"
//             className="form-control mb-3"
//             placeholder="+1 555 555 5555"
//             value={phone}
//             onChange={(e) => setPhone(e.target.value)}
//             required
//           />
//           <div id="recaptcha-container"></div>
//           <button type="submit" className="btn btn-primary w-100">
//             Send Code
//           </button>
//         </form>
//       )}

//       {step === 2 && (
//         <form onSubmit={handleCodeVerify}>
//           <input
//             type="text"
//             className="form-control mb-3"
//             placeholder="Enter 6-digit code"
//             value={code}
//             onChange={(e) => setCode(e.target.value)}
//             required
//           />
//           <button type="submit" className="btn btn-success w-100">
//             Verify Code
//           </button>
//         </form>
//       )}

//       {step === 3 && (
//         <form onSubmit={handleFinalSubmit}>
//           <input
//             type="text"
//             className="form-control mb-3"
//             placeholder="Your Name"
//             value={userData.name}
//             onChange={(e) => setUserData((prev) => ({ ...prev, name: e.target.value }))}
//             required
//           />
//           <select
//             className="form-select mb-3"
//             value={userData.role}
//             onChange={(e) => setUserData((prev) => ({ ...prev, role: e.target.value }))}
//           >
//             <option value="driver">Driver</option>
//             <option value="passenger">Passenger</option>
//           </select>
//           <button type="submit" className="btn btn-success w-100">
//             Create Account
//           </button>
//         </form>
//       )}
//     </div>
//   );
// }

// export default SignUp;

import { useState } from 'react';
import { auth, db, RecaptchaVerifier } from '../services/firebase';
import {
  signInWithPhoneNumber,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  doc,
  setDoc,
} from 'firebase/firestore';
