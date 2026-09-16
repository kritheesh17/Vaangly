import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingBag, Calendar, Wrench, MapPin, Sparkles, ChevronRight, ShieldCheck, Clock } from 'lucide-react';
import { useLocationContext } from '../context/LocationContext';
import { ActionCard } from '../components/customer/ActionCard';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import './HomePage.css';
import { useLanguage } from '../context/LanguageContext';

export const HomePage: React.FC = () => {
  const { selectedLocation, setIsLocationModalOpen } = useLocationContext();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [comingSoonModal, setComingSoonModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
  }>({
    isOpen: false,
    title: '',
    description: '',
  });

  const handleOrderClick = () => {
    navigate('/shops?group=ORDER');
  };

  const handleAppointmentClick = () => {
    navigate('/shops?group=APPOINTMENT');
  };

  const handleServiceClick = () => {
    navigate('/shops?group=SERVICE');
  };

  return (
    <div className="vaango-home">
      {/* Location Bar Banner */}
      <section className="vaango-home__location-banner">
        <div className="container vaango-home__location-inner">
          <button
            type="button"
            className="vaango-home__location-chip"
            onClick={() => setIsLocationModalOpen(true)}
            aria-label={`Current location is ${selectedLocation.name}. Tap to change.`}
          >
            <MapPin size={18} className="vaango-home__location-icon" />
            <div className="vaango-home__location-text">
              <span className="vaango-home__location-prefix">Browsing in</span>
              <strong className="vaango-home__location-title">
                {selectedLocation.name}, {selectedLocation.state}
              </strong>
            </div>
            <ChevronRight size={16} className="vaango-home__location-arrow" />
          </button>
        </div>
      </section>

      {/* Primary Customer Question: "What do you want to do?" */}
      <section className="container vaango-home__hero">
        <div className="vaango-home__hero-header">
          <Badge variant="accent" size="sm" withDot>
            Phase 4: Multi-Vertical Workflows Active
          </Badge>
          <h1 className="vaango-home__headline">{t('whatDoYouWant')}</h1>
          <p className="vaango-home__subheadline">
            {t('whatDoYouWantSubtitle')} {selectedLocation.name}.
          </p>
        </div>

        {/* The 3 Core Action Choices */}
        <div className="vaango-actions-grid" role="region" aria-label="Customer Action Choices">
          {/* Action 1: Order Something (Group A) */}
          <ActionCard
            icon={<ShoppingBag size={28} />}
            title={t('orderActionTitle')}
            subtitle={t('orderActionSubtitle')}
            badgeText="Ready to order"
            onClick={handleOrderClick}
          />

          {/* Action 2: Book an Appointment (Group B) */}
          <ActionCard
            icon={<Calendar size={28} />}
            title={t('appointmentActionTitle')}
            subtitle={t('appointmentActionSubtitle')}
            badgeText="Slots Available"
            onClick={handleAppointmentClick}
          />

          {/* Action 3: Get a Service (Group C) */}
          <ActionCard
            icon={<Wrench size={28} />}
            title={t('serviceActionTitle')}
            subtitle={t('serviceActionSubtitle')}
            badgeText="Services Open"
            onClick={handleServiceClick}
          />
        </div>
      </section>

      {/* Quick Category Jump for Order Workflow */}
      <section className="container vaango-home__categories-sec">
        <div className="vaango-home__sec-header">
          <div>
            <h2 className="vaango-home__sec-title">Order from Local Shops</h2>
            <p className="vaango-home__sec-subtitle">Pre-order essentials and skip physical queues</p>
          </div>
          <button
            type="button"
            className="vaango-home__see-all-btn"
            onClick={() => navigate('/shops')}
          >
            <span>See all</span>
            <ChevronRight size={16} />
          </button>
        </div>

        <div className="vaango-category-chips">
          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=grocery')}
          >
            <span className="vaango-cat-chip__emoji">🥦</span>
            <span className="vaango-cat-chip__label">Grocery & Provision</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=bakery')}
          >
            <span className="vaango-cat-chip__emoji">🥖</span>
            <span className="vaango-cat-chip__label">Bakery & Sweets</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=restaurant')}
          >
            <span className="vaango-cat-chip__emoji">☕</span>
            <span className="vaango-cat-chip__label">Restaurant & Eatery</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=pharmacy')}
          >
            <span className="vaango-cat-chip__emoji">💊</span>
            <span className="vaango-cat-chip__label">Pharmacy & Medicals</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=stationery')}
          >
            <span className="vaango-cat-chip__emoji">📚</span>
            <span className="vaango-cat-chip__label">Stationery & Books</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=salon')}
          >
            <span className="vaango-cat-chip__emoji">✂️</span>
            <span className="vaango-cat-chip__label">Salon & Grooming</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=clinic')}
          >
            <span className="vaango-cat-chip__emoji">🩺</span>
            <span className="vaango-cat-chip__label">Clinic & Doctors</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=tailor')}
          >
            <span className="vaango-cat-chip__emoji">🧵</span>
            <span className="vaango-cat-chip__label">Tailor & Stitching</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=mechanic')}
          >
            <span className="vaango-cat-chip__emoji">🛵</span>
            <span className="vaango-cat-chip__label">Bike Mechanic</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=repair')}
          >
            <span className="vaango-cat-chip__emoji">📱</span>
            <span className="vaango-cat-chip__label">Mobile & Laptop Repair</span>
          </button>

          <button
            type="button"
            className="vaango-cat-chip"
            onClick={() => navigate('/shops?category=laundry')}
          >
            <span className="vaango-cat-chip__emoji">👔</span>
            <span className="vaango-cat-chip__label">Steam Press & Laundry</span>
          </button>
        </div>
      </section>

      {/* Value Proposition Callout */}
      <section className="container vaango-home__value-sec">
        <Card variant="elevated" padding="lg" className="vaango-value-card">
          <div className="vaango-value-item">
            <div className="vaango-value-icon">
              <Clock size={24} />
            </div>
            <div>
              <h3 className="vaango-value-title">Zero Waiting Lines</h3>
              <p className="vaango-value-desc">
                Send what you need in advance. The shopkeeper packs it before you arrive.
              </p>
            </div>
          </div>

          <div className="vaango-value-item">
            <div className="vaango-value-icon">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="vaango-value-title">Verified Local Merchants</h3>
              <p className="vaango-value-desc">
                Support authentic neighborhood stores in your hometown with real accountability.
              </p>
            </div>
          </div>

          <div className="vaango-value-item">
            <div className="vaango-value-icon">
              <Sparkles size={24} />
            </div>
            <div>
              <h3 className="vaango-value-title">Realtime Order Tracking</h3>
              <p className="vaango-value-desc">
                Follow every step: from shop acceptance and packing to ready for pickup.
              </p>
            </div>
          </div>
        </Card>
      </section>

      {/* Coming Soon Modal for Appointment/Service */}
      <Modal
        isOpen={comingSoonModal.isOpen}
        onClose={() => setComingSoonModal({ ...comingSoonModal, isOpen: false })}
        title={comingSoonModal.title}
        maxWidth="sm"
        footer={
          <Button
            variant="primary"
            size="md"
            onClick={() => setComingSoonModal({ ...comingSoonModal, isOpen: false })}
          >
            Got it
          </Button>
        }
      >
        <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
          {comingSoonModal.description}
        </p>
      </Modal>
    </div>
  );
};
