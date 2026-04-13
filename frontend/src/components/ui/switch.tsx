import * as React from "react"

import { cn } from "@/lib/utils"

interface SwitchProps extends Omit<React.ComponentProps<"button">, "onChange"> {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  size?: "sm" | "default"
}

function Switch({
  className,
  checked: checkedProp,
  defaultChecked = false,
  onCheckedChange,
  size = "default",
  disabled,
  ...props
}: SwitchProps) {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked)
  const isControlled = checkedProp !== undefined
  const checked = isControlled ? checkedProp : internalChecked

  const handleClick = React.useCallback(() => {
    if (disabled) return
    const next = !checked
    if (!isControlled) setInternalChecked(next)
    onCheckedChange?.(next)
  }, [checked, disabled, isControlled, onCheckedChange])

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-size={size}
      disabled={disabled}
      onClick={handleClick}
      className={cn(
        "peer group/switch relative inline-flex shrink-0 items-center rounded-full border border-transparent transition-all outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 aria-checked:bg-primary aria-[checked=false]:bg-input dark:aria-[checked=false]:bg-input/80 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      <span
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-transform dark:data-[state=checked]:bg-primary-foreground",
          size === "default" ? "size-4" : "size-3",
          checked
            ? "translate-x-[calc(100%-2px)]"
            : "translate-x-0",
          checked && "dark:bg-primary-foreground",
          !checked && "dark:bg-foreground"
        )}
      />
    </button>
  )
}

export { Switch }
export type { SwitchProps }
