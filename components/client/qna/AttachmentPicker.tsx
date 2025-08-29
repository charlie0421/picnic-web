'use client';

import React, { useRef, useState } from 'react';

interface AttachmentPickerProps {
  files: File[];
  onFilesChange: (
    files: File[],
    meta: { previewUrls: string[]; objectUrls: string[] }
  ) => void;
  inputName?: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  attachLabel?: string;
  removeAllLabel?: string;
}

function generateVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.setAttribute('src', URL.createObjectURL(file));
    video.load();
    video.addEventListener('error', (ex) => reject(ex));
    video.addEventListener('loadedmetadata', () => {
      video.currentTime = 0.1;
    });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      const aspectRatio = video.videoWidth / video.videoHeight;
      const width = 200;
      const height = width / aspectRatio;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(video.src);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      URL.revokeObjectURL(video.src);
      resolve(dataUrl);
    });
  });
}

export default function AttachmentPicker({
  files,
  onFilesChange,
  inputName,
  accept = 'image/*,video/*',
  multiple = true,
  disabled = false,
  attachLabel = '파일 첨부',
  removeAllLabel = '모두 제거',
}: AttachmentPickerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [objectUrls, setObjectUrls] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const newlySelected = e.target.files ? Array.from(e.target.files) : [];
    if (newlySelected.length === 0) {
      setPreviewUrls([]);
      setObjectUrls([]);
      onFilesChange([], { previewUrls: [], objectUrls: [] });
      return;
    }

    // Combine with previously selected files
    const combined = [...files, ...newlySelected];
    const dt = new DataTransfer();
    combined.forEach((f) => dt.items.add(f));
    if (fileInputRef.current) {
      fileInputRef.current.files = dt.files;
    }

    // Generate previews only for newly added files, keep existing previews
    const appendedObjectUrls: string[] = [];
    const appendedPreviewUrls: string[] = [];
    for (const file of newlySelected) {
      const objectUrl = URL.createObjectURL(file);
      appendedObjectUrls.push(objectUrl);
      if (file.type.startsWith('image/')) {
        appendedPreviewUrls.push(objectUrl);
      } else if (file.type.startsWith('video/')) {
        try {
          const thumbnailUrl = await generateVideoThumbnail(file);
          appendedPreviewUrls.push(thumbnailUrl);
        } catch {
          appendedPreviewUrls.push(objectUrl);
        }
      } else {
        appendedPreviewUrls.push(objectUrl);
      }
    }

    const nextPreview = [...previewUrls, ...appendedPreviewUrls];
    const nextObject = [...objectUrls, ...appendedObjectUrls];
    setPreviewUrls(nextPreview);
    setObjectUrls(nextObject);
    onFilesChange(Array.from(dt.files), { previewUrls: nextPreview, objectUrls: nextObject });
  };

  const removeAt = (index: number) => {
    if (!fileInputRef.current || !fileInputRef.current.files) return;
    const current = Array.from(fileInputRef.current.files);
    const dt = new DataTransfer();
    current.forEach((f, i) => {
      if (i !== index) dt.items.add(f);
    });
    fileInputRef.current.files = dt.files;
    const nextFiles = Array.from(dt.files);
    const nextPreview = previewUrls.filter((_, i) => i !== index);
    const nextObject = objectUrls.filter((_, i) => i !== index);
    setPreviewUrls(nextPreview);
    setObjectUrls(nextObject);
    onFilesChange(nextFiles, { previewUrls: nextPreview, objectUrls: nextObject });
  };

  const clearAll = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    setPreviewUrls([]);
    setObjectUrls([]);
    onFilesChange([], { previewUrls: [], objectUrls: [] });
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        name={inputName}
        onChange={handleFileChange}
        className="hidden"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          className="p-2 border rounded-lg hover:bg-primary-50 bg-white border-primary-300 text-primary-800 font-medium flex items-center gap-1 disabled:opacity-50"
        >
          📎 {attachLabel}
        </button>
        {files.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="px-2 py-1 text-xs border rounded-lg text-red-600 border-red-200"
          >
            {removeAllLabel}
          </button>
        )}
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, idx) => (
            <li key={`${file.name}-${idx}`} className="relative">
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-primary-100 flex items-center justify-center">
                {previewUrls[idx] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={previewUrls[idx]} alt={`preview-${idx}`} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-gray-600">{file.name}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-600 text-white text-xs flex items-center justify-center shadow-md hover:bg-red-700"
                aria-label={`첨부 ${idx + 1} 제거`}
                title="제거"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


