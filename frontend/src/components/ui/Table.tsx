import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Search, Filter } from 'lucide-react';
import './Table.css';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
}

interface TableProps<T> {
  data: T[];
  columns: Column<T>[];
  itemsPerPage?: number;
  searchable?: boolean;
  searchKeys?: (keyof T)[];
  filterable?: boolean;
  className?: string;
  emptyMessage?: string;
}

export function Table<T extends Record<string, any>>({
  data,
  columns,
  itemsPerPage = 10,
  searchable = false,
  searchKeys = [],
  filterable = false,
  className = '',
  emptyMessage = 'No hay datos disponibles'
}: TableProps<T>) {
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const filteredData = useMemo(() => {
    let result = [...data];

    if (searchable && searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(item =>
        searchKeys.some(key => {
          const value = item[key];
          return value?.toString().toLowerCase().includes(term);
        })
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];
        
        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, sortConfig, searchable, searchKeys]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(startIndex, startIndex + itemsPerPage);

  const handleSort = (key: string) => {
    setSortConfig(current => {
      if (!current || current.key !== key) {
        return { key, direction: 'asc' };
      }
      if (current.direction === 'asc') {
        return { key, direction: 'desc' };
      }
      return null;
    });
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  return (
    <div className={`ui-table-container ${className}`}>
      {(searchable || filterable) && (
        <div className="table-toolbar">
          {searchable && (
            <div className="table-search">
              <Search size={18} />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                aria-label="Buscar en tabla"
              />
            </div>
          )}
          {filterable && (
            <button className="table-filter-btn" aria-label="Filtrar">
              <Filter size={18} />
              <span>Filtrar</span>
            </button>
          )}
        </div>
      )}

      <div className="table-wrapper">
        <table className="ui-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  className={column.sortable ? 'sortable' : ''}
                  onClick={() => column.sortable && handleSort(String(column.key))}
                >
                  {column.header}
                  {column.sortable && sortConfig?.key === column.key && (
                    <span className="sort-indicator">
                      {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, index) => (
                <tr key={index} className={index % 2 === 0 ? 'even' : 'odd'}>
                  {columns.map((column) => (
                    <td key={String(column.key)}>
                      {column.render
                        ? column.render(item)
                        : item[column.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="table-pagination">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Página anterior"
          >
            <ChevronLeft size={18} />
          </button>
          
          <div className="pagination-info">
            Página {currentPage} de {totalPages}
            <span className="results-info">
              ({filteredData.length} resultados)
            </span>
          </div>
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Página siguiente"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

export default Table;
