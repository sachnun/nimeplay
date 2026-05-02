export type TitleCleanupRule = RegExp | [RegExp, string]

export function cleanTitleWithRules(title: string, rules: TitleCleanupRule[]): string {
  return rules.reduce((value, rule) => {
    if (Array.isArray(rule)) return value.replace(rule[0], rule[1])
    return value.replace(rule, '')
  }, title).trim()
}
