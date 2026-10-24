import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './PaginationControls.css';

interface PaginationControlsProps {
  currentPage: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50],
  className = '',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(totalItems, currentPage * pageSize);

  if (totalItems <= pageSize && currentPage === 1 && !onPageSizeChange) {
    return null;
  }

  return (
    <div className={`vaango-pagination ${className}`} aria-label="Pagination Navigation">
      <div className="vaango-pagination__range">
        Showing <strong>{startItem}</strong> – <strong>{endItem}</strong> of <strong>{totalItems}</strong>
      </div>

      <div className="vaango-pagination__actions">
        {onPageSizeChange && (
          <div className="vaango-pagination__size-selector">
            <label htmlFor="pagination-page-size" className="vaango-pagination__size-label">
              Rows:
            </label>
            <select
              id="pagination-page-size"
              className="vaango-pagination__select"
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              aria-label="Records per page"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="vaango-pagination__buttons">
          <button
            type="button"
            className="vaango-pagination__btn"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            aria-label="Go to previous page"
          >
            <ChevronLeft size={16} />
            <span className="vaango-pagination__btn-text">Previous</span>
          </button>

          <span className="vaango-pagination__page-indicator" aria-current="page">
            Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
          </span>

          <button
            type="button"
            className="vaango-pagination__btn"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            aria-label="Go to next page"
          >
            <span className="vaango-pagination__btn-text">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
