import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Plus,
  Edit2,
  AlertCircle,
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
import './AdminLocationsPage.css';

export const AdminLocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [locations, setLocations] = useState<AdminLocationWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    setIsSaving(false);

    if (res.success) {
      success(editingLoc ? 'Location updated successfully.' : 'New operating town registered.');
      setModalOpen(false);
      loadLocations();
    } else {
      setFormError(res.error || 'Failed to save location.');
      toastError(res.error || 'Failed to save location.');
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

    const res = await toggleLocationActive(targetLocToToggle.id, newStatus, user.id);
    setIsToggling(false);
    setDeactivateModalOpen(false);

    if (res.success) {
      success(
        newStatus
          ? `${targetLocToToggle.name} reactivated for customer discovery.`
          : `${targetLocToToggle.name} deactivated. Historical order records remain safe.`
      );
      loadLocations();
    } else {
      toastError(res.error || 'Failed to update location status.');
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
            <span>Dashboard</span>
          </button>
          <h1 className="vaango-admin-locs__title">Hometowns & Operating Locations</h1>
          <p className="vaango-admin-locs__subtitle">
            Control which regional towns Vaango operates in. Deactivating a location hides it from new customer selection without destroying past orders or shop records.
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenAdd} leftIcon={<Plus size={16} />}>
          Add New Location
        </Button>
      </div>

      {/* Locations Directory Table */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <Skeleton height={60} />
          <Skeleton height={60} />
          <Skeleton height={60} />
        </div>
      ) : (
        <Card variant="default" padding="none" className="vaango-admin-locs__table-card">
          <div className="vaango-admin-locs__table-responsive">
            <table className="vaango-admin-table" aria-label="Hometown locations list">
              <thead>
                <tr>
                  <th>Location Name</th>
                  <th>State</th>
                  <th>PIN Code</th>
                  <th>Associated Shops</th>
                  <th>Launch Town</th>
                  <th>Discovery Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {locations.map((loc) => (
                  <tr key={loc.id} className={!loc.is_active ? 'vaango-admin-tr--inactive' : ''}>
                    <td>
                      <div className="vaango-admin-loc-name">
                        <MapPin size={16} className="vaango-admin-loc-icon" />
                        <strong>{loc.name}</strong>
                      </div>
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
      )}

      {/* Add / Edit Location Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLoc ? `Edit ${editingLoc.name}` : 'Register New Hometown Location'}
        maxWidth="md"
      >
        <form onSubmit={handleSaveLocation} className="vaango-loc-form">
          {formError && (
            <div className="vaango-form-error-banner">
              <AlertCircle size={16} />
              <span>{formError}</span>
            </div>
          )}

          <div className="vaango-form-group">
            <label htmlFor="loc-name">Hometown / City Name *</label>
            <Input
              id="loc-name"
              placeholder="e.g. Sathyamangalam"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="vaango-form-row">
            <div className="vaango-form-group" style={{ flex: 1 }}>
              <label htmlFor="loc-state">State *</label>
              <Input
                id="loc-state"
                value={stateName}
                onChange={(e) => setStateName(e.target.value)}
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
                onChange={(e) => setPincode(e.target.value)}
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

          <div className="vaango-modal-actions">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={isSaving}>
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
