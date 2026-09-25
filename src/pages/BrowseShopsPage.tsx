import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MapPin, Store, ArrowLeft } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { useLanguage } from '../context/LanguageContext';
import { MOCK_SHOP_TYPES } from '../data/mockData';
import { searchLocationCatalog, fetchCustomerLocationCatalog, CustomerCatalogData } from '../lib/search';
import { ShopCard } from '../components/customer/ShopCard';
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

  // Live database customer catalog state
  const [catalogData, setCatalogData] = useState<CustomerCatalogData>({
    shops: [],
    products: [],
    services: [],
    shopTypes: MOCK_SHOP_TYPES,
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load authoritative live shops, products, and services for selected town
  const loadCatalog = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchCustomerLocationCatalog(selectedLocation.id);
      setCatalogData(data);
    } catch (err) {
      console.error('Failed to load customer catalog:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedLocation.id]);

  useEffect(() => {
    void loadCatalog();

    if (!isSupabaseConfigured) return;

    // Realtime listener: Automatically update customer view when a shop goes live or updates
    const channel = supabase
      .channel(`customer-shops-${selectedLocation.id}`)
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
  }, [selectedLocation.id, loadCatalog]);

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
            <div className="vaango-browse__location-tag">
              <MapPin size={15} />
              <span>{t('location')}: {selectedLocation.name}</span>
            </div>
          </div>
        </div>

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
      ) : (
        /* Empty State */
        <div className="vaango-browse__empty">
          <EmptyState
            icon={<Store size={44} />}
            title={t('noShopsFound')}
            description={t('noShopsFoundDesc', {
              query: searchQuery || activeShopType?.name || '',
              location: selectedLocation.name,
            })}
            actionLabel={t('viewAllShops')}
            onAction={() => {
              setSearchQuery('');
              handleCategorySelect('all');
            }}
            secondaryActionLabel={t('restoreSampleShops')}
            onSecondaryAction={() => {
              resetDemoData();
              setSearchQuery('');
              handleCategorySelect('all');
            }}
          />
        </div>
      )}
    </div>
  );
};
