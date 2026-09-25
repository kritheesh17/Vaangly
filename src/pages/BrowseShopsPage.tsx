import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MapPin, Store, ArrowLeft, Navigation, Loader2, AlertCircle, LayoutGrid, Map } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useLanguage } from '../context/LanguageContext';
import { MOCK_SHOP_TYPES } from '../data/mockData';
import { searchLocationCatalog, fetchCustomerLocationCatalog, fetchNearbyShopCatalog, CustomerCatalogData } from '../lib/search';
import { formatDistance } from '../lib/distance';
import { ShopCard } from '../components/customer/ShopCard';
import { CustomerMapView } from '../components/gis/CustomerMapView';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { WorkflowGroupCode } from '../types/workflow';
import { Shop, ShopType } from '../types/database';
import { resetDemoData } from '../lib/demoData';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import './BrowseShopsPage.css';

export const BrowseShopsPage: React.FC = () => {
  const { selectedLocation } = useLocationContext();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCategoryCode = searchParams.get('category') || 'all';
  const rawGroup = searchParams.get('group') || searchParams.get('type');
  const selectedGroup = (rawGroup?.toUpperCase() as WorkflowGroupCode) || null;
  const [searchQuery, setSearchQuery] = useState('');

  // Near Me / GIS Discovery State (Transient customer coordinates only - NEVER persisted)
  const [isNearMeMode, setIsNearMeMode] = useState<boolean>(() => {
    return searchParams.get('nearMe') === 'true';
  });
  const [customerCoords, setCustomerCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMeters, setRadiusMeters] = useState<number>(5000);
  const [geoState, setGeoState] = useState<'idle' | 'requesting' | 'active' | 'denied' | 'error'>('idle');
  const [geoErrorMessage, setGeoErrorMessage] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Live database customer catalog state
  const [catalogData, setCatalogData] = useState<CustomerCatalogData>({
    shops: [],
    products: [],
    services: [],
    shopTypes: MOCK_SHOP_TYPES,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Request customer browser location with fallback to town mode on rejection
  const handleRequestNearMe = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setGeoState('error');
      setGeoErrorMessage('Geolocation is not supported by your browser.');
      return;
    }

    setGeoState('requesting');
    setGeoErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomerCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setIsNearMeMode(true);
        setGeoState('active');
        const params = new URLSearchParams(searchParams);
        params.set('nearMe', 'true');
        setSearchParams(params);
      },
      (err) => {
        console.warn('Customer geolocation error:', err);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoState('denied');
          setGeoErrorMessage(t('locationAccessOff'));
        } else {
          setGeoState('error');
          setGeoErrorMessage('Unable to determine location. Showing town shops.');
        }
        setIsNearMeMode(false);
        const params = new URLSearchParams(searchParams);
        params.delete('nearMe');
        setSearchParams(params);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [searchParams, setSearchParams, t]);

  // If URL has ?nearMe=true on initial load, trigger request
  useEffect(() => {
    if (searchParams.get('nearMe') === 'true' && geoState === 'idle') {
      handleRequestNearMe();
    }
  }, [searchParams, geoState, handleRequestNearMe]);

  const handleSwitchToTown = () => {
    setIsNearMeMode(false);
    const params = new URLSearchParams(searchParams);
    params.delete('nearMe');
    setSearchParams(params);
  };

  const handleRadiusChange = (newRadius: number) => {
    setRadiusMeters(newRadius);
  };

  // Load authoritative live shops, products, and services for selected mode
  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      if (isNearMeMode && customerCoords) {
        const data = await fetchNearbyShopCatalog(customerCoords.lat, customerCoords.lng, radiusMeters);
        setCatalogData(data);
      } else {
        const data = await fetchCustomerLocationCatalog(selectedLocation.id);
        setCatalogData(data);
      }
    } catch (err) {
      console.error('Failed to load customer catalog:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isNearMeMode, customerCoords, radiusMeters, selectedLocation.id]);

  useEffect(() => {
    void loadCatalog();

    if (!isSupabaseConfigured) return;

    // Realtime listener: Automatically update customer view when a shop goes live or updates
    const channelId = isNearMeMode ? 'customer-near-me' : `customer-shops-${selectedLocation.id}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops' },
        () => void loadCatalog()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shop_products' },
        () => void loadCatalog()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadCatalog, isNearMeMode, selectedLocation.id]);

  const allShopTypes = catalogData.shopTypes.length > 0 ? catalogData.shopTypes : MOCK_SHOP_TYPES;

  // Resolve shop type for any shop (handles UUIDs from Supabase or code strings)
  const getShopCategory = useCallback(
    (shop: Shop): ShopType | undefined => {
      return (
        allShopTypes.find((t) => t.id === shop.shop_type_id || t.code === shop.shop_type_id) ||
        MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id || t.code === shop.shop_type_id)
      );
    },
    [allShopTypes]
  );

  // Find active shop type if selected
  const activeShopType = useMemo(() => {
    if (selectedCategoryCode === 'all') return undefined;
    return allShopTypes.find((st) => st.code === selectedCategoryCode || st.id === selectedCategoryCode);
  }, [selectedCategoryCode, allShopTypes]);

  // Filter types by group if specified
  const displayedShopTypes = useMemo(() => {
    if (!selectedGroup) return allShopTypes;
    return allShopTypes.filter((st) => st.workflow_group_code === selectedGroup);
  }, [selectedGroup, allShopTypes]);

  // Dynamic page title
  const pageTitle = useMemo(() => {
    if (activeShopType) return activeShopType.name;
    if (selectedGroup === 'SALES_SERVICE') return 'Sales & Services';
    if (selectedGroup === 'APPOINTMENT') return t('coreAppointmentsTitle');
    if (selectedGroup === 'SERVICE') return t('coreServicesTitle');
    if (selectedGroup === 'ORDER') return t('coreOrderTitle');
    return t('allBusinesses');
  }, [activeShopType, selectedGroup, t]);

  // Execute search / filtering against live database catalog
  const { shops, matchingProducts, matchingServices } = useMemo(() => {
    return searchLocationCatalog(
      selectedLocation.id,
      searchQuery,
      activeShopType?.id,
      catalogData
    );
  }, [selectedLocation.id, searchQuery, activeShopType, catalogData]);

  // Filter shops by workflow group
  const finalShops = useMemo(() => {
    if (!selectedGroup) return shops;
    return shops.filter((s) => {
      const type = getShopCategory(s);
      return type?.workflow_group_code === selectedGroup;
    });
  }, [shops, selectedGroup, getShopCategory]);

  const handleCategorySelect = (code: string) => {
    const params = new URLSearchParams(searchParams);
    if (code === 'all') {
      params.delete('category');
    } else {
      params.set('category', code);
    }
    setSearchParams(params);
  };

  return (
    <div className="container vaango-browse">
      {/* Header & Breadcrumb */}
      <div className="vaango-browse__header">
        <button
          type="button"
          className="vaango-browse__back-btn"
          onClick={() => navigate('/')}
          aria-label={t('backBtn')}
        >
          <ArrowLeft size={18} />
          <span>{t('navHome')}</span>
        </button>

        <div className="vaango-browse__title-row">
          <div>
            <h1 className="vaango-browse__title">{pageTitle}</h1>
            <div className="vaango-browse__mode-row">
              {isNearMeMode ? (
                <div className="vaango-browse__location-tag vaango-browse__location-tag--near-me">
                  <Navigation size={14} className="vaango-browse__near-icon" />
                  <span>
                    {t('nearYou')} • {formatDistance(radiusMeters)}
                    {finalShops.length > 0 && ` (${t('shopsNearbyCount', { count: finalShops.length })})`}
                  </span>
                </div>
              ) : (
                <div className="vaango-browse__location-tag">
                  <MapPin size={15} />
                  <span>{t('location')}: {selectedLocation.name}</span>
                </div>
              )}

              {/* Mode Toggle Action */}
              {!isNearMeMode ? (
                <button
                  type="button"
                  className="vaango-near-me-trigger-btn"
                  onClick={handleRequestNearMe}
                  disabled={geoState === 'requesting'}
                >
                  {geoState === 'requesting' ? (
                    <>
                      <Loader2 size={13} className="vaango-spin" />
                      <span>{t('gettingLocation')}</span>
                    </>
                  ) : (
                    <>
                      <Navigation size={13} />
                      <span>{t('nearMe')}</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  className="vaango-switch-town-trigger-btn"
                  onClick={handleSwitchToTown}
                >
                  <MapPin size={13} />
                  <span>{t('switchToTownMode')}</span>
                </button>
              )}
            </div>
          </div>

          {/* LIST | MAP View Toggle */}
          <div className="vaango-browse__view-toggle" role="group" aria-label="View format">
            <button
              type="button"
              className={`vaango-view-toggle-btn ${viewMode === 'list' ? 'vaango-view-toggle-btn--active' : ''}`}
              onClick={() => setViewMode('list')}
              aria-label="List view"
            >
              <LayoutGrid size={15} />
              <span>List</span>
            </button>
            <button
              type="button"
              className={`vaango-view-toggle-btn ${viewMode === 'map' ? 'vaango-view-toggle-btn--active' : ''}`}
              onClick={() => setViewMode('map')}
              aria-label="Map view"
            >
              <Map size={15} />
              <span>Map</span>
            </button>
          </div>
        </div>

        {/* Radius Selector Pills (Active in Near Me mode) */}
        {isNearMeMode && (
          <div className="vaango-browse__radius-bar">
            <span className="vaango-browse__radius-label">{t('withinRadius', { radius: '' }).replace('{{radius}}', '').trim() || 'Within'}:</span>
            {[1000, 3000, 5000, 10000].map((m) => (
              <button
                key={m}
                type="button"
                className={`vaango-radius-pill ${radiusMeters === m ? 'vaango-radius-pill--active' : ''}`}
                onClick={() => handleRadiusChange(m)}
              >
                {m < 1000 ? `${m} m` : `${m / 1000} km`}
              </button>
            ))}
          </div>
        )}

        {/* Informational Notification for Geo Permission Issues */}
        {geoErrorMessage && !isNearMeMode && (
          <div className="vaango-browse__geo-alert">
            <AlertCircle size={15} className="vaango-browse__geo-alert-icon" />
            <span>{geoErrorMessage}</span>
          </div>
        )}

        {/* Search Bar with Tanglish Support */}
        <div className="vaango-browse__search-wrap">
          <Input
            id="shop-search-input"
            type="search"
            placeholder={
              selectedGroup === 'SALES_SERVICE'
                ? 'Search sales, repairs, workshop, accessories...'
                : selectedGroup === 'APPOINTMENT'
                ? language === 'ta'
                  ? 'டாக்டர், சலூன், கிளினிக் தேடுக...'
                  : 'Search doctor, clinic, haircut, salon...'
                : selectedGroup === 'SERVICE'
                ? language === 'ta'
                  ? 'பழுது, தையல், மெக்கானிக் தேடுக...'
                  : 'Search repair, tailoring, mechanic, bike...'
                : language === 'ta'
                ? 'பொருட்கள் அல்லது கடைகளைத் தேடுக (எ.கா. தக்காளி, பால்)...'
                : 'Search shops or items (e.g. Tomato, Milk, Bread)...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            leftIcon={<Search size={18} />}
          />
        </div>

        {/* Shop Type Filter Tabs */}
        <div className="vaango-browse__tabs" role="tablist" aria-label="Filter by shop type">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategoryCode === 'all'}
            className={`vaango-browse-tab ${selectedCategoryCode === 'all' ? 'vaango-browse-tab--active' : ''}`}
            onClick={() => handleCategorySelect('all')}
          >
            {selectedGroup === 'APPOINTMENT'
              ? t('coreAppointmentsTitle')
              : selectedGroup === 'SERVICE'
              ? t('coreServicesTitle')
              : t('allBusinesses')}
          </button>
          {displayedShopTypes.map((type) => (
            <button
              key={type.code}
              type="button"
              role="tab"
              aria-selected={selectedCategoryCode === type.code}
              className={`vaango-browse-tab ${selectedCategoryCode === type.code ? 'vaango-browse-tab--active' : ''}`}
              onClick={() => handleCategorySelect(type.code)}
            >
              {type.name}
            </button>
          ))}
        </div>
      </div>

      {/* Matching Items Quick Callout */}
      {searchQuery.trim() && matchingProducts.length > 0 && (
        <div className="vaango-browse__item-matches">
          <span className="vaango-browse__item-matches-title">
            {t('itemsFoundMatching', { query: searchQuery })}
          </span>
          <div className="vaango-browse__item-pills">
            {matchingProducts.slice(0, 4).map(({ product, shop }) => (
              <button
                key={product.id}
                type="button"
                className="vaango-item-pill"
                onClick={() => navigate(`/shop/${shop.id}`)}
              >
                <span>{product.name}</span>
                <span className="vaango-item-pill__price">₹{product.price}</span>
                <span className="vaango-item-pill__shop">{t('atShop', { shop: shop.name })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matching Services Quick Callout */}
      {searchQuery.trim() && matchingServices && matchingServices.length > 0 && (
        <div className="vaango-browse__item-matches">
          <span className="vaango-browse__item-matches-title">
            {t('servicesFoundMatching', { query: searchQuery })}
          </span>
          <div className="vaango-browse__item-pills">
            {matchingServices.slice(0, 4).map(({ service, shop }) => (
              <button
                key={service.id}
                type="button"
                className="vaango-item-pill"
                onClick={() => navigate(`/shop/${shop.id}`)}
              >
                <span>{service.name}</span>
                {service.provider_name && <span>({service.provider_name})</span>}
                <span className="vaango-item-pill__price">
                  {service.price_type === 'range'
                    ? `₹${service.min_price}–₹${service.max_price}`
                    : `₹${service.base_price}`}
                </span>
                <span className="vaango-item-pill__shop">{t('atShop', { shop: shop.name })}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading && catalogData.shops.length === 0 ? (
        <div className="vaango-browse__grid" style={{ marginTop: '16px' }}>
          {[1, 2, 3, 4].map((n) => (
            <div key={n} style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
              <Skeleton height={180} />
              <div style={{ padding: '16px' }}>
                <Skeleton height={20} width="60%" style={{ marginBottom: '8px' }} />
                <Skeleton height={14} width="80%" style={{ marginBottom: '12px' }} />
                <Skeleton height={14} width="40%" />
              </div>
            </div>
          ))}
        </div>
      ) : finalShops.length > 0 ? (
        viewMode === 'map' ? (
          /* Interactive GIS Map View */
          <div className="vaango-browse__map-wrap">
            <CustomerMapView
              shops={finalShops}
              customerCoords={customerCoords}
              radiusMeters={isNearMeMode ? radiusMeters : undefined}
              selectedLocationName={selectedLocation.name}
              onSwitchToList={() => setViewMode('list')}
            />
          </div>
        ) : (
          /* Shops Grid */
          <div className="vaango-browse__grid">
            {finalShops.map((shop) => {
              const category = getShopCategory(shop);
              return (
                <ShopCard
                  key={shop.id}
                  shop={shop}
                  categoryName={category?.name}
                  onClick={() => navigate(`/shop/${shop.id}`)}
                />
              );
            })}
          </div>
        )
      ) : (
        /* Empty State */
        <div className="vaango-browse__empty">
          <EmptyState
            icon={<Store size={44} />}
            title={
              isNearMeMode
                ? t('noNearbyShops', { radius: formatDistance(radiusMeters) })
                : t('noShopsFound')
            }
            description={
              isNearMeMode
                ? (language === 'ta'
                    ? `${formatDistance(radiusMeters)} சுற்றளவில் எந்தக் கடையும் காணப்படவில்லை. சுற்றளவை அதிகரிக்கலாம் அல்லது ${selectedLocation.name} ஊர் வாரியாகப் பார்க்கலாம்.`
                    : `No active shops found within ${formatDistance(radiusMeters)}. Try a larger search radius or browse all shops in ${selectedLocation.name}.`)
                : t('noShopsFoundDesc', {
                    query: searchQuery || activeShopType?.name || '',
                    location: selectedLocation.name,
                  })
            }
            actionLabel={
              isNearMeMode
                ? radiusMeters < 10000
                  ? t('tryLargerRadius')
                  : t('browseTown', { town: selectedLocation.name })
                : t('viewAllShops')
            }
            onAction={() => {
              if (isNearMeMode) {
                if (radiusMeters < 10000) {
                  setRadiusMeters(10000);
                } else {
                  handleSwitchToTown();
                }
              } else {
                setSearchQuery('');
                handleCategorySelect('all');
              }
            }}
            secondaryActionLabel={
              isNearMeMode && radiusMeters < 10000
                ? t('browseTown', { town: selectedLocation.name })
                : !isNearMeMode
                ? t('restoreSampleShops')
                : undefined
            }
            onSecondaryAction={() => {
              if (isNearMeMode) {
                handleSwitchToTown();
              } else {
                resetDemoData();
                setSearchQuery('');
                handleCategorySelect('all');
              }
            }}
          />
        </div>
      )}
    </div>
  );
};
