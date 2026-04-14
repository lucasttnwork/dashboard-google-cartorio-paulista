import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { DateRangePicker, type DateRangeValue } from './DateRangePicker'

// jsdom PointerEvent polyfill for base-ui Popover.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 0
    }
  }
  window.PointerEvent = PointerEvent as never
}

/**
 * Controlled wrapper so the test can drive the picker exactly like a real
 * consumer would (AnalyticsPage / DashboardPage). React-day-picker fires
 * `onSelect` on every click, so the picker's internal `pendingClicks`
 * counter must observe the external `value` update propagating back.
 */
function ControlledPicker() {
  const [value, setValue] = useState<DateRangeValue>({ from: null, to: null })
  return <DateRangePicker value={value} onChange={setValue} />
}

/**
 * SI-2 regression — the popover must stay open after the first click and
 * auto-close once the user has committed two intentional clicks AND the
 * range has both endpoints. F4 in Phase 3.8 introduced the counter; this
 * test guards that counter against future regressions.
 */
describe('DateRangePicker (SI-2 auto-close regression)', () => {
  it('closes automatically after two clicks selecting a complete range', async () => {
    const user = userEvent.setup()
    render(<ControlledPicker />)

    // Open the popover
    await user.click(screen.getByRole('button', { name: 'Selecionar período' }))

    // Calendar mounts inside a portal — wait for a known day cell to appear.
    // Picking days by their aria-label keeps us resilient to row layout.
    const firstDay = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="1 de"]',
      )
      if (!el) throw new Error('First day button not yet rendered')
      return el
    })
    await user.click(firstDay)

    // After one click the popover must still be open — the internal counter
    // guarantees this. We verify by locating a second day cell.
    const secondDay = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="15 de"]',
      )
      if (!el) throw new Error('Second day button not yet rendered')
      return el
    })
    expect(secondDay).toBeInTheDocument()

    await user.click(secondDay)

    // After the second click the popover must auto-close. react-day-picker
    // removes itself from the DOM when base-ui unmounts the portal.
    await waitFor(() => {
      expect(
        document.querySelector('button[aria-label*="1 de"]'),
      ).toBeNull()
    })
  })
})
