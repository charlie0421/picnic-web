'use client';

import React from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useLocaleRouter } from '@/hooks/useLocaleRouter';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  loginText?: string;
  cancelText?: string;
}

const LoginDialog: React.FC<LoginDialogProps> = ({
  isOpen,
  onClose,
  title = '로그인이 필요합니다',
  description = '이 기능을 사용하려면 로그인이 필요합니다.',
  loginText = '로그인하기',
  cancelText = '취소',
}) => {
  const { getLocalizedPath } = useLocaleRouter();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
            aria-label="닫기"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="mb-6">
          <p className="text-gray-600">{description}</p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors"
          >
            {cancelText}
          </button>
          <Link
            href={getLocalizedPath('/login')}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-center"
          >
            {loginText}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginDialog; 