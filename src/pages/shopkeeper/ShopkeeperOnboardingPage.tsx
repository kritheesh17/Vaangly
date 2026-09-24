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
  ArrowLeft,
  X,
  Plus,
  ImagePlus,
  FileText,
  Check,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { MOCK_SHOP_TYPES } from '../../data/mockData';
import { useLocationContext } from '../../context/LocationContext';
import { isValidIndianMobile, normalizeIndianPhone } from '../../lib/phoneUtils';
import {
  submitShopApplication,
  getLatestApplication,
  simulateApplicationReview,
  fetchShopTypes,
} from '../../lib/shopkeeperApi';
import { ShopApplication, ShopType } from '../../types/database';
import { GPSLocationPicker } from '../../components/shopkeeper/GPSLocationPicker';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { compressImage } from '../../lib/imageCompressor';
import { isValidUpiQrUrl } from '../../lib/upi';
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

  type OnboardingStep = 'basic' | 'verification' | 'review';
  const [step, setStep] = useState<OnboardingStep>('basic');

  const [existingApp, setExistingApp] = useState<ShopApplication | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Form Fields - Pre-filled from authenticated user profile
  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState(user?.full_name || '');
  const [contactPhone, setContactPhone] = useState(user?.phone || '');
  const [shopTypes, setShopTypes] = useState<ShopType[]>(MOCK_SHOP_TYPES);
  const [shopTypeId, setShopTypeId] = useState(MOCK_SHOP_TYPES[0]?.id || '');

  // Load canonical shop types from Supabase
  useEffect(() => {
    fetchShopTypes().then((types) => {
      if (types && types.length > 0) {
        setShopTypes(types);
        setShopTypeId((prev) => {
          if (!prev || !types.some((t) => t.id === prev)) {
            return types[0].id;
          }
          return prev;
        });
      }
    });
  }, []);
  const [area, setArea] = useState('');
  const [district, setDistrict] = useState('');
  const [taluk, setTaluk] = useState('');
  const [pincode, setPincode] = useState('');
  const [description, setDescription] = useState('');
  const [shopPhotos, setShopPhotos] = useState<File[]>([]);
  const [upiQrFile, setUpiQrFile] = useState<File | null>(null);
  const [upiId, setUpiId] = useState('');
  const [idProofFile, setIdProofFile] = useState<File | null>(null);
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [addressLine, setAddressLine] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  // Keep owner name and contact phone in sync with authenticated user
  useEffect(() => {
    if (user) {
      if (!ownerName && user.full_name) setOwnerName(user.full_name);
      if (!contactPhone && user.phone) setContactPhone(user.phone);
    }
  }, [user]);

  const handleContinueToVerification = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!shopName.trim()) {
      setFormError('Shop name is required.');
      return;
    }
    if (!ownerName.trim()) {
      setFormError('Owner / Proprietor name is required.');
      return;
    }
    if (!contactPhone.trim() || !isValidIndianMobile(contactPhone.trim())) {
      setFormError('Please enter a valid 10-digit Indian contact phone number.');
      return;
    }
    if (!shopTypeId) {
      setFormError('Please select a shop category.');
      return;
    }
    if (!area.trim()) {
      setFormError('Area / Street / Locality is required.');
      return;
    }
    if (!taluk.trim()) {
      setFormError('Taluk is required.');
      return;
    }
    if (!district.trim()) {
      setFormError('District is required.');
      return;
    }
    if (!pincode.trim() || !/^\d{6}$/.test(pincode.trim())) {
      setFormError('Please enter a valid 6-digit Pincode.');
      return;
    }
    setStep('verification');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleContinueToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (shopPhotos.length < 4 || shopPhotos.length > 10) {
      setFormError('Please upload between 4 and 10 storefront photos (mandatory for business verification).');
      return;
    }
    if (!gpsCoords) {
      setFormError('Please capture your storefront live GPS coordinates.');
      return;
    }
    if (!addressLine.trim()) {
      setFormError('Shop address is required. Detect it from GPS or enter it manually.');
      return;
    }
    if (!idProofFile) {
      setFormError('Government identity proof document is required.');
      return;
    }
    if (upiId.trim() && (!upiQrFile || !upiQrFile.type.startsWith('image/') || upiQrFile.size === 0)) {
      setFormError('UPI QR code is required to accept UPI payments.');
      return;
    }
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

    const oversized = incoming.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      toastError(`Photo "${oversized.name}" exceeds 10MB. Please select images less than 10MB.`);
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

    const isPdf = file.name.toLowerCase().endsWith('.pdf');
    let fileToUpload = file;
    if (!isPdf && file.type.startsWith('image/')) {
      fileToUpload = await compressImage(file, {
        maxDimension: 1000,
        quality: 0.75,
        maxFileSizeMB: 10,
      });
    }
    const mimeType = fileToUpload.type || (bucket === 'shop-documents' && isPdf ? 'application/pdf' : 'image/jpeg');

    const uploadPromise = supabase.storage.from(bucket).upload(path, fileToUpload, {
      upsert: true,
      contentType: mimeType,
    });
    const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: { message: `Upload timed out for ${file.name}` } }), 15000)
    );

    const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
    if (uploadResult?.error) {
      throw new Error(`Unable to upload ${file.name}: ${uploadResult.error.message}`);
    }
    if (bucket === 'shop-documents') return path;
    const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicData.publicUrl;
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
    if (!contactPhone.trim() || !isValidIndianMobile(contactPhone.trim())) {
      setFormError('Please enter a valid 10-digit Indian contact phone number.');
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
    if (upiId.trim() && (!upiQrFile || !upiQrFile.type.startsWith('image/') || upiQrFile.size === 0)) {
      setFormError('UPI QR code is required to accept UPI payments.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      let activeUserId = user.id;
      if (isSupabaseConfigured) {
        const authUserPromise = supabase.auth.getUser();
        const authTimeout = new Promise<{ data: { user: null }; error: Error }>((_, reject) =>
          setTimeout(() => reject(new Error('Authentication verification timed out. Please refresh and try again.')), 8000)
        );
        const { data: authData } = await Promise.race([authUserPromise, authTimeout]);
        if (!authData?.user) {
          throw new Error('Please sign in to submit your partner application.');
        }
        activeUserId = authData.user.id;
      }

      // Fast concurrent upload of storefront photos, ID document, and UPI QR
      const idExt = idProofFile.name.toLowerCase().endsWith('.pdf') ? 'pdf' : (idProofFile.name.split('.').pop()?.toLowerCase() || 'jpg');
      const [photoUrls, idProofPath, upiQrUrl] = await Promise.all([
        Promise.all(
          shopPhotos.map((file, i) => {
            const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
            return uploadFile('shop-photos', `${activeUserId}/photos/${Date.now()}_${i}.${ext}`, file);
          })
        ),
        uploadFile('shop-documents', `${activeUserId}/id_proof_${Date.now()}.${idExt}`, idProofFile),
        upiQrFile
          ? uploadFile('shop-photos', `${activeUserId}/upi-qr/upi_qr_${Date.now()}.${upiQrFile.name.split('.').pop()?.toLowerCase() || 'jpg'}`, upiQrFile)
          : Promise.resolve(null),
      ]);
      if (upiId.trim() && !isValidUpiQrUrl(upiQrUrl)) {
        throw new Error('UPI QR code is required to accept UPI payments.');
      }

      const res = await submitShopApplication({
        applicant_id: activeUserId,
        shop_name: shopName.trim(),
        owner_name: ownerName.trim(),
        description: description.trim() || null,
        shop_type_id: shopTypeId,
        location_id: selectedLocation.id,
        contact_phone: normalizeIndianPhone(contactPhone.trim()) || contactPhone.trim(),
        address_line: addressLine.trim(),
        photo_url: photoUrls[0] || null,
        photo_urls: photoUrls,
        upi_id: upiId.trim() || null,
        upi_qr_url: upiQrUrl,
        id_proof_url: idProofPath,
        gps_lat: gpsCoords.lat,
        gps_lng: gpsCoords.lng,
        google_maps_url: googleMapsUrl.trim() || null,
        area: area.trim(),
        district: district.trim(),
        taluk: taluk.trim(),
        pincode: pincode.trim(),
      });

      if (res.success && res.application) {
        setExistingApp(res.application);
        success('Storefront application submitted for verification!');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        const errMsg = res.error || 'Failed to submit application.';
        setFormError(errMsg);
        toastError(errMsg);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error submitting application';
      setFormError(msg);
      toastError(msg);
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
  }  const selectedType = shopTypes.find((t) => t.id === shopTypeId) || shopTypes[0];

  return (
    <div className="container vaango-onboarding">
      <div className="vaango-onboarding__header">
        <span className="vaango-onboarding__kicker">Merchant Partner Program</span>
        <h1 className="vaango-onboarding__title">Register Your Shop on Vaango</h1>
        <p className="vaango-onboarding__subtitle">
          Join local neighborhood merchants in {selectedLocation.name}. Complete your application with verified device GPS location.
        </p>
      </div>

      {/* 3-Step Breadcrumb Progress Indicator */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
        <button
          type="button"
          onClick={() => { if (step !== 'basic') setStep('basic'); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: step === 'basic' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: step === 'basic' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            border: '1px solid var(--color-border)',
            cursor: step !== 'basic' ? 'pointer' : 'default',
          }}
        >
          <span>1. Basic Details</span>
          {step !== 'basic' && <Check size={14} className="text-success" />}
        </button>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>→</span>
        <button
          type="button"
          onClick={() => { if (step === 'review') setStep('verification'); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: step === 'verification' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: step === 'verification' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            border: '1px solid var(--color-border)',
            cursor: step === 'review' ? 'pointer' : 'default',
          }}
        >
          <span>2. Shop Verification</span>
          {step === 'review' && <Check size={14} className="text-success" />}
        </button>
        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-xs)' }}>→</span>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-full, 9999px)',
            background: step === 'review' ? 'var(--color-primary)' : 'var(--color-surface)',
            color: step === 'review' ? '#fff' : 'var(--color-text-secondary)',
            fontSize: 'var(--font-size-xs)',
            fontWeight: 600,
            border: '1px solid var(--color-border)',
          }}
        >
          <span>3. Review & Submit</span>
        </div>
      </div>

      <div className="vaango-onboarding__form">
        {formError && (
          <div className="vaango-form-error-alert" role="alert">
            <AlertCircle size={18} />
            <span>{formError}</span>
          </div>
        )}

        {/* STEP 1: BASIC BUSINESS / OWNER DETAILS */}
        {step === 'basic' && (
          <>
            <Card variant="default" padding="lg" className="vaango-onboarding-card">
              <div className="vaango-onboarding-card__header">
                <Store size={20} className="text-primary" />
                <h2 className="vaango-onboarding-card__title">Step 1 — Basic Store Information</h2>
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
                  {shopTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({groupLabels[t.workflow_group_code as keyof typeof groupLabels] || t.workflow_group_code})
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div className="vaango-form-group">
                  <label className="vaango-form-label" htmlFor="app-area">
                    Area / Street / Locality <span className="vaango-required">*</span>
                  </label>
                  <Input
                    id="app-area"
                    placeholder="e.g. Gandhi Nagar, Main Road"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                    required
                  />
                </div>

                <div className="vaango-form-group">
                  <label className="vaango-form-label" htmlFor="app-taluk">
                    Taluk <span className="vaango-required">*</span>
                  </label>
                  <Input
                    id="app-taluk"
                    placeholder="e.g. Pollachi"
                    value={taluk}
                    onChange={(e) => setTaluk(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                <div className="vaango-form-group">
                  <label className="vaango-form-label" htmlFor="app-district">
                    District <span className="vaango-required">*</span>
                  </label>
                  <Input
                    id="app-district"
                    placeholder="e.g. Coimbatore"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    required
                  />
                </div>

                <div className="vaango-form-group">
                  <label className="vaango-form-label" htmlFor="app-pincode">
                    Pincode <span className="vaango-required">*</span>
                  </label>
                  <Input
                    id="app-pincode"
                    placeholder="e.g. 642001"
                    maxLength={6}
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>
              </div>
            </Card>

            <div className="vaango-onboarding__submit-bar" style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleContinueToVerification}
                rightIcon={<ArrowRight size={18} />}
              >
                Continue to Shop Verification
              </Button>
            </div>
          </>
        )}

        {/* STEP 2: SHOP VERIFICATION DETAILS & DOCUMENT UPLOADS */}
        {step === 'verification' && (
          <>
            {/* Storefront Photos Multi-Uploader (4-10 Photos) */}
            <Card variant="default" padding="lg" className="vaango-onboarding-card">
              <div className="vaango-onboarding-card__header">
                <Camera size={20} className="text-primary" />
                <h2 className="vaango-onboarding-card__title">Storefront Photos (4–10 Photos Required)</h2>
              </div>

              <div className="vaango-photo-uploader">
                <div className="vaango-photo-uploader__header">
                  <label className="vaango-form-label mb-0" htmlFor="app-photo">
                    Upload Photos of Your Storefront <span className="vaango-required">*</span>
                  </label>

                  {shopPhotos.length === 0 ? (
                    <Badge variant="neutral" size="sm">
                      0 / 10 photos • Min 4 Required
                    </Badge>
                  ) : shopPhotos.length < 4 ? (
                    <Badge variant="warning" size="sm">
                      {shopPhotos.length} / 10 photos • Need {4 - shopPhotos.length} more
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm">
                      {shopPhotos.length} / 10 photos • Requirement Met
                    </Badge>
                  )}
                </div>

                <div className="vaango-photo-requirements-banner" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  background: 'var(--color-primary-light, rgba(25, 135, 84, 0.08))',
                  border: '1px solid var(--color-primary-border, rgba(25, 135, 84, 0.25))',
                  borderRadius: 'var(--radius-md, 8px)',
                  marginBottom: '14px',
                  fontSize: '0.85rem',
                  color: 'var(--color-text)',
                }}>
                  <Camera size={20} className="text-primary" style={{ flexShrink: 0 }} />
                  <div>
                    <strong>Image Upload Requirements:</strong> Please upload images <strong>less than 10MB</strong> each (supports JPG, PNG, and WebP). High-resolution smartphone photos are supported and will be automatically optimized for rapid upload.
                  </div>
                </div>

                <div className="vaango-photo-guide">
                  <span className="vaango-photo-guide__title">
                    <Check size={14} className="text-primary" />
                    Recommended Verification Photos for Admin Approval:
                  </span>
                  <ul className="vaango-photo-guide__list">
                    <li className="vaango-photo-guide__item">1. Full shop entrance & signboard</li>
                    <li className="vaango-photo-guide__item">2. Street / road view from store</li>
                    <li className="vaango-photo-guide__item">3. Main counter / checkout</li>
                    <li className="vaango-photo-guide__item">4. Product display or work area</li>
                  </ul>
                </div>

                <div
                  className={`vaango-photo-dropzone ${isPhotoDragging ? 'vaango-photo-dropzone--active' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setIsPhotoDragging(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsPhotoDragging(false); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsPhotoDragging(false);
                    handleAddPhotos(e.dataTransfer.files);
                  }}
                  onClick={() => photoInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  aria-label="Upload Storefront Photos"
                >
                  <input
                    ref={photoInputRef}
                    id="app-photo"
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => handleAddPhotos(e.target.files)}
                  />
                  <ImagePlus size={32} className="text-primary" />
                  <span className="vaango-photo-dropzone__label">
                    Click to browse or drag & drop storefront photos
                  </span>
                  <span className="vaango-photo-dropzone__hint">
                    JPG, PNG, WebP less than 10MB each (auto-optimized for fast upload) • Min 4, Max 10 photos
                  </span>
                </div>

                {photoPreviews.length > 0 && (
                  <div className="vaango-photo-gallery">
                    {photoPreviews.map((item, idx) => (
                      <div
                        key={item.id}
                        className="vaango-photo-tile"
                        onClick={() => setPreviewModalUrl(item.url)}
                        title="Click to view full photo"
                      >
                        <img src={item.url} alt={`Storefront Preview ${idx + 1}`} className="vaango-photo-tile__img" />
                        <span className="vaango-photo-tile__badge">
                          {idx === 0 ? 'Primary' : `#${idx + 1}`}
                        </span>
                        <button
                          type="button"
                          className="vaango-photo-tile__remove"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemovePhoto(idx);
                          }}
                          title="Remove photo"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {shopPhotos.length < 10 && (
                      <button
                        type="button"
                        className="vaango-photo-tile vaango-photo-tile--add"
                        onClick={() => photoInputRef.current?.click()}
                        title="Add another photo"
                      >
                        <Plus size={24} />
                        <span>Add Photo</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>

            {/* Storefront Device GPS Location */}
            <Card variant="default" padding="lg" className="vaango-onboarding-card">
              <div className="vaango-onboarding-card__header">
                <MapPin size={20} className="text-primary" />
                <h2 className="vaango-onboarding-card__title">Storefront Device GPS Location</h2>
              </div>

              <GPSLocationPicker
                onLocationCaptured={(coords) => {
                  setGpsCoords({ lat: coords.lat, lng: coords.lng });
                  if (coords.address) setAddressLine(coords.address);
                }}
              />

              <div className="vaango-form-group mt-4">
                <label className="vaango-form-label" htmlFor="app-address">Shop Address</label>
                <Input
                  id="app-address"
                  value={addressLine}
                  onChange={(e) => setAddressLine(e.target.value)}
                  placeholder="Enter or correct the physical shop address"
                  required
                />
                <span className="text-xs text-secondary mt-1">Review the detected address and correct it before submitting.</span>
              </div>

              <div className="vaango-gmaps-alt">
                <p className="vaango-gmaps-alt__label">OR — Already on Google Maps? (Optional)</p>
                <p className="text-xs text-secondary mb-2">Paste your Google Maps profile URL to assist admin location verification.</p>
                <Input
                  id="app-gmaps-url"
                  type="url"
                  placeholder="https://maps.google.com/maps?q=your+shop+name"
                  value={googleMapsUrl}
                  onChange={(e) => setGoogleMapsUrl(e.target.value)}
                  leftIcon={<MapPin size={16} />}
                />
              </div>
            </Card>

            {/* Government ID & Payments */}
            <Card variant="default" padding="lg" className="vaango-onboarding-card">
              <div className="vaango-onboarding-card__header">
                <ShieldCheck size={20} className="text-primary" />
                <h2 className="vaango-onboarding-card__title">Identity & Payment Verification</h2>
              </div>

              <div className="vaango-form-group">
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
                      if (!file) return;
                      if (file.size > 10 * 1024 * 1024) {
                        toastError(`ID document "${file.name}" exceeds 10MB. Please select a file less than 10MB.`);
                        e.target.value = '';
                        return;
                      }
                      setIdProofFile(file);
                    }}
                  />
                  <p className="text-xs text-secondary mt-1" style={{ fontSize: '0.78rem' }}>
                    JPG, PNG, PDF less than 10MB accepted.
                  </p>
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

              <div className="vaango-form-group mt-4">
                <label className="vaango-form-label" htmlFor="app-upi">Shop UPI ID / VPA (Optional)</label>
                <Input
                  id="app-upi"
                  type="text"
                  placeholder="e.g. shopname@okaxis or 9876512345@upi"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                />
                <span className="text-xs text-secondary mt-1">Customers will see this to pay you directly. Vaango never touches your money.</span>
              </div>

              <div className="vaango-form-group mt-4">
                <label className="vaango-form-label" htmlFor="app-upi-qr">UPI QR Photo (Required when UPI is enabled)</label>
                <input
                  ref={upiQrInputRef}
                  id="app-upi-qr"
                  type="file"
                  accept="image/*"
                  className="vaango-file-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 10 * 1024 * 1024) {
                      toastError(`UPI QR image exceeds 10MB. Please select an image less than 10MB.`);
                      e.target.value = '';
                      return;
                    }
                    setUpiQrFile(file);
                  }}
                />
                <p className="text-xs text-secondary mt-1" style={{ fontSize: '0.78rem' }}>
                  JPG, PNG, WebP less than 10MB accepted.
                </p>
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
            </Card>

            <div className="vaango-onboarding__submit-bar" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => { setStep('basic'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                leftIcon={<ArrowLeft size={18} />}
              >
                Back to Basic Details
              </Button>
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={handleContinueToReview}
                rightIcon={<ArrowRight size={18} />}
              >
                Continue to Review
              </Button>
            </div>
          </>
        )}

        {/* STEP 3: REVIEW / CONFIRMATION & ADMIN SUBMISSION */}
        {step === 'review' && (
          <>
            <Card variant="default" padding="lg" className="vaango-onboarding-card">
              <div className="vaango-onboarding-card__header">
                <CheckCircle2 size={20} className="text-primary" />
                <h2 className="vaango-onboarding-card__title">Step 3 — Review Your Application</h2>
              </div>
              <p className="text-xs text-secondary" style={{ marginTop: '-4px', marginBottom: 'var(--space-3)' }}>
                Please confirm your business details and verification attachments before submitting for human admin review.
              </p>

              {/* Summary Sections */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
                {/* Store Profile */}
                <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                    Business Profile
                  </span>
                  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div><strong>Shop Name:</strong> {shopName}</div>
                    <div><strong>Owner / Proprietor:</strong> {ownerName}</div>
                    <div><strong>Contact Phone:</strong> {contactPhone}</div>
                    <div><strong>Category:</strong> {selectedType?.name || 'General'}</div>
                    <div><strong>Town:</strong> {selectedLocation.name}</div>
                    {description && <div><strong>Description:</strong> {description}</div>}
                  </div>
                </div>

                {/* Verification Documents */}
                <div style={{ padding: 'var(--space-3)', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700, color: 'var(--color-primary)', textTransform: 'uppercase' }}>
                    Verification Attachments
                  </span>
                  <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div><strong>Storefront Photos:</strong> {shopPhotos.length} photos attached</div>
                    <div><strong>GPS Coordinates:</strong> {gpsCoords ? `${gpsCoords.lat.toFixed(5)}, ${gpsCoords.lng.toFixed(5)}` : 'Captured'}</div>
                    <div><strong>ID Document:</strong> {idProofFile?.name || 'Attached'} (Private KYC)</div>
                    <div><strong>Payment Info:</strong> {upiId ? `UPI: ${upiId}` : 'Not provided'}</div>
                    {googleMapsUrl && <div><strong>Google Maps:</strong> Linked</div>}
                  </div>
                </div>
              </div>

              {/* Photo Thumbnails Preview */}
              {photoPreviews.length > 0 && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Attached Storefront Photos ({photoPreviews.length}):
                  </span>
                  <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                    {photoPreviews.map((item, idx) => (
                      <img
                        key={item.id}
                        src={item.url}
                        alt={`Thumbnail ${idx + 1}`}
                        onClick={() => setPreviewModalUrl(item.url)}
                        title="Click to view full photo"
                        style={{
                          width: '72px',
                          height: '72px',
                          objectFit: 'cover',
                          borderRadius: 'var(--radius-md)',
                          border: '1.5px solid var(--color-border)',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Admin Review Explanatory Notice */}
              <div style={{ marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'rgba(230, 81, 0, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(230, 81, 0, 0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <Clock size={16} className="text-primary" />
                  <span style={{ fontSize: 'var(--font-size-xs)', fontWeight: 700 }}>Human Admin Verification Process</span>
                </div>
                <p style={{ margin: 0, fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Once submitted, the Vaangly administration team verifies your storefront photos, GPS location, and government ID. Verified merchants receive approval and access to the catalogue and shopkeeper dashboard.
                </p>
              </div>
            </Card>

            <div className="vaango-onboarding__submit-bar" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => { setStep('verification'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                leftIcon={<ArrowLeft size={18} />}
              >
                Back to Edit
              </Button>

              <Button
                type="button"
                variant="primary"
                size="lg"
                isLoading={isSubmitting}
                onClick={(e) => handleSubmit(e)}
                leftIcon={<ShieldCheck size={18} />}
              >
                Submit Application for Admin Review
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Lightbox Modal for Photo Preview */}
      {previewModalUrl && (
        <div
          className="vaango-image-modal-backdrop"
          onClick={() => setPreviewModalUrl(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Full size photo preview"
        >
          <div className="vaango-image-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="vaango-image-modal-close"
              onClick={() => setPreviewModalUrl(null)}
              title="Close preview"
            >
              <X size={20} />
            </button>
            <img src={previewModalUrl} alt="Storefront full preview" className="vaango-image-modal-img" />
          </div>
        </div>
      )}
    </div>
  );
};
