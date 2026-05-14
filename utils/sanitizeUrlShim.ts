const BLANK_URL = 'about:blank';

const invalidProtocolRegex = /^([^\w]*)(javascript|data|vbscript)/im;
const htmlEntitiesRegex = /&#(\w+)(^\w|;)?/g;
const htmlCtrlEntityRegex = /&(newline|tab);/gi;
const ctrlCharactersRegex = /[\u0000-\u001F\u007F-\u009F\u2000-\u200D\uFEFF]/gim;
const urlSchemeRegex = /^.+(:|&colon;)/gim;
const relativeFirstCharacters = ['.', '/'];

function isRelativeUrlWithoutProtocol(url: string) {
  return relativeFirstCharacters.includes(url[0]);
}

function decodeHtmlCharacters(str: string) {
  return str.replace(htmlEntitiesRegex, (_match, dec) => String.fromCharCode(dec));
}

function sanitizeUrl(url?: string | null) {
  const sanitizedUrl = decodeHtmlCharacters(url || '')
    .replace(htmlCtrlEntityRegex, '')
    .replace(ctrlCharactersRegex, '')
    .trim();

  if (!sanitizedUrl) return BLANK_URL;
  if (isRelativeUrlWithoutProtocol(sanitizedUrl)) return sanitizedUrl;

  const urlSchemeParseResults = sanitizedUrl.match(urlSchemeRegex);
  if (!urlSchemeParseResults) return sanitizedUrl;

  const urlScheme = urlSchemeParseResults[0];
  return invalidProtocolRegex.test(urlScheme) ? BLANK_URL : sanitizedUrl;
}

export { BLANK_URL, sanitizeUrl };

export default {
  BLANK_URL,
  sanitizeUrl,
};
