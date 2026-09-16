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

// Default supported launch locations sorted in ascending alphabetical order
export const DEFAULT_LOCATIONS: Location[] = [
  {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Kangeyam',
    state: 'Tamil Nadu',
    pincode: '638108',
    is_active: true,
    is_launch_town: true,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'loc-chennai',
    name: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600001',
    is_active: true,
    is_launch_town: false,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'loc-coimbatore',
    name: 'Coimbatore',
    state: 'Tamil Nadu',
    pincode: '641001',
    is_active: true,
    is_launch_town: false,
    created_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'loc-madurai',
    name: 'Madurai',
    state: 'Tamil Nadu',
    pincode: '625001',
    is_active: true,
    is_launch_town: false,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const STORAGE_KEY = 'vaango-customer-location';

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locations, setLocations] = useState<Location[]>(DEFAULT_LOCATIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(() => !localStorage.getItem(STORAGE_KEY));

  // Initialize selected location: check localStorage or default to Kangeyam (launch town)
  const [selectedLocation, setSelectedLocationState] = useState<Location>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        const match = DEFAULT_LOCATIONS.find((l) => l.id === parsed.id || l.name === parsed.name);
        if (match) return match;
      }
    } catch {
      // ignore JSON parse error
    }
    // Default to launch town
    return DEFAULT_LOCATIONS.find((l) => l.is_launch_town) || DEFAULT_LOCATIONS[0];
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
          if (!error && data && data.length > 0 && isMounted) {
            setLocations(data as Location[]);
            // Update selected location if present in fresh data
            const currentId = selectedLocation.id;
            const freshMatch = (data as Location[]).find((l) => l.id === currentId || l.name === selectedLocation.name);
            if (freshMatch) {
              setSelectedLocationState(freshMatch);
            }
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
