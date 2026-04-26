import React from 'react'
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import GroupedBoardList from '@/components/community/GroupedBoardList'

describe('GroupedBoardList', () => {
  it('renders bookmarked section when bookmarkedBoardIds provided', () => {
    render(
      <GroupedBoardList
        lang='ko'
        items={[
          { boardId: 'b1', name: '보드1', description: null, artist: { id: 1, name: '아티스트A', image: null } },
          { boardId: 'b2', name: '보드2', description: null, artist: { id: 2, name: '아티스트B', image: null } },
        ]}
        bookmarkedBoardIds={['b2']}
      />
    )
    expect(screen.getByText('내 북마크 보드')).toBeInTheDocument()
    // bookmarked item appears in the first section
    const bookmarkSection = screen.getByText('내 북마크 보드').closest('section') as HTMLElement
    expect(within(bookmarkSection).getByText('보드2')).toBeInTheDocument()
  })

  it('groups by artist and shows artist titles', () => {
    render(
      <GroupedBoardList
        lang='ko'
        items={[
          { boardId: 'b1', name: '보드1', description: null, artist: { id: 1, name: '아티스트A', image: null } },
          { boardId: 'b2', name: '보드2', description: null, artist: { id: 1, name: '아티스트A', image: null } },
          { boardId: 'b3', name: '보드3', description: null, artist: { id: 2, name: '아티스트B', image: null } },
        ]}
      />
    )
    expect(screen.getByText('아티스트A')).toBeInTheDocument()
    expect(screen.getByText('아티스트B')).toBeInTheDocument()
    expect(screen.getByText('보드1')).toBeInTheDocument()
    expect(screen.getByText('보드2')).toBeInTheDocument()
    expect(screen.getByText('보드3')).toBeInTheDocument()
  })
})


