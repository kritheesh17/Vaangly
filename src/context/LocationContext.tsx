import React, { createContext, useContext, useState, useEffect } from 'react';
import { Location } from '../types/database';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface LocationContextType {
  locations: Location[];
  selectedLocation: Location;
  setSelectedLocation: (location: Location) => void;
  isLoading: boolean;
  isLocationModalOpen: boolean;
  setIsLocationModalOpen: (open: boolean) => void;
}

// Fallback location used before Supabase data loads or when it is unavailable.
export const DEFAULT_LOCATIONS: Location[] = [
  {
    id: '10000000-0000-0000-0000-000000000004',
    name: 'Kangeyam',
    state: 'Tamil Nadu',
    pincode: '638108',
    is_active: true,
    is_launch_town: true,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const STORAGE_KEY = 'vaango-customer-location';
const FALLBACK_LOCATION = DEFAULT_LOCATIONS[0];

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locations, setLocations] = useState<Location[]>([FALLBACK_LOCATION]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(() => !localStorage.getItem(STORAGE_KEY));

  // Accept only the staging location from persisted state.
  const [selectedLocation, setSelectedLocationState] = useState<Location>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.name === FALLBACK_LOCATION.name) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(FALLBACK_LOCATION));
          return FALLBACK_LOCATION;
        }
      }
    } catch {
      // ignore JSON parse error
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(FALLBACK_LOCATION));
    return FALLBACK_LOCATION;
  });

  // Fetch locations from Supabase if configured
  useEffect(() => {
    let isMounted = true;
    if (isSupabaseConfigured) {
      setIsLoading(true);
      supabase
        .from('locations')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data && isMounted) {
            const activeLocations = (data as Location[]).filter((location) => location.is_active);
            if (activeLocations.length === 0) {
              setLocations([FALLBACK_LOCATION]);
              setSelectedLocationState(FALLBACK_LOCATION);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(FALLBACK_LOCATION));
              return;
            }

            setLocations(activeLocations);

            // Keep the selected location inside the active Supabase result.
            const currentId = selectedLocation.id;
            const freshMatch = activeLocations.find((location) =>
              location.id === currentId || location.name === selectedLocation.name
            );
            const nextLocation = freshMatch || activeLocations.find((location) => location.is_launch_town) || activeLocations[0];
            if (nextLocation) {
              setSelectedLocationState(nextLocation);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(nextLocation));
            }
          } else if (isMounted) {
            setLocations([FALLBACK_LOCATION]);
            setSelectedLocationState(FALLBACK_LOCATION);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(FALLBACK_LOCATION));
          }
          if (isMounted) setIsLoading(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const setSelectedLocation = (location: Location) => {
    setSelectedLocationState(location);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(location));
    } catch {
      // ignore storage error
    }
  };

  return (
    <LocationContext.Provider
      value={{
        locations,
        selectedLocation,
        setSelectedLocation,
        isLoading,
        isLocationModalOpen,
        setIsLocationModalOpen,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export const useLocationContext = (): LocationContextType => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return context;
};
