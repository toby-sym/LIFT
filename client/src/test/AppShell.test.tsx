import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from '../components/AppShell'

function renderAppShell(version?: string) {
  return render(
    <AppShell
      page="today"
      email="test@example.test"
      hasActive={false}
      busy={false}
      onNavigate={vi.fn()}
      onNew={vi.fn()}
      onSignOut={vi.fn()}
      overlays={null}
      version={version}
    >
      <div>Page content</div>
    </AppShell>,
  )
}

describe('application version label', () => {
  it('shows Development by default', () => {
    renderAppShell()

    expect(screen.getByLabelText('Application version').textContent).toBe(
      'Development',
    )
  })

  it('shows the supplied release version', () => {
    renderAppShell('1.0.0')

    expect(screen.getByLabelText('Application version').textContent).toBe(
      '1.0.0',
    )
  })
})
