'use client'

/**
 * Модуль переводов — один на админку, бота и Mini App (docs/i18n.md).
 *
 * Главное правило: ни одна строка, которую увидит человек, не хранится
 * на конкретном языке. Хранится код и параметры, в текст это превращается
 * здесь, в момент показа, на языке читателя.
 *
 * Отсутствующий ключ не показывается человеку сырым: берётся английский
 * фоллбэк, а сам факт пропажи пишется в лог.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import en from './dictionaries/en.json'
import ru from './dictionaries/ru.json'

export const LOCALES = ['ru', 'en'] as const
export type Locale = (typeof LOCALES)[number]

/** Язык продукта по умолчанию — английский (docs/i18n.md). На время показа
 *  прототипа дефолт русский: его смотрит русскоязычное руководство
 *  (docs/prototype.md). Перед разработкой вернуть на 'en'. */
export const PROTOTYPE_LOCALE: Locale = 'ru'
export const PRODUCT_LOCALE: Locale = 'en'

type Dictionary = Record<string, string>

const DICTIONARIES: Record<Locale, Dictionary> = {
  ru: ru as Dictionary,
  en: en as Dictionary,
}

export const LOCALE_NAMES: Record<Locale, string> = {
  ru: 'Русский',
  en: 'English',
}

export type TParams = Record<string, string | number>

const missing = new Set<string>()

function reportMissing(locale: Locale, key: string) {
  const id = `${locale}:${key}`
  if (missing.has(id)) return
  missing.add(id)
  // Пропавший ключ — ошибка сборки на этапе разработки (docs/i18n.md),
  // в прототипе достаточно заметной записи в консоли.
  console.warn(`[i18n] нет ключа «${key}» в словаре «${locale}»`)
}

/**
 * Подстановка параметров в шаблон.
 *
 * Строки не склеиваются из кусков — в разных языках порядок слов разный.
 * Только шаблон целиком с подстановкой: «{count} операций на {amount}».
 */
function interpolate(template: string, params?: TParams): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Выбор формы множественного числа правилами Intl, а не своими `if`:
 * в русском три формы, в английском две, и дальше языки будут разные.
 *
 * Ключ с count ищется как `<key>.one` / `.few` / `.many` / `.other`.
 */
function pluralKey(locale: Locale, key: string, count: number): string {
  const rule = new Intl.PluralRules(locale).select(count)
  return `${key}.${rule}`
}

function lookup(locale: Locale, key: string): string | undefined {
  return DICTIONARIES[locale][key]
}

export function translate(locale: Locale, key: string, params?: TParams): string {
  const withCount = typeof params?.count === 'number'

  // Сначала всегда пробуем ключ как есть. Параметр с именем `count` сам по
  // себе НЕ означает, что строка склоняется: «удерживается {amount} по
  // {count} операциям» — обычный шаблон. Формы множественного числа ищем
  // только тогда, когда простого ключа в словаре нет.
  let primaryKey = key
  let template = lookup(locale, key)

  if (template === undefined && withCount) {
    primaryKey = pluralKey(locale, key, params.count as number)
    template = lookup(locale, primaryKey)
    // Нужной формы может не быть в языке, где её не существует
    // (в английском нет `few`) — тогда берём `other`.
    if (template === undefined) template = lookup(locale, `${key}.other`)
  }

  if (template === undefined && locale !== PRODUCT_LOCALE) {
    reportMissing(locale, primaryKey)
    template =
      lookup(PRODUCT_LOCALE, primaryKey) ??
      (withCount ? lookup(PRODUCT_LOCALE, `${key}.other`) : undefined)
  }

  if (template === undefined) {
    reportMissing(locale, primaryKey)
    // Сырой ключ человеку не показываем никогда. Пустая строка заметна
    // в вёрстке и не выглядит как часть интерфейса.
    return ''
  }

  return interpolate(template, params)
}

/* -------------------------------------------------------------------------- */

interface I18nValue {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (key: string, params?: TParams) => string
}

const I18nContext = createContext<I18nValue | null>(null)

const STORAGE_KEY = 'reloom-locale'

export function I18nProvider({
  children,
  initialLocale = PROTOTYPE_LOCALE,
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    document.documentElement.lang = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // приватный режим — язык просто не запомнится до следующего раза
    }
  }, [])

  const value = useMemo<I18nValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => translate(locale, key, params),
    }),
    [locale, setLocale],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext)
  if (!value) throw new Error('useI18n вызван вне I18nProvider')
  return value
}

/** Короткая форма для случаев, где нужен только перевод. */
export function useT() {
  return useI18n().t
}

/* --- Форматы --------------------------------------------------------------
   Деньги здесь не форматируются: их формат одинаков во всех языках и
   собирается на границе UI (компонент Amount), а в прототипе приходит
   готовой строкой из фикстур. Даты локализуются — иначе переключатель
   языка оставляет половину экрана непереведённой. */

export function formatDate(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(iso))
}

export function formatDateTime(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

export function formatTime(locale: Locale, iso: string): string {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}
