import React, { useRef } from 'react';
import { Search, X, RotateCcw } from 'lucide-react';
import './SearchFilterBar.css';

interface SearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  totalCount?: number;
  filteredCount?: number;
  isFiltered?: boolean;
  onResetFilters?: () => void;
  children?: React.ReactNode;
  className?: string;
  id?: string;
}

export const SearchFilterBar: React.FC<SearchFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  placeholder = 'Search records...',
  totalCount,
  filteredCount,
  isFiltered = false,
  onResetFilters,
  children,
  className = '',
  id = 'retrieval-search-input',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClear = () => {
    onSearchChange('');
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  const showCount = filteredCount !== undefined && totalCount !== undefined;

  return (
    <div className={`vaango-retrieval-bar ${className}`}>
      <div className="vaango-retrieval-bar__top">
        <div className="vaango-retrieval-bar__search-box">
          <Search size={16} className="vaango-retrieval-bar__search-icon" aria-hidden="true" />
          <input
            ref={inputRef}
            id={id}
            type="text"
            className="vaango-retrieval-bar__input"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label={placeholder}
          />
          {searchQuery && (
            <button
              type="button"
              className="vaango-retrieval-bar__clear-btn"
              onClick={handleClear}
              aria-label="Clear search input"
              title="Clear search (Esc)"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {children && <div className="vaango-retrieval-bar__filters">{children}</div>}
      </div>

      {(showCount || isFiltered) && (
        <div className="vaango-retrieval-bar__summary">
          {showCount && (
            <span className="vaango-retrieval-bar__count">
              Showing <strong>{filteredCount}</strong> of <strong>{totalCount}</strong> records
              {isFiltered && filteredCount < totalCount && ' (filtered)'}
            </span>
          )}

          {isFiltered && onResetFilters && (
            <button
              type="button"
              className="vaango-retrieval-bar__reset-btn"
              onClick={onResetFilters}
              aria-label="Reset all search queries and filters"
            >
              <RotateCcw size={13} />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
