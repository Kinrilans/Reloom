import type { MetadataRoute } from 'next'

/**
 * Манифест веб-приложения.
 *
 * Нужен ровно для одного: чтобы приложение, открытое в браузере, можно
 * было добавить на рабочий стол и запускать как обычное — без адресной
 * строки и вкладок. Это путь для тех, у кого Telegram нет (вход по почте,
 * docs/flows-user.md).
 *
 * Цвета продублированы числами: манифест — это JSON, переменных CSS в нём
 * не бывает. Значения те же, что у --bg в тёмной теме (src/ui/tokens.css);
 * при смене фирменного фона их правят здесь руками.
 *
 * Значок пока векторный. Для iOS понадобится ещё растровый apple-touch-icon,
 * но его делают из утверждённого логотипа на этапе разработки, а не в
 * прототипе.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reloom',
    short_name: 'Reloom',
    description: 'Корпоративные расходные карты',
    // Запуск с главного экрана приложения, а не с витрины компонентов.
    start_url: '/app',
    display: 'standalone',
    background_color: '#0c0c10',
    theme_color: '#0c0c10',
    icons: [
      {
        src: '/logo/reloom-purple.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  }
}
