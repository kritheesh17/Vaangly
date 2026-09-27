import React from 'react';
import { Download, Share2, PlusSquare, MoreVertical, CheckCircle2 } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { usePermissions } from '../../context/PermissionContext';
import './Permissions.css';

export const ManualInstallModal: React.FC = () => {
  const { isManualInstallOpen, setIsManualInstallOpen, platform, isInstalled } = usePermissions();

  if (!isManualInstallOpen) return null;

  return (
    <Modal
      isOpen={isManualInstallOpen}
      onClose={() => setIsManualInstallOpen(false)}
      title="Install Vaangly App"
      maxWidth="md"
    >
      <div className="vaangly-install-modal">
        {isInstalled ? (
          <div className="vaangly-install-success text-center py-6">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-3" />
            <h3 className="text-lg font-bold">Vaangly is Already Installed!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              You are running Vaangly as an installed app on your home screen or desktop.
            </p>
            <Button
              variant="primary"
              className="mt-5 w-full"
              onClick={() => setIsManualInstallOpen(false)}
            >
              Done
            </Button>
          </div>
        ) : platform === 'ios' ? (
          <div className="vaangly-install-guide">
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl mb-4 text-primary">
              <Download size={22} />
              <div className="text-sm font-medium">
                Install Vaangly on iPhone / iPad in 2 easy steps
              </div>
            </div>
            <ol className="vaangly-install-steps">
              <li className="flex items-start gap-3 mb-4">
                <span className="vaangly-step-number">1</span>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    Tap the Share button <Share2 size={16} className="text-primary inline" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    At the bottom of Safari (or top in iPad), tap the Share icon.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 mb-4">
                <span className="vaangly-step-number">2</span>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    Select &quot;Add to Home Screen&quot; <PlusSquare size={16} className="text-primary inline" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Scroll down and tap &quot;Add to Home Screen&quot;, then tap &quot;Add&quot; at top right.
                  </p>
                </div>
              </li>
            </ol>
            <Button
              variant="outline"
              className="w-full mt-2"
              onClick={() => setIsManualInstallOpen(false)}
            >
              Got it
            </Button>
          </div>
        ) : (
          <div className="vaangly-install-guide">
            <div className="flex items-center gap-3 p-3 bg-primary/10 rounded-xl mb-4 text-primary">
              <Download size={22} />
              <div className="text-sm font-medium">
                Install Vaangly from your browser menu
              </div>
            </div>
            <ol className="vaangly-install-steps">
              <li className="flex items-start gap-3 mb-4">
                <span className="vaangly-step-number">1</span>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    Open browser menu <MoreVertical size={16} className="text-primary inline" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tap the three dots (⋮) in the top-right corner of your browser.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3 mb-4">
                <span className="vaangly-step-number">2</span>
                <div>
                  <div className="font-semibold text-sm flex items-center gap-1.5">
                    Choose &quot;Install app&quot; or &quot;Add to Home screen&quot;
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Confirm the prompt to pin Vaangly to your phone home screen or app drawer.
                  </p>
                </div>
              </li>
            </ol>
            <Button
              variant="primary"
              className="w-full mt-2"
              onClick={() => setIsManualInstallOpen(false)}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
};
