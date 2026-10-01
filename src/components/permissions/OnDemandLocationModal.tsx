import React from 'react';
import { MapPin, Navigation, ShieldCheck, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import './OnDemandLocationModal.css';

interface OnDemandLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmLocation: () => Promise<void>;
  isRequesting: boolean;
  isDenied: boolean;
  onChooseTownInstead: () => void;
  onOpenSettings?: () => void;
}

export const OnDemandLocationModal: React.FC<OnDemandLocationModalProps> = ({
  isOpen,
  onClose,
  onConfirmLocation,
  isRequesting,
  isDenied,
  onChooseTownInstead,
  onOpenSettings,
}) => {
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="sm">
      <div className="vaangly-ondemand-loc pt-1 pb-1">
        {/* Header Icon */}
        <div className="text-center mb-5">
          <div
            className={`inline-flex p-3 rounded-2xl mb-3 ${
              isDenied
                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            }`}
          >
            {isDenied ? <AlertCircle size={28} /> : <Navigation size={28} />}
          </div>

          <h2 className="text-lg font-bold tracking-tight">
            {isDenied ? 'Location Access Blocked' : 'Find Stores Near You'}
          </h2>

          <p className="text-xs text-muted-foreground mt-1.5 max-w-xs mx-auto leading-relaxed">
            {isDenied
              ? 'Your browser has blocked location access for Vaangly. You can select your town manually to browse shops, or update browser settings.'
              : 'Vaangly uses your location on demand to calculate live distances to neighborhood shops, pharmacies, and clinics.'}
          </p>
        </div>

        {/* Feature & Privacy Highlights (when not denied) */}
        {!isDenied ? (
          <div className="space-y-2.5 mb-5 text-xs">
            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <MapPin size={16} className="text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-foreground">Accurate Walking & Driving Distances</span>
                <p className="text-muted-foreground text-[11px] mt-0.5">
                  See exact meters and kilometers to nearby stores and available services.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
              <ShieldCheck size={16} className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div>
                <span className="font-semibold text-foreground">Private & On-Demand Only</span>
                <p className="text-muted-foreground text-[11px] mt-0.5">
                  Your coordinates are used strictly while searching nearby stores and are never tracked or saved.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-foreground mb-5 space-y-1.5">
            <div className="font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <span>To unblock location:</span>
            </div>
            <ol className="list-decimal pl-4 space-y-1 text-muted-foreground text-[11px]">
              <li>Tap the <strong>Padlock (🔒)</strong> or site settings icon in the address bar.</li>
              <li>Change <strong>Location</strong> from Blocked to <strong>Allow</strong>.</li>
              <li>Return and tap Near Me again.</li>
            </ol>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isDenied ? (
            <Button
              variant="primary"
              size="md"
              className="w-full flex items-center justify-center gap-2"
              isLoading={isRequesting}
              onClick={onConfirmLocation}
            >
              <Navigation size={15} />
              <span>Use Current Location</span>
            </Button>
          ) : (
            onOpenSettings && (
              <Button
                variant="primary"
                size="md"
                className="w-full flex items-center justify-center gap-2"
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
              >
                <ExternalLink size={15} />
                <span>Open Permission Center</span>
              </Button>
            )
          )}

          <Button
            variant="outline"
            size="md"
            className="w-full flex items-center justify-center gap-2 text-xs"
            onClick={() => {
              onClose();
              onChooseTownInstead();
            }}
          >
            <span>Browse by Town Instead</span>
            <ArrowRight size={14} />
          </Button>
        </div>
      </div>
    </Modal>
  );
};
