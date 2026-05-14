import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-md space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
          404
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">
          Page not found
        </h1>
        <p className="text-sm text-muted leading-relaxed">
          The page you’re looking for doesn’t exist or has moved.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="focus-ring inline-flex items-center justify-center rounded-md bg-primary px-4 h-11 sm:h-9 text-sm font-medium text-primary-fg hover:bg-primary-hover"
          >
            Back home
          </Link>
        </div>
      </div>
    </div>
  )
}
