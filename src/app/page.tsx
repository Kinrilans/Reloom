import { redirect } from 'next/navigation'

// На этапе П0 в проекте есть только витрина компонентов. Экраны приложения
// и админки появятся на П1 и П2 и займут свои маршруты.
export default function RootPage() {
  redirect('/showcase')
}
