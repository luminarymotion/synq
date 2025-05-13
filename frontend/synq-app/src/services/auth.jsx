import { createContext, useContext, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { createUserProfile } from './firebaseOperations';

const UserAuthContext = createContext();

export function UserAuthContextProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [needsProfileSetup, setNeedsProfileSetup] = useState(false);

    // Helper function to check if user needs profile setup
    const checkProfileSetup = async (user) => {
        if (!user) return false;

        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) return true;
            
            const userData = userDoc.data();
            // Check if essential profile fields are missing
            return !userData.displayName || !userData.phoneNumber;
        } catch (error) {
            console.error('Error checking profile setup:', error);
            return false;
        }
    };

    // Helper function to ensure user profile exists
    const ensureUserProfile = async (user) => {
        if (!user) return;

        try {
            // Check if user profile exists
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (!userDoc.exists()) {
                // Create basic profile if it doesn't exist
                const profileData = {
                    email: user.email,
                    displayName: user.displayName || user.email?.split('@')[0],
                    photoURL: user.photoURL,
                    phoneNumber: null, // Will be set during profile setup
                    preferences: {
                        notifications: true,
                        locationSharing: false
                    }
                };

                await createUserProfile(user.uid, profileData);
                console.log('Created basic profile for:', user.uid);
                setNeedsProfileSetup(true);
            } else {
                // Check if profile needs setup
                const needsSetup = await checkProfileSetup(user);
                setNeedsProfileSetup(needsSetup);
            }
        } catch (error) {
            console.error('Error ensuring user profile:', error);
        }
    };

    const logIn = async (email, password) => {
        // TODO: Implement login logic
        console.log('Login attempt with:', email, password);
    };

    const signUp = async (email, password, displayName) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserProfile(result.user);
        return result;
    };

    const login = async (email, password) => {
        const result = await signInWithEmailAndPassword(auth, email, password);
        await ensureUserProfile(result.user);
        return result;
    };

    const logOut = () => {
        setNeedsProfileSetup(false);
        return signOut(auth);
    };

    const googleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            await ensureUserProfile(result.user);
            return result;
        } catch (error) {
            console.error('Error signing in with Google:', error);
            throw error;
        }
    };

    // const startPhoneNumberSignIn = async (phoneNumber, recaptchaVerifier) => {
    //     try {
    //         if (!recaptchaVerifier) {
    //             throw new Error('reCAPTCHA not initialized');
    //         }

    //         console.log('Starting phone number sign in for:', phoneNumber);
            
    //         // Add a small delay to ensure reCAPTCHA is fully ready
    //         await new Promise(resolve => setTimeout(resolve, 500));
            
    //         const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
    //         console.log("SMS sent, confirmation result:", confirmationResult);
    //         return confirmationResult;
    //     } catch (error) {
    //         console.error("Error during phone sign in: ", error);
    //         throw error;
    //     }
    // };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("Auth state changed:", currentUser);
            if (currentUser) {
                await ensureUserProfile(currentUser);
            } else {
                setNeedsProfileSetup(false);
            }
            setUser(currentUser);
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const value = {
        user,
        logIn,
        signUp,
        login,
        logOut,
        googleSignIn,
        needsProfileSetup,
        setNeedsProfileSetup
    };

    return (
        <UserAuthContext.Provider value={value}>
            {!loading && children}
        </UserAuthContext.Provider>
    );
}

export function useUserAuth() {
    const context = useContext(UserAuthContext);
    if (!context) {
        throw new Error('useUserAuth must be used within a UserAuthContextProvider');
    }
    return context;
} 