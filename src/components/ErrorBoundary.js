/**
 * BBZCloud - Error Boundary Component
 * 
 * This component catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI instead of the component tree that crashed.
 * 
 * @author Dennis Clausen <dennis.clausen@bbz-rd-eck.de>
 * @version 2.0.38
 */

import React from 'react';
import { Box, Text, Button, VStack, Alert, AlertIcon, AlertTitle, AlertDescription } from '@chakra-ui/react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      // Fallback UI
      return (
        <Box p={8} maxW="800px" mx="auto" mt={8}>
          <Alert status="error" mb={4}>
            <AlertIcon />
            <Box>
              <AlertTitle>Something went wrong!</AlertTitle>
              <AlertDescription>
                The application encountered an error and couldn't render properly.
              </AlertDescription>
            </Box>
          </Alert>
          
          <VStack spacing={4} align="stretch">
            <Text fontSize="lg" fontWeight="bold">Error Details:</Text>
            
            {this.state.error && (
              <Box bg="red.50" p={4} borderRadius="md" border="1px" borderColor="red.200">
                <Text fontWeight="bold" color="red.600">Error:</Text>
                <Text fontFamily="mono" fontSize="sm" color="red.800">
                  {this.state.error.toString()}
                </Text>
              </Box>
            )}
            
            {this.state.errorInfo && (
              <Box bg="gray.50" p={4} borderRadius="md" border="1px" borderColor="gray.200">
                <Text fontWeight="bold" color="gray.600">Component Stack:</Text>
                <Text fontFamily="mono" fontSize="xs" color="gray.800" whiteSpace="pre-wrap">
                  {this.state.errorInfo.componentStack}
                </Text>
              </Box>
            )}
            
            <Button 
              colorScheme="blue" 
              onClick={() => window.location.reload()}
              size="lg"
            >
              Reload Application
            </Button>
            
            <Text fontSize="sm" color="gray.600" textAlign="center">
              If this problem persists, please check the browser console for more details.
            </Text>
          </VStack>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
