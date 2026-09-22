import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clock,
  MapPin,
  Phone,
  Store,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { fetchAdminApplications } from '../../lib/adminApi';
import { ShopApplication } from '../../types/database';
import { MOCK_SHOP_TYPES, getShopType } from '../../data/mockData';
import { DEFAULT_LOCATIONS } from '../../context/LocationContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { useLanguage } from '../../context/LanguageContext';
import './AdminApplicationsPage.css';

export const AdminApplicationsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useLanguage();

  const [applications, setApplications] = useState<ShopApplication[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters from query params
  const activeStatus = searchParams.get('status') || 'all';
  const activeLocation = searchParams.get('location') || 'all';
  const activeType = searchParams.get('type') || 'all';

  const loadApps = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminApplications({
        status: activeStatus as any,
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

  const handleStatusFilter = (status: string) => {
    const params = new URLSearchParams(searchParams);
    if (status === 'all') params.delete('status');
    else params.set('status', status);
    setSearchParams(params);
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
            {t('pendingVerification')}
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

      {/* Applications List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <Skeleton height={110} />
          <Skeleton height={110} />
          <Skeleton height={110} />
        </div>
      ) : applications.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {t('noApplicationsFound')}
        </Card>
      ) : (
        <div className="vaango-admin-apps__grid">
          {applications.map((app) => {
            const shopType = getShopType(app.shop_type_id);
            const location = DEFAULT_LOCATIONS.find((l) => l.id === app.location_id);

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
      )}
    </div>
  );
};
