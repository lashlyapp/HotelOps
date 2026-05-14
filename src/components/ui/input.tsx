import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export type InputProps = InputHTMLAttributes<HTMLInputElement>

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        // text-base (16px) on mobile prevents iOS Safari from
        // auto-zooming when an input gains focus; bumps back to text-sm
        // on >=sm so the desktop density is unchanged.
        'h-9 w-full rounded-md border border-border-default bg-surface px-3 text-base sm:text-sm text-fg shadow-xs',
        'placeholder:text-subtle',
        'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
        'focus-ring focus:border-border-strong',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
})
