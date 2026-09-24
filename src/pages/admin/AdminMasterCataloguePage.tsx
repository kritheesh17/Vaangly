import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package,
  Search,
  Plus,
  CheckCircle2,
  XCircle,
  Archive,
  Edit2,
  Sparkles,
  ArrowLeft,
  Tag,
  Layers,
} from 'lucide-react';
import { MasterProduct, MasterProductStatus } from '../../types/database';
import {
  adminFetchMasterProducts,
  adminCreateMasterProduct,
  adminUpdateMasterProduct,
  adminModerateMasterProduct,
} from '../../lib/masterCatalogueApi';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import './AdminMasterCataloguePage.css';

interface ShopTypeOption {
  id: string;
  name: string;
  code: string;
}

export const AdminMasterCataloguePage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();

  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [shopTypes, setShopTypes] = useState<ShopTypeOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [shopTypeFilter, setShopTypeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<MasterProduct | null>(null);

  // Rejection Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Form states for Add / Edit
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [formShopTypeId, setFormShopTypeId] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch shop types for categories
  useEffect(() => {
    async function loadShopTypes() {
      const { data } = await supabase
        .from('shop_types')
        .select('id, name, code')
        .eq('is_active', true)
        .order('name');
      if (data) setShopTypes(data);
    }
    loadShopTypes();
  }, []);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await adminFetchMasterProducts({
        status: statusFilter,
        shopTypeId: shopTypeFilter !== 'all' ? shopTypeFilter : undefined,
        search: searchTerm,
      });
      setProducts(data);
    } catch (err) {
      console.error('Failed to load master products:', err);
      toastError('Failed to load master catalogue products');
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, shopTypeFilter, searchTerm, toastError]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Counts for summary cards
  const totalCount = products.length;
  const pendingCount = products.filter((p) => p.status === 'pending').length;
  const approvedCount = products.filter((p) => p.status === 'approved').length;
  const rejectedCount = products.filter((p) => p.status === 'rejected').length;
  const archivedCount = products.filter((p) => p.status === 'archived').length;

  const handleApprove = async (id: string, name: string) => {
    try {
      await adminModerateMasterProduct(id, 'approved');
      success(`Approved "${name}" into global catalogue`);
      loadProducts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to approve product');
    }
  };

  const handleOpenReject = (id: string) => {
    setRejectTargetId(id);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!rejectTargetId) return;
    setIsRejecting(true);
    try {
      await adminModerateMasterProduct(rejectTargetId, 'rejected', rejectReason);
      success('Product rejected with moderation note');
      setRejectModalOpen(false);
      setRejectTargetId(null);
      loadProducts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to reject product');
    } finally {
      setIsRejecting(false);
    }
  };

  const handleArchive = async (id: string, name: string) => {
    try {
      await adminModerateMasterProduct(id, 'archived', 'Archived by administrator');
      success(`Archived "${name}"`);
      loadProducts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to archive product');
    }
  };

  const handleOpenCreate = () => {
    setFormName('');
    setFormDescription('');
    setFormImageUrl('');
    setFormShopTypeId(shopTypes[0]?.id || '');
    setFormBrand('');
    setCreateModalOpen(true);
  };

  const handleOpenEdit = (p: MasterProduct) => {
    setEditProduct(p);
    setFormName(p.name);
    setFormDescription(p.description || '');
    setFormImageUrl(p.image_url || '');
    setFormShopTypeId(p.shop_type_id || '');
    setFormBrand(p.brand || '');
  };

  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      toastError('Product name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await adminCreateMasterProduct({
        name: formName.trim(),
        description: formDescription.trim() || null,
        image_url: formImageUrl.trim() || null,
        shop_type_id: formShopTypeId || null,
        brand: formBrand.trim() || null,
        status: 'approved',
      });
      success(`Created approved master product "${formName.trim()}"`);
      setCreateModalOpen(false);
      loadProducts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to create master product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;
    if (!formName.trim()) {
      toastError('Product name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      await adminUpdateMasterProduct(editProduct.id, {
        name: formName.trim(),
        description: formDescription.trim() || null,
        image_url: formImageUrl.trim() || null,
        shop_type_id: formShopTypeId || null,
        brand: formBrand.trim() || null,
      });
      success(`Updated master product "${formName.trim()}"`);
      setEditProduct(null);
      loadProducts();
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to update master product');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: MasterProductStatus) => {
    switch (status) {
      case 'approved':
        return <Badge variant="success">Approved</Badge>;
      case 'pending':
        return <Badge variant="warning">Pending Review</Badge>;
      case 'rejected':
        return <Badge variant="error">Rejected</Badge>;
      case 'archived':
        return <Badge variant="neutral">Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <div className="container vaango-admin-catalogue">
      {/* Top Header */}
      <div className="vaango-admin-catalogue__header">
        <div className="vaango-admin-catalogue__breadcrumb">
          <button
            type="button"
            className="vaango-back-btn"
            onClick={() => navigate('/admin/dashboard')}
          >
            <ArrowLeft size={16} />
            <span>Operations Dashboard</span>
          </button>
        </div>

        <div className="vaango-admin-catalogue__title-row">
          <div>
            <div className="vaango-admin-catalogue__tag">
              <Layers size={14} />
              <span>Master Catalogue Console</span>
            </div>
            <h1 className="vaango-admin-catalogue__title">Global Master Products</h1>
            <p className="vaango-admin-catalogue__subtitle">
              Manage standardized reference products, review merchant proposals, and maintain platform catalogue quality.
            </p>
          </div>

          <Button variant="primary" size="md" onClick={handleOpenCreate}>
            <Plus size={18} />
            <span>Add Master Product</span>
          </Button>
        </div>
      </div>

      {/* Stats Summary Cards */}
      <div className="vaango-admin-catalogue__stats">
        <Card className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--blue">
            <Package size={20} />
          </div>
          <div className="vaango-admin-stat-card__data">
            <span className="vaango-admin-stat-card__count">{totalCount}</span>
            <span className="vaango-admin-stat-card__label">Total Products</span>
          </div>
        </Card>

        <Card className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--amber">
            <Sparkles size={20} />
          </div>
          <div className="vaango-admin-stat-card__data">
            <span className="vaango-admin-stat-card__count">{pendingCount}</span>
            <span className="vaango-admin-stat-card__label">Pending Proposals</span>
          </div>
        </Card>

        <Card className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--green">
            <CheckCircle2 size={20} />
          </div>
          <div className="vaango-admin-stat-card__data">
            <span className="vaango-admin-stat-card__count">{approvedCount}</span>
            <span className="vaango-admin-stat-card__label">Approved Live</span>
          </div>
        </Card>

        <Card className="vaango-admin-stat-card">
          <div className="vaango-admin-stat-card__icon vaango-admin-stat-card__icon--gray">
            <Archive size={20} />
          </div>
          <div className="vaango-admin-stat-card__data">
            <span className="vaango-admin-stat-card__count">{rejectedCount + archivedCount}</span>
            <span className="vaango-admin-stat-card__label">Rejected / Archived</span>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <Card className="vaango-admin-catalogue__filters">
        <div className="vaango-admin-filter-row">
          <div className="vaango-admin-search-box">
            <Search size={18} className="vaango-admin-search-icon" />
            <input
              type="text"
              className="vaango-admin-search-input"
              placeholder="Search by product name or brand..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="vaango-admin-select-group">
            <select
              className="vaango-admin-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Proposals</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="archived">Archived</option>
            </select>

            <select
              className="vaango-admin-select"
              value={shopTypeFilter}
              onChange={(e) => setShopTypeFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              {shopTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      {/* Master Products List / Table */}
      <div className="vaango-admin-catalogue__body">
        {isLoading ? (
          <div className="vaango-admin-loading">
            <Skeleton className="h-16 w-full mb-3" />
            <Skeleton className="h-16 w-full mb-3" />
            <Skeleton className="h-16 w-full mb-3" />
          </div>
        ) : products.length === 0 ? (
          <Card className="vaango-admin-empty-state">
            <Package size={48} className="vaango-admin-empty-icon" />
            <h3>No Master Products Found</h3>
            <p className="text-secondary">
              {searchTerm || statusFilter !== 'all' || shopTypeFilter !== 'all'
                ? 'Try adjusting your search criteria or filters.'
                : 'Get started by creating the first master catalogue product.'}
            </p>
            <Button variant="primary" onClick={handleOpenCreate} className="mt-3">
              <Plus size={16} /> Add Master Product
            </Button>
          </Card>
        ) : (
          <div className="vaango-admin-table-container">
            <table className="vaango-admin-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                  <th>Status</th>
                  <th>Contributor</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="vaango-admin-product-cell">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            className="vaango-admin-product-thumb"
                          />
                        ) : (
                          <div className="vaango-admin-product-placeholder">
                            <Package size={20} />
                          </div>
                        )}
                        <div className="vaango-admin-product-info">
                          <strong className="vaango-admin-product-name">{p.name}</strong>
                          {p.brand && (
                            <span className="vaango-admin-product-brand">
                              <Tag size={11} /> {p.brand}
                            </span>
                          )}
                          {p.description && (
                            <p className="vaango-admin-product-desc">{p.description}</p>
                          )}
                          {p.moderation_reason && (
                            <span className="vaango-admin-product-reason">
                              Reason: {p.moderation_reason}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge variant="neutral">
                        {p.shop_types?.name || 'Unassigned'}
                      </Badge>
                    </td>
                    <td>{getStatusBadge(p.status)}</td>
                    <td>
                      <span className="vaango-admin-meta-text">
                        {p.created_by ? 'Merchant Proposal' : 'System Admin'}
                      </span>
                    </td>
                    <td>
                      <span className="vaango-admin-meta-text">
                        {new Date(p.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td>
                      <div className="vaango-admin-actions-cell">
                        {p.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="primary"
                              onClick={() => handleApprove(p.id, p.name)}
                              title="Approve Proposal"
                            >
                              <CheckCircle2 size={14} />
                              <span>Approve</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenReject(p.id)}
                              title="Reject Proposal"
                            >
                              <XCircle size={14} />
                              <span>Reject</span>
                            </Button>
                          </>
                        )}

                        {p.status === 'approved' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenEdit(p)}
                              title="Edit Master Product"
                            >
                              <Edit2 size={14} />
                              <span>Edit</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleArchive(p.id, p.name)}
                              title="Archive Master Product"
                            >
                              <Archive size={14} />
                              <span>Archive</span>
                            </Button>
                          </>
                        )}

                        {(p.status === 'rejected' || p.status === 'archived') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleApprove(p.id, p.name)}
                              title="Restore/Approve to Live Catalogue"
                            >
                              <CheckCircle2 size={14} />
                              <span>Restore</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenEdit(p)}
                              title="Edit Product"
                            >
                              <Edit2 size={14} />
                              <span>Edit</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Master Product Modal */}
      {createModalOpen && (
        <Modal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          title="Add New Master Catalogue Product"
        >
          <form onSubmit={handleSaveCreate} className="vaango-admin-form">
            <div className="vaango-form-group">
              <label className="vaango-form-label">Product Name *</label>
              <Input
                placeholder="e.g. Basmati Rice, Full Cream Milk..."
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Brand / Manufacturer (Optional)</label>
              <Input
                placeholder="e.g. India Gate, Amul, Britannia..."
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Category *</label>
              <select
                className="vaango-admin-select w-full"
                value={formShopTypeId}
                onChange={(e) => setFormShopTypeId(e.target.value)}
                required
              >
                <option value="">Select Category</option>
                {shopTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Description (Optional)</label>
              <textarea
                className="vaango-admin-textarea"
                rows={3}
                placeholder="Standard reusable product description..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Standard Image URL (Optional)</label>
              <Input
                placeholder="https://... (or leave empty)"
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
              />
            </div>

            <div className="vaango-admin-form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create & Approve Product'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Master Product Modal */}
      {editProduct && (
        <Modal
          isOpen={Boolean(editProduct)}
          onClose={() => setEditProduct(null)}
          title={`Edit Master Product: ${editProduct.name}`}
        >
          <form onSubmit={handleSaveEdit} className="vaango-admin-form">
            <div className="vaango-form-group">
              <label className="vaango-form-label">Product Name *</label>
              <Input
                placeholder="Product name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Brand / Manufacturer</label>
              <Input
                placeholder="Brand name"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Category</label>
              <select
                className="vaango-admin-select w-full"
                value={formShopTypeId}
                onChange={(e) => setFormShopTypeId(e.target.value)}
              >
                <option value="">Select Category</option>
                {shopTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Description</label>
              <textarea
                className="vaango-admin-textarea"
                rows={3}
                placeholder="Standard reusable product description..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label">Standard Image URL</label>
              <Input
                placeholder="https://..."
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
              />
            </div>

            <div className="vaango-admin-form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditProduct(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Reject Proposal Modal */}
      {rejectModalOpen && (
        <Modal
          isOpen={rejectModalOpen}
          onClose={() => setRejectModalOpen(false)}
          title="Reject Master Product Proposal"
        >
          <div className="vaango-admin-form">
            <p className="text-secondary mb-3">
              Please specify a reason for rejecting this product proposal. This note will be recorded in the audit trail.
            </p>
            <div className="vaango-form-group">
              <label className="vaango-form-label">Rejection Reason</label>
              <textarea
                className="vaango-admin-textarea"
                rows={3}
                placeholder="e.g. Duplicate product exists, inaccurate details, prohibited item..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>

            <div className="vaango-admin-form-actions">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRejectModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isRejecting}
                onClick={handleConfirmReject}
              >
                {isRejecting ? 'Rejecting...' : 'Confirm Rejection'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
