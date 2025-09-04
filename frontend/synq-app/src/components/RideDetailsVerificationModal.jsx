import React, { useState, useEffect } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  Typography,
  Button,
  TextField,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText
} from '@mui/material';
import {
  Edit as EditIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  DirectionsCar as DriverIcon,
  Person as PassengerIcon
} from '@mui/icons-material';
import '../styles/RideDetailsVerificationModal.css';

function RideDetailsVerificationModal({
  isOpen,
  onClose,
  rideData,
  onConfirm,
  onEdit
}) {
  const [formData, setFormData] = useState({
    title: '',
    startTime: '',
    startImmediately: false, // New field for immediate start option
    destination: '',
    description: '',
    creatorRole: 'driver', // Changed from userRole to creatorRole to match the data structure
    specialNotes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  // Initialize form data when modal opens
  useEffect(() => {
    if (isOpen && rideData) {
      setFormData({
        title: rideData.title || '',
        startTime: rideData.startTime || '',
        startImmediately: rideData.startImmediately || false,
        destination: rideData.destination?.address || rideData.destination || '',
        description: rideData.description || '',
        creatorRole: rideData.creatorRole || 'driver', // Changed from userRole to creatorRole
        specialNotes: rideData.specialNotes || ''
      });
    }
  }, [isOpen, rideData]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }

    // Reset car seats when switching to passenger role
    if (field === 'creatorRole' && value === 'passenger') {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }

    // Handle start immediately toggle
    if (field === 'startImmediately') {
      setFormData(prev => ({
        ...prev,
        [field]: value,
        startTime: value ? '' : prev.startTime // Clear start time if starting immediately
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.title.trim()) {
      newErrors.title = 'Ride title is required';
    }
    
    if (!formData.startTime.trim() && !formData.startImmediately) {
      newErrors.startTime = 'Please select "Start Now" or "Choose a Time"';
    }
    
    if (!formData.destination.trim()) {
      newErrors.destination = 'Destination is required';
    }
    
    // No specific validation needed for tolls preference
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = async () => {
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        ...rideData,
        ...formData
      });
    } catch (error) {
      console.error('Error confirming ride:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = () => {
    onEdit();
  };

  const handleClose = () => {
    setErrors({});
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        className: 'ride-details-modal'
      }}
    >
      <DialogContent className="modal-content">
        {/* Header */}
        <Box className="modal-header">
          <Typography variant="h6" className="modal-title">
            Review Ride Details
          </Typography>
          <IconButton onClick={handleClose} className="close-button">
            <CloseIcon />
          </IconButton>
        </Box>

        <Box className="modal-body">
          {/* Compact Form */}
          <Box className="form-container" sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Ride Title"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              error={!!errors.title}
              helperText={errors.title}
              placeholder="Enter a title for your ride"
              className="form-field"
              size="small"
              sx={{ 
                '& .MuiInputLabel-root': { 
                  color: '#4e342e',
                  fontWeight: 600 
                },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#e0c9b3' },
                  '&:hover fieldset': { borderColor: '#b08968' },
                  '&.Mui-focused fieldset': { borderColor: '#a47551' }
                }
              }}
            />

                         {/* Start Time Section */}
             <Box className="form-field" sx={{ mt: 2 }}>
               <Typography 
                 variant="body2" 
                 sx={{ 
                   color: '#4e342e',
                   fontWeight: 600,
                   fontSize: '0.75rem',
                   mb: 0.5,
                   fontFamily: 'inherit',
                   lineHeight: 1.2,
                   textTransform: 'uppercase',
                   letterSpacing: '0.5px'
                 }}
               >
                 Set a time
               </Typography>
              
                             <Box display="flex" gap={1}>
                <Button
                  variant={formData.startImmediately ? "contained" : "outlined"}
                  size="small"
                  onClick={() => handleInputChange('startImmediately', true)}
                  sx={{
                    flex: 1,
                    backgroundColor: formData.startImmediately ? '#87CEEB' : 'transparent',
                    color: formData.startImmediately ? '#fff' : '#4e342e',
                    borderColor: formData.startImmediately ? '#87CEEB' : '#e0c9b3',
                    '&:hover': {
                      backgroundColor: formData.startImmediately ? '#87CEEB' : 'rgba(135, 206, 235, 0.1)',
                      borderColor: '#87CEEB'
                    },
                    textTransform: 'none',
                    fontWeight: 500,
                    borderRadius: 1.5
                  }}
                >
                  Start Now
                </Button>
                
                <Button
                  variant={!formData.startImmediately ? "contained" : "outlined"}
                  size="small"
                  onClick={() => handleInputChange('startImmediately', false)}
                  sx={{
                    flex: 1,
                    backgroundColor: !formData.startImmediately ? '#87CEEB' : 'transparent',
                    color: !formData.startImmediately ? '#fff' : '#4e342e',
                    borderColor: !formData.startImmediately ? '#87CEEB' : '#e0c9b3',
                    '&:hover': {
                      backgroundColor: !formData.startImmediately ? '#87CEEB' : 'rgba(135, 206, 235, 0.1)',
                      borderColor: '#87CEEB'
                    },
                    textTransform: 'none',
                    fontWeight: 500,
                    borderRadius: 1.5
                  }}
                >
                  Choose a Time
                </Button>
              </Box>
              
                             {!formData.startImmediately && (
                 <Box sx={{ mt: 2 }}>
                   <TextField
                     fullWidth
                     label="Start Time"
                     type="datetime-local"
                     value={formData.startTime}
                     onChange={(e) => handleInputChange('startTime', e.target.value)}
                     error={!!errors.startTime}
                     helperText={errors.startTime}
                     InputLabelProps={{ shrink: true }}
                     className="form-field"
                     size="small"
                     sx={{ 
                       '& .MuiInputLabel-root': { 
                         color: '#4e342e',
                         fontWeight: 600 
                       },
                       '& .MuiOutlinedInput-root': {
                         '& fieldset': { borderColor: '#e0c9b3' },
                         '&:hover fieldset': { borderColor: '#b08968' },
                         '&.Mui-focused fieldset': { borderColor: '#a47551' }
                       }
                     }}
                   />
                 </Box>
               )}
            </Box>

            <TextField
              fullWidth
              label="Destination"
              value={formData.destination}
              onChange={(e) => handleInputChange('destination', e.target.value)}
              error={!!errors.destination}
              helperText={errors.destination}
              className="form-field"
              size="small"
              sx={{ 
                '& .MuiInputLabel-root': { 
                  color: '#4e342e',
                  fontWeight: 600 
                },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#e0c9b3' },
                  '&:hover fieldset': { borderColor: '#b08968' },
                  '&.Mui-focused fieldset': { borderColor: '#a47551' }
                }
              }}
            />

            <TextField
              fullWidth
              label="Description"
              multiline
              rows={2}
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="What's this ride for?"
              className="form-field"
              size="small"
              sx={{ 
                '& .MuiInputLabel-root': { 
                  color: '#4e342e',
                  fontWeight: 600 
                },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#e0c9b3' },
                  '&:hover fieldset': { borderColor: '#b08968' },
                  '&.Mui-focused fieldset': { borderColor: '#a47551' }
                }
              }}
            />

            <FormControl fullWidth size="small" className="form-field">
              <InputLabel id="user-role-label" sx={{ color: '#4e342e', fontWeight: 600 }}>Role</InputLabel>
              <Select
                labelId="user-role-label"
                value={formData.creatorRole}
                label="Role"
                onChange={(e) => handleInputChange('creatorRole', e.target.value)}
                error={!!errors.creatorRole}
                sx={{ 
                  '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e0c9b3' },
                  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#b08968' },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#a47551' }
                }}
              >
                <MenuItem value="driver">
                  <Box display="flex" alignItems="center">
                    <DriverIcon fontSize="small" />
                    <Typography variant="body2" sx={{ ml: 1 }}>Driver</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="passenger">
                  <Box display="flex" alignItems="center">
                    <PassengerIcon fontSize="small" />
                    <Typography variant="body2" sx={{ ml: 1 }}>Passenger</Typography>
                  </Box>
                </MenuItem>
              </Select>
              {errors.creatorRole && <FormHelperText error>{errors.creatorRole}</FormHelperText>}
            </FormControl>

            <TextField
              fullWidth
              label="Special Notes"
              multiline
              rows={2}
              value={formData.specialNotes}
              onChange={(e) => handleInputChange('specialNotes', e.target.value)}
              placeholder="Any special instructions or notes?"
              className="form-field"
              size="small"
              sx={{ 
                '& .MuiInputLabel-root': { 
                  color: '#4e342e',
                  fontWeight: 600 
                },
                '& .MuiOutlinedInput-root': {
                  '& fieldset': { borderColor: '#e0c9b3' },
                  '&:hover fieldset': { borderColor: '#b08968' },
                  '&.Mui-focused fieldset': { borderColor: '#a47551' }
                }
              }}
            />
          </Box>
        </Box>

        {/* Actions */}
        <Box className="modal-actions">
          <Button
            variant="outlined"
            onClick={handleEdit}
            className="edit-button"
            startIcon={<EditIcon />}
            size="small"
          >
            Back to Edit
          </Button>
          
          <Button
            variant="contained"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="confirm-button"
            startIcon={isSubmitting ? <CircularProgress size={16} /> : <CheckIcon />}
            size="small"
          >
            {isSubmitting ? 'Creating...' : 'Create Ride'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

export default RideDetailsVerificationModal; 