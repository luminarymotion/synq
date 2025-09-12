import React, { useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  Typography,
  Button,
  IconButton,
  Switch,
  FormControlLabel,
  Slider,
  Divider,
  Stack,
  Chip
} from '@mui/material';
import {
  Close as CloseIcon,
  DirectionsCar as CarIcon,
  AttachMoney as TollIcon,
  People as PeopleIcon,
  Route as RouteIcon,
  AccessTime as TimeIcon,
  LocalGasStation as FuelIcon
} from '@mui/icons-material';

function TripModal({ 
  open, 
  onClose, 
  ride, 
  onEnterDriveMode, 
  onTollsToggle, 
  onSeatsChange, 
  tollsEnabled, 
  selectedSeats 
}) {
  const [localTollsEnabled, setLocalTollsEnabled] = useState(tollsEnabled);
  const [localSelectedSeats, setLocalSelectedSeats] = useState(selectedSeats);

  const handleTollsToggle = (event) => {
    const newValue = event.target.checked;
    setLocalTollsEnabled(newValue);
    onTollsToggle(newValue);
  };

  const handleSeatsChange = (event, newValue) => {
    setLocalSelectedSeats(newValue);
    onSeatsChange(newValue);
  };

  const handleEnterDriveMode = () => {
    onEnterDriveMode();
    onClose();
  };

  if (!ride) return null;

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          background: 'linear-gradient(135deg, #f9f6f2 0%, #f5f3e7 100%)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)'
        }
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        {/* Header */}
        <Box sx={{ 
          p: 3, 
          pb: 2, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.08)'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ 
              p: 1.5, 
              borderRadius: 2, 
              background: 'rgba(164, 117, 81, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <RouteIcon sx={{ color: '#a47551', fontSize: 24 }} />
            </Box>
            <Box>
              <Typography variant="h6" fontWeight={600} color="#4e342e">
                Trip Details
              </Typography>
              <Typography variant="body2" color="#7c5e48">
                Configure your trip settings
              </Typography>
            </Box>
          </Box>
          <IconButton 
            onClick={onClose}
            sx={{ 
              color: '#7c5e48',
              '&:hover': { 
                background: 'rgba(0,0,0,0.05)' 
              }
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>

        {/* Content */}
        <Box sx={{ p: 3 }}>
          {/* Trip Information */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} color="#4e342e" mb={2}>
              Trip Information
            </Typography>
            <Stack spacing={2}>
              <Box sx={{ 
                p: 2, 
                background: 'rgba(255,255,255,0.7)', 
                borderRadius: 2,
                border: '1px solid rgba(0,0,0,0.06)'
              }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <CarIcon sx={{ color: '#a47551', fontSize: 20 }} />
                  <Typography variant="body2" fontWeight={600} color="#4e342e">
                    Route
                  </Typography>
                </Box>
                <Typography variant="body2" color="#7c5e48">
                  {ride.origin?.name || ride.origin?.address || 'Starting point'} → {ride.destination?.name || ride.destination?.address || 'Destination'}
                </Typography>
              </Box>

              {ride.departureTime && (
                <Box sx={{ 
                  p: 2, 
                  background: 'rgba(255,255,255,0.7)', 
                  borderRadius: 2,
                  border: '1px solid rgba(0,0,0,0.06)'
                }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <TimeIcon sx={{ color: '#a47551', fontSize: 20 }} />
                    <Typography variant="body2" fontWeight={600} color="#4e342e">
                      Departure Time
                    </Typography>
                  </Box>
                  <Typography variant="body2" color="#7c5e48">
                    {ride.departureTime.toDate ? ride.departureTime.toDate().toLocaleString() : ride.departureTime}
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Trip Settings */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle1" fontWeight={600} color="#4e342e" mb={2}>
              Trip Settings
            </Typography>
            
            {/* Tolls Toggle */}
            <Box sx={{ 
              p: 2, 
              background: 'rgba(255,255,255,0.7)', 
              borderRadius: 2,
              border: '1px solid rgba(0,0,0,0.06)',
              mb: 2
            }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={localTollsEnabled}
                    onChange={handleTollsToggle}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': {
                        color: '#a47551',
                      },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                        backgroundColor: '#a47551',
                      },
                    }}
                  />
                }
                label={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TollIcon sx={{ color: '#a47551', fontSize: 20 }} />
                    <Typography variant="body2" fontWeight={500} color="#4e342e">
                      Include toll roads
                    </Typography>
                  </Box>
                }
              />
              <Typography variant="caption" color="#7c5e48" sx={{ ml: 4 }}>
                Allow routes that include toll roads for faster travel
              </Typography>
            </Box>

            {/* Seats Selection */}
            <Box sx={{ 
              p: 2, 
              background: 'rgba(255,255,255,0.7)', 
              borderRadius: 2,
              border: '1px solid rgba(0,0,0,0.06)'
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <PeopleIcon sx={{ color: '#a47551', fontSize: 20 }} />
                <Typography variant="body2" fontWeight={600} color="#4e342e">
                  Available Seats
                </Typography>
              </Box>
              <Box sx={{ px: 2 }}>
                <Slider
                  value={localSelectedSeats}
                  onChange={handleSeatsChange}
                  min={1}
                  max={8}
                  step={1}
                  marks={[
                    { value: 1, label: '1' },
                    { value: 2, label: '2' },
                    { value: 3, label: '3' },
                    { value: 4, label: '4' },
                    { value: 5, label: '5' },
                    { value: 6, label: '6' },
                    { value: 7, label: '7' },
                    { value: 8, label: '8' }
                  ]}
                  sx={{
                    '& .MuiSlider-thumb': {
                      color: '#a47551',
                    },
                    '& .MuiSlider-track': {
                      color: '#a47551',
                    },
                    '& .MuiSlider-rail': {
                      color: '#e0c9b3',
                    },
                    '& .MuiSlider-mark': {
                      color: '#a47551',
                    },
                    '& .MuiSlider-markLabel': {
                      color: '#7c5e48',
                      fontSize: '0.75rem'
                    }
                  }}
                />
              </Box>
              <Typography variant="caption" color="#7c5e48" sx={{ mt: 1, display: 'block' }}>
                Currently set to {localSelectedSeats} seat{localSelectedSeats !== 1 ? 's' : ''}
              </Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Action Buttons */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
            <Button
              variant="outlined"
              onClick={onClose}
              sx={{
                color: '#7c5e48',
                borderColor: '#e0c9b3',
                borderRadius: 2,
                fontWeight: 600,
                px: 3,
                py: 1
              }}
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              onClick={handleEnterDriveMode}
              startIcon={<CarIcon />}
              sx={{
                background: '#a47551',
                color: '#fff',
                borderRadius: 2,
                fontWeight: 600,
                px: 3,
                py: 1,
                '&:hover': {
                  background: '#8d6247'
                }
              }}
            >
              Start Driving
            </Button>
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default TripModal;
