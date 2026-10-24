import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock,
  MapPin,
  Phone,
  Store,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { fetchAdminApplications, fetchAdminLocations } from '../../lib/adminApi';
import { ShopApplication, Location } from '../../types/database';
import { getShopType, MOCK_SHOP_TYPES } from '../../data/mockData';
import { DEFAULT_LOCATIONS } from '../../context/LocationContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { NotificationBadge } from '../../components/ui/NotificationBadge';
import { useSectionUnreadCounts } from '../../hooks/useSectionUnreadCounts';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { PaginationControls } from '../../components/common/PaginationControls';
import { CopyableText } from '../../components/common/CopyableText';
import { useLanguage } from '../../context/LanguageContext';
import { useDebounce } from '../../hooks/useDebounce';
import './AdminApplicationsPage.css';

export const AdminApplicationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();
  const { pendingApplications } = useSectionUnreadCounts();

  const [applications, setApplications] = useState<ShopApplication[]>([]);
  const [allLocations, setAllLocations] = useState<Location[]>(DEFAULT_LOCATIONS);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const activeStatus = searchParams.get('status') || 'all';
  const activeLocation = searchParams.get('location') || 'all';
  const activeType = searchParams.get('type') || 'all';
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name_asc'>('newest');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);

  // Load locations dynamically
  useEffect(() => {
    async function loadLocs() {
      try {
        const locs = await fetchAdminLocations();
        if (locs && locs.length > 0) setAllLocations(locs);
      } catch (err) {
        console.warn('Failed to load admin locations:', err);
      }
    }
    loadLocs();
  }, []);

  const loadApps = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminApplications({
        status: activeStatus !== 'all' ? (activeStatus as any) : undefined,
        locationId: activeLocation !== 'all' ? activeLocation : undefined,
        shopTypeId: activeType !== 'all' ? activeType : undefined,
      });
      setApplications(data);
    } catch (err) {
      console.error('Error fetching applications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [activeStatus, activeLocation, activeType]);

  const updateParam = (key: string, val: string) => {
    const params = new URLSearchParams(searchParams);
    if (val === 'all' || !val) params.delete(key);
    else params.set(key, val);
    setSearchParams(params);
  };

  const handleStatusFilter = (status: string) => {
    updateParam('status', status);
  };

  // Client-side search and sorting on retrieved application set
  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase().trim();
        const matchName = app.shop_name.toLowerCase().includes(q);
        const matchOwner = (app.owner_name || '').toLowerCase().includes(q);
        const matchPhone = (app.contact_phone || '').toLowerCase().includes(q);
        const matchId = app.id.toLowerCase().includes(q);
        return matchName || matchOwner || matchPhone || matchId;
      }
      return true;
    });
  }, [applications, debouncedSearch]);

  const sortedApps = useMemo(() => {
    const list = [...filteredApps];
    list.sort((a, b) => {
      if (sortBy === 'name_asc') return a.shop_name.localeCompare(b.shop_name);
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (sortBy === 'oldest') return timeA - timeB;
      return timeB - timeA;
    });
    return list;
  }, [filteredApps, sortBy]);

  // Reset pagination on filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, activeStatus, activeLocation, activeType, sortBy]);

  const pagedApps = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedApps.slice(start, start + pageSize);
  }, [sortedApps, currentPage, pageSize]);

  const isFiltered = Boolean(
    searchQuery.trim() ||
    activeStatus !== 'all' ||
    activeLocation !== 'all' ||
    activeType !== 'all'
  );

  const handleResetFilters = () => {
    setSearchQuery('');
    setSortBy('newest');
    setSearchParams(new URLSearchParams());
  };

  return (
    <div className="container vaango-admin-apps">
      {/* Header */}
      <div className="vaango-admin-apps__header">
        <div>
          <button
            type="button"
            className="vaango-back-btn"
            onClick={() => navigate('/admin/dashboard')}
            aria-label="Back to dashboard"
          >
            <ArrowLeft size={16} />
            <span>{t('adminDashboard')}</span>
          </button>
          <h1 className="vaango-admin-apps__title">Shop Onboarding Applications</h1>
          <p className="vaango-admin-apps__subtitle">
            Review applicant storefront photos, GPS coordinates, and private identity proofs before granting storefront access.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="vaango-admin-apps__filter-bar">
        <div className="vaango-admin-tabs" role="tablist" aria-label="Filter applications by status">
          <button
            type="button"
            className={`vaango-admin-tab ${activeStatus === 'all' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleStatusFilter('all')}
          >
            {t('allApplications')}
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeStatus === 'submitted' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleStatusFilter('submitted')}
          >
            <span>{t('pendingVerification')}</span>
            <NotificationBadge count={pendingApplications} size="sm" />
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeStatus === 'approved' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleStatusFilter('approved')}
          >
            {t('approvedStatus')}
          </button>
          <button
            type="button"
            className={`vaango-admin-tab ${activeStatus === 'rejected' ? 'vaango-admin-tab--active' : ''}`}
            onClick={() => handleStatusFilter('rejected')}
          >
            {t('rejectedStatus')}
          </button>
        </div>
      </div>

      {/* Information Retrieval Bar */}
      <SearchFilterBar
        id="admin-applications-search"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search by shop name, owner, phone, or application ID..."
        totalCount={applications.length}
        filteredCount={filteredApps.length}
        isFiltered={isFiltered}
        onResetFilters={handleResetFilters}
      >
        <select
          className="vaango-admin-select"
          value={activeLocation}
          onChange={(e) => updateParam('location', e.target.value)}
          aria-label="Filter by hometown location"
        >
          <option value="all">Location: All Towns</option>
          {allLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>

        <select
          className="vaango-admin-select"
          value={activeType}
          onChange={(e) => updateParam('type', e.target.value)}
          aria-label="Filter by business type"
        >
          <option value="all">Category: All Types</option>
          {MOCK_SHOP_TYPES.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>

        <select
          className="vaango-admin-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          aria-label="Sort applications"
        >
          <option value="newest">Sort: Newest Submissions</option>
          <option value="oldest">Sort: Oldest Submissions</option>
          <option value="name_asc">Sort: Shop Name (A – Z)</option>
        </select>
      </SearchFilterBar>

      {/* Applications List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
        </div>
      ) : sortedApps.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {isFiltered ? (
            <div>
              <p style={{ margin: '0 0 12px 0' }}>No shop applications found matching your search or filters.</p>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                Clear Search & Filters
              </Button>
            </div>
          ) : (
            <p style={{ margin: 0 }}>{t('noApplicationsFound')}</p>
          )}
        </Card>
      ) : (
        <>
          <div className="vaango-admin-apps__grid">
            {pagedApps.map((app) => {
              const shopType = getShopType(app.shop_type_id);
              const location =
                allLocations.find((l) => l.id === app.location_id) ||
                DEFAULT_LOCATIONS.find((l) => l.id === app.location_id);

              return (
                <Card
                  key={app.id}
                  variant="default"
                  padding="md"
                  className="vaango-admin-app-card"
                  onClick={() => navigate(`/admin/applications/${app.id}`)}
                >
                  <div className="vaango-admin-app-card__main">
                    <div className="vaango-admin-app-card__header">
                      <div>
                        <h3 className="vaango-admin-app-card__name">{app.shop_name}</h3>
                        <span className="vaango-admin-app-card__owner">
                          Applicant: <strong>{app.owner_name || 'Store Merchant'}</strong>
                        </span>
                      </div>

                      <Badge
                        variant={
                          app.status === 'approved'
                            ? 'success'
                            : app.status === 'rejected'
                            ? 'error'
                            : 'warning'
                        }
                        size="sm"
                        withDot
                      >
                        {app.status.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="vaango-admin-app-card__meta">
                      <span>
                        <Store size={14} /> {shopType?.name || 'Retail'}
                      </span>
                      <span>
                        <MapPin size={14} /> {location?.name || 'Hometown'}
                      </span>
                      <span>
                        <Phone size={14} /> {app.contact_phone}
                      </span>
                      <span>
                        <Clock size={14} />{' '}
                        {new Date(app.created_at).toLocaleDateString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span onClick={(e) => e.stopPropagation()}>
                        <CopyableText text={app.id} truncate label="Copy Application ID" />
                      </span>
                    </div>

                    {app.review_notes && (
                      <div className="vaango-admin-app-card__notes">
                        <strong>Audit Note:</strong> {app.review_notes}
                      </div>
                    )}
                  </div>

                  <div className="vaango-admin-app-card__action">
                    <Button variant="ghost" size="sm" rightIcon={<ArrowRight size={14} />}>
                      Review
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>

          <PaginationControls
            currentPage={currentPage}
            totalItems={sortedApps.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[12, 24, 48]}
          />
        </>
      )}
    </div>
  );
};
