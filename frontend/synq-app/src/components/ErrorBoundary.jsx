import React from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            p: 3,
            background: 'rgba(255,255,255,0.9)',
            borderRadius: 2,
            border: '1px solid #e0e0e0'
          }}
        >
          <Alert severity="error" sx={{ mb: 2, width: '100%' }}>
            <Typography variant="h6" gutterBottom>
              Something went wrong
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {this.props.errorMessage || 'An unexpected error occurred. Please try again.'}
            </Typography>
            <Button
              variant="contained"
              startIcon={<RefreshIcon />}
              onClick={this.handleRetry}
              sx={{ mt: 1 }}
            >
              Retry
            </Button>
          </Alert>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Box sx={{ mt: 2, p: 2, background: '#f5f5f5', borderRadius: 1, fontSize: '0.8rem' }}>
              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                {this.state.error.toString()}
              </Typography>
            </Box>
          )}
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 