# Review Ride Details Modal

A React component that displays a modal for reviewing ride details before creating a ride invitation. This modal follows the wireframe design and matches the app's existing styling patterns.

## Features

- **Editable Ride Title**: Click on the ride title to edit it inline
- **Ride Details Display**: Shows all ride information in a clean, organized layout
- **Driving Status**: Visual indicator for driving status with car seats information
- **Responsive Design**: Optimized for both desktop and mobile devices
- **Accessibility**: Proper focus management and keyboard navigation
- **Consistent Styling**: Matches the app's warm color theme and design patterns

## Usage

```jsx
import ReviewRideDetailsModal from './components/ReviewRideDetailsModal';

function MyComponent() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rideDetails, setRideDetails] = useState({
    destination: 'Central Park, New York',
    description: 'Weekend trip to Central Park',
    startTime: new Date().toISOString(),
    isDriving: true,
    carSeats: 3,
    additionalNotes: 'Bring snacks and drinks',
    pickupLocation: 'Times Square, New York'
  });

  const handleCreateRide = (finalRideDetails) => {
    // Handle ride creation logic here
    console.log('Creating ride:', finalRideDetails);
  };

  return (
    <ReviewRideDetailsModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      rideDetails={rideDetails}
      onCreateRide={handleCreateRide}
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `isOpen` | boolean | Yes | Controls modal visibility |
| `onClose` | function | Yes | Callback when modal is closed |
| `rideDetails` | object | Yes | Object containing ride information |
| `onCreateRide` | function | Yes | Callback when "Create Ride" button is clicked |

## Ride Details Object Structure

```javascript
{
  destination: string,        // Ride destination
  description: string,        // Ride description
  startTime: string,          // ISO date string
  isDriving: boolean,         // Whether user is driving
  carSeats: number,           // Number of available car seats (if driving)
  additionalNotes: string,    // Additional notes
  pickupLocation: string      // Pickup location
}
```

## Styling

The modal uses the app's existing design system with:
- Warm color palette (`#b08968`, `#a47551`)
- Consistent border radius and shadows
- Smooth animations and transitions
- Mobile-responsive design
- Proper focus states for accessibility

## Demo

See `ReviewRideDetailsDemo.jsx` for a complete example of how to use the modal.

## Integration Notes

1. The modal automatically generates a default title based on the destination
2. Users can click on the title to edit it inline
3. The modal handles all the styling and animations internally
4. The "Create Ride" button passes the final ride details (including the edited title) to the `onCreateRide` callback
5. The modal is fully responsive and works well on mobile devices

## Accessibility Features

- Proper ARIA labels and roles
- Keyboard navigation support
- Focus management
- Screen reader friendly
- High contrast color scheme
- Clear visual hierarchy 