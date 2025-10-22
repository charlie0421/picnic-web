import React from 'react'
import { getCdnImageUrl } from '@/utils/api/image'

export default function BoardCard({ boardId, name, description, lang, artist }: { boardId: string; name: string; description?: string | null; lang: string; artist?: { id: number; name: string; image: string | null; groupName?: string | null } | null }) {
  return (
    <li className='border rounded-md p-4 hover:bg-gray-50'>
      <a href={`/${lang}/community/boards/${boardId}`} className='block'>
        <div className='flex items-center gap-3'>
          {artist?.image ? (
            <img src={getCdnImageUrl(artist.image, 80)} alt='' className='w-10 h-10 rounded-md object-cover flex-shrink-0' />
          ) : (
            <div className='w-10 h-10 rounded-md bg-gray-200 flex items-center justify-center text-gray-500 text-xs'>IMG</div>
          )}
          <div className='min-w-0'>
            <h2 className='text-lg font-medium line-clamp-1 text-gray-900'>{name}</h2>
            {(artist?.name || artist?.groupName) ? (
              <div className='text-sm text-gray-700 line-clamp-1'>
                {artist?.groupName ? `${artist.groupName} · ` : ''}{artist?.name || ''}
              </div>
            ) : null}
          </div>
        </div>
        {description ? <p className='text-sm text-gray-700 line-clamp-2 mt-2'>{description}</p> : null}
      </a>
    </li>
  )
}


