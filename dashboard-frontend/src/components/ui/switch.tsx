"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(event.target.checked)
    }

    return (
      <label className={cn("relative inline-flex h-6 w-11 cursor-pointer items-center", disabled && "cursor-not-allowed opacity-50")}>
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          ref={ref}
          {...props}
        />
        <span
          className={cn(
            "inline-block h-6 w-11 rounded-full border-2 border-transparent bg-input transition-colors",
            checked && "bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
        />
        <span
          className={cn(
            "absolute left-0.5 top-0.5 inline-block h-5 w-5 rounded-full bg-background shadow-lg transition-transform",
            checked && "translate-x-5"
          )}
        />
      </label>
    )
  }
)

Switch.displayName = "Switch"

export { Switch }
