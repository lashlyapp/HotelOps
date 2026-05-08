import { type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils/cn'

export type RadioOptionProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label: string
  hint?: string
}

export function RadioOption({
  label,
  hint,
  id,
  className,
  ...rest
}: RadioOptionProps) {
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-2.5 cursor-pointer select-none"
    >
      <input
        id={id}
        type="radio"
        className={cn(
          'mt-0.5 size-4 shrink-0 accent-fg focus-ring',
          className,
        )}
        {...rest}
      />
      <span>
        <span className="block text-sm text-fg">{label}</span>
        {hint ? <span className="block text-xs text-subtle">{hint}</span> : null}
      </span>
    </label>
  )
}
