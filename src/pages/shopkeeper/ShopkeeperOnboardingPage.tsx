import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Store,
  MapPin,
  Camera,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  ArrowRight,
  X,
  Plus,
  ImagePlus,
  FileText,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import { useLocationContext } from '../../context/LocationContext';
import {
  submitShopApplication,
  getLatestApplication,
  simulateApplicationReview,
} from '../../lib/shopkeeperApi';
import { ShopApplication } from '../../types/database';
import { GPSLocationPicker } from '../../components/shopkeeper/GPSLocationPicker';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import './ShopkeeperOnboardingPage.css';

export const ShopkeeperOnboardingPage: React.FC = () => {
  const { user } = useAuth();
  const { selectedLocation } = useLocationContext();
  const navigate = useNavigate();
  const { success, error: toastError, info } = useToast();
  const groupLabels = {
    ORDER: 'Group A - Order-Based',
    APPOINTMENT: 'Group B - Appointment',
    SERVICE: 'Group C - Quote/Service',
  } as const;

  const [existingApp, setExistingApp] = useState<ShopApplication | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form Fields
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState(user?.full_name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [shopTypeId, setShopTypeId] = useState(MOCK_SHOP_TYPES[0]?.id || '');
  const [description, setDescription] = useState('');
  const [shopPhotos, setShopPhotos] = useState<File[]>([]);
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null);
  const [upiId, setUpiId] = useState('');
  const [idProofFile, setIdProofFile] = useState<File | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Refs for file uploads
  const photoInputRef = useRef<HTMLInputElement>(null);
  const upiQrInputRef = useRef<HTMLInputElement>(null);
  const idProofInputRef = useRef<HTMLInputElement>(null);
  const [isPhotoDragging, setIsPhotoDragging] = useState(false);

  // Storefront photos preview URLs with proper cleanup
  const [photoPreviews, setPhotoPreviews] = useState<{ id: string; file: File; url: string }[]>([]);

  useEffect(() => {
    const previews = shopPhotos.map((file, idx) => ({
      id: `${file.name}-${file.size}-${idx}`,
      file,
      url: URL.createObjectURL(file),
    }));
    setPhotoPreviews(previews);

    return () => {
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [shopPhotos]);

  // UPI QR Preview with cleanup
  const [upiQrPreview, setUpiQrPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!upiQrFile) {
      setUpiQrPreview(null);
      return;
    }
    const url = URL.createObjectURL(upiQrFile);
    setUpiQrPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [upiQrFile]);

  // ID Proof Preview with cleanup
  const [idProofPreview, setIdProofPreview] = useState<{ url: string; isImage: boolean } | null>(null);
  useEffect(() => {
    if (!idProofFile) {
      setIdProofPreview(null);
      return;
    }
    const isImage = idProofFile.type.startsWith('image/');
    const url = isImage ? URL.createObjectURL(idProofFile) : '';
    setIdProofPreview({ url, isImage });
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [idProofFile]);

  // Incremental photo adder (allows multi-select or one-by-one addition without wiping previous ones)
  const handleAddPhotos = (files: FileList | File[] | null) => {
    if (!files) return;
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'));
    if (incoming.length === 0) {
      toastError('Please select valid image files (JPG, PNG, WebP).');
      return;
    }

    setShopPhotos((prev) => {
      // De-duplicate by name and size
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const uniqueIncoming = incoming.filter((f) => !existingKeys.has(`${f.name}-${f.size}`));

      if (uniqueIncoming.length === 0) {
        toastError('The selected photo is already added.');
        return prev;
      }

      if (prev.length + uniqueIncoming.length > 10) {
        const allowed = Math.max(0, 10 - prev.length);
        if (allowed > 0) {
          info(`Maximum 10 storefront photos allowed. Added ${allowed} photo(s).`);
          return [...prev, ...uniqueIncoming.slice(0, allowed)];
        } else {
          info('Maximum of 10 storefront photos reached.');
          return prev;
        }
      }

      return [...prev, ...uniqueIncoming];
    });

    if (photoInputRef.current) {
      photoInputRef.current.value = '';
    }
  };

  const handleRemovePhoto = (indexToRemove: number) => {
    setShopPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const uploadFile = async (bucket: string, path: string, file: File): Promise<string> => {
    if (!isSupabaseConfigured) {
      // In offline/demo mode, convert images to compact Base64 data URLs so admin review can preview them
      return new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (file.type.startsWith('image/')) {
            const img = new Image();
            img.onload = () => {
              const canvas = document.createElement('canvas');
              const maxDim = 800;
              let { width, height } = img;
              if (width > maxDim || height > maxDim) {
                if (width > height) {
                  height = Math.round((height * maxDim) / width);
                  width = maxDim;
                } else {
                  width = Math.round((width * maxDim) / height);
                  height = maxDim;
                }
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
                return;
              }
              resolve(result);
            };
            img.onerror = () => resolve(result);
            img.src = result;
          } else {
            resolve(result);
          }
        };
        reader.onerror = () => resolve(`local://${path}`);
        reader.readAsDataURL(file);
      });
    }
    const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) throw error;
    if (bucket === 'shop-documents') return path;
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };

  useEffect(() => {
    async function checkApplication() {
      if (!user) {
        setIsLoading(false);
        return;
      }
      try {
        const app = await getLatestApplication(user.id);
        if (app) setExistingApp(app);
      } catch (err) {
        console.error('Error fetching application:', err);
      } finally {
        setIsLoading(false);
      }
    }
    checkApplication();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!user) {
      toastError('Please sign in first.');
      return;
    }

    if (!shopName.trim()) {
      setFormError('Shop name is required.');
      return;
    }
    if (!contactPhone.trim()) {
      setFormError('Contact phone number is required.');
      return;
    }
    if (!gpsCoords) {
      setFormError('Please capture your storefront live GPS coordinates.');
      return;
    }
    if (shopPhotos.length < 4 || shopPhotos.length > 10) {
      setFormError('Please upload between 4 and 10 storefront photos.');
      return;
    }
    if (!idProofFile) {
      setFormError('Government ID proof is required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const photoUrls = await Promise.all(
        shopPhotos.map((file, index) => uploadFile('shop-photos', `shop-photos/${user.id}/photos/${Date.now()}_${index}.jpg`, file))
      );
      const idProofPath = await uploadFile('shop-documents', `${user.id}/id_proof_${Date.now()}${idProofFile.name.toLowerCase().endsWith('.pdf') ? '.pdf' : '.jpg'}`, idProofFile);
      const upiQrUrl = upiQrFile
        ? await uploadFile('shop-photos', `shop-photos/${user.id}/upi_qr.jpg`, upiQrFile)
        : null;
      const res = await submitShopApplication({
        applicant_id: user.id,
        shop_name: shopName.trim(),
        owner_name: ownerName.trim(),
        description: description.trim() || null,
        shop_type_id: shopTypeId,
        location_id: selectedLocation.id,
        contact_phone: contactPhone.trim(),
        photo_url: photoUrls[0] || null,
        photo_urls: photoUrls,
        upi_id: upiId.trim() || null,
        upi_qr_url: upiQrUrl,
        id_proof_url: idProofPath,
        gps_lat: gpsCoords.lat,
        gps_lng: gpsCoords.lng,
        google_maps_url: googleMapsUrl.trim() || null,
      });

      if (res.success && res.application) {
        setExistingApp(res.application);
        success('Storefront application submitted for verification!');
      } else {
        setFormError(res.error || 'Failed to submit application.');
        toastError(res.error || 'Failed to submit application.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting application';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Review Simulator for testing approval/rejection lifecycle
  const handleSimulateStatus = async (status: 'approved' | 'rejected') => {
    if (!existingApp) return;
    const res = await simulateApplicationReview(
      existingApp.id,
      status,
      status === 'rejected'
        ? 'Storefront photo unclear and identity proof unreadable.'
        : 'Storefront location verified. Approved for catalogue setup.'
    );

    if (res.success && res.application) {
      setExistingApp(res.application);
      if (status === 'approved') {
        success('Application Approved! Your shop is created with "Catalogue Incomplete" state.');
      } else {
        info('Application marked as Rejected.');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="container vaango-onboarding">
        <p>Checking onboarding status...</p>
      </div>
    );
  }

  // If application already exists, display status tracker
  if (existingApp) {
    return (
      <div className="container vaango-onboarding">
        <div className="vaango-onboarding__header">
          <span className="vaango-onboarding__kicker">Onboarding Status</span>
          <h1 className="vaango-onboarding__title">Shop Application Review</h1>
        </div>

        <Card variant="default" padding="lg" className="vaango-app-status-card">
          <div className="vaango-app-status-card__top">
            <div>
              <span className="vaango-meta-label">Submitted Shop</span>
              <h2 className="text-xl font-extrabold">{existingApp.shop_name}</h2>
              <span className="text-xs text-secondary">
                Submitted on {new Date(existingApp.created_at).toLocaleDateString()}
              </span>
            </div>

            <div>
              {existingApp.status === 'approved' && (
                <Badge variant="success" size="md">Approved</Badge>
              )}
              {existingApp.status === 'rejected' && (
                <Badge variant="error" size="md">Rejected</Badge>
              )}
              {['submitted', 'under_review'].includes(existingApp.status) && (
                <Badge variant="warning" size="md" withDot>Pending Verification</Badge>
              )}
            </div>
          </div>

          <div className="vaango-app-status-card__body mt-4">
            {existingApp.status === 'approved' && (
              <div className="vaango-status-alert vaango-status-alert--success">
                <CheckCircle2 size={24} className="text-success flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Congratulations! Your shop application is approved.</h3>
                  <p className="text-xs text-secondary mt-1">
                    Your shop has been created with status <strong>Approved — Catalogue Incomplete</strong>. You can now access your dashboard, add products, and make your shop live.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="mt-3"
                    onClick={() => navigate('/shopkeeper/dashboard')}
                    rightIcon={<ArrowRight size={14} />}
                  >
                    Go to Shopkeeper Dashboard
                  </Button>
                </div>
              </div>
            )}

            {existingApp.status === 'rejected' && (
              <div className="vaango-status-alert vaango-status-alert--error">
                <XCircle size={24} className="text-error flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Application Not Approved</h3>
                  <p className="text-xs text-secondary mt-1">
                    {existingApp.review_notes || 'Your application did not meet the verification standards.'}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setExistingApp(null)}
                  >
                    Submit New Application
                  </Button>
                </div>
              </div>
            )}

            {['submitted', 'under_review'].includes(existingApp.status) && (
              <div className="vaango-status-alert vaango-status-alert--warning">
                <Clock size={24} className="text-warning flex-shrink-0" />
                <div>
                  <h3 className="font-bold text-sm">Application is Pending Review</h3>
                  <p className="text-xs text-secondary mt-1">
                    Our team is verifying your storefront GPS coordinates and identification document. This ensures trusted local neighborhood listings.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Demonstration / Evaluation Control: Test transition without waiting for Phase 5 */}
          {import.meta.env.DEV && <div className="vaango-simulator-box mt-6">
            <span className="text-xs font-bold text-secondary uppercase block mb-2">
              Developer / Demo Review Simulator
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSimulateStatus('approved')}
              >
                Simulate Admin Approval
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-error"
                onClick={() => handleSimulateStatus('rejected')}
              >
                Simulate Admin Rejection
              </Button>
            </div>
          </div>}
        </Card>
      </div>
    );
  }

  return (
    <div className="container vaango-onboarding">
      <div className="vaango-onboarding__header">
        <span className="vaango-onboarding__kicker">Merchant Partner Program</span>
        <h1 className="vaango-onboarding__title">Register Your Shop on Vaango</h1>
        <p className="vaango-onboarding__subtitle">
          Join local neighborhood merchants in {selectedLocation.name}. Complete your application with verified device GPS location.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="vaango-onboarding__form">
        {formError && (
          <div className="vaango-form-error-alert" role="alert">
            <AlertCircle size={18} />
            <span>{formError}</span>
          </div>
        )}

        {/* 1. Shop & Owner Details */}
        <Card variant="default" padding="lg" className="vaango-onboarding-card">
          <div className="vaango-onboarding-card__header">
            <Store size={20} className="text-primary" />
            <h2 className="vaango-onboarding-card__title">Basic Store Information</h2>
          </div>

          <div className="vaango-form-group">
            <label className="vaango-form-label" htmlFor="app-shop-name">
              Shop Name <span className="vaango-required">*</span>
            </label>
            <Input
              id="app-shop-name"
              placeholder="e.g. Murugan Supermarket & Spices"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="app-owner-name">
                Owner / Proprietor Name <span className="vaango-required">*</span>
              </label>
              <Input
                id="app-owner-name"
                placeholder="e.g. Murugan S."
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                required
              />
            </div>

            <div className="vaango-form-group">
              <label className="vaango-form-label" htmlFor="app-phone">
                Contact Phone Number <span className="vaango-required">*</span>
              </label>
              <Input
                id="app-phone"
                type="tel"
                placeholder="+91 98765 12345"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="vaango-form-group mt-3">
            <label className="vaango-form-label" htmlFor="app-type">
              Shop Category / Group <span className="vaango-required">*</span>
            </label>
            <select
              id="app-type"
              className="vaango-select-input"
              value={shopTypeId}
              onChange={(e) => setShopTypeId(e.target.value)}
            >
              {MOCK_SHOP_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({groupLabels[t.workflow_group_code]})
                </option>
              ))}
            </select>
          </div>

          <div className="vaango-form-group mt-3">
            <label className="vaango-form-label" htmlFor="app-desc">
              Short Description / Specialties
            </label>
            <textarea
              id="app-desc"
              className="vaango-textarea"
              rows={2}
              placeholder="e.g. Fresh country vegetables, pulses, spices, and Kongu grocery items."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </Card>

        {/* 2. Device GPS Location (Required by Specification) */}
        <Card variant="default" padding="lg" className="vaango-onboarding-card">
          <div className="vaango-onboarding-card__header">
            <MapPin size={20} className="text-primary" />
            <h2 className="vaango-onboarding-card__title">Storefront Device GPS Location</h2>
          </div>

          <GPSLocationPicker
            onLocationCaptured={(coords) => setGpsCoords({ lat: coords.lat, lng: coords.lng })}
          />
        </Card>

        {/* 3. Storefront Photo & Private ID Proof */}
        <Card variant="default" padding="lg" className="vaango-onboarding-card">
          <div className="vaango-onboarding-card__header">
            <Camera size={20} className="text-primary" />
            <h2 className="vaango-onboarding-card__title">Storefront Photo & ID Proof</h2>
          </div>

          {/* 3. Storefront Photos Multi-Uploader (4-10 Photos) */}
          <div className="vaango-photo-uploader">
            <div className="vaango-photo-uploader__header">
              <label className="vaango-form-label mb-0" htmlFor="app-photo">
                Storefront Photos (4–10) <span className="vaango-required">*</span>
              </label>

              {shopPhotos.length === 0 ? (
                <Badge variant="neutral" size="sm">
                  0 / 10 photos • Min 4 Required
                </Badge>
              ) : shopPhotos.length < 4 ? (
                <Badge variant="warning" size="sm">
                  {shopPhotos.length} / 10 photos • {4 - shopPhotos.length} more needed
                </Badge>
              ) : (
                <Badge variant="success" size="sm" withDot>
                  {shopPhotos.length} / 10 photos • Requirement Met
                </Badge>
              )}
            </div>

            {/* Progress bar towards 4 min / 10 max */}
            <div className="vaango-photo-progress-track">
              <div
                className={`vaango-photo-progress-bar ${shopPhotos.length >= 4 ? 'vaango-photo-progress-bar--complete' : ''}`}
                style={{ width: `${Math.min(100, (shopPhotos.length / 10) * 100)}%` }}
              />
            </div>

            {/* Suggested Photo Guide for quick verification */}
            <div className="vaango-photo-guide">
              <div className="vaango-photo-guide__title">
                <Camera size={14} className="text-primary" />
                <span>Recommended 4 photos for fast approval:</span>
              </div>
              <ul className="vaango-photo-guide__list">
                <li className="vaango-photo-guide__item">
                  <Check size={12} className={shopPhotos.length >= 1 ? 'text-success' : 'text-secondary'} />
                  1. Shop Name & Board
                </li>
                <li className="vaango-photo-guide__item">
                  <Check size={12} className={shopPhotos.length >= 2 ? 'text-success' : 'text-secondary'} />
                  2. Entrance / Street View
                </li>
                <li className="vaango-photo-guide__item">
                  <Check size={12} className={shopPhotos.length >= 3 ? 'text-success' : 'text-secondary'} />
                  3. Main Shelves / Racks
                </li>
                <li className="vaango-photo-guide__item">
                  <Check size={12} className={shopPhotos.length >= 4 ? 'text-success' : 'text-secondary'} />
                  4. Billing / Checkout Area
                </li>
              </ul>
            </div>

            {/* Hidden multi-file input (supports selecting multiple or one-by-one) */}
            <input
              ref={photoInputRef}
              id="app-photo"
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => handleAddPhotos(e.target.files)}
            />

            {/* If no photos yet, show large interactive dropzone */}
            {photoPreviews.length === 0 ? (
              <div
                className={`vaango-photo-dropzone ${isPhotoDragging ? 'vaango-photo-dropzone--active' : ''}`}
                onClick={() => photoInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsPhotoDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsPhotoDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsPhotoDragging(false);
                  if (e.dataTransfer.files) handleAddPhotos(e.dataTransfer.files);
                }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    photoInputRef.current?.click();
                  }
                }}
              >
                <div className="vaango-photo-dropzone__icon">
                  <ImagePlus size={24} />
                </div>
                <h4 className="vaango-photo-dropzone__title">Click to Upload Storefront Photos</h4>
                <p className="vaango-photo-dropzone__subtitle">
                  Select 4 to 10 photos together, or add them one by one. JPG, PNG, WebP supported.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-1"
                  leftIcon={<Plus size={14} />}
                  onClick={(e) => {
                    e.stopPropagation();
                    photoInputRef.current?.click();
                  }}
                >
                  Choose 4–10 Photos
                </Button>
              </div>
            ) : (
              <div>
                {/* Thumbnails grid */}
                <div className="vaango-photos-grid">
                  {photoPreviews.map((p, idx) => (
                    <div key={p.id} className="vaango-photo-card">
                      <img src={p.url} alt={`Storefront photo ${idx + 1}`} className="vaango-photo-card__img" />
                      <span className="vaango-photo-card__badge">
                        #{idx + 1} {idx === 0 ? 'Cover' : ''}
                      </span>
                      <button
                        type="button"
                        className="vaango-photo-card__remove-btn"
                        onClick={() => handleRemovePhoto(idx)}
                        title="Remove photo"
                        aria-label={`Remove photo ${idx + 1}`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  {/* Add more button tile if under 10 photos */}
                  {shopPhotos.length < 10 && (
                    <button
                      type="button"
                      className="vaango-photo-card--add-btn"
                      onClick={() => photoInputRef.current?.click()}
                      title="Add more photos"
                    >
                      <Plus size={22} />
                      <span>Add Photo</span>
                      <small>({10 - shopPhotos.length} left)</small>
                    </button>
                  )}
                </div>

                {/* Status banner under grid */}
                {shopPhotos.length < 4 ? (
                  <div className="vaango-photo-status-banner vaango-photo-status-banner--warning">
                    <span>
                      ⚠️ <strong>{4 - shopPhotos.length} more photo{4 - shopPhotos.length > 1 ? 's' : ''} required.</strong> Minimum 4 storefront photos needed to submit your application.
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      leftIcon={<Plus size={14} />}
                      onClick={() => photoInputRef.current?.click()}
                    >
                      Add Photo
                    </Button>
                  </div>
                ) : (
                  <div className="vaango-photo-status-banner vaango-photo-status-banner--success">
                    <span>
                      ✓ <strong>{shopPhotos.length} photos ready.</strong> Minimum requirement satisfied.
                    </span>
                    {shopPhotos.length < 10 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        leftIcon={<Plus size={14} />}
                        onClick={() => photoInputRef.current?.click()}
                      >
                        Add more ({10 - shopPhotos.length} slots left)
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="vaango-form-group mt-4">
            <label className="vaango-form-label" htmlFor="app-upi">Shop UPI ID / VPA (for customer payments)</label>
            <Input id="app-upi" type="text" placeholder="e.g. shopname@okaxis or 9876512345@upi" value={upiId} onChange={(e) => setUpiId(e.target.value)} />
            <span className="text-xs text-secondary mt-1">Customers will see this to pay you directly. Vaango never touches your money.</span>
          </div>

          <div className="vaango-form-group mt-4">
            <label className="vaango-form-label" htmlFor="app-upi-qr">UPI QR Photo (optional)</label>
            <input
              ref={upiQrInputRef}
              id="app-upi-qr"
              type="file"
              accept="image/*"
              className="vaango-file-input"
              onChange={(e) => setUpiQrFile(e.target.files?.[0] || null)}
            />
            {upiQrFile && upiQrPreview && (
              <div className="vaango-file-preview-card">
                <div className="vaango-file-preview-card__left">
                  <img src={upiQrPreview} alt="UPI QR Preview" className="vaango-file-preview-card__thumb" />
                  <div className="vaango-file-preview-card__info">
                    <span className="vaango-file-preview-card__name">{upiQrFile.name}</span>
                    <span className="vaango-file-preview-card__meta">{(upiQrFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="vaango-file-preview-card__remove-btn"
                  onClick={() => {
                    setUpiQrFile(null);
                    if (upiQrInputRef.current) upiQrInputRef.current.value = '';
                  }}
                  title="Remove UPI QR"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="vaango-form-group mt-4">
            <label className="vaango-form-label" htmlFor="app-id-proof">
              Government ID Proof (Aadhaar / Trade License) <span className="vaango-required">*</span>
            </label>
            <div className="vaango-id-proof-field">
              <input
                ref={idProofInputRef}
                id="app-id-proof"
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="vaango-file-input"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setIdProofFile(file);
                }}
              />
              {idProofFile && (
                <div className="vaango-file-preview-card">
                  <div className="vaango-file-preview-card__left">
                    {idProofPreview?.isImage && idProofPreview.url ? (
                      <img src={idProofPreview.url} alt="ID Proof Preview" className="vaango-file-preview-card__thumb" />
                    ) : (
                      <div className="vaango-file-preview-card__icon">
                        <FileText size={20} />
                      </div>
                    )}
                    <div className="vaango-file-preview-card__info">
                      <span className="vaango-file-preview-card__name">{idProofFile.name}</span>
                      <span className="vaango-file-preview-card__meta">{(idProofFile.size / 1024).toFixed(1)} KB</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="vaango-file-preview-card__remove-btn"
                    onClick={() => {
                      setIdProofFile(null);
                      if (idProofInputRef.current) idProofInputRef.current.value = '';
                    }}
                    title="Remove ID Proof"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              <div className="vaango-id-proof-notice">
                <ShieldCheck size={16} className="text-success" />
                <span>
                  <strong>Strict Privacy:</strong> ID documents are uploaded to private restricted storage (<code className="text-xs">shop-documents</code>) and will NEVER be publicly accessible or shared with customers.
                </span>
              </div>
            </div>
          </div>

          <div className="vaango-gmaps-alt">
            <p className="vaango-gmaps-alt__label">OR - Already on Google Maps?</p>
            <p className="text-xs text-secondary mb-2">Paste your Google Maps profile URL so the admin can quickly verify your shop.</p>
            <Input id="app-gmaps-url" type="url" placeholder="https://maps.google.com/maps?q=your+shop+name" value={googleMapsUrl} onChange={(e) => setGoogleMapsUrl(e.target.value)} leftIcon={<MapPin size={16} />} />
            <p className="text-xs text-secondary mt-1">This is an extra verification signal and does not replace the four-photo requirement.</p>
          </div>
        </Card>

        {/* Submit */}
        <div className="vaango-onboarding__submit-bar">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={isSubmitting}
            leftIcon={<ShieldCheck size={18} />}
          >
            Submit Shop Application
          </Button>
        </div>
      </form>
    </div>
  );
};
