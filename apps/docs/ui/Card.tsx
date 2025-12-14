import React from 'react'

export function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  const ContentElement = typeof children === 'string' ? 'p' : 'div'

  return (
    <div className="flex flex-col gap-3 p-6 bg-gray-50 dark:bg-gray-800 h-full rounded-2xl">
      <div className="flex items-center justify-center w-12 h-12 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-white rounded-full p-2 text-xl">
        {icon}
      </div>
      <div className="font-semibold text-lg text-gray-900 dark:text-gray-100">
        {title}
      </div>
      <ContentElement className="text-gray-600 dark:text-gray-300 text-base m-0!">
        {children}
      </ContentElement>
    </div>
  )
}
