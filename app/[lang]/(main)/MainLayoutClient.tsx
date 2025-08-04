'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Banner, Popup } from '@/types/interfaces';
import Header from '@/components/layouts/Header';
import Footer from '@/components/layouts/Footer';

const fetcher = (url: string) => fetch(url).then(res => res.json());

interface MainLayoutClientProps {
  children: React.ReactNode;
}

const MainLayoutClient = ({ children }: MainLayoutClientProps) => {
  const { data: popups, error: popupsError } = useSWR<Popup[]>('/api/popups', fetcher);

  const [activePopup, setActivePopup] = useState<Popup | null>(null);

  useEffect(() => {
    if (popups && popups.length > 0) {
      setActivePopup(popups[0]);
    }
  }, [popups]);

  const handleClosePopup = () => {
    setActivePopup(null);
  };
  
  if (popupsError) console.error('Failed to load popups', popupsError);

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-grow">
        {children}
      </main>
      <Footer />
    </div>
  );
};

export default MainLayoutClient; 