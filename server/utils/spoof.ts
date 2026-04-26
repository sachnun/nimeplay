const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
]

const ACCEPT_LANGUAGES = [
  'en-US,en;q=0.9',
  'en-US,en;q=0.9,id;q=0.8',
  'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  'id-ID,id;q=0.9,en;q=0.8',
  'en-GB,en;q=0.9,en-US;q=0.8',
  'en-US,en;q=0.9,ja;q=0.8',
]

const SEC_CH_UA_SETS: { ua: string; mobile: string; platform: string }[] = [
  { ua: '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"', mobile: '?0', platform: '"Windows"' },
  { ua: '"Chromium";v="130", "Not_A Brand";v="24", "Google Chrome";v="130"', mobile: '?0', platform: '"Windows"' },
  { ua: '"Chromium";v="131", "Not_A Brand";v="24", "Google Chrome";v="131"', mobile: '?0', platform: '"macOS"' },
  { ua: '"Chromium";v="131", "Not_A Brand";v="24", "Microsoft Edge";v="131"', mobile: '?0', platform: '"Windows"' },
  { ua: '"Not_A Brand";v="24", "Chromium";v="129", "Google Chrome";v="129"', mobile: '?0', platform: '"Linux"' },
]

function pick<T>(arr: T[]): T {
  const item = arr[Math.floor(Math.random() * arr.length)]
  if (item === undefined) throw new Error('Cannot pick from an empty array')
  return item
}

function isChromium(ua: string): boolean {
  return /Chrome\/\d/.test(ua) && !/Firefox/.test(ua) && !/Safari\/6/.test(ua)
}

type SpoofContext = 'navigate' | 'cors' | 'iframe'

export function getSpoofHeaders(referer?: string, context: SpoofContext = 'navigate'): Record<string, string> {
  const ua = pick(USER_AGENTS)
  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept-Language': pick(ACCEPT_LANGUAGES),
  }

  headers.Accept = context === 'navigate'
    ? 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    : '*/*'

  if (referer) headers.Referer = referer

  if (isChromium(ua)) {
    const hint = pick(SEC_CH_UA_SETS)
    headers['Sec-CH-UA'] = hint.ua
    headers['Sec-CH-UA-Mobile'] = hint.mobile
    headers['Sec-CH-UA-Platform'] = hint.platform

    if (context === 'navigate') {
      headers['Sec-Fetch-Dest'] = 'document'
      headers['Sec-Fetch-Mode'] = 'navigate'
      headers['Sec-Fetch-Site'] = referer ? 'same-origin' : 'none'
      headers['Sec-Fetch-User'] = '?1'
      headers['Upgrade-Insecure-Requests'] = '1'
    } else if (context === 'iframe') {
      headers['Sec-Fetch-Dest'] = 'iframe'
      headers['Sec-Fetch-Mode'] = 'navigate'
      headers['Sec-Fetch-Site'] = 'cross-site'
    } else {
      headers['Sec-Fetch-Dest'] = 'empty'
      headers['Sec-Fetch-Mode'] = 'cors'
      headers['Sec-Fetch-Site'] = 'same-origin'
    }
  }

  if (Math.random() > 0.5) headers.DNT = '1'
  if (Math.random() > 0.6) {
    headers['Cache-Control'] = 'no-cache'
    headers.Pragma = 'no-cache'
  }

  return headers
}
