import Link from 'next/link'

export default function Page() {
  return (
    <main className="prose prose-slate dark:prose-invert max-w-none">
      <section className="flex flex-col gap-4">
        <h1 className="!mb-2">Package</h1>
        <p className="text-gray-600 dark:text-gray-300 !mt-0">
          A simple package documentation site with component reference and
          examples.
        </p>
        <div className="flex gap-3">
          <Link
            href="/components"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:opacity-90 no-underline"
          >
            Browse Components
          </Link>
          <Link
            href="https://github.com/souporserious/renoun"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800 no-underline"
          >
            GitHub
          </Link>
        </div>
      </section>
    </main>
  )
}
