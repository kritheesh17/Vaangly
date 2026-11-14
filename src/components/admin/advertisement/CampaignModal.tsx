import React, { useState, useEffect } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Video,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '../../ui/Modal';
import { Button } from '../../ui/Button';
import { FormField } from '../../ui/FormField';
import { Input } from '../../ui/Input';
import { Textarea } from '../../ui/Textarea';
import { ActionErrorBanner } from '../../ui/ActionErrorBanner';
import {
  AdCampaign,
  MediaType,
  SkipDuration,
  CampaignStatus,
} from '../../../types/advertisement';
import {
  createAdminCampaign,
  updateAdminCampaign,
  validateDestinationUrl,
  validateMediaFile,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
} from '../../../lib/advertisementApi';
import { getISTDateString } from '../../../lib/analyticsApi';

interface CampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedCampaign: AdCampaign) => void;
  campaignToEdit?: AdCampaign | null;
}

const CTA_OPTIONS = [
  'Learn More',
  'Visit Website',
  'Shop Now',
  'Book Appointment',
  'Contact Us',
  'Explore Offer',
];

export const CampaignModal: React.FC<CampaignModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  campaignToEdit,
}) => {
  const isEditing = Boolean(campaignToEdit);

  // Form State
  const [advertiserName, setAdvertiserName] = useState('');
  const [campaignName, setCampaignName] = useState('');
  const [description, setDescription] = useState('');
  const [contactInfo, setContactInfo] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('image');
  const [destinationUrl, setDestinationUrl] = useState('');
  const [ctaLabel, setCtaLabel] = useState('Learn More');
  const [skipDuration, setSkipDuration] = useState<SkipDuration>(5);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('00:00');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');
  const [priority, setPriority] = useState<number>(1);
  const [status, setStatus] = useState<CampaignStatus>('active');

  // Media File State
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);

  // UI State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Reset or Populate form on open
  useEffect(() => {
    if (!isOpen) return;

    if (campaignToEdit) {
      setAdvertiserName(campaignToEdit.advertiser_name);
      setCampaignName(campaignToEdit.campaign_name);
      setDescription(campaignToEdit.description || '');
      setContactInfo(campaignToEdit.contact_info || '');
      setSkipDuration(campaignToEdit.skip_duration);
      setPriority(campaignToEdit.priority || 1);
      setStatus(campaignToEdit.status);

      const creative = campaignToEdit.creatives?.[0];
      if (creative) {
        setMediaType(creative.media_type);
        setDestinationUrl(creative.destination_url);
        setCtaLabel(creative.cta_label || 'Learn More');
        setMediaPreviewUrl(creative.media_url);
      }

      // Format start and end date for IST input fields
      const sDateObj = new Date(campaignToEdit.start_at);
      const eDateObj = new Date(campaignToEdit.end_at);
      setStartDate(getISTDateString(sDateObj));
      setStartTime(sDateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }));
      setEndDate(getISTDateString(eDateObj));
      setEndTime(eDateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }));

      setMediaFile(null);
    } else {
      // Default new campaign values
      const now = new Date();
      const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      setAdvertiserName('');
      setCampaignName('');
      setDescription('');
      setContactInfo('');
      setMediaType('image');
      setDestinationUrl('');
      setCtaLabel('Learn More');
      setSkipDuration(5);
      setPriority(1);
      setStatus('active');
      setStartDate(getISTDateString(now));
      setStartTime('00:00');
      setEndDate(getISTDateString(inSevenDays));
      setEndTime('23:59');
      setMediaFile(null);
      setMediaPreviewUrl(null);
    }

    setFormError(null);
    setIsSubmitting(false);
  }, [isOpen, campaignToEdit]);

  // Handle local file selection and create preview
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateMediaFile(file, mediaType);
    if (!validation.valid) {
      setFormError(validation.error || 'Invalid file.');
      return;
    }

    setFormError(null);
    setMediaFile(file);

    // Create browser preview URL
    const preview = URL.createObjectURL(file);
    setMediaPreviewUrl(preview);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Basic validation
    if (!advertiserName.trim()) {
      setFormError('Please enter the advertiser or organization name.');
      return;
    }
    if (!campaignName.trim()) {
      setFormError('Please enter a campaign name.');
      return;
    }

    // 2. Destination URL validation
    const urlValidation = validateDestinationUrl(destinationUrl);
    if (!urlValidation.valid) {
      setFormError(urlValidation.error || 'Invalid destination URL.');
      return;
    }

    // 3. Media validation (required for new campaigns)
    if (!isEditing && !mediaFile) {
      setFormError(`Please select a ${mediaType} file to upload.`);
      return;
    }

    // 4. Date validation
    if (!startDate || !endDate) {
      setFormError('Start date and end date are both required.');
      return;
    }

    // Parse dates with Asia/Kolkata timezone offset (+05:30)
    const startIso = `${startDate}T${startTime || '00:00'}:00+05:30`;
    const endIso = `${endDate}T${endTime || '23:59'}:00+05:30`;
    const startDt = new Date(startIso);
    const endDt = new Date(endIso);

    if (isNaN(startDt.getTime()) || isNaN(endDt.getTime())) {
      setFormError('Please enter valid dates.');
      return;
    }
    if (endDt <= startDt) {
      setFormError('Campaign end date must be strictly after the start date.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && campaignToEdit) {
        const updated = await updateAdminCampaign(
          campaignToEdit.id,
          {
            advertiser_name: advertiserName,
            campaign_name: campaignName,
            description,
            contact_info: contactInfo,
            skip_duration: skipDuration,
            priority,
            status,
            start_at: startDt.toISOString(),
            end_at: endDt.toISOString(),
            media_type: mediaType,
            destination_url: destinationUrl,
            cta_label: ctaLabel,
          },
          mediaFile || undefined
        );
        onSuccess(updated);
      } else {
        const created = await createAdminCampaign(
          {
            advertiser_name: advertiserName,
            campaign_name: campaignName,
            description,
            contact_info: contactInfo,
            skip_duration: skipDuration,
            priority,
            status,
            start_at: startDt.toISOString(),
            end_at: endDt.toISOString(),
            media_type: mediaType,
            destination_url: destinationUrl,
            cta_label: ctaLabel,
          },
          mediaFile!
        );
        onSuccess(created);
      }
      onClose();
    } catch (err) {
      console.error('Error saving campaign:', err);
      setFormError(err instanceof Error ? err.message : 'Failed to save advertisement campaign.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEditing ? 'Edit Advertisement Campaign' : 'Create Advertisement Campaign'}
      description="Configure advertiser details, media creatives, skip duration, destination link, and scheduling."
      maxWidth="lg"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {formError && (
          <ActionErrorBanner
            message={formError}
            variant="error"
            onDismiss={() => setFormError(null)}
          />
        )}

        {/* Section 1: Advertiser & Campaign Info */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <FormField id="ad-advertiser-name" label="Advertiser / Organization Name" required>
            <Input
              id="ad-advertiser-name"
              value={advertiserName}
              onChange={(e) => setAdvertiserName(e.target.value)}
              placeholder="e.g. City Fashion Hub, Nike, Local Bakery"
              required
            />
          </FormField>

          <FormField id="ad-campaign-name" label="Campaign Name" required>
            <Input
              id="ad-campaign-name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              placeholder="e.g. Diwali Super Sale, Weekend Promo"
              required
            />
          </FormField>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <FormField id="ad-campaign-desc" label="Campaign Description (Optional)">
            <Textarea
              id="ad-campaign-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal campaign notes or offer details..."
              rows={2}
            />
          </FormField>

          <FormField id="ad-contact-info" label="Advertiser Contact / Email (Optional)">
            <Input
              id="ad-contact-info"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
              placeholder="e.g. contact@advertiser.com, 9876543210"
            />
          </FormField>
        </div>

        {/* Section 2: Media Creative Upload */}
        <div
          style={{
            padding: '16px',
            background: 'var(--color-bg-secondary, rgba(0,0,0,0.03))',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ fontWeight: 600, fontSize: '0.95rem' }}>
              Advertisement Media Creative {isEditing ? '(Optional to replace)' : '*'}
            </label>

            {/* Media Type Toggle */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--color-card-bg)', padding: '3px', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                onClick={() => {
                  setMediaType('image');
                  if (mediaFile && !ALLOWED_IMAGE_TYPES.includes(mediaFile.type)) {
                    setMediaFile(null);
                    setMediaPreviewUrl(null);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: mediaType === 'image' ? 'var(--color-primary)' : 'transparent',
                  color: mediaType === 'image' ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                <ImageIcon size={14} />
                <span>Image (JPG, PNG, WebP)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMediaType('video');
                  if (mediaFile && !ALLOWED_VIDEO_TYPES.includes(mediaFile.type)) {
                    setMediaFile(null);
                    setMediaPreviewUrl(null);
                  }
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  background: mediaType === 'video' ? 'var(--color-primary)' : 'transparent',
                  color: mediaType === 'video' ? '#fff' : 'var(--color-text-muted)',
                }}
              >
                <Video size={14} />
                <span>Video (MP4, WebM)</span>
              </button>
            </div>
          </div>

          {/* Media Preview & Dropzone */}
          {mediaPreviewUrl ? (
            <div
              style={{
                position: 'relative',
                width: '100%',
                maxHeight: '260px',
                borderRadius: '8px',
                overflow: 'hidden',
                background: '#000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {mediaType === 'image' ? (
                <img
                  src={mediaPreviewUrl}
                  alt="Creative Preview"
                  style={{ width: '100%', maxHeight: '260px', objectFit: 'contain' }}
                />
              ) : (
                <video
                  src={mediaPreviewUrl}
                  controls
                  style={{ width: '100%', maxHeight: '260px', objectFit: 'contain' }}
                />
              )}

              <div
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  display: 'flex',
                  gap: '8px',
                }}
              >
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: 'rgba(0,0,0,0.75)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  <RefreshCw size={13} />
                  <span>Replace Media</span>
                  <input
                    type="file"
                    accept={mediaType === 'image' ? ALLOWED_IMAGE_TYPES.join(',') : ALLOWED_VIDEO_TYPES.join(',')}
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            </div>
          ) : (
            <label
              style={{
                border: '2px dashed var(--color-border)',
                borderRadius: '8px',
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--color-card-bg)',
                transition: 'border-color 0.2s',
              }}
            >
              <Upload size={32} style={{ color: 'var(--color-primary)' }} />
              <div style={{ fontWeight: 600 }}>Click or drag & drop to upload {mediaType}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {mediaType === 'image'
                  ? 'Supports JPG, PNG, WebP up to 10MB'
                  : 'Supports MP4, WebM up to 50MB (autoplay muted)'}
              </div>
              <input
                type="file"
                accept={mediaType === 'image' ? ALLOWED_IMAGE_TYPES.join(',') : ALLOWED_VIDEO_TYPES.join(',')}
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </label>
          )}
        </div>

        {/* Section 3: Destination Link & CTA */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
          <FormField
            id="ad-destination-url"
            label="Destination Web URL"
            required
            hint="External website to open when customer clicks (Must start with https://)"
          >
            <Input
              id="ad-destination-url"
              type="url"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://advertiser.example.com/promo"
              required
            />
          </FormField>

          <FormField id="ad-cta-label" label="Call to Action (CTA) Button Label">
            <select
              id="ad-cta-label"
              value={ctaLabel}
              onChange={(e) => setCtaLabel(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid var(--color-border)',
                background: 'var(--color-card-bg)',
                color: 'var(--color-text-primary)',
                fontSize: '0.9rem',
              }}
            >
              {CTA_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        {/* Section 4: Skip Duration (Exactly 5s, 10s, 30s) */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', fontSize: '0.95rem' }}>
            Skip Duration (Countdown before user can skip) *
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
            {([5, 10, 30] as SkipDuration[]).map((dur) => (
              <label
                key={dur}
                style={{
                  border: `2px solid ${skipDuration === dur ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: skipDuration === dur ? 'rgba(10, 123, 131, 0.08)' : 'var(--color-card-bg)',
                  borderRadius: '10px',
                  padding: '14px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.2s ease',
                }}
              >
                <input
                  type="radio"
                  name="skipDuration"
                  value={dur}
                  checked={skipDuration === dur}
                  onChange={() => setSkipDuration(dur)}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: skipDuration === dur ? 'var(--color-primary)' : 'inherit' }}>
                  {dur}s
                </span>
                <span style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                  {dur === 5 ? 'Short & Snappy' : dur === 10 ? 'Balanced Standard' : 'Extended Video'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Section 5: Campaign Scheduling & Status */}
        <div
          style={{
            padding: '16px',
            background: 'var(--color-bg-secondary, rgba(0,0,0,0.03))',
            borderRadius: '12px',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} style={{ color: 'var(--color-primary)' }} />
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>Campaign Scheduling (Asia/Kolkata IST)</h4>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <FormField id="ad-start-date" label="Start Date" required>
              <Input
                id="ad-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </FormField>

            <FormField id="ad-start-time" label="Start Time (IST)">
              <Input
                id="ad-start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </FormField>

            <FormField id="ad-end-date" label="End Date" required>
              <Input
                id="ad-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </FormField>

            <FormField id="ad-end-time" label="End Time (IST)">
              <Input
                id="ad-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </FormField>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <FormField id="ad-campaign-status" label="Campaign Status">
              <select
                id="ad-campaign-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as CampaignStatus)}
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-card-bg)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.9rem',
                }}
              >
                <option value="active">Active (Publish / Eligible)</option>
                <option value="scheduled">Scheduled for Later</option>
                <option value="paused">Paused</option>
                <option value="draft">Save as Draft</option>
              </select>
            </FormField>

            <FormField id="ad-campaign-priority" label="Rotation Priority (1 = Normal, 10 = Highest)">
              <Input
                id="ad-campaign-priority"
                type="number"
                min={1}
                max={10}
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value, 10) || 1)}
              />
            </FormField>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
          <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>

          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            {isEditing ? 'Update Campaign' : 'Publish / Create Campaign'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
