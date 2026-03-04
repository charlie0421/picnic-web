'use client';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

interface VotingOverlayProps {
  isVoting: boolean;
  t: (key: string) => string;
}

export function VotingOverlay({ isVoting, t }: VotingOverlayProps) {
  return (
    <AnimatePresence>
      {isVoting && (
        <motion.div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="text-center text-white">
            <motion.div
              className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Image
                src="/images/logo.webp"
                alt="Vote Loading"
                width={32}
                height={32}
                className="w-8 h-8 rounded-full animate-scale-pulse drop-shadow-lg object-cover"
                priority
              />
            </motion.div>
            <motion.h3
              className="text-xl font-bold"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              {t('vote_popup_voting')}
            </motion.h3>
            <motion.p
              className="text-sm text-white/80 mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              {t('vote_popup_please_wait')}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface SuccessOverlayProps {
  showSuccess: boolean;
  t: (key: string) => string;
}

export function SuccessOverlay({ showSuccess, t }: SuccessOverlayProps) {
  return (
    <AnimatePresence>
      {showSuccess && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-br from-primary to-secondary bg-opacity-90 flex items-center justify-center z-10"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
        >
          <div className="text-center text-white">
            <motion.div
              className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center mx-auto mb-4"
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ duration: 0.6 }}
            >
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </motion.div>
            <h3 className="text-xl font-bold">{t('vote_popup_vote_success')}</h3>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
