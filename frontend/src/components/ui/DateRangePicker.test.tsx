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
 * Controlled wrapper exercising the commit-only API. The picker never
 * streams intermediate selections — only Aplicar triggers `onApply`.
 */
function ControlledPicker({
  onApply,
}: {
  onApply?: (range: DateRangeValue) => void
}) {
  const [value, setValue] = useState<DateRangeValue>({ from: null, to: null })
  return (
    <DateRangePicker
      value={value}
      onApply={(range) => {
        setValue(range)
        onApply?.(range)
      }}
    />
  )
}

describe('DateRangePicker (deferred-apply commit model)', () => {
  it('does not fire onApply on intermediate clicks — only when Aplicar is pressed', async () => {
    const user = userEvent.setup()
    const applySpy = vi.fn()
    render(<ControlledPicker onApply={applySpy} />)

    await user.click(screen.getByRole('button', { name: 'Selecionar período' }))

    const firstDay = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="1 de"]',
      )
      if (!el) throw new Error('First day button not yet rendered')
      return el
    })
    await user.click(firstDay)

    const secondDay = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="15 de"]',
      )
      if (!el) throw new Error('Second day button not yet rendered')
      return el
    })
    await user.click(secondDay)

    // Intermediate calendar clicks MUST NOT commit a new range — the parent
    // (Dashboard / Analytics) depends on this to avoid refetching per click.
    expect(applySpy).not.toHaveBeenCalled()

    const applyBtn = screen.getByRole('button', { name: 'Aplicar' })
    expect(applyBtn).not.toBeDisabled()
    await user.click(applyBtn)

    await waitFor(() => {
      expect(applySpy).toHaveBeenCalledTimes(1)
    })
    const firstCall = applySpy.mock.calls[0]
    expect(firstCall).toBeDefined()
    const call = firstCall![0] as DateRangeValue
    expect(call.from).toBeInstanceOf(Date)
    expect(call.to).toBeInstanceOf(Date)

    // Popover closes on Apply.
    await waitFor(() => {
      expect(
        document.querySelector('button[aria-label*="1 de"]'),
      ).toBeNull()
    })
  })

  it('Cancel discards the draft and does not fire onApply', async () => {
    const user = userEvent.setup()
    const applySpy = vi.fn()
    render(<ControlledPicker onApply={applySpy} />)

    await user.click(screen.getByRole('button', { name: 'Selecionar período' }))
    const firstDay = await waitFor(() => {
      const el = document.querySelector<HTMLButtonElement>(
        'button[aria-label*="1 de"]',
      )
      if (!el) throw new Error('First day button not yet rendered')
      return el
    })
    await user.click(firstDay)

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(applySpy).not.toHaveBeenCalled()
  })

  it('disables Aplicar while the calendar has no selection', async () => {
    const user = userEvent.setup()
    render(<ControlledPicker />)

    await user.click(screen.getByRole('button', { name: 'Selecionar período' }))
    const applyBtn = await screen.findByRole('button', { name: 'Aplicar' })
    expect(applyBtn).toBeDisabled()
  })
})
