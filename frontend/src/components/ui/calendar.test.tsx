import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Calendar } from './calendar'

// jsdom lacks PointerEvent — react-day-picker v9 dispatches click through
// the normal DOM path so the stock polyfill used elsewhere in the suite
// is not strictly required, but we keep it here for symmetry with the
// other page tests in case a future day-picker minor starts emitting
// pointer events.
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
 * SI-1 regression — `Calendar` nav buttons must remain clickable.
 *
 * Phase 3.8 (BUG-1) fixed a pointer-events interception where the
 * `.months` positioning context was swallowing clicks on the ◀ / ▶
 * navigation buttons. This test renders a range Calendar, clicks the
 * previous-month button, and asserts the displayed month header
 * actually rolled back one month. Without the CSS fix the click would
 * be a no-op and the assertion would fail.
 */
describe('Calendar (SI-1 nav click regression)', () => {
  it('advances the displayed month when the ◀ previous button is clicked', async () => {
    const user = userEvent.setup()
    const fixedMonth = new Date(2026, 3, 15) // 15 April 2026

    render(
      <Calendar
        mode="range"
        numberOfMonths={1}
        selected={{ from: undefined, to: undefined }}
        defaultMonth={fixedMonth}
      />,
    )

    // react-day-picker v9 exposes the visible month as the caption text
    // inside the `.rdp-month_caption` container. Using a regex instead of
    // `getByText` to tolerate surrounding whitespace and future styling.
    expect(screen.getByText(/abril 2026/i)).toBeInTheDocument()

    // react-day-picker v9 renders a semantic <nav> containing exactly two
    // buttons — previous (index 0) and next (1). Positional query is the
    // most resilient path: locale labels drift and the v9 class names are
    // not prefixed with `rdp-` anymore.
    const navElement = document.querySelector('nav')
    expect(navElement).not.toBeNull()
    const navButtons = navElement!.querySelectorAll<HTMLButtonElement>('button')
    expect(navButtons.length).toBeGreaterThanOrEqual(2)
    await user.click(navButtons[0]!)

    // Clicking ◀ must land on March 2026. If pointer-events were still
    // intercepted, the text would remain "abril 2026" and the assertion
    // below would fail — exactly the BUG-1 regression guard we want.
    expect(await screen.findByText(/março 2026/i)).toBeInTheDocument()
    expect(screen.queryByText(/abril 2026/i)).not.toBeInTheDocument()
  })
})
