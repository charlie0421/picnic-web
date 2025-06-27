'use client';
import React from 'react';
import { StarCandyProductsWrapper } from './StarCandyProductsWrapper';

interface StarCandyProductsProps {
  className?: string;
}

export function StarCandyProducts({ className }: StarCandyProductsProps) {
  return <StarCandyProductsWrapper className={className} />;
}
