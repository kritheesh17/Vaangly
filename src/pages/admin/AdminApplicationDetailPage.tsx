import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Store,
  MapPin,
  Phone,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  ExternalLink,
  Navigation,
  FileText,
  User,
} from 'lucide-react';
import {
  fetchApplicationDetail,
  approveShopApplication,
  rejectShopApplication,
} from '../../lib/adminApi';
import { ShopApplication } from '../../types/database';
import { MOCK_SHOP_TYPES, getShopType } from '../../data/mockData';
import { DEFAULT_LOCATIONS } from '../../context/LocationContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import './AdminApplicationDetailPage.css';

export const AdminApplicationDetailPage: React.FC = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { success, error: toastError } = useToast();

  const [application, setApplication] = useState<ShopApplication | null>(null);
  const [idProofLink, setIdProofLink] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Approval Modal State
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('Storefront verified and identity approved.');
  const [isApproving, setIsApproving] = useState(false);

  // Rejection Modal State
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const loadDetail = async () => {
    if (!applicationId) return;
    setIsLoading(true);
    try {
      const data = await fetchApplicationDetail(applicationId);
      setApplication(data);
      if (data?.id_proof_url) {
        if (
          isSupabaseConfigured &&
          !data.id_proof_url.startsWith('data:') &&
          !data.id_proof_url.startsWith('http') &&
          !data.id_proof_url.startsWith('blob:') &&
          !data.id_proof_url.startsWith('local://')
        ) {
          try {
            const { data: signedData } = await supabase.storage
              .from('shop-documents')
              .createSignedUrl(data.id_proof_url, 600);
            setIdProofLink(signedData?.signedUrl || data.id_proof_url);
          } catch {
            setIdProofLink(data.id_proof_url);
          }
        } else {
          setIdProofLink(data.id_proof_url);
        }
      }
    } catch (err) {
      console.error('Error fetching application detail:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [applicationId]);

  const handleApprove = async () => {
    if (!applicationId || !user) return;
    setIsApproving(true);
    try {
      const res = await approveShopApplication(applicationId, user.id, approvalNotes);
      setApproveModalOpen(false);

      if (res.success) {
        success('Shop Application Approved! Shop is created with "Catalogue Incomplete" status.');
        loadDetail();
      } else {
        toastError(res.error || 'Failed to approve application.');
      }
    } catch (err: unknown) {
      toastError(err instanceof Error ? err.message : 'Error approving application.');
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!applicationId || !user) return;
    if (!rejectionReason.trim()) {
      setRejectError('Please provide a mandatory reason for rejecting this application.');
      return;
    }

    setIsRejecting(true);
    try {
      const res = await rejectShopApplication(applicationId, user.id, rejectionReason.trim());

      if (res.success) {
        success('Application marked as Rejected with mandatory audit note.');
        setRejectModalOpen(false);
        loadDetail();
      } else {
        setRejectError(res.error || 'Failed to reject application.');
      }
    } catch (err: unknown) {
      setRejectError(err instanceof Error ? err.message : 'Error rejecting application.');
    } finally {
      setIsRejecting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container vaango-admin-app-detail">
        <Skeleton height={40} width={200} style={{ marginBottom: 16 }} />
        <Skeleton height={200} style={{ marginBottom: 20 }} />
        <Skeleton height={140} />
      </div>
    );
  }

  if (!application) {
    return (
      <div className="container vaango-admin-app-detail">
        <Card variant="outlined" padding="lg" style={{ textAlign: 'center' }}>
          <h2>Application Not Found</h2>
          <p style={{ color: 'var(--color-text-muted)' }}>The requested merchant onboarding application does not exist.</p>
          <Button variant="outline" onClick={() => navigate('/admin/applications')}>
            Back to Applications
          </Button>
        </Card>
      </div>
    );
  }

  const shopType = getShopType(application.shop_type_id);
  const location = DEFAULT_LOCATIONS.find((l) => l.id === application.location_id);

  return (
    <div className="container vaango-admin-app-detail">
      {/* Navigation */}
      <button
        type="button"
        className="vaango-back-btn"
        onClick={() => navigate('/admin/applications')}
        aria-label="Back to applications list"
      >
        <ArrowLeft size={16} />
        <span>Applications List</span>
      </button>

      {/* Header Banner */}
      <div className="vaango-app-detail__header">
        <div>
          <div className="vaango-app-detail__badge-row">
            <span className="vaango-app-detail__kicker">KYC Verification Review</span>
            <Badge
              variant={
                application.status === 'approved'
                  ? 'success'
                  : application.status === 'rejected'
                  ? 'error'
                  : 'warning'
              }
              size="md"
              withDot
            >
              {application.status.toUpperCase()}
            </Badge>
          </div>
          <h1 className="vaango-app-detail__title">{application.shop_name}</h1>
          <p className="vaango-app-detail__subtitle">
            Submitted on {new Date(application.created_at).toLocaleDateString('en-IN', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {/* Action Controls for Pending Applications */}
        {application.status === 'submitted' || application.status === 'under_review' ? (
          <div className="vaango-app-detail__actions">
            <Button
              variant="outline"
              onClick={() => {
                setRejectionReason('');
                setRejectError(null);
                setRejectModalOpen(true);
              }}
              className="vaango-btn--danger-outline"
              leftIcon={<XCircle size={16} />}
            >
              Reject Application
            </Button>
            <Button
              variant="primary"
              onClick={() => setApproveModalOpen(true)}
              leftIcon={<CheckCircle2 size={16} />}
            >
              Approve Storefront
            </Button>
          </div>
        ) : (
          <div className="vaango-app-detail__actions">
            <Badge variant={application.status === 'approved' ? 'success' : 'neutral'} size="md">
              Decision Recorded
            </Badge>
          </div>
        )}
      </div>

      {/* Main Review Sections */}
      <div className="vaango-app-detail__grid">
        {/* Left Column: Business & Identity Details */}
        <div className="vaango-app-detail__col-main">
          <Card variant="default" padding="lg" className="vaango-app-detail__section-card">
            <h2 className="vaango-app-detail__sec-heading">
              <Store size={18} /> Storefront & Category Profile
            </h2>
            <div className="vaango-app-detail__info-grid">
              <div>
                <span className="vaango-field-label">Shop Name</span>
                <span className="vaango-field-value">{application.shop_name}</span>
              </div>
              <div>
                <span className="vaango-field-label">Selected Shop Type</span>
                <span className="vaango-field-value">{shopType?.name || 'Retail Store'}</span>
              </div>
              <div>
                <span className="vaango-field-label">Workflow Vertical</span>
                <span className="vaango-field-value">
                  <Badge variant="neutral" size="sm">
                    {shopType?.workflow_group_code || 'ORDER'}
                  </Badge>
                </span>
              </div>
              <div>
                <span className="vaango-field-label">Operating Hometown</span>
                <span className="vaango-field-value">
                  <MapPin size={14} style={{ marginRight: 4, color: 'var(--color-primary)' }} />
                  {location?.name || 'Hometown Zone'} ({location?.pincode})
                </span>
              </div>
              {application.area && (
                <div>
                  <span className="vaango-field-label">Area / Locality</span>
                  <span className="vaango-field-value">{application.area}</span>
                </div>
              )}
              {application.taluk && (
                <div>
                  <span className="vaango-field-label">Taluk</span>
                  <span className="vaango-field-value">{application.taluk}</span>
                </div>
              )}
              {application.district && (
                <div>
                  <span className="vaango-field-label">District</span>
                  <span className="vaango-field-value">{application.district}</span>
                </div>
              )}
              {application.pincode && (
                <div>
                  <span className="vaango-field-label">Postal Pincode</span>
                  <span className="vaango-field-value">{application.pincode}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              <span className="vaango-field-label">Storefront Description</span>
              <p className="vaango-app-detail__desc">
                {application.description || 'No description provided by applicant.'}
              </p>
            </div>
          </Card>

          <Card variant="default" padding="lg" className="vaango-app-detail__section-card">
            <h2 className="vaango-app-detail__sec-heading">
              <User size={18} /> Owner & Contact Information
            </h2>
            <div className="vaango-app-detail__info-grid">
              <div>
                <span className="vaango-field-label">Owner / Operator Name</span>
                <span className="vaango-field-value">{application.owner_name || 'Store Merchant'}</span>
              </div>
              <div>
                <span className="vaango-field-label">Primary Contact Phone</span>
                <span className="vaango-field-value">
                  <Phone size={14} style={{ marginRight: 4 }} />
                  {application.contact_phone}
                </span>
              </div>
              <div>
                <span className="vaango-field-label">Applicant User ID</span>
                <span className="vaango-field-value">
                  <code>{application.applicant_id}</code>
                </span>
              </div>
            </div>
          </Card>

          {/* Sensitive Document Security Section */}
          <Card variant="default" padding="lg" className="vaango-app-detail__section-card vaango-doc-sec-card">
            <div className="vaango-doc-sec__header">
              <div className="vaango-doc-sec__icon">
                <Shield size={20} />
              </div>
              <div>
                <h2 className="vaango-app-detail__sec-heading" style={{ margin: 0 }}>
                  Private KYC & Trade Identity Document
                </h2>
                <p className="vaango-doc-sec__hint">
                  Protected Document Policy: Access is strictly restricted to verified platform admins. Customers and other shopkeepers have zero access.
                </p>
              </div>
            </div>

            {application.id_proof_url ? (() => {
              const isBase64 = application.id_proof_url.startsWith('data:');
              const isLocal = application.id_proof_url.startsWith('local://');
              const isPdf = application.id_proof_url.toLowerCase().includes('.pdf') || application.id_proof_url.startsWith('data:application/pdf');
              const isImage = !isPdf && idProofLink && !isLocal;
              const displayFilename = isBase64
                ? 'merchant_kyc_document.jpg'
                : (application.id_proof_url.split('/').pop() || 'merchant_identity_proof');

              return (
                <>
                  <div className="vaango-doc-box">
                    <div className="vaango-doc-box__left">
                      <FileText size={24} className="vaango-doc-box__file-icon" />
                      <div className="vaango-doc-box__path">
                        <strong>Merchant Identity Proof</strong>
                        <code>{displayFilename}</code>
                      </div>
                    </div>
                    <Badge variant={isLocal ? 'neutral' : 'primary'} size="sm">
                      {isLocal ? 'Demo Local File' : 'Verified In Storage'}
                    </Badge>
                  </div>

                  {/* Document preview if image */}
                  {isImage && (
                    <div className="vaango-kyc-preview-container">
                      <div className="vaango-kyc-preview-header">
                        <span>Identity Document Preview</span>
                        <a href={idProofLink} target="_blank" rel="noopener noreferrer" className="vaango-kyc-open-link">
                          <ExternalLink size={13} /> Open full size
                        </a>
                      </div>
                      <div className="vaango-kyc-img-wrapper">
                        <img src={idProofLink} alt="Merchant Identity Proof" className="vaango-kyc-img" />
                      </div>
                    </div>
                  )}

                  {/* PDF or generic document link */}
                  {isPdf && idProofLink && !isLocal && (
                    <div className="vaango-kyc-pdf-container">
                      <a href={idProofLink} target="_blank" rel="noopener noreferrer" className="vaango-gps-link">
                        <FileText size={16} /> Open PDF Proof Document in New Tab
                      </a>
                    </div>
                  )}

                  {isLocal && (
                    <div className="vaango-doc-local-badge">
                      <FileText size={14} /> Identity proof uploaded (Stored locally in offline demo mode)
                    </div>
                  )}
                </>
              );
            })() : (
              <div className="vaango-doc-empty">
                <AlertCircle size={16} />
                <span>No identity document was submitted with this application.</span>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Photos & GPS Location */}
        <div className="vaango-app-detail__col-side">
          <Card variant="default" padding="lg" className="vaango-app-detail__section-card">
            <h2 className="vaango-app-detail__sec-heading">
              <Store size={18} /> Verification Photos
            </h2>
            {(application.photo_urls?.length || application.photo_url) ? (
              <div className="vaango-verification-photo-grid">
                {(application.photo_urls?.length ? application.photo_urls : [application.photo_url!]).map((url, idx) => {
                  const isLocal = url.startsWith('local://');
                  return (
                    <div key={url + idx} className="vaango-verification-photo-wrap">
                      {isLocal ? (
                        <div className="vaango-photo-local-fallback">
                          <Store size={20} />
                          <span>Demo Photo #{idx + 1}</span>
                          <span className="vaango-photo-subtext">Supabase Storage unconfigured</span>
                        </div>
                      ) : (
                        <a href={url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={url}
                            alt={`Storefront photo ${idx + 1} for ${application.shop_name}`}
                            className="vaango-app-detail__photo"
                          />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="vaango-app-detail__no-photo">
                <Store size={32} />
                <span>⚠ No shop photos uploaded — consider requesting before approval</span>
              </div>
            )}
            {application.google_maps_url && <a href={application.google_maps_url} target="_blank" rel="noopener noreferrer" className="vaango-gmaps-verify-link"><MapPin size={14} /> View shop on Google Maps - verify photos and existence</a>}
            {application.upi_qr_url && (
              application.upi_qr_url.startsWith('local://') ? (
                <div className="vaango-doc-local-badge">
                  <FileText size={14} /> UPI QR code uploaded (Stored locally in demo mode)
                </div>
              ) : (
                <img src={application.upi_qr_url} alt="Shop UPI QR code" className="vaango-app-detail__photo" />
              )
            )}
          </Card>

          <Card variant="default" padding="lg" className="vaango-app-detail__section-card">
            <h2 className="vaango-app-detail__sec-heading">
              <Navigation size={18} /> Live Device GPS Coordinates
            </h2>
            {application.gps_lat && application.gps_lng ? (
              <div className="vaango-app-detail__gps-box">
                <div className="vaango-gps-coords">
                  <span>Latitude: <strong>{application.gps_lat}</strong></span>
                  <span>Longitude: <strong>{application.gps_lng}</strong></span>
                </div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${application.gps_lat},${application.gps_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="vaango-gps-link"
                >
                  <ExternalLink size={14} /> Open Location in Google Maps
                </a>
              </div>
            ) : (
              <div className="vaango-app-detail__no-photo">
                <MapPin size={24} />
                <span>GPS coordinates not captured</span>
              </div>
            )}
          </Card>

          {application.review_notes && (
            <Card variant="outlined" padding="md" className="vaango-audit-notes-card">
              <span className="vaango-field-label">Review Audit Notes</span>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: 'var(--color-text)' }}>
                {application.review_notes}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Approval Confirmation Modal */}
      <Modal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        title="Approve Shop Application?"
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Approving <strong>{application.shop_name}</strong> will create a new shop record in <strong>Active</strong> status.
            <br /><br />
            <strong>Important Product Rule:</strong> The shop will be initialized with <code>is_live = false</code> (<strong>Approved — Catalogue Incomplete</strong>). It will remain invisible to customers until the shopkeeper adds their catalogue items/services and turns the shop live. A 60-day trial subscription will be initialized.
          </p>

          <div className="vaango-form-group">
            <label htmlFor="approval-notes">Approval Notes (Optional)</label>
            <input
              id="approval-notes"
              className="vaango-input"
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="e.g. Identity and storefront verified."
            />
          </div>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setApproveModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleApprove} isLoading={isApproving}>
              Confirm Approval
            </Button>
          </div>
        </div>
      </Modal>

      {/* Rejection Modal with Mandatory Reason */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => setRejectModalOpen(false)}
        title="Reject Shop Application"
        maxWidth="md"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, color: 'var(--color-text-muted)', lineHeight: 1.5 }}>
            Please state why this application cannot be approved. This reason will be recorded in the audit log and communicated to the merchant applicant.
          </p>

          {rejectError && (
            <div className="vaango-form-error-banner">
              <AlertCircle size={16} />
              <span>{rejectError}</span>
            </div>
          )}

          <div className="vaango-form-group">
            <label htmlFor="rejection-reason">Mandatory Rejection Reason *</label>
            <textarea
              id="rejection-reason"
              className="vaango-input"
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Storefront photo was unclear and the uploaded trade identity document could not be verified."
              required
            />
          </div>

          <div className="vaango-modal-actions">
            <Button variant="outline" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleReject} isLoading={isRejecting}>
              Reject Application
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
