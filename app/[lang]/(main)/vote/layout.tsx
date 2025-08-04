import React, { ReactNode } from 'react';

interface VoteLayoutProps {
  children: ReactNode;
}

export default function VoteLayout({ children }: VoteLayoutProps) {
  return (
    <div>
      {children}
    </div>
  );
}
