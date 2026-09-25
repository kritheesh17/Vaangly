import React, { useState } from 'react';
import {
  Sparkles,
  ShoppingBag,
  Bell,
  Heart,
  Share2,
  Trash2,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { IconButton } from '../components/ui/IconButton';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Textarea } from '../components/ui/Textarea';
import { Checkbox } from '../components/ui/Checkbox';
import { Switch } from '../components/ui/Switch';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { NotificationBadge } from '../components/ui/NotificationBadge';
import { Avatar } from '../components/ui/Avatar';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { FormField } from '../components/ui/FormField';
import { useToast } from '../context/ToastContext';
import './DesignSystemShowcasePage.css';

export const DesignSystemShowcasePage: React.FC = () => {
  const { success, warning, error, info } = useToast();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [switchVal, setSwitchVal] = useState(true);
  const [checkboxVal, setCheckboxVal] = useState(true);
  const [textVal, setTextVal] = useState('Gobichettipalayam');
  const [btnLoading, setBtnLoading] = useState(false);

  return (
    <div className="container vaango-showcase">
      <div className="vaango-showcase__header">
        <div className="vaango-showcase__title-row">
          <Sparkles className="vaango-showcase__icon" />
          <h1 className="vaango-showcase__title">Vaango Design System & Tokens</h1>
        </div>
        <p className="vaango-showcase__desc">
          Modular, accessible component library built with semantic design tokens, Nunito typography, and high-contrast touch targets (≥ 52px).
        </p>
      </div>

      {/* 1. Color Palette Tokens */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">1. Color Palette & Semantic Tokens</h2>
        <div className="vaango-color-grid">
          <div className="vaango-swatch" style={{ backgroundColor: '#0A7B83', color: '#FFF' }}>
            <span className="vaango-swatch__name">Deep Teal</span>
            <span className="vaango-swatch__hex">#0A7B83</span>
            <span className="vaango-swatch__role">Primary Brand Action</span>
          </div>

          <div className="vaango-swatch" style={{ backgroundColor: '#F59E0B', color: '#0F172A' }}>
            <span className="vaango-swatch__name">Warm Amber</span>
            <span className="vaango-swatch__hex">#F59E0B</span>
            <span className="vaango-swatch__role">Secondary Accent</span>
          </div>

          <div className="vaango-swatch" style={{ backgroundColor: '#0F1828', color: '#FFF' }}>
            <span className="vaango-swatch__name">Deep Navy</span>
            <span className="vaango-swatch__hex">#0F1828</span>
            <span className="vaango-swatch__role">Dark Theme Canvas</span>
          </div>

          <div className="vaango-swatch" style={{ backgroundColor: '#10B981', color: '#FFF' }}>
            <span className="vaango-swatch__name">Emerald</span>
            <span className="vaango-swatch__hex">#10B981</span>
            <span className="vaango-swatch__role">Success & Active</span>
          </div>

          <div className="vaango-swatch" style={{ backgroundColor: '#EF4444', color: '#FFF' }}>
            <span className="vaango-swatch__name">Ruby</span>
            <span className="vaango-swatch__hex">#EF4444</span>
            <span className="vaango-swatch__role">Error & Terminal</span>
          </div>
        </div>
      </section>

      {/* 2. Button Component System */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">2. Buttons & IconButtons (≥ 52px Touch Targets)</h2>
        <Card variant="default" padding="lg">
          <div className="vaango-component-row">
            <Button variant="primary" size="lg">Primary (Teal)</Button>
            <Button variant="accent" size="lg">Accent (Amber)</Button>
            <Button variant="secondary" size="lg">Secondary</Button>
            <Button variant="outline" size="lg">Outline</Button>
            <Button variant="ghost" size="lg">Ghost</Button>
            <Button variant="danger" size="lg" leftIcon={<Trash2 size={18} />}>Danger</Button>
          </div>

          <div className="vaango-component-row" style={{ marginTop: 'var(--space-4)' }}>
            <Button
              variant="primary"
              size="lg"
              isLoading={btnLoading}
              onClick={() => {
                setBtnLoading(true);
                setTimeout(() => setBtnLoading(false), 2000);
              }}
            >
              {btnLoading ? 'Processing...' : 'Click for Loading State'}
            </Button>
            <Button variant="primary" size="lg" disabled>Disabled</Button>
            <Button variant="primary" size="md">Medium (46px)</Button>
            <Button variant="primary" size="sm">Small (40px)</Button>
          </div>

          <div className="vaango-component-row" style={{ marginTop: 'var(--space-4)' }}>
            <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, alignSelf: 'center' }}>IconButtons:</span>
            <IconButton icon={<Heart />} aria-label="Favorite shop" variant="ghost" size="lg" />
            <IconButton icon={<Share2 />} aria-label="Share listing" variant="secondary" size="lg" />
            <IconButton icon={<ShoppingBag />} aria-label="Shop catalog" variant="outline" size="lg" />
            <IconButton icon={<Bell />} aria-label="Notifications" variant="primary" size="lg" />
          </div>
        </Card>
      </section>

      {/* 3. Form Controls & Accessibility */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">3. Form Controls & Inputs</h2>
        <Card variant="default" padding="lg">
          <div className="vaango-form-grid">
            <FormField id="showcase-text" label="Town / Landmark" required hint="Defaults to launch town">
              <Input
                id="showcase-text"
                value={textVal}
                onChange={(e) => setTextVal(e.target.value)}
                placeholder="Enter town name"
              />
            </FormField>

            <FormField id="showcase-select" label="Workflow Category" required>
              <Select
                id="showcase-select"
                options={[
                  { value: 'order', label: 'Group A: Order-Based (Groceries, Bakery)' },
                  { value: 'appointment', label: 'Group B: Appointment-Based (Salon, Clinic)' },
                  { value: 'service', label: 'Group C: Service-Based (Tailor, Mechanic)' },
                ]}
              />
            </FormField>

            <FormField id="showcase-error" label="Validated Field Example" error="Mobile number must include 10 digits">
              <Input id="showcase-error" defaultValue="+91 999" error />
            </FormField>

            <FormField id="showcase-textarea" label="Customer Request Notes">
              <Textarea id="showcase-textarea" placeholder="Add specific instructions for the merchant..." />
            </FormField>
          </div>

          <div className="vaango-component-row" style={{ marginTop: 'var(--space-6)' }}>
            <Checkbox
              label="Allow SMS order status updates"
              sublabel="Critical updates regarding preparation time"
              checked={checkboxVal}
              onChange={(e) => setCheckboxVal(e.target.checked)}
            />
          </div>

          <div style={{ marginTop: 'var(--space-4)' }}>
            <Switch
              checked={switchVal}
              onChange={setSwitchVal}
              label="Live shop status notifications"
              description="Notify immediately when merchant confirms request"
            />
          </div>
        </Card>
      </section>

      {/* 4. Badges & Avatars */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">4. Badges, Chips & Avatars</h2>
        <Card variant="default" padding="lg">
          <div className="vaango-component-row">
            <Badge variant="primary" size="md" withDot>Requested</Badge>
            <Badge variant="accent" size="md" withDot>Preparing</Badge>
            <Badge variant="success" size="md" withDot>Ready for Pickup</Badge>
            <Badge variant="warning" size="md">Delayed</Badge>
            <Badge variant="error" size="md">Cancelled</Badge>
            <Badge variant="neutral" size="md">Draft</Badge>
          </div>

          <div style={{ marginTop: 'var(--space-6)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>
              Standardized Red Notification Badges (Centered Number Inside)
            </h4>
            <div className="vaango-component-row" style={{ alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Count 1: <NotificationBadge count={1} size="md" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Count 9: <NotificationBadge count={9} size="md" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Count 25: <NotificationBadge count={25} size="md" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Count 99: <NotificationBadge count={99} size="md" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                Count 100+: <NotificationBadge count={120} size="md" />
              </span>
            </div>

            <div className="vaango-component-row" style={{ marginTop: '12px', alignItems: 'center', gap: '16px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                Applications <NotificationBadge count={3} size="sm" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                Orders <NotificationBadge count={12} size="sm" />
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                Master Catalogue <NotificationBadge count={5} size="sm" />
              </span>
            </div>
          </div>

          <div className="vaango-component-row" style={{ marginTop: 'var(--space-6)' }}>
            <Avatar name="Ananya Raman" alt="Ananya Raman" size="sm" />
            <Avatar name="Murugan Stores" alt="Murugan Stores" size="md" />
            <Avatar name="Vaango Admin" alt="Vaango Admin" size="lg" />
            <Avatar name="Karthik Tailors" alt="Karthik Tailors" size="xl" />
          </div>
        </Card>
      </section>

      {/* 5. Modals & Dialogs */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">5. Modals & Dialog Systems</h2>
        <Card variant="default" padding="lg">
          <div className="vaango-component-row">
            <Button variant="primary" size="md" onClick={() => setIsModalOpen(true)}>
              Launch Example Modal
            </Button>
            <Button variant="danger" size="md" onClick={() => setIsConfirmOpen(true)}>
              Launch Confirm Dialog
            </Button>
          </div>
        </Card>

        {/* Example Modal */}
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Neighborhood Delivery Terms"
          description="Standard merchant-customer protocol for local pickups."
          footer={
            <Button variant="primary" size="md" onClick={() => setIsModalOpen(false)}>
              I Understand
            </Button>
          }
        >
          <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
            In Vaango, pre-orders are held at the shop counter with zero physical queueing.
            Customers show their reference code upon arrival.
          </p>
        </Modal>

        {/* Example Confirm Dialog */}
        <ConfirmDialog
          isOpen={isConfirmOpen}
          onClose={() => setIsConfirmOpen(false)}
          onConfirm={() => {
            setIsConfirmOpen(false);
            success('Action confirmed successfully.');
          }}
          title="Cancel Service Ticket?"
          message="Are you sure you want to cancel this appointment? The shopkeeper has already reserved this slot."
          variant="danger"
          confirmLabel="Yes, Cancel"
        />
      </section>

      {/* 6. Feedback & Notifications (Toast) */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">6. Toasts & Feedback</h2>
        <Card variant="default" padding="lg">
          <div className="vaango-component-row">
            <Button variant="secondary" size="md" onClick={() => success('Merchant accepted order #ORD-4019!')}>
              Trigger Success Toast
            </Button>
            <Button variant="secondary" size="md" onClick={() => warning('Shop closing in 30 minutes.')}>
              Trigger Warning Toast
            </Button>
            <Button variant="secondary" size="md" onClick={() => error('Unable to verify network connection.')}>
              Trigger Error Toast
            </Button>
            <Button variant="secondary" size="md" onClick={() => info('Gobichettipalayam zone is online.')}>
              Trigger Info Toast
            </Button>
          </div>
        </Card>
      </section>

      {/* 7. Loading & Zero States */}
      <section className="vaango-showcase__section">
        <h2 className="vaango-showcase__sec-title">7. Loading Skeletons & Zero States</h2>
        <div className="vaango-grid-2">
          <Card variant="default" padding="md">
            <h3 style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--font-size-base)' }}>Skeleton Placeholders</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <Skeleton height={28} width="50%" />
              <Skeleton height={18} width="80%" />
              <Skeleton height={60} />
            </div>
          </Card>

          <Card variant="default" padding="md">
            <ErrorState
              title="Mini Error Display"
              message="Simulated component error handled with retry."
              onRetry={() => info('Retrying connection...')}
            />
          </Card>
        </div>
      </section>
    </div>
  );
};
