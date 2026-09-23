// Unit tests for cookielib.js (pure). Run: node test/unit.mjs
import * as L from '../cookielib.js';

const results = [];
const check = (name, ok, extra = '') => { results.push([name, !!ok]); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${ok ? '' : extra}`); };
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const NOW = 1_800_000_000; // fixed "now" (seconds)
const opts = { now: NOW };

// ---------- site matching ----------
check('baseDomain: sub.a.test -> a.test', L.baseDomain('sub.a.test') === 'a.test');
check('baseDomain: IP and single label kept', L.baseDomain('127.0.0.1') === '127.0.0.1' && L.baseDomain('localhost') === 'localhost');
check('parentDomains: x.sub.a.test', eq(L.parentDomains('x.sub.a.test'), ['x.sub.a.test', 'sub.a.test', 'a.test']));
check('baseDomain/parentDomains stop at a public suffix (co.uk, github.io)', L.baseDomain('www.bbc.co.uk') === 'bbc.co.uk' && eq(L.parentDomains('www.bbc.co.uk'), ['www.bbc.co.uk', 'bbc.co.uk']) && eq(L.parentDomains('me.github.io'), ['me.github.io']));
check('parentDomains: IP', eq(L.parentDomains('10.0.0.1'), ['10.0.0.1']));
const dom = (domain, hostOnly) => ({ domain, hostOnly });
check('appliesToHost: parent domain cookie applies to subdomain', L.appliesToHost(dom('.a.test', false), 'sub.a.test'));
check('appliesToHost: host-only parent cookie does not apply to subdomain', !L.appliesToHost(dom('a.test', true), 'sub.a.test'));
check('appliesToHost: sibling subdomain does not apply', !L.appliesToHost(dom('other.a.test', true), 'sub.a.test') && !L.appliesToHost(dom('.other.a.test', false), 'sub.a.test'));
check('appliesToHost: suffix trick rejected (evila.test vs a.test)', !L.appliesToHost(dom('.a.test', false), 'evila.test'));
check('appliesToHost: case-insensitive', L.appliesToHost(dom('.A.Test', false), 'Sub.a.test'));
check('cookieUrl: secure -> https, keeps path', L.cookieUrl({ domain: '.a.test', secure: true, path: '/x' }) === 'https://a.test/x' && L.cookieUrl({ domain: 'a.test', secure: false }) === 'http://a.test/');
check('cookieKey differs by partition', L.cookieKey({ domain: 'a', path: '/', name: 'n' }) !== L.cookieKey({ domain: 'a', path: '/', name: 'n', partitionKey: { topLevelSite: 'https://b.test' } }));
check('filterCookies matches name/value/domain', L.filterCookies([{ name: 'sid', value: 'abc', domain: 'x' }, { name: 'o', value: 'ZZ', domain: 'y' }, { name: 'p', value: '', domain: 'find.me' }], 'zz').length === 1
  && L.filterCookies([{ name: 'p', value: '', domain: 'find.me' }], 'FIND').length === 1);

// ---------- normalizeCookie / validation ----------
const n = (o, x = opts) => L.normalizeCookie(o, x);
let r = n({ name: 'a', value: 'b', domain: '.a.test', expirationDate: NOW + 100 });
check('normalize: domain cookie, defaults', eq(r.cookie, { name: 'a', value: 'b', domain: '.a.test', hostOnly: false, path: '/', secure: false, httpOnly: false, sameSite: 'unspecified', session: false, expirationDate: NOW + 100 }), JSON.stringify(r));
r = n({ name: 'a', value: 'b', domain: 'A.test' });
check('normalize: no expiry -> session, host-only lowercased', r.cookie.session === true && r.cookie.hostOnly === true && r.cookie.domain === 'a.test' && !('expirationDate' in r.cookie));
check('normalize: hostOnly:false adds the dot', n({ name: 'a', value: '', domain: 'a.test', hostOnly: false }).cookie.domain === '.a.test');
check('normalize: defaultDomain used when domain missing', n({ name: 'a', value: 'b' }, { ...opts, defaultDomain: 'x.test' }).cookie.domain === 'x.test');
check('normalize: missing domain without default is an error', !!n({ name: 'a', value: 'b' }).error);
check('normalize: expired cookie flagged', n({ name: 'a', value: 'b', domain: 'a.test', expirationDate: NOW - 1 }).expired === true);
check('normalize: milliseconds expiry converted', n({ name: 'a', value: 'b', domain: 'a.test', expires: (NOW + 60) * 1000 }).cookie.expirationDate === NOW + 60);
check('normalize: Playwright expires -1 -> session', n({ name: 'a', value: 'b', domain: 'a.test', expires: -1 }).cookie.session === true);
check('normalize: sameSite variants', n({ name: 'a', value: '', domain: 'a.test', sameSite: 'Lax' }).cookie.sameSite === 'lax' && n({ name: 'a', value: '', domain: 'a.test', sameSite: 'None', secure: true }).cookie.sameSite === 'no_restriction' && n({ name: 'a', value: '', domain: 'a.test', sameSite: null }).cookie.sameSite === 'unspecified');
check('normalize: invalid sameSite rejected', /sameSite/.test(n({ name: 'a', value: '', domain: 'a.test', sameSite: 'sometimes' }).error));
check('normalize: SameSite=None without Secure rejected', /requires Secure/.test(n({ name: 'a', value: '', domain: 'a.test', sameSite: 'no_restriction' }).error));
check('normalize: __Host- without Secure rejected', /require Secure/.test(n({ name: '__Host-x', value: '1', domain: 'a.test' }).error));
check('normalize: ; in value rejected', !!n({ name: 'a', value: 'x;y', domain: 'a.test' }).error);
check('normalize: = in name rejected', !!n({ name: 'a=b', value: 'x', domain: 'a.test' }).error);
check('normalize: newline in value rejected', !!n({ name: 'a', value: 'x\ny', domain: 'a.test' }).error);
check('normalize: bad domain rejected', !!n({ name: 'a', value: 'x', domain: 'a b.test' }).error && !!n({ name: 'a', value: 'x', domain: 'http://a.test' }).error);
check('normalize: path must start with /', !!n({ name: 'a', value: 'x', domain: 'a.test', path: 'x' }).error);
check('normalize: numeric value stringified', n({ name: 'a', value: 5, domain: 'a.test' }).cookie.value === '5');
check('normalize: empty name and value rejected', !!n({ name: '', value: '', domain: 'a.test' }).error);
check('normalize: non-object rejected', !!n(null).error && !!n([1]).error && !!n('x').error);
r = n({ name: 'p', value: '1', domain: 'a.test', secure: true, partitionKey: { topLevelSite: 'https://b.test', hasCrossSiteAncestor: false } });
check('normalize: partitionKey kept', eq(r.cookie.partitionKey, { topLevelSite: 'https://b.test', hasCrossSiteAncestor: false }));
check('normalize: partitionKey string accepted', n({ name: 'p', value: '1', domain: 'a.test', secure: true, partitionKey: 'https://b.test' }).cookie.partitionKey.topLevelSite === 'https://b.test');
check('normalize: partitioned without Secure rejected', /Secure/.test(n({ name: 'p', value: '1', domain: 'a.test', partitionKey: 'https://b.test' }).error));
check('normalize: bad partition site rejected', !!n({ name: 'p', value: '1', domain: 'a.test', secure: true, partitionKey: 'b.test/x' }).error);
check('normalize: empty partitionKey object ignored', !('partitionKey' in n({ name: 'p', value: '1', domain: 'a.test', partitionKey: {} }).cookie));
check('normalize: string booleans', n({ name: 'a', value: '1', domain: 'a.test', secure: 'true', httpOnly: 'TRUE' }).cookie.httpOnly === true);

// ---------- toSetDetails ----------
let d = L.toSetDetails(n({ name: 'a', value: 'b', domain: '.a.test', path: '/p', secure: true, sameSite: 'strict', expirationDate: NOW + 5 }).cookie, '1');
check('toSetDetails: domain cookie', eq(d, { url: 'https://a.test/p', name: 'a', value: 'b', path: '/p', secure: true, httpOnly: false, domain: 'a.test', expirationDate: NOW + 5, sameSite: 'strict', storeId: '1' }), JSON.stringify(d));
d = L.toSetDetails(n({ name: 'a', value: 'b', domain: 'a.test' }).cookie);
check('toSetDetails: host-only has no domain, session has no expiry, unspecified sameSite omitted', !('domain' in d) && !('expirationDate' in d) && !('sameSite' in d) && d.url === 'http://a.test/');
check('toSetDetails: partitionKey passed', L.toSetDetails(n({ name: 'p', value: '1', domain: 'a.test', secure: true, partitionKey: 'https://b.test' }).cookie).partitionKey.topLevelSite === 'https://b.test');

// ---------- JSON export / import round trip ----------
const jar = [
  { name: 'sid', value: 's3cr3t', domain: '.a.test', hostOnly: false, path: '/', secure: false, httpOnly: true, sameSite: 'lax', session: false, expirationDate: NOW + 3600, storeId: '0' },
  { name: 'host', value: 'x=1&y=2', domain: 'sub.a.test', hostOnly: true, path: '/app', secure: true, httpOnly: false, sameSite: 'strict', session: true, storeId: '0' },
  { name: 'chip', value: 'p', domain: 'sub.a.test', hostOnly: true, path: '/', secure: true, httpOnly: false, sameSite: 'no_restriction', session: true, storeId: '0', partitionKey: { topLevelSite: 'https://b.test', hasCrossSiteAncestor: true } }
];
const exp = L.toExportJSON(jar);
check('export JSON: Cookie-Editor style keys', eq(Object.keys(exp[0]), ['domain', 'expirationDate', 'hostOnly', 'httpOnly', 'name', 'path', 'sameSite', 'secure', 'session', 'storeId', 'value']), Object.keys(exp[0]).join());
check('export JSON: session cookie has no expirationDate, partitionKey kept', !('expirationDate' in exp[1]) && exp[2].partitionKey.topLevelSite === 'https://b.test');
let p = L.parseImport(JSON.stringify(exp), opts);
check('JSON round trip preserves every field', p.format === 'json' && same(p.cookies.map((c) => ({ ...c, storeId: '0' })), jar), JSON.stringify(p));
p = L.parseImport(JSON.stringify({ cookies: [{ name: 'pw', value: 'v', domain: '.a.test', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }] }), opts);
check('import: Playwright storageState {cookies:[...]}', p.cookies.length === 1 && p.cookies[0].sameSite === 'lax' && p.cookies[0].session);
p = L.parseImport(JSON.stringify([{ name: 'ok', value: '1', domain: 'a.test' }, { name: 'bad;', value: '1', domain: 'a.test' }, { name: 'old', value: '1', domain: 'a.test', expirationDate: 5 }, { name: 'ok', value: '2', domain: 'a.test' }]), opts);
check('import: invalid entries reported, expired counted, duplicates skipped', p.cookies.length === 1 && p.problems.length === 2 && p.expired === 1 && /#2/.test(p.problems[0]) && /duplicate/.test(p.problems[1]), JSON.stringify(p));
check('import: invalid JSON', /not valid JSON/.test(L.parseImport('[{', opts).error));
check('import: wrong JSON shape', /Expected a JSON array/.test(L.parseImport('{"a":1}', opts).error));
check('import: empty', !!L.parseImport('   ', opts).error && !!L.parseImport(null, opts).error);
check('import: all expired message', /already expired/.test(L.parseImport(JSON.stringify([{ name: 'a', value: '1', domain: 'a.test', expirationDate: 1 }]), opts).error));
check('import: no valid cookies', /No valid cookies/.test(L.parseImport('[{"name":"x;"}]', opts).error));

// ---------- Netscape cookies.txt ----------
const txt = L.toNetscape(jar);
const lines = txt.split('\n');
check('cookies.txt: header + warning', lines[0] === '# Netscape HTTP Cookie File' && /treat it like a password/.test(lines[1]));
check('cookies.txt: domain cookie line (#HttpOnly_, TRUE, expiry)', lines.includes(`#HttpOnly_.a.test\tTRUE\t/\tFALSE\t${NOW + 3600}\tsid\ts3cr3t`), txt);
check('cookies.txt: host-only session line', lines.includes('sub.a.test\tFALSE\t/app\tTRUE\t0\thost\tx=1&y=2'));
p = L.parseImport(txt, opts);
check('cookies.txt round trip (name/value/domain/path/secure/httpOnly/expiry)', p.format === 'netscape' && p.cookies.length === 3
  && eq(p.cookies.map((c) => [c.name, c.value, c.domain, c.hostOnly, c.path, c.secure, c.httpOnly, c.session, c.expirationDate]), jar.map((c) => [c.name, c.value, c.domain, c.hostOnly, c.path, c.secure, c.httpOnly, c.session, c.expirationDate])), JSON.stringify(p.cookies));
p = L.parseImport('# comment\n\nbad line\na.test\tFALSE\t/\tFALSE\t0\tn\t\n', opts);
check('cookies.txt: bad line reported, empty value allowed', p.cookies.length === 1 && p.cookies[0].value === '' && p.problems.length === 1 && /line 3/.test(p.problems[0]), JSON.stringify(p));
p = L.parseImport('a.test FALSE / FALSE 0 spaced v\n', opts);
check('cookies.txt: space-separated fallback', p.cookies.length === 1 && p.cookies[0].name === 'spaced');
check('cookies.txt: nothing recognisable', !!L.parseImport('hello world', opts).error);

// ---------- review fixes ----------
check('public suffix: ccTLD registries (co.th, com.ec, ac.id) are never requested', eq(L.parentDomains('www.shop.co.th'), ['www.shop.co.th', 'shop.co.th']) && L.baseDomain('a.b.com.ec') === 'b.com.ec' && eq(L.parentDomains('x.ac.id'), ['x.ac.id']));
check('public suffix: hosting platforms -> exact host only (foo.github.io, bucket.s3.amazonaws.com, a.b.herokuapp.com)', eq(L.parentDomains('foo.github.io'), ['foo.github.io']) && eq(L.parentDomains('bucket.s3.amazonaws.com'), ['bucket.s3.amazonaws.com']) && eq(L.parentDomains('a.b.herokuapp.com'), ['a.b.herokuapp.com']));
check('public suffix: ordinary domains still include the registrable parent', eq(L.parentDomains('www.example.de'), ['www.example.de', 'example.de']) && eq(L.parentDomains('a.b.example.com'), ['a.b.example.com', 'b.example.com', 'example.com']) && eq(L.parentDomains('localhost'), ['localhost']));
check('IPv6: host kept in [brackets] like Chrome stores it; cookie applies', eq(L.parentDomains('[::1]'), ['[::1]']) && L.baseDomain('::1') === '[::1]' && L.appliesToHost({ domain: '[::1]', hostOnly: true }, '[::1]'));
check('IPv6: cookie validated (bracketed domain, forced host-only)', (() => { const c = n({ name: 'a', value: '1', domain: '[::1]', hostOnly: false }).cookie; return c && c.domain === '[::1]' && c.hostOnly === true; })());
check('IP: domain cookie on an IP never matches another IP', !L.appliesToHost({ domain: '.0.0.1', hostOnly: false }, '127.0.0.1'));
check('IDN: unicode domain converted to punycode', n({ name: 'a', value: '1', domain: '.münchen.test' }).cookie.domain === '.xn--mnchen-3ya.test' && n({ name: 'a', value: '1', domain: 'MÜNCHEN.test' }).cookie.domain === 'xn--mnchen-3ya.test');
check('__Host-: domain cookie or path other than / rejected with a clear message', /host-only/.test(n({ name: '__Host-x', value: '1', domain: '.a.test', secure: true }).error) && /path "\/"/.test(n({ name: '__Host-x', value: '1', domain: 'a.test', path: '/p', secure: true }).error) && !!n({ name: '__Host-x', value: '1', domain: 'a.test', secure: true }).cookie);
check('__Secure- (any case) needs Secure', /require Secure/.test(n({ name: '__secure-x', value: '1', domain: 'a.test' }).error) && !!n({ name: '__Secure-x', value: '1', domain: '.a.test', secure: true }).cookie);
check('size: 4096 bytes name+value ok, 4097 rejected, counted in UTF-8 bytes', !!n({ name: 'abcd', value: 'x'.repeat(4092), domain: 'a.test' }).cookie && /4096/.test(n({ name: 'abcd', value: 'x'.repeat(4093), domain: 'a.test' }).error) && /4096/.test(n({ name: 'u', value: 'é'.repeat(2100), domain: 'a.test' }).error));
check('unicode value (é€😀) accepted as is', n({ name: 'u', value: 'é€😀 "q", a\\b', domain: 'a.test' }).cookie.value === 'é€😀 "q", a\\b');
check('leading/trailing spaces in name or value rejected (Chrome refuses them)', /space/.test(n({ name: 'a', value: ' x', domain: 'a.test' }).error) && /space/.test(n({ name: 'a ', value: 'x', domain: 'a.test' }).error) && !!n({ name: 'a', value: 'x y', domain: 'a.test' }).cookie);
check('path longer than 1024 bytes rejected', /1024/.test(n({ name: 'a', value: '1', domain: 'a.test', path: '/' + 'p'.repeat(1030) }).error));
check('cookieKey distinguishes hasCrossSiteAncestor', L.cookieKey({ domain: 'a', name: 'n', partitionKey: { topLevelSite: 'https://a', hasCrossSiteAncestor: true } }) !== L.cookieKey({ domain: 'a', name: 'n', partitionKey: { topLevelSite: 'https://a', hasCrossSiteAncestor: false } }));
check('cookieUrl: https override for a non-Secure cookie', L.cookieUrl({ domain: 'a.test', secure: false }, true) === 'https://a.test/');
p = L.parseImport(JSON.stringify([{ domain: '.a.test', expirationDate: NOW + 100.123456, hostOnly: false, httpOnly: true, name: 'etc', path: '/', sameSite: 'no_restriction', secure: true, session: false, storeId: 'firefox-default', value: 'v', id: 1 }, { domain: 'sub.a.test', hostOnly: true, httpOnly: false, name: 'ce', path: '/', sameSite: null, secure: false, session: true, storeId: '0', value: 'w', firstPartyDomain: '', partitionKey: null }]), opts);
check('import: EditThisCookie / Cookie-Editor (Firefox) JSON: float expiry kept exactly, sameSite null -> unspecified, storeId kept for the store check', p.cookies.length === 2 && p.cookies[0].expirationDate === NOW + 100.123456 && p.cookies[0].sameSite === 'no_restriction' && p.cookies[1].sameSite === 'unspecified' && p.cookies[1].hostOnly && p.cookies[0].storeId === 'firefox-default', JSON.stringify(p));
p = L.parseImport('#HttpOnly_.a.test\tTRUE\t/\tTRUE\t0\t__Secure-s\tv\n#HttpOnly_sub.a.test\tFALSE\t/\tTRUE\t0\t__Host-h\tv\n', opts);
check('cookies.txt: #HttpOnly_ with __Secure-/__Host- prefixes', p.cookies.length === 2 && p.cookies.every((c) => c.httpOnly && c.secure) && p.cookies[1].hostOnly, JSON.stringify(p));

// ---------- datetime-local helpers ----------
const t = 1_800_000_060;
check('toLocalInput/fromLocalInput round trip (minute precision)', L.fromLocalInput(L.toLocalInput(t)) === t);
check('fromLocalInput invalid -> NaN', Number.isNaN(L.fromLocalInput('nope')));

const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} unit checks passed`);
process.exit(failed.length ? 1 : 0);
