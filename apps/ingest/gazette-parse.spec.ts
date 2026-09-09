/**
 * Reading a Công báo listing. The number is the lookup key for every later question,
 * so misreading one indexes a document under a number that will answer the wrong
 * question later — a silent failure, which is why this is unit-tested rather than
 * eyeballed once.
 */
import { decodeTitle, docTypeFromNumber, numberFromTitle, pageKey, parseListing } from './gazette-parse';

describe('numberFromTitle', () => {
  it('reads the number every gazette title states after "số"', () => {
    expect(numberFromTitle('Thông tư số 33/2023/TT-BTC quy định về xác định xuất xứ hàng hóa')).toBe('33/2023/TT-BTC');
    expect(numberFromTitle('Nghị định số 08/2015/NĐ-CP quy định chi tiết')).toBe('08/2015/NĐ-CP');
    expect(numberFromTitle('Luật số 09/2026/QH16 luật đầu tư')).toBe('09/2026/QH16');
    expect(numberFromTitle('Văn bản hợp nhất số 25/VBHN-BTC hợp nhất Thông tư')).toBe('25/VBHN-BTC');
    expect(numberFromTitle('Quyết định số 1466/QĐ-TTg phê duyệt đề án')).toBe('1466/QĐ-TTG');
  });

  it('handles a letter-suffixed serial', () => {
    expect(numberFromTitle('Thông tư số 12A/2020/TT-BTC về abc')).toBe('12A/2020/TT-BTC');
  });

  it('returns null rather than guessing', () => {
    // Better to drop an entry than to index it under a number that will later match
    // the wrong question.
    expect(numberFromTitle('Công báo điện tử Nước CHXHCN Việt Nam')).toBeNull();
    expect(numberFromTitle('Thông tư số 33 về abc')).toBeNull(); // no second segment
  });
});

describe('decodeTitle', () => {
  it('decodes the entity forms Công báo emits and flattens whitespace', () => {
    expect(decodeTitle('Th&#xF4;ng t&#x1B0; s&#x1ED1; 10/2026/TT-BNG  h&#x1B0;&#x1EDB;ng d&#x1EAB;n')).toBe(
      'Thông tư số 10/2026/TT-BNG hướng dẫn',
    );
    expect(decodeTitle('<span>Nghị định số 1/2020/NĐ-CP</span> &amp; abc')).toBe('Nghị định số 1/2020/NĐ-CP & abc');
  });
});

describe('parseListing', () => {
  // Shape taken from a real /van-ban-dang-cong-bao/thong-tu-l3/trang-2.htm response.
  const html = `
    <ul>
      <li><a href="/van-ban/thong-tu-so-10-2026-tt-bng-470168.htm">Thông tư số 10/2026/TT-BNG hướng dẫn một số nội dung</a></li>
      <li><a href="/van-ban/thong-tu-so-104-2026-tt-btc-470155/12345.htm">Thông tư số 104/2026/TT-BTC quy định phân cấp thẩm quyền</a></li>
      <li><a href="/van-ban/thong-tu-so-10-2026-tt-bng-470168.htm">Thông tư số 10/2026/TT-BNG hướng dẫn một số nội dung</a></li>
      <li><a href="/cong-bao/trang-42.htm">Công báo điện tử</a></li>
    </ul>`;

  it('extracts id, number and absolute url', () => {
    const rows = parseListing(html);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      congbaoId: 470168,
      number: '10/2026/TT-BNG',
      title: 'Thông tư số 10/2026/TT-BNG hướng dẫn một số nội dung',
      sourceUrl: 'https://congbao.chinhphu.vn/van-ban/thong-tu-so-10-2026-tt-bng-470168.htm',
    });
  });

  it('keeps the gazette-issue variant of a url and drops non-document links', () => {
    const rows = parseListing(html);
    expect(rows[1]!.congbaoId).toBe(470155);
    expect(rows.map((r) => r.number)).not.toContain(null);
  });

  it('de-duplicates repeated links within a page', () => {
    expect(parseListing(html).filter((r) => r.congbaoId === 470168)).toHaveLength(1);
  });
});

describe('pageKey', () => {
  it('is equal for the clamped repeat and different for a real next page', () => {
    // An out-of-range page is NOT empty and does NOT 404 — the gazette clamps to the
    // last real page and serves it again. The crawler's stop condition depends on this.
    const a = parseListing(
      '<a href="/van-ban/x-1.htm">Thông tư số 1/2020/TT-BTC về abc def ghi</a><a href="/van-ban/x-2.htm">Thông tư số 2/2020/TT-BTC về abc def</a>',
    );
    const clamped = parseListing(
      '<a href="/van-ban/x-1.htm">Thông tư số 1/2020/TT-BTC về abc def ghi</a><a href="/van-ban/x-2.htm">Thông tư số 2/2020/TT-BTC về abc def</a>',
    );
    const next = parseListing('<a href="/van-ban/x-3.htm">Thông tư số 3/2020/TT-BTC về abc def ghi</a>');
    expect(pageKey(a)).toBe(pageKey(clamped));
    expect(pageKey(a)).not.toBe(pageKey(next));
  });
});

describe('docTypeFromNumber', () => {
  it('reads the kind from the number, not from the page it was found on', () => {
    // The listing slug is not trustworthy: deep pages of thong-tu-l3 served 705
    // nghị định, which entered the catalogue mislabelled until the kind was derived
    // from the number itself.
    expect(docTypeFromNumber('178/2013/NĐ-CP', 'thong_tu')).toBe('nghi_dinh');
    expect(docTypeFromNumber('33/2023/TT-BTC', 'nghi_dinh')).toBe('thong_tu');
    expect(docTypeFromNumber('25/VBHN-BTC', 'thong_tu')).toBe('vbhn');
    expect(docTypeFromNumber('71/2026/VBHN-NĐ-BCT', 'nghi_dinh')).toBe('vbhn');
    expect(docTypeFromNumber('05/2012/TTLT-VKSNDTC-TANDTC', 'thong_tu')).toBe('thong_tu_lien_tich');
    expect(docTypeFromNumber('09/2026/QH16', 'nghi_dinh')).toBe('luat');
    expect(docTypeFromNumber('1466/QĐ-TTG', 'thong_tu')).toBe('quyet_dinh');
    expect(docTypeFromNumber('19/2026/QH16', 'x')).toBe('luat');
  });

  it('falls back to the crawl route when the suffix says nothing', () => {
    expect(docTypeFromNumber('123/2020/ABC-XYZ', 'thong_tu')).toBe('thong_tu');
  });
});

describe('numberFromTitle length guard', () => {
  it('keeps the longest genuine number and drops mangled ones', () => {
    const real = '05/2012/TTLT-VKSNDTC-TANDTC-BCA-BTP-BQP-BTC-BNNPTNT';
    expect(numberFromTitle(`Thông tư liên tịch số ${real} hướng dẫn`)).toBe(real);
    // An unbounded read of a mangled title overflowed varchar(64) and killed the crawl.
    expect(numberFromTitle(`Thông tư số 1/2020/${'X'.repeat(90)} abc`)).toBeNull();
  });
});
