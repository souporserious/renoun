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
  return (
    <div className="flex flex-col rounded-2xl p-6 bg-white dark:bg-gray-900 h-full">
      <div className="flex items-center justify-center w-12 h-12 mb-4 bg-gray-700 text-white rounded-full p-2 text-xl">
        {icon}
      </div>
      <div className="font-semibold text-lg mb-1 text-gray-900 dark:text-gray-100">
        {title}
      </div>
      <div className="text-gray-600 dark:text-gray-300 text-base">
        {children}
      </div>
    </div>
  )
}
