/** The exact shape `next-intl`'s `useTranslations(namespace)` returns --
 * host apps on `next-intl` can pass that straight through as `t`/`tNav`; any
 * other i18n solution just needs to satisfy this same call signature. See
 * this package's README for the full list of keys called against each. */
export type TFunction = (key: string, params?: Record<string, string | number | Date>) => string;
