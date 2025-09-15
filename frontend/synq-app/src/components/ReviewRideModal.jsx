import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  IconButton,
  CircularProgress,
  ButtonGroup
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

function ReviewRideModal({ 
  isOpen, 
  onClose, 
  rideData, 
  onConfirmCreate,
  isCreating = false 
}) {
  const [formData, setFormData] = useState({
    rideTitle: '',
    destination: '',
    rideTiming: 'now', // 'now' or 'planned'
    plannedDateTime: '',
    description: '',
    role: 'passenger', // 'passenger' or 'driver'
    carSeats: 0,
    additionalNotes: ''
  });

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && rideData) {
      setFormData({
        rideTitle: rideData.name || `Ride to ${rideData.destination?.address || rideData.destination?.name || ''}`,
        destination: rideData.destination?.address || rideData.destination?.name || '',
        rideTiming: rideData.plannedDateTime ? 'planned' : 'now',
        plannedDateTime: rideData.plannedDateTime || '',
        description: rideData.description || '',
        role: rideData.creator?.role || 'passenger', // Use the role from creator, default to passenger
        carSeats: rideData.creator?.carSeats || 0,
        additionalNotes: rideData.additionalNotes || ''
      });
    }
  }, [isOpen, rideData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (onConfirmCreate) {
      onConfirmCreate(formData);
    }
  };

  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return '';
    const date = new Date(dateTimeString);
    return date.toLocaleString();
  };

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
          maxHeight: '95vh',
          margin: 1,
          minHeight: '600px'
        }
      }}
    >
      <DialogTitle sx={{ 
        pb: 1,
        borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Typography variant="h6" component="div">
          Review Ride Details
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ ml: 1 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      
      <DialogContent sx={{ p: 3 }}>
        <br></br>
        <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Ride Title */}
          <TextField
            fullWidth
            label="Ride Title"
            value={formData.rideTitle}
            onChange={(e) => handleInputChange('rideTitle', e.target.value)}
            placeholder="Enter ride title"
            required
            size="small"
          />

          {/* Destination */}
          <TextField
            fullWidth
            label="Destination"
            value={formData.destination}
            onChange={(e) => handleInputChange('destination', e.target.value)}
            placeholder="Enter destination"
            required
            size="small"
          />

          {/* Ride Type */}
          <Box>
            <Typography variant="body2" sx={{ mb: 1, fontWeight: 500 }}>
              Ride Type
            </Typography>
            <ButtonGroup fullWidth size="small" sx={{ mb: 1 }}>
              <Button
                variant={formData.rideTiming === 'now' ? 'contained' : 'outlined'}
                onClick={() => handleInputChange('rideTiming', 'now')}
                sx={{ borderRadius: '8px 0 0 8px' }}
              >
                Ride now
              </Button>
              <Button
                variant={formData.rideTiming === 'planned' ? 'contained' : 'outlined'}
                onClick={() => handleInputChange('rideTiming', 'planned')}
                sx={{ borderRadius: '0 8px 8px 0' }}
              >
                Plan a Ride
              </Button>
            </ButtonGroup>
            
            {/* Planned DateTime Input */}
            {formData.rideTiming === 'planned' && (
              <TextField
                fullWidth
                type="datetime-local"
                value={formData.plannedDateTime}
                onChange={(e) => handleInputChange('plannedDateTime', e.target.value)}
                required={formData.rideTiming === 'planned'}
                size="small"
                InputLabelProps={{
                  shrink: true,
                }}
              />
            )}
          </Box>

          {/* Description */}
          <TextField
            fullWidth
            label="Description"
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            placeholder="Enter ride description"
            multiline
            rows={2}
            size="small"
          />

          {/* Role Selection */}
          <FormControl fullWidth size="small">
            <InputLabel>Your Role</InputLabel>
            <Select
              value={formData.role}
              onChange={(e) => handleInputChange('role', e.target.value)}
              label="Your Role"
            >
              <MenuItem value="passenger">Passenger</MenuItem>
              <MenuItem value="driver">Driver</MenuItem>
            </Select>
          </FormControl>

          {/* Car Seats */}
          {formData.role === 'driver' && (
            <FormControl fullWidth size="small">
              <InputLabel>Car Seats Available</InputLabel>
              <Select
                value={formData.carSeats}
                onChange={(e) => handleInputChange('carSeats', parseInt(e.target.value))}
                label="Car Seats Available"
              >
                {Array.from({ length: 10 }, (_, i) => (
                  <MenuItem key={i} value={i}>{i}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Additional Notes */}
          <TextField
            fullWidth
            label="Additional Notes"
            value={formData.additionalNotes}
            onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
            placeholder="Any additional notes or special instructions"
            multiline
            rows={2}
            size="small"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ 
        p: 2,
        borderTop: '1px solid rgba(0, 0, 0, 0.08)',
        gap: 1
      }}>
        <Button
          onClick={onClose}
          disabled={isCreating}
          sx={{ borderRadius: '8px' }}
        >
          Cancel
        </Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={isCreating || !formData.rideTitle || !formData.destination}
          startIcon={isCreating ? <CircularProgress size={16} /> : null}
          sx={{ borderRadius: '8px' }}
        >
          {isCreating ? 'Creating Ride...' : 'Create Ride'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default ReviewRideModal;
