import { createContext, useContext, useEffect, useState } from "react";
import {
    onAuthStateChanged,
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc, query, getDocs, where, collection } from 'firebase/firestore';
import { auth, db } from './firebase';
import { createUserProfile } from './firebaseOperations';
import locationTrackingService from './locationTrackingService';
import { checkUserMigrationStatus } from './migration';

const UserAuthContext = createContext();

export function UserAuthContextProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
    const [error, setError] = useState(null);

    // Helper function to check if user needs profile setup
    const checkProfileSetup = async (user) => {
        if (!user) {
            console.log('No user provided to checkProfileSetup');
            return false;
        }

        try {
            console.log('Checking profile setup for user:', user.uid);
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                console.log('User document does not exist, needs setup');
                return true;
            }
            
            const userData = userDoc.data();
            
            // First check if profile needs migration
            const migrationStatus = await checkUserMigrationStatus(user.uid);
            if (migrationStatus.needsMigration) {
                console.log('Profile needs migration, needs setup');
                return true;
            }

            // Only check setupComplete flag - if it's true, consider setup complete
            if (userData.profile?.setupComplete === true) {
                console.log('Profile setup marked as complete in Firestore');
                return false;
            }

            // If setupComplete is not true, check required fields
            const needsSetup = !userData.profile?.displayName || 
                              !userData.profile?.phoneNumber;
            
            console.log('Profile setup check result:', { 
                needsSetup, 
                hasDisplayName: !!userData.profile?.displayName,
                hasPhoneNumber: !!userData.profile?.phoneNumber,
                setupComplete: !!userData.profile?.setupComplete,
                migrationStatus: migrationStatus
            });

            // If profile is complete, mark it in Firestore
            if (!needsSetup) {
                await updateDoc(doc(db, 'users', user.uid), {
                    'profile.setupComplete': true,
                    updatedAt: new Date().toISOString()
                });
                console.log('Marked profile setup as complete in Firestore');
            }

            return needsSetup;
        } catch (error) {
            console.error('Error checking profile setup:', error);
            setError(error.message || 'An error occurred during profile setup check');
            return false;
        }
    };

    // Helper function to ensure user profile exists
    const ensureUserProfile = async (user) => {
        if (!user) {
            console.log('No user provided to ensureUserProfile');
            return;
        }

        try {
            console.log('Ensuring user profile exists for:', user.uid);
            
            // Check if user profile exists
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            
            if (!userDoc.exists()) {
                console.log('Creating basic profile for:', user.uid);
                // Create basic profile if it doesn't exist
                const profileData = {
                    profile: {
                        email: user.email,
                        displayName: user.displayName || user.email?.split('@')[0],
                        photoURL: user.photoURL,
                        phoneNumber: null,
                        bio: '',
                        location: null,
                        setupComplete: false, // Explicitly set to false for new profiles
                        social: {
                            interests: [],
                            preferredRoutes: [],
                            availability: {
                                monday: [],
                                tuesday: [],
                                wednesday: [],
                                thursday: [],
                                friday: [],
                                saturday: [],
                                sunday: []
                            }
                        }
                    },
                    settings: {
                        privacy: {
                            profileVisibility: 'friends',
                            showOnlineStatus: true,
                            showRideHistory: true,
                            allowRideInvites: true,
                            allowFriendRequests: true,
                            allowCommunityInvites: true
                        },
                        notifications: {
                            friendRequests: true,
                            rideInvites: true,
                            communityUpdates: true,
                            friendActivity: true
                        },
                        ridePreferences: {
                            music: true,
                            conversation: true,
                            carType: 'any',
                            smoking: false,
                            pets: false,
                            maxPassengers: 4
                        }
                    },
                    reputation: {
                        trustScore: 0,
                        rideCount: 0,
                        rating: 0,
                        badges: [],
                        verification: {
                            email: true,
                            phone: false
                        }
                    }
                };

                await createUserProfile(user.uid, profileData);
                console.log('Created basic profile for:', user.uid);
                setNeedsProfileSetup(true);
            } else {
                const userData = userDoc.data();
                
                // First check if profile needs migration
                const migrationStatus = await checkUserMigrationStatus(user.uid);
                console.log('Migration status:', migrationStatus);

                if (migrationStatus.needsMigration) {
                    console.log('Profile needs migration, redirecting to profile setup');
                    setNeedsProfileSetup(true);
                    return;
                }

                // Check setupComplete flag first
                if (userData.profile?.setupComplete === true) {
                    console.log('Profile setup is complete');
                    setNeedsProfileSetup(false);
                    return;
                }

                // If setupComplete is not true, check required fields
                const needsSetup = !userData.profile?.displayName || 
                                 !userData.profile?.phoneNumber;
                
                console.log('Profile setup check:', {
                    needsSetup,
                    hasDisplayName: !!userData.profile?.displayName,
                    hasPhoneNumber: !!userData.profile?.phoneNumber,
                    setupComplete: !!userData.profile?.setupComplete
                });

                setNeedsProfileSetup(needsSetup);
            }
        } catch (error) {
            console.error('Error ensuring user profile:', error);
            setError(error.message || 'Failed to set up user profile');
        }
    };

    const signUp = async (email, password, displayName) => {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await ensureUserProfile(result.user);
        return result;
    };

    const login = async (email, password) => {
        try {
            // First check if user exists in Firestore
            const userQuery = query(collection(db, 'users'), where('profile.email', '==', email));
            const querySnapshot = await getDocs(userQuery);
            
            if (querySnapshot.empty) {
                throw new Error('No account found with this email. Please sign up first.');
            }

            // If user exists in Firestore, proceed with Firebase Auth sign in
            const result = await signInWithEmailAndPassword(auth, email, password);
            await ensureUserProfile(result.user);
            return result;
        } catch (error) {
            console.error('Error during login:', error);
            // If the error is from Firebase Auth, provide a more user-friendly message
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                throw new Error('Invalid email or password. Please try again.');
            }
            throw error;
        }
    };

    const logOut = async () => {
        try {
            // Stop location tracking first
            locationTrackingService.stopTracking();
            setNeedsProfileSetup(false);
            await signOut(auth);
        } catch (error) {
            console.error('Error during logout:', error);
            throw error;
        }
    };

    const googleSignIn = async () => {
        const provider = new GoogleAuthProvider();
        try {
            const result = await signInWithPopup(auth, provider);
            
            // Check if user exists in Firestore
            const userDoc = await getDoc(doc(db, 'users', result.user.uid));
            
            if (!userDoc.exists()) {
                // If user doesn't exist, create a new profile
                console.log('Creating new profile for Google user:', result.user.uid);
                const profileData = {
                    profile: {
                        email: result.user.email,
                        displayName: result.user.displayName || result.user.email?.split('@')[0],
                        photoURL: result.user.photoURL,
                        phoneNumber: result.user.phoneNumber || null,
                        bio: '',
                        location: null,
                        setupComplete: false,
                        social: {
                            interests: [],
                            preferredRoutes: [],
                            availability: {
                                monday: [],
                                tuesday: [],
                                wednesday: [],
                                thursday: [],
                                friday: [],
                                saturday: [],
                                sunday: []
                            }
                        }
                    },
                    settings: {
                        privacy: {
                            profileVisibility: 'friends',
                            showOnlineStatus: true,
                            showRideHistory: true,
                            allowRideInvites: true,
                            allowFriendRequests: true,
                            allowCommunityInvites: true
                        },
                        notifications: {
                            friendRequests: true,
                            rideInvites: true,
                            communityUpdates: true,
                            friendActivity: true
                        },
                        ridePreferences: {
                            music: true,
                            conversation: true,
                            carType: 'any',
                            smoking: false,
                            pets: false,
                            maxPassengers: 4
                        }
                    },
                    reputation: {
                        trustScore: 0,
                        rideCount: 0,
                        rating: 0,
                        badges: [],
                        verification: {
                            email: true,
                            phone: false
                        }
                    }
                };

                await createUserProfile(result.user.uid, profileData);
                console.log('Created new profile for Google user');
            }
            
            await ensureUserProfile(result.user);
            return result;
        } catch (error) {
            console.error('Error signing in with Google:', error);
            setError(error.message || 'Failed to sign in with Google');
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
        console.log('Setting up auth state listener...');
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            console.log("Auth state changed:", { 
                uid: currentUser?.uid,
                email: currentUser?.email,
                displayName: currentUser?.displayName,
                providerId: currentUser?.providerData[0]?.providerId
            });

            try {
                if (currentUser) {
                    await ensureUserProfile(currentUser);
                } else {
                    console.log('No current user, resetting states');
                    setNeedsProfileSetup(false);
                }
                setUser(currentUser);
            } catch (error) {
                console.error('Error in auth state change handler:', error);
                setError(error.message || 'An error occurred during authentication');
            } finally {
                setLoading(false);
            }
        });

        return () => {
            console.log('Cleaning up auth state listener');
            unsubscribe();
        };
    }, []);

    const value = {
        user,
        signUp,
        login,
        logOut,
        googleSignIn,
        needsProfileSetup,
        setNeedsProfileSetup,
        error
    };

    if (loading) {
        console.log('Auth provider is loading...');
        return (
            <div className="auth-loading">
                <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                </div>
            </div>
        );
    }

    if (error) {
        console.error('Auth provider error:', error);
        return (
            <div className="auth-error">
                <div className="alert alert-danger" role="alert">
                    <h4 className="alert-heading">Authentication Error</h4>
                    <p>{error}</p>
                    <button 
                        className="btn btn-outline-danger mt-2"
                        onClick={() => window.location.reload()}
                    >
                        Reload Page
                    </button>
                </div>
            </div>
        );
    }

    return (
        <UserAuthContext.Provider value={value}>
            {children}
        </UserAuthContext.Provider>
    );
}

// Add styles for auth loading and error states
const styles = `
    .auth-loading {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.9);
        z-index: 9999;
    }

    .auth-error {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 9999;
        width: 90%;
        max-width: 500px;
        padding: 20px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    }

    .auth-error .alert {
        margin: 0;
    }

    .auth-error .alert-heading {
        margin-bottom: 10px;
    }

    .auth-error .btn {
        margin-top: 15px;
    }
`;

// Add the styles to the document
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

export function useUserAuth() {
    const context = useContext(UserAuthContext);
    if (!context) {
        throw new Error('useUserAuth must be used within a UserAuthContextProvider');
    }
    return context;
} 