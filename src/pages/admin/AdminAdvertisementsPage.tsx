import React, { useState, useEffect, useMemo } from 'react';
import {
  Megaphone,
  Plus,
  Search,
  Eye,
  Edit2,
  Trash2,
  Pause,
  Play,
  BarChart3,
  Settings,
  Calendar,
  Image as ImageIcon,
  Video,
  RefreshCw,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { AdCampaign } from '../../types/advertisement';
import {
  fetchAdminCampaigns,
  deleteAdminCampaign,
  pauseAdminCampaign,
  resumeAdminCampaign,
} from '../../lib/advertisementApi';
import { getISTDateString } from '../../lib/analyticsApi';

import { CampaignModal } from '../../components/admin/advertisement/CampaignModal';
import { AdPreviewModal } from '../../components/admin/advertisement/AdPreviewModal';
import { AdAnalyticsTab } from '../../components/admin/advertisement/AdAnalyticsTab';
import { AdSettingsTab } from '../../components/admin/advertisement/AdSettingsTab';
import './AdminAdvertisementsPage.css';

type ActiveTab = 'campaigns' | 'analytics' | 'settings';

export const AdminAdvertisementsPage: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();

  const [activeTab, setActiveTab] = useState<ActiveTab>('campaigns');
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals State
  const [isCampaignModalOpen, setIsCampaignModalOpen] = useState<boolean>(false);
  const [campaignToEdit, setCampaignToEdit] = useState<AdCampaign | null>(null);

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);
  const [campaignToPreview, setCampaignToPreview] = useState<AdCampaign | null>(null);

  const [campaignToDelete, setCampaignToDelete] = useState<AdCampaign | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const [analyticsTargetCampaignId, setAnalyticsTargetCampaignId] = useState<string>('');

  const loadCampaigns = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminCampaigns();
      setCampaigns(data);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      toastError('Could not load advertisement campaigns.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadCampaigns();
  };

  // Filtered campaigns
  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      const matchesSearch =
        searchQuery === '' ||
        c.campaign_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.advertiser_name.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === 'all' || c.status.toLowerCase() === statusFilter.toLowerCase();

      return matchesSearch && matchesStatus;
    });
  }, [campaigns, searchQuery, statusFilter]);

  // Actions
  const handleOpenAddModal = () => {
    setCampaignToEdit(null);
    setIsCampaignModalOpen(true);
  };

  const handleOpenEditModal = (c: AdCampaign) => {
    setCampaignToEdit(c);
    setIsCampaignModalOpen(true);
  };

  const handleOpenPreviewModal = (c: AdCampaign) => {
    setCampaignToPreview(c);
    setIsPreviewModalOpen(true);
  };

  const handleTogglePauseResume = async (c: AdCampaign) => {
    try {
      if (c.status === 'paused') {
        await resumeAdminCampaign(c.id);
        toastSuccess(`Campaign "${c.campaign_name}" resumed.`);
      } else {
        await pauseAdminCampaign(c.id);
        toastSuccess(`Campaign "${c.campaign_name}" paused.`);
      }
      loadCampaigns();
    } catch (err) {
      console.error('Error toggling campaign status:', err);
      toastError('Failed to change campaign status.');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!campaignToDelete) return;
    setIsDeleting(true);
    try {
      await deleteAdminCampaign(campaignToDelete.id);
      toastSuccess(`Campaign "${campaignToDelete.campaign_name}" deleted.`);
      setCampaignToDelete(null);
      loadCampaigns();
    } catch (err) {
      console.error('Error deleting campaign:', err);
      toastError('Failed to delete campaign.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleViewAnalytics = (campaignId: string) => {
    setAnalyticsTargetCampaignId(campaignId);
    setActiveTab('analytics');
  };

  return (
    <div className="vaango-admin-ads">
      {/* Page Header */}
      <div className="vaango-admin-ads-header">
        <div className="vaango-admin-ads-title-wrap">
          <h1>Advertisement Management</h1>
          <p>Create, schedule, monitor, and analyze commercial brand campaigns.</p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button variant="outline" onClick={handleRefresh} isLoading={isRefreshing}>
            <RefreshCw size={16} style={{ marginRight: '6px' }} />
            Refresh
          </Button>

          <Button variant="primary" onClick={handleOpenAddModal}>
            <Plus size={16} style={{ marginRight: '6px' }} />
            Add Advertisement
          </Button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="vaango-admin-ads-tabs">
        <button
          type="button"
          className={`vaango-admin-ads-tab-btn ${activeTab === 'campaigns' ? 'active' : ''}`}
          onClick={() => setActiveTab('campaigns')}
        >
          <Megaphone size={16} />
          <span>Campaign Manager ({campaigns.length})</span>
        </button>

        <button
          type="button"
          className={`vaango-admin-ads-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={16} />
          <span>Analytics Dashboard</span>
        </button>

        <button
          type="button"
          className={`vaango-admin-ads-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          <Settings size={16} />
          <span>Advertisement Settings</span>
        </button>
      </div>

      {/* TAB 1: CAMPAIGN MANAGER */}
      {activeTab === 'campaigns' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Search & Filter Row */}
          <div className="vaango-admin-ads-filter-row">
            <div className="vaango-admin-ads-search-box">
              <Search size={18} style={{ color: 'var(--color-text-muted)' }} />
              <Input
                placeholder="Search campaigns by name or advertiser..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>

            <div className="vaango-admin-ads-status-pills">
              {[
                { key: 'all', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'scheduled', label: 'Scheduled' },
                { key: 'paused', label: 'Paused' },
                { key: 'expired', label: 'Expired' },
                { key: 'draft', label: 'Draft' },
              ].map((pill) => (
                <button
                  key={pill.key}
                  type="button"
                  className={`vaango-admin-ads-status-pill ${statusFilter === pill.key ? 'active' : ''}`}
                  onClick={() => setStatusFilter(pill.key)}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Campaigns Table */}
          <Card className="vaango-admin-ads-table-card">
            {isLoading ? (
              <div style={{ padding: '24px' }}>
                <Skeleton height={40} style={{ marginBottom: '12px' }} />
                <Skeleton height={50} style={{ marginBottom: '8px' }} />
                <Skeleton height={50} style={{ marginBottom: '8px' }} />
                <Skeleton height={50} />
              </div>
            ) : filteredCampaigns.length === 0 ? (
              <EmptyState
                icon={<Megaphone size={40} />}
                title={campaigns.length === 0 ? 'No campaigns created yet' : 'No matching campaigns found'}
                description={
                  campaigns.length === 0
                    ? 'Get started by creating your first sponsored advertisement campaign.'
                    : 'Try clearing your search query or status filter.'
                }
                actionLabel={campaigns.length === 0 ? 'Create Advertisement' : undefined}
                onAction={campaigns.length === 0 ? handleOpenAddModal : undefined}
              />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="vaango-admin-ads-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>Creative</th>
                      <th>Campaign & Advertiser</th>
                      <th>Schedule (IST)</th>
                      <th>Skip</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Impressions</th>
                      <th style={{ textAlign: 'right' }}>Clicks (CTR)</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((c) => {
                      const creative = c.creatives?.[0];
                      const sDate = getISTDateString(c.start_at);
                      const eDate = getISTDateString(c.end_at);

                      return (
                        <tr key={c.id}>
                          {/* Thumbnail / Creative icon */}
                          <td>
                            {creative?.media_type === 'image' && creative.media_url ? (
                              <img
                                src={creative.media_url}
                                alt={c.campaign_name}
                                className="vaango-admin-ads-thumb"
                              />
                            ) : creative?.media_type === 'video' ? (
                              <div className="vaango-admin-ads-thumb-fallback">
                                <Video size={22} style={{ color: 'var(--color-primary)' }} />
                              </div>
                            ) : (
                              <div className="vaango-admin-ads-thumb-fallback">
                                <ImageIcon size={22} />
                              </div>
                            )}
                          </td>

                          {/* Campaign & Advertiser */}
                          <td>
                            <div style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              {c.campaign_name}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                              <span>{c.advertiser_name}</span>
                              {creative && (
                                <Badge variant="neutral">
                                  {creative.media_type === 'video' ? 'VIDEO' : 'IMAGE'}
                                </Badge>
                              )}
                            </div>
                          </td>

                          {/* Dates */}
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                              <Calendar size={13} style={{ color: 'var(--color-text-muted)' }} />
                              <span>{sDate} to {eDate}</span>
                            </div>
                          </td>

                          {/* Skip duration */}
                          <td>
                            <Badge variant="neutral">{c.skip_duration}s</Badge>
                          </td>

                          {/* Status */}
                          <td>
                            <Badge
                              variant={
                                c.status === 'active'
                                  ? 'success'
                                  : c.status === 'scheduled'
                                  ? 'primary'
                                  : c.status === 'paused'
                                  ? 'warning'
                                  : 'neutral'
                              }
                            >
                              {c.status.toUpperCase()}
                            </Badge>
                          </td>

                          {/* Impressions */}
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {(c.impressions || 0).toLocaleString()}
                          </td>

                          {/* Clicks & CTR */}
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 600, color: '#10b981' }}>
                              {(c.clicks || 0).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)' }}>
                              {c.ctr || 0}% CTR
                            </div>
                          </td>

                          {/* Actions */}
                          <td>
                            <div className="vaango-admin-ads-actions">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenPreviewModal(c)}
                                title="Preview customer view"
                              >
                                <Eye size={15} />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenEditModal(c)}
                                title="Edit campaign"
                              >
                                <Edit2 size={15} />
                              </Button>

                              {c.status !== 'expired' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleTogglePauseResume(c)}
                                  title={c.status === 'paused' ? 'Resume campaign' : 'Pause campaign'}
                                >
                                  {c.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                                </Button>
                              )}

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleViewAnalytics(c.id)}
                                title="View detailed analytics"
                              >
                                <BarChart3 size={15} />
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setCampaignToDelete(c)}
                                title="Delete campaign"
                                style={{ color: 'var(--color-error)' }}
                              >
                                <Trash2 size={15} />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 2: ANALYTICS DASHBOARD */}
      {activeTab === 'analytics' && (
        <AdAnalyticsTab
          campaigns={campaigns}
          initialCampaignId={analyticsTargetCampaignId}
        />
      )}

      {/* TAB 3: ADVERTISEMENT SETTINGS */}
      {activeTab === 'settings' && <AdSettingsTab />}

      {/* Campaign Creation / Edit Modal */}
      <CampaignModal
        isOpen={isCampaignModalOpen}
        onClose={() => setIsCampaignModalOpen(false)}
        campaignToEdit={campaignToEdit}
        onSuccess={() => {
          toastSuccess(campaignToEdit ? 'Campaign updated successfully!' : 'Campaign created successfully!');
          loadCampaigns();
        }}
      />

      {/* Customer Preview Simulation Modal */}
      <AdPreviewModal
        isOpen={isPreviewModalOpen}
        onClose={() => setIsPreviewModalOpen(false)}
        campaign={campaignToPreview}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(campaignToDelete)}
        title="Delete Advertisement Campaign"
        message={`Are you sure you want to permanently delete campaign "${campaignToDelete?.campaign_name}"? All associated creative media and analytics events will be removed.`}
        confirmLabel="Delete Campaign"
        variant="danger"
        isLoading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onClose={() => setCampaignToDelete(null)}
      />
    </div>
  );
};
