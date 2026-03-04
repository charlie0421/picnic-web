'use client';

import React, { useState, Fragment } from 'react';
import { QnaAttachments as QnaAttachment } from '@/types/interfaces';
import { formatDate, formatTime, UiQnaMessage, QnaThreadWithRelations } from './qna-utils';

interface QnaMessageListProps {
  messages: UiQnaMessage[];
  thread: QnaThreadWithRelations;
  onSelectImage: (url: string) => void;
  onSelectVideo: (url: string) => void;
  t: (key: string, fallback?: string) => string;
  tDynamic: (key: string, fallback?: string) => string;
}

function ExpandableText({
  text,
  maxChars = 200,
  threadStatus,
  tDynamic,
}: {
  text: string;
  maxChars?: number;
  threadStatus: string | null;
  tDynamic: (key: string, fallback?: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = (text || '').length > maxChars;
  const display = expanded || !isLong ? text : (text || '').slice(0, maxChars) + '\u2026';
  return (
    <div className="text-sm whitespace-pre-wrap break-words">
      {display}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={`ml-2 underline ${threadStatus !== 'RESOLVED' ? 'text-white/90' : 'text-primary-700'}`}
        >
          {expanded ? tDynamic('dialog_button_close', '\ub2eb\uae30') : tDynamic('post_comment_content_more', '\ub354\ubcf4\uae30')}
        </button>
      )}
    </div>
  );
}

export default function QnaMessageList({
  messages,
  thread,
  onSelectImage,
  onSelectVideo,
  t,
  tDynamic,
}: QnaMessageListProps) {
  let lastDate: string | null = null;

  return (
    <>
      {messages.map((msg) => {
        const createdAtStr = msg.created_at || new Date().toISOString();
        const currentDate = new Date(createdAtStr).toDateString();
        const showDivider = currentDate !== lastDate;
        lastDate = currentDate;

        return (
          <Fragment key={msg.id}>
            {showDivider && (
              <div className="text-center my-4">
                <span className="text-xs text-sub-700 bg-sub-100 px-2 py-1 rounded-full">
                  {formatDate(createdAtStr)}
                </span>
              </div>
            )}
            <div className={`flex flex-col gap-1 ${msg.is_admin_message ? 'items-start' : 'items-end'}`}>
              <div className={`flex items-center gap-2 ${msg.is_admin_message ? 'flex-row' : 'flex-row-reverse'}`}>
                <div className="w-8 h-8 rounded-full bg-primary-100 flex-shrink-0">
                  <img
                    src={msg.is_admin_message ? '/images/logo_alpha.png' : (msg.user_profiles?.avatar_url || '/images/default-avatar.svg')}
                    alt={msg.is_admin_message ? 'Admin' : 'User'}
                    className="w-full h-full rounded-full object-cover"
                  />
                </div>
                <span className="text-xs text-gray-800 font-semibold">
                  {msg.is_admin_message ? t('admin_message') : msg.user_profiles?.nickname || '\uc0ac\uc6a9\uc790'}
                </span>
              </div>

              <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-lg mt-1 ${
                  msg.is_admin_message
                    ? 'bg-white shadow-md'
                    : 'bg-primary text-white'
                }`}
              >
                {Array.isArray(msg.qna_attachments) && msg.qna_attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {msg.qna_attachments.map((attachment: QnaAttachment) => {
                      const isVideo = attachment.file_type?.startsWith('video/');
                      const isImage = attachment.file_type?.startsWith('image/');
                      const playUrl = isVideo ? (msg.client_video_url || attachment.file_path) : undefined;

                      if (isVideo) {
                        return (
                          <button
                            key={attachment.id}
                            onClick={() => playUrl && onSelectVideo(playUrl)}
                            className="relative focus:outline-none w-[200px] bg-black rounded-lg flex items-center justify-center cursor-pointer overflow-hidden"
                            aria-label="Play video attachment"
                          >
                            {msg.client_video_url ? (
                              <img
                                src={attachment.file_path}
                                alt="Video thumbnail"
                                className="w-full h-auto"
                              />
                            ) : (
                              <video
                                src={attachment.file_path}
                                preload="metadata"
                                className="w-full h-auto"
                              />
                            )}
                            <div className="absolute inset-0 bg-black opacity-50 rounded-lg"></div>
                            <svg
                              className="w-12 h-12 text-white z-10 absolute"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                              xmlns="http://www.w3.org/2000/svg"
                            >
                              <path
                                fillRule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z"
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                        );
                      }

                      if (isImage) {
                        return (
                          <button
                            key={attachment.id}
                            onClick={() => onSelectImage(attachment.file_path)}
                            className="focus:outline-none w-[200px] bg-primary-100 rounded-lg flex items-center justify-center"
                            aria-label={attachment.file_name}
                          >
                            <img
                              src={attachment.file_path}
                              alt={attachment.file_name}
                              style={{ width: 200, height: 'auto' }}
                              className="rounded-lg object-contain max-w-full max-h-full"
                            />
                          </button>
                        );
                      }

                      return (
                        <a
                          key={attachment.id}
                          href={attachment.file_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary-300 underline break-all"
                        >
                          {attachment.file_name}
                        </a>
                      );
                    })}
                  </div>
                )}
                <ExpandableText text={msg.content || ''} threadStatus={thread?.status ?? null} tDynamic={tDynamic} />
              </div>
              <span className={`text-xs text-gray-400 pt-1`}>
                {formatTime(createdAtStr)}
              </span>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
