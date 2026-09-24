import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Search,
  Plus,
  Package,
  AlertCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { MasterProduct } from '../../types/database';
import {
  searchApprovedMasterProducts,
  checkMasterProductDuplicates,
  DuplicateCheckResult,
} from '../../lib/masterCatalogueApi';
import { Button } from '../ui/Button';
import './MasterCatalogueModal.css';

interface MasterCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopTypeId?: string;
  onSelectMasterProduct: (product: MasterProduct) => void;
  onCreateCustomProduct: (customName?: string) => void;
}

export const MasterCatalogueModal: React.FC<MasterCatalogueModalProps> = ({
  isOpen,
  onClose,
  shopTypeId,
  onSelectMasterProduct,
  onCreateCustomProduct,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [products, setProducts] = useState<MasterProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult[] | null>(null);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const fetchProducts = useCallback(async (query: string) => {
    setIsLoading(true);
    try {
      const data = await searchApprovedMasterProducts(query, shopTypeId);
      setProducts(data);
    } catch (err) {
      console.error('Failed to search master products:', err);
    } finally {
      setIsLoading(false);
    }
  }, [shopTypeId]);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setDuplicateWarning(null);
      fetchProducts('');
    }
  }, [isOpen, fetchProducts]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    setDuplicateWarning(null);
    fetchProducts(val);
  };

  const handleCreateNewClick = async () => {
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      onCreateCustomProduct();
      return;
    }

    setIsCheckingDuplicate(true);
    try {
      const duplicates = await checkMasterProductDuplicates(trimmed, shopTypeId);
      if (duplicates.length > 0) {
        setDuplicateWarning(duplicates);
      } else {
        onCreateCustomProduct(trimmed);
      }
    } catch (err) {
      console.error('Duplicate check error:', err);
      onCreateCustomProduct(trimmed);
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="vaango-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="catalogue-modal-title">
      <div className="vaango-modal-content vaango-master-catalogue-modal">
        {/* Header */}
        <div className="vaango-master-modal__header">
          <div className="vaango-master-modal__header-info">
            <div className="vaango-master-modal__tag">
              <Sparkles size={14} />
              <span>Global Master Catalogue</span>
            </div>
            <h2 id="catalogue-modal-title" className="vaango-master-modal__title">
              Select or Propose Product
            </h2>
            <p className="vaango-master-modal__subtitle">
              Choose from standardized products or create a brand new product for your shop.
            </p>
          </div>
          <button
            type="button"
            className="vaango-master-modal__close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search bar & Create Action */}
        <div className="vaango-master-modal__controls">
          <div className="vaango-master-modal__search-wrapper">
            <Search size={18} className="vaango-master-modal__search-icon" />
            <input
              type="text"
              className="vaango-master-modal__search-input"
              placeholder="Search products (e.g. Rice, Milk, Soap)..."
              value={searchTerm}
              onChange={handleSearchChange}
              autoFocus
            />
            {searchTerm && (
              <button
                type="button"
                className="vaango-master-modal__clear-btn"
                onClick={() => {
                  setSearchTerm('');
                  setDuplicateWarning(null);
                  fetchProducts('');
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            className="vaango-master-modal__new-btn"
            onClick={handleCreateNewClick}
            disabled={isCheckingDuplicate}
          >
            <Plus size={16} />
            <span>{isCheckingDuplicate ? 'Checking...' : 'Create New Product'}</span>
          </Button>
        </div>

        {/* Duplicate Warning Alert */}
        {duplicateWarning && duplicateWarning.length > 0 && (
          <div className="vaango-master-duplicate-alert">
            <div className="vaango-master-duplicate-alert__header">
              <AlertCircle size={18} className="vaango-master-duplicate-alert__icon" />
              <div>
                <h4 className="vaango-master-duplicate-alert__title">
                  Similar products already exist in catalogue
                </h4>
                <p className="vaango-master-duplicate-alert__text">
                  To prevent duplicate listings, you can select one of these existing products or continue creating your own.
                </p>
              </div>
            </div>

            <div className="vaango-master-duplicate-alert__list">
              {duplicateWarning.map((item) => (
                <div key={item.id} className="vaango-master-duplicate-item">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.name} className="vaango-master-duplicate-item__thumb" />
                  ) : (
                    <div className="vaango-master-duplicate-item__placeholder">
                      <Package size={16} />
                    </div>
                  )}
                  <div className="vaango-master-duplicate-item__details">
                    <span className="vaango-master-duplicate-item__name">{item.name}</span>
                    {item.brand && <span className="vaango-master-duplicate-item__brand">{item.brand}</span>}
                  </div>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onSelectMasterProduct({
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        image_url: item.image_url,
                        shop_type_id: item.shop_type_id,
                        brand: item.brand,
                        status: item.status as any,
                        created_by: null,
                        approved_by: null,
                        approved_at: null,
                        moderation_reason: null,
                        created_at: '',
                        updated_at: '',
                      });
                    }}
                  >
                    Select Existing
                  </Button>
                </div>
              ))}
            </div>

            <div className="vaango-master-duplicate-alert__footer">
              <Button
                size="sm"
                variant="outline"
                onClick={() => onCreateCustomProduct(searchTerm.trim())}
              >
                Continue Creating "{searchTerm.trim()}" Anyway
                <ArrowRight size={14} />
              </Button>
            </div>
          </div>
        )}

        {/* Master Products Grid / List */}
        <div className="vaango-master-modal__body">
          {isLoading ? (
            <div className="vaango-master-modal__loading">
              <div className="vaango-master-spinner" />
              <p>Searching master catalogue...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="vaango-master-modal__empty">
              <Package size={40} className="vaango-master-modal__empty-icon" />
              <h3>No matching products found</h3>
              <p>
                {searchTerm
                  ? `No catalogue product matches "${searchTerm}". You can create it now!`
                  : 'No catalogue products available in this category yet.'}
              </p>
              <Button
                variant="primary"
                onClick={() => onCreateCustomProduct(searchTerm.trim())}
                className="mt-3"
              >
                <Plus size={16} />
                <span>Create "{searchTerm.trim() || 'New Product'}"</span>
              </Button>
            </div>
          ) : (
            <div className="vaango-master-grid">
              {products.map((p) => (
                <div key={p.id} className="vaango-master-card">
                  <div className="vaango-master-card__image-container">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="vaango-master-card__image" />
                    ) : (
                      <div className="vaango-master-card__image-placeholder">
                        <Package size={32} />
                      </div>
                    )}
                    <span className="vaango-master-card__badge">
                      <ShieldCheck size={12} /> Standard
                    </span>
                  </div>

                  <div className="vaango-master-card__content">
                    <h4 className="vaango-master-card__title">{p.name}</h4>
                    {p.brand && (
                      <span className="vaango-master-card__brand">
                        <Tag size={12} /> {p.brand}
                      </span>
                    )}
                    {p.description && (
                      <p className="vaango-master-card__desc">{p.description}</p>
                    )}
                  </div>

                  <div className="vaango-master-card__footer">
                    <Button
                      size="sm"
                      variant="primary"
                      className="vaango-master-card__select-btn"
                      onClick={() => onSelectMasterProduct(p)}
                    >
                      <Plus size={14} />
                      <span>Add to My Shop</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
