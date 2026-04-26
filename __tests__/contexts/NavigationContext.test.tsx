import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import {
  NavigationProvider,
  useNavigation,
} from '@/contexts/NavigationContext'
import { PortalType } from '@/utils/enums'

function TestComponent({ onMount }: { onMount: (ctx: any) => void }) {
  const ctx = useNavigation()
  React.useEffect(() => {
    onMount(ctx)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div>navigation-test</div>
}

function DisplayComponent() {
  const { navigationState } = useNavigation()
  return (
    <div>
      <span data-testid="screen">{navigationState.currentScreen ?? 'none'}</span>
      <span data-testid="portal">{navigationState.currentPortalType}</span>
    </div>
  )
}

function ControlComponent() {
  const { setCurrentScreen, setCurrentPortalType } = useNavigation()
  return (
    <div>
      <button
        data-testid="set-screen"
        onClick={() => setCurrentScreen('home')}
      >
        Set Screen
      </button>
      <button
        data-testid="set-portal"
        onClick={() => setCurrentPortalType(PortalType.GOONG_HAP)}
      >
        Set Portal
      </button>
    </div>
  )
}

describe('NavigationContext', () => {
  describe('NavigationProvider', () => {
    it('renders children', () => {
      render(
        <NavigationProvider>
          <div data-testid="child">Child content</div>
        </NavigationProvider>,
      )

      expect(screen.getByTestId('child')).toBeDefined()
      expect(screen.getByText('Child content')).toBeDefined()
    })

    it('renders multiple children', () => {
      render(
        <NavigationProvider>
          <div data-testid="child1">First</div>
          <div data-testid="child2">Second</div>
        </NavigationProvider>,
      )

      expect(screen.getByTestId('child1')).toBeDefined()
      expect(screen.getByTestId('child2')).toBeDefined()
    })
  })

  describe('useNavigation', () => {
    it('throws when used outside NavigationProvider', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => {
        render(<TestComponent onMount={() => {}} />)
      }).toThrow()

      consoleSpy.mockRestore()
    })

    it('provides context when inside NavigationProvider', () => {
      let context: any = null

      render(
        <NavigationProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </NavigationProvider>,
      )

      expect(context).not.toBeNull()
      expect(context.setCurrentScreen).toBeDefined()
      expect(context.setCurrentPortalType).toBeDefined()
    })
  })

  describe('default portal type', () => {
    it('defaults to VOTE portal type', () => {
      let context: any = null

      render(
        <NavigationProvider>
          <TestComponent onMount={(ctx) => { context = ctx }} />
        </NavigationProvider>,
      )

      expect(context.navigationState.currentPortalType).toBe(PortalType.VOTE)
    })
  })

  describe('setCurrentScreen', () => {
    it('updates the current screen state', () => {
      render(
        <NavigationProvider>
          <DisplayComponent />
          <ControlComponent />
        </NavigationProvider>,
      )

      expect(screen.getByTestId('screen').textContent).toBe('none')

      act(() => {
        screen.getByTestId('set-screen').click()
      })

      expect(screen.getByTestId('screen').textContent).toBe('home')
    })
  })

  describe('setCurrentPortalType', () => {
    it('updates the current portal type', () => {
      render(
        <NavigationProvider>
          <DisplayComponent />
          <ControlComponent />
        </NavigationProvider>,
      )

      expect(screen.getByTestId('portal').textContent).toBe(PortalType.VOTE)

      act(() => {
        screen.getByTestId('set-portal').click()
      })

      expect(screen.getByTestId('portal').textContent).toBe(PortalType.GOONG_HAP)
    })
  })
})
