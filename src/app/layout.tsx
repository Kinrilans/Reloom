import type { Metadata, Viewport } from 'next'
import { Onest } from 'next/font/google'
import '@/ui/globals.css'

// Одна гарнитура на весь продукт (docs/brand.md). next/font скачивает её на
// этапе сборки и раздаёт с нашего домена — запросов к внешнему CDN в рантайме
// нет. Переменный шрифт: начертания 400-700 берутся из одного файла.
const onest = Onest({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-onest',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Reloom',
  description: 'Внутренняя платформа корпоративных расходных карт',
  /* Приложение открывают и в браузере — с телефона его добавляют на
     рабочий стол через «Поделиться» (docs/flows-user.md). Отсюда манифест
     и признаки «запускается как приложение». */
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Reloom', statusBarStyle: 'black-translucent' },
}

/* Безопасные зоны телефона мы уже уважаем (env(safe-area-inset-*)), но
   работает это только при viewport-fit: cover. Без него на айфоне с
   «чёлкой» нижняя навигация уезжает под системную полосу. */
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#0c0c10',
}

// Тёмная тема основная на обеих поверхностях. Скрипт ниже применяет
// сохранённый выбор до первой отрисовки, иначе при переключении на светлую
// страница моргает тёмным.
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('reloom-theme');if(t==='light'||t==='dark'){document.documentElement.dataset.theme=t}}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" data-theme="dark" className={onest.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
