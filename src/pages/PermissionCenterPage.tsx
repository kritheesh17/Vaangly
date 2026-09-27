import React from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PermissionCenterContent } from '../components/permissions/PermissionCenterContent';

export const PermissionCenterPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="container py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={16} /> Back
        </button>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
          <Shield className="text-primary" size={28} />
          <span>Vaangly Permission Center</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage device notifications, location discovery, and home screen installation settings.
        </p>
      </div>

      <PermissionCenterContent />
    </div>
  );
};
