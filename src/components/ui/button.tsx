import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

const variantStyles: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50',
  secondary:
    'bg-surface text-fg border border-border-default hover:bg-surface-muted disabled:opacity-50',
  ghost:
    'bg-transparent text-fg hover:bg-surface-muted disabled:opacity-50',
  danger:
    'bg-danger-bg text-danger-fg hover:brightness-95 disabled:opacity-50',
}

const sizeStyles: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-sm',
  md: 'h-9 px-4 text-sm rounded-md',
  lg: 'h-11 px-5 text-base rounded-md',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = 'primary', size = 'md', className, type = 'button', ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium',
          'transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
          'focus-ring disabled:cursor-not-allowed',
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...rest}
      />
    )
  },
)
