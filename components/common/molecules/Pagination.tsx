'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface PaginationProps {
  totalPages: number;
  currentPage: number;
}

export default function Pagination({ totalPages, currentPage }: PaginationProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const createPageURL = (pageNumber: number | string) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', pageNumber.toString());
    return `${pathname}?${params.toString()}`;
  };

  if (totalPages <= 1) {
    return null;
  }

  const renderPageNumbers = () => {
    const pageNumbers: React.ReactNode[] = [];
    const maxPagesToShow = 5;
    let startPage: number, endPage: number;

    if (totalPages <= maxPagesToShow) {
      startPage = 1;
      endPage = totalPages;
    } else {
      const maxPagesBeforeCurrentPage = Math.floor(maxPagesToShow / 2);
      const maxPagesAfterCurrentPage = Math.ceil(maxPagesToShow / 2) - 1;

      if (currentPage <= maxPagesBeforeCurrentPage) {
        startPage = 1;
        endPage = maxPagesToShow;
      } else if (currentPage + maxPagesAfterCurrentPage >= totalPages) {
        startPage = totalPages - maxPagesToShow + 1;
        endPage = totalPages;
      } else {
        startPage = currentPage - maxPagesBeforeCurrentPage;
        endPage = currentPage + maxPagesAfterCurrentPage;
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      pageNumbers.push(
        <Link
          key={i}
          href={createPageURL(i)}
          className={`px-4 py-2 mx-1 rounded-md text-sm font-medium ${
            currentPage === i
              ? 'bg-primary text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          }`}
        >
          {i}
        </Link>
      );
    }
    return pageNumbers;
  };

  return (
    <div className="flex justify-center items-center mt-8">
      <Link
        href={createPageURL(currentPage - 1)}
        className={`px-3 py-2 mx-1 rounded-md text-sm font-medium ${
          currentPage === 1
            ? 'text-gray-400 cursor-not-allowed bg-gray-100'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        aria-disabled={currentPage === 1}
        onClick={(e) => currentPage === 1 && e.preventDefault()}
      >
        <ChevronLeftIcon className="h-5 w-5" />
      </Link>

      {renderPageNumbers()}

      <Link
        href={createPageURL(currentPage + 1)}
        className={`px-3 py-2 mx-1 rounded-md text-sm font-medium ${
          currentPage === totalPages
            ? 'text-gray-400 cursor-not-allowed bg-gray-100'
            : 'bg-white text-gray-700 hover:bg-gray-50'
        }`}
        aria-disabled={currentPage === totalPages}
        onClick={(e) => currentPage === totalPages && e.preventDefault()}
      >
        <ChevronRightIcon className="h-5 w-5" />
      </Link>
    </div>
  );
}