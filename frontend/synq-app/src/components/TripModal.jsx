import React, { useState } from "react";
import { Car } from "lucide-react";
import { 
  Box, 
  Typography, 
  IconButton, 
  Modal,
  Fade,
  Backdrop
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

export default function TripModal({ 
  open, 
  onClose, 
  ride, 
  calculatedRoute, 
  onEnterDriveMode,
  onTollsToggle,
  onSeatsChange,
  tollsEnabled = false,
  selectedSeats = 3
}) {
  const [showSeatsDropdown, setShowSeatsDropdown] = useState(false);

  const seatsOptions = [1, 2, 3, 4, 5, 6, 7, 8];

  // Calculate distance and time from route data
  const distance = calculatedRoute?.totalDistance ? 
    calculatedRoute.totalDistance.toFixed(1) : 
    calculatedRoute?.routes?.[0]?.distance ? 
    calculatedRoute.routes[0].distance.toFixed(1) : 
    calculatedRoute?.routes?.[0]?.legs?.[0]?.distance ? 
    (calculatedRoute.routes[0].legs[0].distance / 1609.34).toFixed(1) : 
    '0.0';

  const duration = calculatedRoute?.totalDuration ? 
    Math.round(calculatedRoute.totalDuration) :
    calculatedRoute?.routes?.[0]?.duration ? 
    Math.round(calculatedRoute.routes[0].duration) :
    calculatedRoute?.routes?.[0]?.legs?.[0]?.duration ? 
    Math.round(calculatedRoute.routes[0].legs[0].duration / 60) :
    '0';

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAfterTransition
      BackdropComponent={Backdrop}
      BackdropProps={{
        timeout: 500,
      }}
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2
      }}
    >
      <Fade in={open}>
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 4,
            p: 3,
            boxShadow: 24,
            width: '100%',
            maxWidth: 'lg',
            position: 'relative',
            maxHeight: '90vh',
            overflow: 'auto'
          }}
        >
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
            <Typography variant="h6" fontWeight={600} color="text.primary">
              Trip Details
            </Typography>
            <IconButton
              onClick={onClose}
              size="small"
              sx={{ 
                color: 'text.secondary',
                '&:hover': { 
                  background: 'rgba(0,0,0,0.04)',
                  transform: 'scale(1.05)'
                },
                transition: 'all 0.2s ease'
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Grid Layout */}
          <Box sx={{ 
            display: 'grid', 
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' },
            gap: 2,
            mb: 3
          }}>
            {/* Avoid Tolls */}
            <Box
              onClick={() => onTollsToggle && onTollsToggle(!tollsEnabled)}
              sx={{
                p: 2,
                borderRadius: 3,
                cursor: onTollsToggle ? 'pointer' : 'default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease',
                border: 2,
                borderColor: tollsEnabled ? 'success.main' : 'grey.300',
                bgcolor: tollsEnabled ? 'success.50' : 'grey.50',
                '&:hover': onTollsToggle ? {
                  transform: 'translateY(-2px)',
                  boxShadow: 2,
                  borderColor: tollsEnabled ? 'success.main' : 'grey.400',
                } : {},
                minHeight: 100
              }}
            >
              <Car 
                size={24} 
                style={{ 
                  color: tollsEnabled ? '#2e7d32' : '#757575',
                  marginBottom: '8px'
                }} 
              />
              <Typography variant="body2" fontWeight={500} color="text.secondary">
                Avoid Tolls
              </Typography>
            </Box>

            {/* Seats */}
            <Box sx={{ position: 'relative' }}>
              <Box
                onClick={() => setShowSeatsDropdown(!showSeatsDropdown)}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s ease',
                  border: 2,
                  borderColor: 'grey.300',
                  bgcolor: 'grey.50',
                  '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: 2,
                    borderColor: 'grey.400',
                  },
                  minHeight: 100
                }}
              >
                <Typography variant="h4" fontWeight={700} color="text.primary" sx={{ lineHeight: 1, mb: 0.5 }}>
                  {selectedSeats}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  seats
                </Typography>
              </Box>
              
              {showSeatsDropdown && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    mt: 1,
                    bgcolor: 'background.paper',
                    border: 1,
                    borderColor: 'grey.300',
                    borderRadius: 2,
                    boxShadow: 3,
                    zIndex: 10,
                    maxHeight: 200,
                    overflow: 'auto'
                  }}
                >
                  {seatsOptions.map((num) => (
                    <Box
                      key={num}
                      onClick={() => {
                        onSeatsChange && onSeatsChange(num);
                        setShowSeatsDropdown(false);
                      }}
                      sx={{
                        px: 2,
                        py: 1.5,
                        cursor: 'pointer',
                        textAlign: 'center',
                        '&:hover': {
                          bgcolor: 'grey.100'
                        },
                        borderBottom: num < seatsOptions.length ? 1 : 0,
                        borderColor: 'grey.200'
                      }}
                    >
                      <Typography variant="body1" fontWeight={500}>
                        {num}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>

            {/* Miles */}
            <Box sx={{
              p: 2,
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: 2,
              borderColor: 'grey.300',
              bgcolor: 'grey.50',
              minHeight: 100
            }}>
              <Typography variant="h4" fontWeight={700} color="text.primary" sx={{ lineHeight: 1, mb: 0.5 }}>
                {distance}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                miles
              </Typography>
            </Box>

            {/* Minutes */}
            <Box sx={{
              p: 2,
              borderRadius: 3,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              border: 2,
              borderColor: 'grey.300',
              bgcolor: 'grey.50',
              position: 'relative',
              minHeight: 100
            }}>
              <Typography variant="h4" fontWeight={700} color="text.primary" sx={{ lineHeight: 1, mb: 0.5 }}>
                {duration}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                mins
              </Typography>
              
              {/* Start Button */}
              <Box
                onClick={onEnterDriveMode}
                sx={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  bgcolor: 'success.main',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  '&:hover': {
                    bgcolor: 'success.dark',
                    transform: 'scale(1.1)',
                    boxShadow: 3
                  },
                  transition: 'all 0.2s ease',
                  boxShadow: 2
                }}
              >
                ▶
              </Box>
            </Box>
          </Box>

          {/* Additional Info */}
          {ride && (
            <Box sx={{ 
              p: 2, 
              bgcolor: 'grey.50', 
              borderRadius: 2,
              border: 1,
              borderColor: 'grey.200'
            }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Destination: {ride.destination?.name || ride.destination?.address || 'Unknown'}
              </Typography>
              {ride.seatsAvailable && (
                <Typography variant="body2" color="text.secondary">
                  Available seats: {ride.seatsAvailable}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Fade>
    </Modal>
  );
}
