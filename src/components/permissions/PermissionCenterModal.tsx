import React from 'react';
import { Modal } from '../ui/Modal';
import { PermissionCenterContent } from './PermissionCenterContent';
import { usePermissions } from '../../context/PermissionContext';

export const PermissionCenterModal: React.FC = () => {
  const { isPermissionCenterOpen, setIsPermissionCenterOpen } = usePermissions();

  if (!isPermissionCenterOpen) return null;

  return (
    <Modal
      isOpen={isPermissionCenterOpen}
      onClose={() => setIsPermissionCenterOpen(false)}
      title="Vaangly Permissions & App Manager"
      maxWidth="lg"
    >
      <div className="py-2">
        <PermissionCenterContent />
      </div>
    </Modal>
  );
};
