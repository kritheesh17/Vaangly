import React, { useState, useEffect, useMemo } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  Store,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { fetchAdminLocations, saveLocation, toggleLocationActive } from '../../lib/adminApi';
import { AdminLocationWithStats } from '../../types/admin';
import { Location } from '../../types/database';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ActionErrorBanner } from '../../components/ui/ActionErrorBanner';
import { SearchFilterBar } from '../../components/common/SearchFilterBar';
import { PaginationControls } from '../../components/common/PaginationControls';
import { CopyableText } from '../../components/common/CopyableText';
import { useLanguage } from '../../context/LanguageContext';
import { useDebounce } from '../../hooks/useDebounce';
import './AdminLocationsPage.css';

export const AdminLocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();
  const { t } = useLanguage();

  const [locations, setLocations] = useState<AdminLocationWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search, Filter, Sort & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebounce(searchQuery, 250);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [launchFilter, setLaunchFilter] = useState<'all' | 'launch_only'>('all');
  const [sortBy, setSortBy] = useState<'name_asc' | 'name_desc' | 'shops_desc' | 'recent'>('name_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Modal State: Add / Edit Location
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<Location | null>(null);
  const [name, setName] = useState('');
  const [stateName, setStateName] = useState('Tamil Nadu');
  const [pincode, setPincode] = useState('');
  const [isLaunchTown, setIsLaunchTown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Modal State: Safe Deactivation Confirmation
  const [deactivateModalOpen, setDeactivateModalOpen] = useState(false);
  const [targetLocToToggle, setTargetLocToToggle] = useState<AdminLocationWithStats | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  const loadLocations = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminLocations();
      setLocations(data);
    } catch (err) {
      console.error('Failed to load locations:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLocations();
  }, []);

  // Filter and sort locations
  const filteredLocations = useMemo(() => {
    return locations.filter((loc) => {
      // Status filter
      if (statusFilter === 'active' && !loc.is_active) return false;
      if (statusFilter === 'inactive' && loc.is_active) return false;

      // Launch town filter
      if (launchFilter === 'launch_only' && !loc.is_launch_town) return false;

      // Keyword search over name, state, pincode, or ID
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase().trim();
        const matchName = loc.name.toLowerCase().includes(q);
        const matchState = loc.state.toLowerCase().includes(q);
        const matchPincode = loc.pincode.toLowerCase().includes(q);
        const matchId = loc.id.toLowerCase().includes(q);
        return matchName || matchState || matchPincode || matchId;
      }

      return true;
    });
  }, [locations, statusFilter, launchFilter, debouncedSearch]);

  const sortedLocations = useMemo(() => {
    const list = [...filteredLocations];
    list.sort((a, b) => {
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
      if (sortBy === 'shops_desc') return b.shop_count - a.shop_count;
      if (sortBy === 'recent') {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });
    return list;
  }, [filteredLocations, sortBy]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, launchFilter, sortBy]);

  const pagedLocations = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedLocations.slice(start, start + pageSize);
  }, [sortedLocations, currentPage, pageSize]);

  const isFiltered = Boolean(searchQuery.trim() || statusFilter !== 'all' || launchFilter !== 'all');

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setLaunchFilter('all');
    setSortBy('name_asc');
  };

  const handleOpenAdd = () => {
    setEditingLoc(null);
    setName('');
    setStateName('Tamil Nadu');
    setPincode('');
    setIsLaunchTown(false);
    setFormError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (loc: AdminLocationWithStats) => {
    setEditingLoc(loc);
    setName(loc.name);
    setStateName(loc.state);
    setPincode(loc.pincode);
    setIsLaunchTown(loc.is_launch_town);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError(null);

    if (!name.trim()) {
      setFormError('Town or city name is required.');
      return;
    }
    if (!pincode.trim() || !/^\d{6}$/.test(pincode.trim())) {
      setFormError('Please enter a valid 6-digit postal PIN code.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveLocation(
        {
          id: editingLoc?.id,
          name: name.trim(),
          state: stateName.trim(),
          pincode: pincode.trim(),
          is_launch_town: isLaunchTown,
          is_active: editingLoc ? editingLoc.is_active : true,
        },
        user.id
      );

      if (res.success) {
        success(editingLoc ? t('locationUpdatedSuccess') : t('locationCreatedSuccess'));
        setModalOpen(false);
        loadLocations();
      } else {
        setFormError(res.error || t('failedSaveLocation'));
        toastError(res.error || t('failedSaveLocation'));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('genericError');
      setFormError(msg);
      toastError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePromptToggle = (loc: AdminLocationWithStats) => {
    setTargetLocToToggle(loc);
    setDeactivateModalOpen(true);
  };

  const handleConfirmToggle = async () => {
    if (!targetLocToToggle || !user) return;
    setIsToggling(true);
    const newStatus = !targetLocToToggle.is_active;

    try {
      const res = await toggleLocationActive(targetLocToToggle.id, newStatus, user.id);
      setDeactivateModalOpen(false);

      if (res.success) {
        success(
          newStatus
            ? `${targetLocToToggle.name} reactivated for customer discovery.`
            : `${targetLocToToggle.name} deactivated. Historical order records remain safe.`
        );
        loadLocations();
      } else {
        toastError(res.error || t('genericError'));
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : t('genericError'));
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="container vaango-admin-locs">
      {/* Header */}
      <div className="vaango-admin-locs__header">
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
          <h1 className="vaango-admin-locs__title">Hometowns & Operating Locations</h1>
          <p className="vaango-admin-locs__subtitle">
            Control which regional towns Vaango operates in. Deactivating a location hides it from new customer selection without destroying past orders or shop records.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenAdd} leftIcon={<Plus size={16} />}>
          {t('addLocation')}
        </Button>
      </div>

      {/* Information Retrieval Bar */}
      <SearchFilterBar
        id="admin-locations-search"
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        placeholder="Search by hometown, state, PIN code, or ID..."
        totalCount={locations.length}
        filteredCount={filteredLocations.length}
        isFiltered={isFiltered}
        onResetFilters={handleResetFilters}
      >
        <select
          className="vaango-admin-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          aria-label="Filter by discovery status"
        >
          <option value="all">Status: All</option>
          <option value="active">Active Towns Only</option>
          <option value="inactive">Deactivated</option>
        </select>

        <select
          className="vaango-admin-select"
          value={launchFilter}
          onChange={(e) => setLaunchFilter(e.target.value as any)}
          aria-label="Filter by launch tier"
        >
          <option value="all">Tier: All Locations</option>
          <option value="launch_only">Flagship Launch Towns Only</option>
        </select>

        <select
          className="vaango-admin-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          aria-label="Sort locations"
        >
          <option value="name_asc">Sort: Name (A – Z)</option>
          <option value="name_desc">Sort: Name (Z – A)</option>
          <option value="shops_desc">Sort: Most Shops</option>
          <option value="recent">Sort: Recently Added</option>
        </select>
      </SearchFilterBar>

      {/* Locations Directory Table */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
      ) : sortedLocations.length === 0 ? (
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          {isFiltered ? (
            <div>
              <p style={{ margin: '0 0 12px 0' }}>No locations found matching your search criteria.</p>
              <Button variant="outline" size="sm" onClick={handleResetFilters}>
                Clear Search & Filters
              </Button>
            </div>
          ) : (
            <p style={{ margin: 0 }}>No locations registered yet.</p>
          )}
        </Card>
      ) : (
        <>
          <Card variant="default" padding="none" className="vaango-admin-locs__table-card">
            <div className="vaango-admin-locs__table-responsive">
              <table className="vaango-admin-table" aria-label="Hometown locations list">
                <thead>
                  <tr>
                    <th>Location Name</th>
                    <th>Location ID</th>
                    <th>State</th>
                    <th>PIN Code</th>
                    <th>Associated Shops</th>
                    <th>Launch Town</th>
                    <th>Discovery Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedLocations.map((loc) => (
                    <tr key={loc.id} className={!loc.is_active ? 'vaango-admin-tr--inactive' : ''}>
                      <td>
                        <div className="vaango-admin-loc-name">
                          <MapPin size={16} className="vaango-admin-loc-icon" />
                          <strong>{loc.name}</strong>
                        </div>
                      </td>
                      <td>
                        <CopyableText text={loc.id} truncate label="Copy Location UUID" />
                      </td>
                      <td>{loc.state}</td>
                      <td><code>{loc.pincode}</code></td>
                      <td>
                        <span className="vaango-admin-shop-count">
                          <Store size={14} /> {loc.shop_count} shop{loc.shop_count !== 1 ? 's' : ''}
                          <small>({loc.active_shop_count} live)</small>
                        </span>
                      </td>
                      <td>
                        {loc.is_launch_town ? (
                          <Badge variant="primary" size="sm">
                            <Sparkles size={11} style={{ marginRight: 4 }} /> Hometown #1
                          </Badge>
                        ) : (
                          <span style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Expansion</span>
                        )}
                      </td>
                      <td>
                        {loc.is_active ? (
                          <Badge variant="success" size="sm" withDot>
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="neutral" size="sm">
                            Deactivated
                          </Badge>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="vaango-admin-actions-cell">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(loc)}
                            title="Edit Location Details"
                          >
                            <Edit2 size={14} />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePromptToggle(loc)}
                            className={loc.is_active ? 'vaango-btn--deactivate' : 'vaango-btn--reactivate'}
                          >
                            {loc.is_active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <PaginationControls
            currentPage={currentPage}
            totalItems={sortedLocations.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
          />
        </>
      )}

      {/* Add / Edit Location Modal with Proximity Error Banner & Preserved Inputs */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLoc ? `Edit ${editingLoc.name}` : 'Register New Hometown Location'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveLocation} className="vaango-loc-form" noValidate>
          <div className="vaango-form-group">
            <label htmlFor="loc-name">Hometown / City Name *</label>
            <Input
              id="loc-name"
              placeholder="e.g. Sathyamangalam"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (formError) setFormError(null);
              }}
              required
            />
          </div>

          <div className="vaango-form-row">
            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="loc-state">State *</label>
              <Input
                id="loc-state"
                value={stateName}
                onChange={(e) => {
                  setStateName(e.target.value);
                  if (formError) setFormError(null);
                }}
                required
              />
            </div>

            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="loc-pincode">PIN Code *</label>
              <Input
                id="loc-pincode"
                placeholder="638402"
                maxLength={6}
                value={pincode}
                onChange={(e) => {
                  setPincode(e.target.value);
                  if (formError) setFormError(null);
                }}
                required
              />
            </div>
          </div>

          <label className="vaango-checkbox-label">
            <input
              type="checkbox"
              checked={isLaunchTown}
              onChange={(e) => setIsLaunchTown(e.target.checked)}
            />
            <span>Mark as Flagship Hometown Launch Zone</span>
          </label>

          {/* Action-proximate error banner placed directly above submit action */}
          {formError && (
            <ActionErrorBanner
              id="admin-location-form-error"
              message={formError}
              variant={
                formError.toLowerCase().includes('network') || formError.toLowerCase().includes('fetch')
                  ? 'network'
                  : 'error'
              }
              action={{
                label: 'Retry Save',
                onClick: () => {
                  const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
                  void handleSaveLocation(syntheticEvent);
                },
              }}
              onDismiss={() => setFormError(null)}
            />
          )}

          <div className="vaango-modal-actions">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving} id="btn-save-location">
              {editingLoc ? 'Save Changes' : 'Create Location'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Safe Deactivation Confirmation Modal */}
      <Modal
        isOpen={deactivateModalOpen}
        onClose={() => setDeactivateModalOpen(false)}
        title={targetLocToToggle?.is_active ? 'Deactivate Location?' : 'Reactivate Location?'}
        maxWidth="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            {targetLocToToggle?.is_active ? (
              <>
                Deactivating <strong>{targetLocToToggle?.name}</strong> will prevent customers from discovering it in the location picker.
                <br /><br />
                <strong>Note:</strong> All existing shops, catalogues, orders, appointments, and historical transaction events will remain completely safe and intact.
              </>
            ) : (
              <>
                Reactivating <strong>{targetLocToToggle?.name}</strong> will allow local customers to immediately select this hometown again.
              </>
            )}
          </p>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setDeactivateModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={targetLocToToggle?.is_active ? 'danger' : 'primary'}
              onClick={handleConfirmToggle}
              isLoading={isToggling}
            >
              {targetLocToToggle?.is_active ? 'Confirm Deactivation' : 'Reactivate Location'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
