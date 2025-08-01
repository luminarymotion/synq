import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useUserAuth } from '../services/auth';
import SimpleLoading from '../components/SimpleLoading';
import { formatPhoneNumberToE164, validatePhoneNumber } from '../utils/phoneNumberFormatter';
import LocationPermissionSettings from '../components/LocationPermissionSettings';
import { locationPermissionManager } from '../services/locationTrackingService';
// MUI imports
import Container from '@mui/material/Container';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import PersonIcon from '@mui/icons-material/Person';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import SecurityIcon from '@mui/icons-material/Security';

function Settings() {
  const { user, needsProfileSetup, setNeedsProfileSetup } = useUserAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [formData, setFormData] = useState({
    displayName: user?.displayName || '',
    phoneNumber: '',
    communityTags: []
  });

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    
    // Check for tab parameter in URL
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ['profile', 'location'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
    
    // Load existing profile data
    const loadProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setFormData(prev => ({
            ...prev,
            displayName: userData.profile?.displayName || prev.displayName,
            phoneNumber: userData.profile?.phoneNumber || prev.phoneNumber
          }));
        }
      } catch (err) {
        // Silent fail
      }
    };
    loadProfile();
  }, [user, navigate, location.search]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!formData.displayName || !formData.phoneNumber) {
        throw new Error('Please fill in all required fields');
      }
      const phoneValidation = validatePhoneNumber(formData.phoneNumber);
      if (!phoneValidation.isValid) {
        throw new Error(phoneValidation.error);
      }
      const formattedPhone = formatPhoneNumberToE164(formData.phoneNumber);
      if (!formattedPhone || !formattedPhone.startsWith('+1')) {
        throw new Error('Phone number formatting failed. Please check your input.');
      }
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const existingData = userDoc.exists() ? userDoc.data() : {};
      const updateData = {
        profile: {
          ...(existingData.profile || {}),
          displayName: formData.displayName.trim(),
          phoneNumber: formattedPhone,
          setupComplete: true,
          social: {
            ...(existingData.profile?.social || {}),
            communityTags: existingData.profile?.social?.communityTags || [],
            interests: existingData.profile?.social?.interests || [],
            preferredRoutes: existingData.profile?.social?.preferredRoutes || []
          }
        },
        reputation: {
          ...(existingData.reputation || {}),
          verification: {
            ...(existingData.reputation?.verification || {}),
            phone: true
          }
        },
        updatedAt: new Date().toISOString()
      };
      await updateDoc(userRef, updateData);
      setNeedsProfileSetup(false);
      await new Promise(resolve => setTimeout(resolve, 100));
      alert('Profile updated successfully!');
    } catch (err) {
      setError(err.message || 'Error updating profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <SimpleLoading message="Updating your profile..." size="medium" />;
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Profile Settings
            </Typography>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            <Box component="form" onSubmit={handleSubmit}>
              <Stack spacing={3}>
                <TextField
                  label="Display Name"
                  name="displayName"
                  value={formData.displayName}
                  onChange={handleChange}
                  required
                  fullWidth
                  inputProps={{ minLength: 2, maxLength: 30 }}
                  helperText="This is how other users will see you in the app"
                  disabled={loading}
                />
                <TextField
                  label="Phone Number"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleChange}
                  required
                  fullWidth
                  type="tel"
                  placeholder="e.g., 214-984-7766 or (214) 984-7766"
                  inputProps={{ pattern: '[\d\s\-\(\)]+' }}
                  helperText="Enter your 10-digit US phone number. We'll use this for SMS notifications and ride coordination."
                  disabled={loading}
                />
                <Divider sx={{ my: 2 }} />
                <Alert icon={<InfoOutlinedIcon fontSize="inherit" />} severity="info">
                  <Typography variant="subtitle1" fontWeight={600}>Coming Soon!</Typography>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    <li>Join communities based on your interests</li>
                    <li>Set your preferred routes</li>
                    <li>Connect with like-minded riders</li>
                  </ul>
                </Alert>
                <Button
                  type="submit"
                  variant="contained"
                  color="primary"
                  size="large"
                  disabled={loading}
                  fullWidth
                >
                  {loading ? 'Updating...' : 'Save Changes'}
                </Button>
              </Stack>
            </Box>
          </Box>
        );
      
      case 'location':
        return (
          <Box>
            <Typography variant="h6" sx={{ mb: 2 }}>
              Location Sharing Settings
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Configure your default location sharing preferences. You can override these settings for individual rides.
            </Typography>
            <LocationPermissionSettings
              userId={user?.uid}
              onSettingsChange={(newSettings) => {
                console.log('Location settings updated in Settings page:', newSettings);
              }}
            />
          </Box>
        );
      
      default:
        return null;
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: 8 }}>
      <Card elevation={3}>
        <CardContent>
          <Box display="flex" flexDirection={{ xs: 'column', md: 'row' }}>
            {/* Sidebar Navigation */}
            <Box minWidth={220} maxWidth={260} mr={{ md: 4 }} mb={{ xs: 3, md: 0 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>
                Settings
              </Typography>
              <List>
                <ListItem 
                  button 
                  selected={activeTab === 'profile'}
                  onClick={() => setActiveTab('profile')}
                >
                  <ListItemIcon>
                    <PersonIcon />
                  </ListItemIcon>
                  <ListItemText primary="Profile" />
                </ListItem>
                <ListItem 
                  button 
                  selected={activeTab === 'location'}
                  onClick={() => setActiveTab('location')}
                >
                  <ListItemIcon>
                    <LocationOnIcon />
                  </ListItemIcon>
                  <ListItemText primary="Location Sharing" />
                </ListItem>
                {/* Add more nav items here for future settings sections */}
              </List>
            </Box>
            {/* Main Content */}
            <Box flex={1}>
              {renderTabContent()}
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Container>
  );
}

export default Settings; 