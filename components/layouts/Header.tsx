'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useMenu } from '@/hooks/useMenu';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';
import { useAuth } from '@/hooks/useAuth';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import { useTranslations } from '@/hooks/useTranslations';
import NavigationLink from '@/components/client/NavigationLink';
import { DefaultAvatar, ProfileImageContainer } from '@/components/ui/ProfileImageContainer';
import LanguageSelector from './LanguageSelector';
import { Menu, Settings, Vote, Users, Image as PictureIcon, BookOpen, Star, ChevronRight, Bell } from 'lucide-react';
import { NotificationInboxService } from '@/lib/data-fetching/client/notification-service';
import AttendanceIconButton from '@/components/client/attendance/AttendanceIconButton';

const Header: React.FC = () => {
  const pathname = usePathname();
  const { isAdmin, portalMenuItems, activePortal } = useMenu();
  const { user, isAuthenticated, isLoading: authLoading, userProfile, loadUserProfile } = useAuth();
  const { getLocalizedPath } = useLocaleRouter();
  
  const { isLoading: globalLoading, forceStopLoading } = useGlobalLoading();
  const { tDynamic: t, translations } = useTranslations();

  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [hasHydrated, setHasHydrated] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const checkScrollState = useCallback(() => {
    if (menuContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = menuContainerRef.current;
      setIsScrolled(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScrollState();
    const currentRef = menuContainerRef.current;
    currentRef?.addEventListener('scroll', checkScrollState);
    window.addEventListener('resize', checkScrollState);
    return () => {
      currentRef?.removeEventListener('scroll', checkScrollState);
      window.removeEventListener('resize', checkScrollState);
    };
  }, [checkScrollState]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobileMenuOpen]);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  // 로그인 다이얼로그 경로에서 복귀 시 프로필이 아직 없다면 즉시 로드
  useEffect(() => {
    if (isAuthenticated && user?.id && !userProfile) {
      try { loadUserProfile(user.id); } catch {}
    }
  }, [isAuthenticated, user?.id, !!userProfile, loadUserProfile]);

  // 읽지 않은 알림 개수 조회 및 주기적 갱신 (관리자만)
  useEffect(() => {
    if (!isAdmin || !isAuthenticated) {
      setUnreadNotificationCount(0);
      return;
    }

    const fetchUnreadCount = async () => {
      try {
        const count = await NotificationInboxService.getUnreadCount();
        setUnreadNotificationCount(count);
      } catch (error) {
        console.error('읽지 않은 알림 개수 조회 실패:', error);
      }
    };

    // 초기 로드
    fetchUnreadCount();

    // 30초마다 갱신
    const interval = setInterval(fetchUnreadCount, 30000);

    // 알림 읽음 처리 이벤트 리스너
    const handleNotificationRead = () => {
      fetchUnreadCount();
    };

    window.addEventListener('notification-read', handleNotificationRead);
    // 페이지 포커스 시 갱신
    window.addEventListener('focus', fetchUnreadCount);

    return () => {
      clearInterval(interval);
      window.removeEventListener('notification-read', handleNotificationRead);
      window.removeEventListener('focus', fetchUnreadCount);
    };
  }, [isAdmin, isAuthenticated]);

  const handleMobileMenuClick = () => {
    if (!isMobileMenuOpen && globalLoading) forceStopLoading();
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };
  
  const getMenuTranslation = (type: string): string => {
    if (translations?.nav?.menu?.[type]) return translations.nav.menu[type];
    const fallbackMap: Record<string, string> = { vote: '투표', community: '커뮤니티', pic: 'PIC', novel: '소설', mypage: '마이페이지' };
    return fallbackMap[type] || type;
  };

  const getMenuIcon = (type: string) => {
    switch (type) {
      case 'vote': return <Vote className="w-4 h-4" />;
      case 'community': return <Users className="w-4 h-4" />;
      case 'pic': return <PictureIcon className="w-4 h-4" />;
      case 'novel': return <BookOpen className="w-4 h-4" />;
      default: return <ChevronRight className="w-4 h-4" />;
    }
  };

  const openMenuLabel = (t('common.menu.openMenu') || '').trim() || 'Open menu';

  const isAuthLoading = authLoading || !hasHydrated;

  const renderProfileIcon = () => (
    isAuthLoading ? (
      <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
    ) : (
      <ProfileImageContainer avatarUrl={userProfile?.avatar_url || null} width={24} height={24} borderRadius={6} className="w-6 h-6 object-cover" />
    )
  );

  return (
    <header className='border-b border-gray-200 bg-white relative'>
      <div className='container mx-auto px-2 sm:px-4 py-2'>
        <div className='flex items-center justify-between w-full gap-2 sm:gap-4'>
          <div className='flex items-center gap-2 sm:gap-4 flex-1 min-w-0'>
            <NavigationLink href="/" className='flex items-center flex-shrink-0'>
              <Image src='/images/logo.webp' alt='logo' width={40} height={40} priority className='w-8 h-8 sm:w-10 sm:h-10 rounded-lg' />
            </NavigationLink>
            <div className='flex-1 relative'>
  <div ref={menuContainerRef} className='overflow-x-auto scrollbar-hide scroll-smooth'>
    <div className='flex items-center space-x-1 sm:space-x-2 min-w-max'>
      {portalMenuItems.map(item => (
        <NavigationLink key={item.path} href={item.path} should_login={item.should_login} className={`group relative px-3 py-2 text-base font-medium transition-all duration-200 hover:scale-105 ${item.isActive ? 'text-blue-600' : 'text-gray-700 hover:text-blue-600'}`}>
          {item.name}
          <div className={`absolute -bottom-1 left-1/2 transform -translate-x-1/2 h-0.5 bg-blue-600 rounded-full transition-all duration-300 ${item.isActive ? 'w-full' : 'w-0 group-hover:w-full'}`} />
          <div className={`absolute inset-0 bg-blue-50 rounded-lg transition-all duration-200 -z-10 ${item.isActive ? 'opacity-20' : 'opacity-0 group-hover:opacity-10'}`} />
        </NavigationLink>
      ))}
    </div>
  </div>
  {canScrollRight && <div className='absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent pointer-events-none flex items-center justify-end pr-1'><ChevronRight className='w-3 h-3 text-gray-400' /></div>}
  {isScrolled && <div className='absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-white via-white/80 to-transparent pointer-events-none' />}
</div>
          </div>

          <div className='flex items-center gap-2 sm:gap-3'>
            <div className='h-8 sm:h-10 flex items-center justify-center'><LanguageSelector /></div>

            {/* 출석체크 아이콘 - 로그인 사용자 표시 */}
            <AttendanceIconButton />

            {/* 알림함 아이콘 - 관리자만 표시 */}
            {isAdmin && (
              <NavigationLink
                href='/mypage/notifications'
                should_login
                className='relative flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0'
                aria-label={t('label_mypage_notifications') || '알림함'}
              >
                <Bell className='w-5 h-5 sm:w-6 sm:h-6 text-gray-700' />
                {isAuthenticated && unreadNotificationCount > 0 && (
                  <span className='absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-semibold text-white bg-red-500 rounded-full border-2 border-white z-10 pointer-events-none'>
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </NavigationLink>
            )}
            
            <div className='md:hidden h-8 sm:h-10 flex items-center justify-center' ref={mobileMenuRef}>
              {/* 비로그인 시 바로 마이페이지로 이동 (데스크탑과 동일) */}
              {!isAuthLoading && !isAuthenticated ? (
                <NavigationLink href='/mypage' className='relative hover:bg-gray-100 rounded-lg transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center' aria-label={openMenuLabel}>
                  <div className="w-full h-full flex items-center justify-center"><Menu className="w-5 h-5 text-gray-600" /></div>
                </NavigationLink>
              ) : (
                <button onClick={handleMobileMenuClick} className='relative hover:bg-gray-100 rounded-lg transition-colors w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center' aria-label={openMenuLabel} aria-expanded={isMobileMenuOpen}>
                  {isAuthLoading ? (
                    <div className="w-full h-full rounded-lg shimmer-effect bg-gray-200" />
                  ) : (
                    renderProfileIcon()
                  )}
                </button>
              )}
              {isMobileMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden animate-dropdown">
                  {isAuthenticated && userProfile && (
                    <div className="bg-gray-50 p-2.5 border-b border-gray-200">
                      <div className="flex items-center space-x-2">
                        {renderProfileIcon()}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{userProfile.nickname || userProfile.email || t('common.user.unknown')}</p>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <div className="flex items-center space-x-1"><Star className="w-3 h-3 text-yellow-500 fill-current" /><span className="text-xs text-gray-600">{(userProfile.star_candy || 0).toLocaleString('en-US')}</span></div>
                            {isAdmin && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">관리자</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="py-1.5">
                  {portalMenuItems.map(item => (
                    <NavigationLink key={item.id} href={item.path} should_login={item.should_login} className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${item.isActive ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                      <span className={item.isActive ? 'text-blue-600' : 'text-gray-500'}>{getMenuIcon(item.id)}</span>
                      <span>{getMenuTranslation(item.id)}</span>
                    </NavigationLink>
                  ))}
                    {isAdmin && (
                      <div className="px-2 mt-1.5 pt-1.5 border-t border-gray-100 space-y-1">
                        <NavigationLink href='/mypage/notifications' should_login onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${pathname.includes('/notifications') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                          <Bell className={`w-4 h-4 ${pathname.includes('/notifications') ? 'text-blue-600' : 'text-gray-500'}`} />
                          <span>{t('label_mypage_notifications') || '알림함'}</span>
                          {isAuthenticated && unreadNotificationCount > 0 && (
                            <span className='ml-auto flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-xs font-semibold text-white bg-red-500 rounded-full'>
                              {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                            </span>
                          )}
                        </NavigationLink>
                      </div>
                    )}
                    <div className="px-2 mt-1.5 pt-1.5 border-t border-gray-100">
                      <NavigationLink href='/mypage' onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center space-x-2 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${pathname.includes('/mypage') && !pathname.includes('/notifications') ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'}`}>
                        <Settings className={`w-4 h-4 ${pathname.includes('/mypage') && !pathname.includes('/notifications') ? 'text-blue-600' : 'text-gray-500'}`} />
                        <span>{getMenuTranslation('mypage')}</span>
                      </NavigationLink>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className='hidden md:flex items-center justify-center h-8 sm:h-10'>
              {isAuthLoading ? (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg shimmer-effect bg-gray-200" />
              ) : (
                isAuthenticated ? (
                  <NavigationLink href='/mypage' className='block w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden'>
                <ProfileImageContainer avatarUrl={userProfile?.avatar_url || null} width={40} height={40} borderRadius={8} className="w-full h-full object-cover" />
                  </NavigationLink>
                ) : (
                  <NavigationLink href='/mypage' className='flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10'>
                    <div className='w-full h-full hover:bg-gray-100 rounded-lg transition-colors cursor-pointer border border-gray-200 flex items-center justify-center'>
                      <Menu className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700" />
                    </div>
                  </NavigationLink>
                )
              )}
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .shimmer-effect { background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-dropdown { animation: dropdown 0.15s ease-out; }
        @keyframes dropdown {
          0% { opacity: 0; transform: translateY(-5px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </header>
  );
};

export default Header;
