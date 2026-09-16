import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, MapPin, Store, ArrowLeft } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { MOCK_SHOP_TYPES } from '../data/mockData';
import { searchLocationCatalog } from '../lib/search';
import { ShopCard } from '../components/customer/ShopCard';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { CartBar } from '../components/customer/CartBar';
import { WorkflowGroupCode } from '../types/workflow';
import { resetDemoData } from '../lib/demoData';
import './BrowseShopsPage.css';

export const BrowseShopsPage: React.FC = () => {
  const { selectedLocation } = useLocationContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedCategoryCode = searchParams.get('category') || 'all';
  const selectedGroup = (searchParams.get('group') as WorkflowGroupCode) || null;
  const [searchQuery, setSearchQuery] = useState('');

  // Find active shop type if selected
  const activeShopType = useMemo(() => {
    if (selectedCategoryCode === 'all') return undefined;
    return MOCK_SHOP_TYPES.find((st) => st.code === selectedCategoryCode);
  }, [selectedCategoryCode]);

  // Filter types by group if specified
  const displayedShopTypes = useMemo(() => {
    if (!selectedGroup) return MOCK_SHOP_TYPES;
    return MOCK_SHOP_TYPES.filter((st) => st.workflow_group_code === selectedGroup);
  }, [selectedGroup]);

  // Dynamic page title
  const pageTitle = useMemo(() => {
    if (activeShopType) return activeShopType.name;
    if (selectedGroup === 'APPOINTMENT') return 'Book an Appointment';
    if (selectedGroup === 'SERVICE') return 'Get a Local Service';
    if (selectedGroup === 'ORDER') return 'Order from Local Shops';
    return 'Local Shops & Merchants';
  }, [activeShopType, selectedGroup]);

  // Execute search / filtering
  const { shops, matchingProducts, matchingServices } = useMemo(() => {
    return searchLocationCatalog(
      selectedLocation.id,
      searchQuery,
      activeShopType?.id
    );
  }, [selectedLocation.id, searchQuery, activeShopType]);

  // Filter shops by workflow group
  const finalShops = useMemo(() => {
    if (!selectedGroup) return shops;
    return shops.filter((s) => {
      const type = MOCK_SHOP_TYPES.find((t) => t.id === s.shop_type_id);
      return type?.workflow_group_code === selectedGroup;
    });
  }, [shops, selectedGroup]);

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
          aria-label="Back to home"
        >
          <ArrowLeft size={18} />
          <span>Home</span>
        </button>

        <div className="vaango-browse__title-row">
          <div>
            <h1 className="vaango-browse__title">{pageTitle}</h1>
            <div className="vaango-browse__location-tag">
              <MapPin size={15} />
              <span>In {selectedLocation.name}</span>
            </div>
          </div>
        </div>

        {/* Search Bar with Tanglish Support */}
        <div className="vaango-browse__search-wrap">
          <Input
            id="shop-search-input"
            type="search"
            placeholder={
              selectedGroup === 'APPOINTMENT'
                ? 'Search doctor, salon, haircut (e.g., Mudi, Doctor)...'
                : selectedGroup === 'SERVICE'
                ? 'Search repair, tailoring, mechanic (e.g., Thaiyal, Vandi, Phone)...'
                : 'Search shops or items (e.g., Thakkali, Rice, Bread, Coffee)...'
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
              ? 'All Appointments'
              : selectedGroup === 'SERVICE'
              ? 'All Services'
              : 'All Shops'}
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
            Items found matching &ldquo;{searchQuery}&rdquo;:
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
                <span className="vaango-item-pill__shop">at {shop.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Matching Services Quick Callout */}
      {searchQuery.trim() && matchingServices && matchingServices.length > 0 && (
        <div className="vaango-browse__item-matches">
          <span className="vaango-browse__item-matches-title">
            Services found matching &ldquo;{searchQuery}&rdquo;:
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
                <span className="vaango-item-pill__shop">at {shop.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Shops Grid */}
      {finalShops.length > 0 ? (
        <div className="vaango-browse__grid">
          {finalShops.map((shop) => {
            const category = MOCK_SHOP_TYPES.find((t) => t.id === shop.shop_type_id);
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
        <div className="vaango-browse__empty">
          <EmptyState
            icon={<Store size={44} />}
            title="No shops found in this area"
            description={`We could not find any active shops matching "${searchQuery || activeShopType?.name || 'criteria'}" in ${selectedLocation.name}.`}
            actionLabel="View All Shops"
            onAction={() => {
              setSearchQuery('');
              handleCategorySelect('all');
            }}
            secondaryActionLabel="Restore Sample Shops"
            onSecondaryAction={() => {
              resetDemoData();
              setSearchQuery('');
              handleCategorySelect('all');
            }}
          />
        </div>
      )}

      {/* Floating Cart Bar (for Order workflows) */}
      <CartBar />
    </div>
  );
};
