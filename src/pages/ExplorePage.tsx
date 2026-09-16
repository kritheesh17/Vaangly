import React, { useState } from 'react';
import { Search, Store, ShoppingBag, Calendar, Wrench } from 'lucide-react';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Card } from '../components/ui/Card';
import { WorkflowGroupCode } from '../types/workflow';
import './ExplorePage.css';

const CATEGORIES = [
  { code: 'grocery', name: 'Grocery & Provisions', group: 'ORDER', count: 'Phase 2' },
  { code: 'bakery', name: 'Bakery & Confectionery', group: 'ORDER', count: 'Phase 2' },
  { code: 'restaurant', name: 'Hotels & Eateries', group: 'ORDER', count: 'Phase 2' },
  { code: 'pharmacy', name: 'Pharmacies & Medicals', group: 'ORDER', count: 'Phase 2' },
  { code: 'stationery', name: 'Books & Stationery', group: 'ORDER', count: 'Phase 2' },
  { code: 'salon', name: 'Hair & Beauty Salons', group: 'APPOINTMENT', count: 'Phase 2' },
  { code: 'clinic', name: 'Clinics & Consultants', group: 'APPOINTMENT', count: 'Phase 2' },
  { code: 'tailor', name: 'Tailoring & Stitching', group: 'SERVICE', count: 'Phase 2' },
  { code: 'mechanic', name: 'Two-Wheeler & Auto Care', group: 'SERVICE', count: 'Phase 2' },
  { code: 'repair', name: 'Mobile & Gadget Repair', group: 'SERVICE', count: 'Phase 2' },
  { code: 'laundry', name: 'Laundry & Dry Cleaners', group: 'SERVICE', count: 'Phase 2' },
];

export const ExplorePage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeGroup, setActiveGroup] = useState<WorkflowGroupCode | 'ALL'>('ALL');

  const filteredCategories = CATEGORIES.filter((cat) => {
    const matchesSearch = cat.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesGroup = activeGroup === 'ALL' || cat.group === activeGroup;
    return matchesSearch && matchesGroup;
  });

  return (
    <div className="container vaango-explore">
      <div className="vaango-explore__header">
        <h1 className="vaango-explore__title">Explore Local Merchants</h1>
        <p className="vaango-explore__subtitle">
          Find verified neighborhood shops in Gobichettipalayam across daily essentials, appointments, and services.
        </p>

        {/* Search Bar */}
        <div className="vaango-explore__search">
          <Input
            id="explore-search"
            placeholder="Search shops, services, or essentials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            leftIcon={<Search size={20} />}
          />
        </div>

        {/* Workflow Group Filter Pills */}
        <div className="vaango-explore__filters" role="group" aria-label="Filter by workflow type">
          <button
            type="button"
            className={`vaango-filter-pill ${activeGroup === 'ALL' ? 'vaango-filter-pill--active' : ''}`}
            onClick={() => setActiveGroup('ALL')}
          >
            All Categories ({CATEGORIES.length})
          </button>
          <button
            type="button"
            className={`vaango-filter-pill ${activeGroup === 'ORDER' ? 'vaango-filter-pill--active' : ''}`}
            onClick={() => setActiveGroup('ORDER')}
          >
            <ShoppingBag size={14} />
            Orders
          </button>
          <button
            type="button"
            className={`vaango-filter-pill ${activeGroup === 'APPOINTMENT' ? 'vaango-filter-pill--active' : ''}`}
            onClick={() => setActiveGroup('APPOINTMENT')}
          >
            <Calendar size={14} />
            Appointments
          </button>
          <button
            type="button"
            className={`vaango-filter-pill ${activeGroup === 'SERVICE' ? 'vaango-filter-pill--active' : ''}`}
            onClick={() => setActiveGroup('SERVICE')}
          >
            <Wrench size={14} />
            Services
          </button>
        </div>
      </div>

      {/* Categories Grid */}
      <div className="vaango-explore__grid">
        {filteredCategories.map((cat) => (
          <Card key={cat.code} variant="default" interactive padding="md" className="vaango-cat-card">
            <div className="vaango-cat-card__body">
              <div className="vaango-cat-card__icon">
                <Store size={22} />
              </div>
              <div>
                <h3 className="vaango-cat-card__name">{cat.name}</h3>
                <span className="vaango-cat-card__group">Group: {cat.group}</span>
              </div>
            </div>
            <Badge variant="neutral" size="sm">
              {cat.count}
            </Badge>
          </Card>
        ))}
      </div>

      {/* Intentional Empty State for Shops */}
      <div className="vaango-explore__empty-section">
        <EmptyState
          title="Merchant Onboarding Underway"
          description="Shop directory discovery and ordering workflows will be enabled in Phase 2 once our initial merchant cohort in Gobichettipalayam completes physical onboarding."
        />
      </div>
    </div>
  );
};
