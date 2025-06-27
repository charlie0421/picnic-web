'use client';

import React, { useEffect, useState } from 'react';
import { useLanguageStore } from '@/stores/languageStore';
import { detectUserLocation, getPaymentMethodByLocation, clearLocationCache } from '@/utils/ip-detection';
import { motion } from 'framer-motion';

export type PaymentMethod = 'portone' | 'paypal';

interface PaymentMethodSelectorProps {
  onMethodChange: (method: PaymentMethod) => void;
  className?: string;
}

export function PaymentMethodSelector({ onMethodChange, className = '' }: PaymentMethodSelectorProps) {
  const { t, currentLanguage } = useLanguageStore();
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('paypal');
  const [isLoading, setIsLoading] = useState(true);
  const [detectedCountry, setDetectedCountry] = useState<string | null>(null);
  const [isManuallySelected, setIsManuallySelected] = useState(false);

  useEffect(() => {
    // Detect user location on component mount
    const detectLocation = async () => {
      setIsLoading(true);
      
      try {
        const location = await detectUserLocation();
        
        if (!isManuallySelected) {
          const method = getPaymentMethodByLocation(location);
          setSelectedMethod(method);
          setDetectedCountry(location.country);
          onMethodChange(method);
        }
      } catch (error) {
        console.error('Error detecting location:', error);
        // This should rarely happen since detectUserLocation now always returns a result
        setSelectedMethod('paypal');
        onMethodChange('paypal');
      } finally {
        setIsLoading(false);
      }
    };

    detectLocation();
  }, [onMethodChange, isManuallySelected]);

  const handleMethodChange = (method: PaymentMethod) => {
    setSelectedMethod(method);
    setIsManuallySelected(true);
    onMethodChange(method);
  };

  const paymentMethods = [
    {
      id: 'portone' as PaymentMethod,
      name: 'Port One',
      description: t('payment_method_portone_desc'),
      icon: '🇰🇷',
      recommended: detectedCountry === 'South Korea',
    },
    {
      id: 'paypal' as PaymentMethod,
      name: 'PayPal',
      description: t('payment_method_paypal_desc'),
      icon: '🌍',
      recommended: detectedCountry !== 'South Korea',
    },
  ];

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-4 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-gray-600">{t('detecting_location')}</span>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="text-center">
        <h3 className="text-lg font-medium mb-2">{t('select_payment_method')}</h3>
        {detectedCountry && !isManuallySelected && (
          <p className="text-sm text-gray-600">
            {t('detected_location', { country: detectedCountry })}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {paymentMethods.map((method) => (
          <motion.button
            key={method.id}
            onClick={() => handleMethodChange(method.id)}
            className={`
              relative p-4 rounded-lg border-2 transition-all
              ${selectedMethod === method.id 
                ? 'border-primary bg-primary/5' 
                : 'border-gray-200 hover:border-gray-300'
              }
            `}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {method.recommended && !isManuallySelected && (
              <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full z-10">
                {t('recommended')}
              </div>
            )}

            <div className="flex items-center space-x-3">
              <span className="text-3xl">{method.icon}</span>
              <div className="text-left">
                <h4 className="font-medium">{method.name}</h4>
                <p className="text-sm text-gray-600">{method.description}</p>
              </div>
            </div>

            {selectedMethod === method.id && (
              <motion.div
                className="absolute inset-0 border-2 border-primary rounded-lg pointer-events-none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              />
            )}
          </motion.button>
        ))}
      </div>

      {isManuallySelected && (
        <button
          onClick={() => {
            setIsManuallySelected(false);
            clearLocationCache();
            window.location.reload();
          }}
          className="text-sm text-primary hover:underline mx-auto block"
        >
          {t('reset_to_auto_detection')}
        </button>
      )}
    </div>
  );
}