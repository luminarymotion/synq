import React, { useEffect, useRef, useState } from 'react';
import 'ol/ol.css';
import { Map, View } from 'ol';
import { OSM } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { Vector as VectorSource } from 'ol/source';
import { Feature } from 'ol';
import Point from 'ol/geom/Point';
import { Style, Fill, Stroke, Circle as CircleStyle, Icon } from 'ol/style';
import { fromLonLat, toLonLat } from 'ol/proj';
import { boundingExtent } from 'ol/extent';
import { defaults as defaultControls } from 'ol/control';
import { LineString } from 'ol/geom';
import { calculateRoute, getTrafficInfo } from './services/routeService';

function MapView({ users, destination, userLocation, onSetDestinationFromMap }) {
  const mapRef = useRef();
  const vectorSourceRef = useRef(new VectorSource());
  const mapInstanceRef = useRef(null);
  const [route, setRoute] = useState(null);
  const [trafficData, setTrafficData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Use CartoDB's Voyager tiles for a modern look
    const baseLayer = new TileLayer({
      source: new OSM({
        url: 'https://{a-d}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
      })
    });

    const vectorLayer = new VectorLayer({
      source: vectorSourceRef.current,
    });

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayer, vectorLayer],
      view: new View({
        center: fromLonLat([-96.7970, 32.7767]), // Dallas default
        zoom: 12,
      }),
      controls: defaultControls({
        zoom: true,
        rotate: false,
        attribution: true
      }).extend([])
    });

    mapInstanceRef.current = map;
    map.on('click', function (event) {
        const coordinate = toLonLat(event.coordinate);
        const [lng, lat] = coordinate;
        if (onSetDestinationFromMap) {
            onSetDestinationFromMap({ lat, lng });
        }
    });

    return () => {
      map.setTarget(null);
    };
  }, []);

  // Calculate route when user location or destination changes
  useEffect(() => {
    const calculateAndDisplayRoute = async () => {
      if (userLocation && destination) {
        try {
          setError(null);
          const routeData = await calculateRoute(userLocation, destination);
          setRoute(routeData);

          // Try to get traffic data, but don't fail if it doesn't work
          try {
            const traffic = await getTrafficInfo(routeData);
            setTrafficData(traffic);
          } catch (trafficError) {
            console.warn('Could not get traffic data:', trafficError);
            // Don't set error state for traffic data failure
          }
        } catch (error) {
          console.error('Error calculating route:', error);
          setError(error.message);
          setRoute(null);
          setTrafficData(null);
        }
      }
    };

    calculateAndDisplayRoute();
  }, [userLocation, destination]);

  useEffect(() => {
    const source = vectorSourceRef.current;
    const map = mapInstanceRef.current;
    if (!map) return;

    source.clear();

    const features = [];

    // Add user location if available
    if (userLocation) {
      const userLocationFeature = new Feature({
        geometry: new Point(fromLonLat([userLocation.lng, userLocation.lat])),
        name: 'Your Location',
      });

      userLocationFeature.setStyle(
        new Style({
          image: new Icon({
            src: 'https://img.icons8.com/ios-filled/50/4CAF50/marker.png', // Green marker for user location
            scale: 0.8,
            anchor: [0.5, 1], // Center the marker on the point
          }),
        })
      );

      features.push(userLocationFeature);
    }

    // Add users
    users.forEach((user) => {
      const userFeature = new Feature({
        geometry: new Point(fromLonLat([user.lng, user.lat])),
        name: user.name,
      });

      // Create a custom style for each user
      const userStyle = new Style({
        image: new CircleStyle({
          radius: 8,
          fill: new Fill({ color: user.color }),
          stroke: new Stroke({ 
            color: '#ffffff',
            width: 2
          }),
        }),
      });

      userFeature.setStyle(userStyle);
      features.push(userFeature);
    });

    // Add destination if available
    if (destination) {
      const destFeature = new Feature({
        geometry: new Point(fromLonLat([destination.lng, destination.lat])),
        name: 'Destination',
      });

      destFeature.setStyle(
        new Style({
          image: new Icon({
            src: 'https://img.icons8.com/ios-filled/50/fa314a/marker.png', // Red destination pin
            scale: 0.8,
            anchor: [0.5, 1], // Center the marker on the point
          }),
        })
      );

      features.push(destFeature);
    }

    // Add route if available
    if (route && route.features && route.features[0]) {
      try {
        const coordinates = route.features[0].geometry.coordinates.map(coord => fromLonLat(coord));
        const routeFeature = new Feature({
          geometry: new LineString(coordinates),
          name: 'Route',
        });

        // Style the route based on traffic data
        const routeStyle = new Style({
          stroke: new Stroke({
            color: trafficData ? getTrafficColor(trafficData) : '#3388ff',
            width: 6,
          }),
        });

        routeFeature.setStyle(routeStyle);
        features.push(routeFeature);
      } catch (error) {
        console.error('Error adding route to map:', error);
      }
    }

    source.addFeatures(features);

    if (features.length > 0) {
      const extent = boundingExtent(features.map((f) => f.getGeometry().getCoordinates()));
      map.getView().fit(extent, {
        padding: [50, 50, 50, 50],
        maxZoom: 16,
        duration: 500,
      });
    } else {
      map.getView().setCenter(fromLonLat([-96.7970, 32.7767]));
      map.getView().setZoom(12);
    }
  }, [users, destination, userLocation, route, trafficData]);

  // Helper function to get color based on traffic data
  const getTrafficColor = (trafficData) => {
    if (!trafficData || !trafficData.features || !trafficData.features[0]) {
      return '#3388ff'; // Default blue
    }
    // This is a simple example - you might want to implement more sophisticated logic
    const trafficLevel = trafficData.features[0].properties.traffic_level;
    switch (trafficLevel) {
      case 'low':
        return '#4CAF50'; // Green
      case 'medium':
        return '#FFC107'; // Yellow
      case 'high':
        return '#F44336'; // Red
      default:
        return '#3388ff'; // Blue
    }
  };

  return (
    <div className="map-container">
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: '500px',
          border: '1px solid #ccc',
          marginTop: '20px',
          borderRadius: '12px',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
      />
      {error && (
        <div className="error-message">
          <p>{error}</p>
        </div>
      )}
      {route && route.features && route.features[0] && (
        <div className="route-info">
          <p>Distance: {(route.features[0].properties.segments[0].distance / 1000).toFixed(1)} km</p>
          <p>Duration: {Math.round(route.features[0].properties.segments[0].duration / 60)} minutes</p>
        </div>
      )}
      <style jsx>{`
        .map-container {
          position: relative;
        }
        .map-container :global(.ol-control) {
          background-color: rgba(255, 255, 255, 0.9);
          border-radius: 4px;
          padding: 2px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }
        .map-container :global(.ol-zoom) {
          top: 10px;
          right: 10px;
          left: auto;
        }
        .map-container :global(.ol-attribution) {
          bottom: 5px;
          right: 5px;
          background-color: rgba(255, 255, 255, 0.9);
          border-radius: 4px;
          padding: 2px 5px;
        }
        .route-info {
          position: absolute;
          top: 10px;
          left: 10px;
          background-color: rgba(255, 255, 255, 0.9);
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          z-index: 1000;
        }
        .error-message {
          position: absolute;
          top: 10px;
          left: 10px;
          background-color: rgba(244, 67, 54, 0.9);
          color: white;
          padding: 10px;
          border-radius: 4px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          z-index: 1000;
        }
      `}</style>
    </div>
  );
}

export default MapView;
