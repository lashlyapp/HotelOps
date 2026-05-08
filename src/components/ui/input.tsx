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
        'h-9 w-full rounded-md border border-border-default bg-surface px-3 text-sm text-fg shadow-xs',
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
