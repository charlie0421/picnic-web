'use client';

import React, { useEffect } from 'react';

interface QnaMediaModalProps {
  selectedImage: string | null;
  selectedVideo: string | null;
  onCloseImage: () => void;
  onCloseVideo: () => void;
}

export default function QnaMediaModal({
  selectedImage,
  selectedVideo,
  onCloseImage,
  onCloseVideo,
}: QnaMediaModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseImage();
        onCloseVideo();
      }
    };

    if (selectedImage || selectedVideo) {
      window.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedImage, selectedVideo, onCloseImage, onCloseVideo]);

  return (
    <>
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={onCloseImage}
        >
          <div className="relative max-w-4xl max-h-4xl">
            <img src={selectedImage} alt="Enlarged view" className="max-w-full max-h-[90vh] object-contain" />
            <button
              className="absolute top-4 right-4 text-white text-2xl"
              onClick={onCloseImage}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {selectedVideo && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={onCloseVideo}
        >
          <div className="relative w-full max-w-4xl" onClick={e => e.stopPropagation()}>
            <video
              src={selectedVideo}
              controls
              autoPlay
              className="w-full max-h-[90vh] object-contain"
            />
            <button
              className="absolute top-4 right-4 text-white text-2xl"
              onClick={onCloseVideo}
            >
              &times;
            </button>
          </div>
        </div>
      )}
    </>
  );
}
