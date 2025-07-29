'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'react-toastify';

/**
 * React hook for handling user logout.
 * Navigates to the homepage and displays a success notification upon successful logout.
 */
export const useLogout = () => {
  const router = useRouter();

  const logout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Logout failed');
      }

      // Refresh server-side data and redirect to home
      router.refresh();
      router.push('/');
      toast.success('로그아웃되었습니다.');
    } catch (error) {
      console.error('Logout error:', error);
      toast.error(
        error instanceof Error ? error.message : '로그아웃 중 오류가 발생했습니다.'
      );
    }
  };

  return logout;
};

/**
 * Quick logout function for emergency use.
 * This function attempts to log the user out via the API and then forces a page reload.
 */
export async function emergencyLogout(): Promise<void> {
  console.log('🚨 Emergency logout initiated');
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
    });
    if (response.ok) {
      console.log('✅ Emergency logout successful');
    } else {
      console.error('🚨 Emergency logout API call failed');
    }
  } catch (error) {
    console.error('🚨 Emergency logout failed with error:', error);
  } finally {
    // Always force a reload to clear client-side state
    if (typeof window !== 'undefined') {
      window.location.href = '/'; // Redirect to home and reload
    }
  }
}