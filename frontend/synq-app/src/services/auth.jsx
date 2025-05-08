import { createContext, useContext, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from './firebase';

const UserAuthContext = createContext();

export function UserAuthContextProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    // to do - login with username and phone number
    const logIn = async (email, password) => {
        // TODO: Implement login logic
        console.log('Login attempt with:', email, password);
    };

    const signUp = (email, password) => {
        return createUserWithEmailAndPassword(auth, email, password);
    };

    const login = (email, password) => {
        return signInWithEmailAndPassword(auth, email, password);
    };

    const logOut = () => {
        return signOut(auth);
    };

    const googleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
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
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            console.log("Auth", currentUser);
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
        googleSignIn
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