import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export type CheckboxProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string
  hint?: string
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, hint, className, id, ...rest }, ref) {
    return (
      <label
        htmlFor={id}
        className="flex items-start gap-2.5 cursor-pointer select-none"
      >
        <input
          ref={ref}
          id={id}
          type="checkbox"
          className={cn(
            'mt-0.5 size-4 shrink-0 rounded-xs border border-border-default bg-surface text-primary',
            'focus-ring',
            'accent-fg',
            className,
          )}
          {...rest}
        />
        <span>
          <span className="text-sm text-fg">{label}</span>
          {hint ? (
            <span className="block text-xs text-subtle">{hint}</span>
          ) : null}
        </span>
      </label>
    )
  },
)
