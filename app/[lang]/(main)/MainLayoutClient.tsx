'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Popup } from '@/types/interfaces';
import Header from '@/components/layouts/Header';
import Footer from '@/components/layouts/Footer';
import { PicnicMenu } from '@/components/client/common/PicnicMenu';

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

  const childrenArray = React.Children.toArray(children);
  const picnicMenu = childrenArray.find(
    (child) => React.isValidElement(child) && child.type === PicnicMenu
  );
  const mainContent = childrenArray.filter(
    (child) => !(React.isValidElement(child) && child.type === PicnicMenu)
  );

  return (
    <div className="flex flex-col min-h-screen bg-white">
      <div className="container mx-auto px-4">
        <Header />
      </div>
      
      {picnicMenu}
      
      <main className="flex-grow container mx-auto px-4 py-4">
        {mainContent}
      </main>

      <div className="container mx-auto px-4">
        <Footer />
      </div>
    </div>
  );
};

export default MainLayoutClient;
