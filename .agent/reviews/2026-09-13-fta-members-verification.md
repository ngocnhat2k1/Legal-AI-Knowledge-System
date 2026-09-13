---
type: review
status: pending-owner-verification
updated: 2026-09-13
related:
  - ../business-rules.md
  - ../concepts/tariff-system.md
---

# Phiếu xác minh danh sách nước được hưởng thuế suất FTA (BẢN NHÁP)

File cần xác minh: `db/seed/data/fta-members.json` (`verifiedBy: null`, `verifiedAt: null`). Theo R18, chỉ người có tên mới được ghi "đã xác minh".
Nguồn: văn bản `.doc` trên Công báo (congbao.chinhphu.vn), tải ngày 2026-09-13, chuyển sang text bằng `textutil`. Trích dẫn cắt thẳng từ text nguồn (chỉ bỏ dòng trống); từng tên nước đã được so khớp tự động với đúng dòng của nó trong trích dẫn.
Anh/chị vui lòng đối chiếu với **PDF đã ký** trên trang Công báo của từng nghị định.

## ACFTA — Nghị định 118/2022/NĐ-CP

- Link: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-118-2022-nd-cp-38936.htm
- Công báo: (Đăng từ Công báo số 529 + 530 đến số 547 + 548)
- Điều khoản: Điều 4, khoản 2 (thành viên); Điều 5 (khu phi thuế quan); xem thêm Điều 3, khoản 5 (cột “Nước không được hưởng ưu đãi”)
- Mẫu C/O trong file: `E`

**Trích nguyên văn:**

> 2. Được nhập khẩu từ các nước là thành viên của Hiệp định Thương mại hàng hóa ASEAN - Trung Quốc, bao gồm các quốc gia và vùng lãnh thổ sau:
> a) Bru-nây Đa-rút-xa-lam, ký hiệu là BN;
> b) Vương quốc Cam-pu-chia, ký hiệu là KH;
> c) Cộng hòa In-đô-nê-xi-a, ký hiệu là ID;
> d) Cộng hòa Dân chủ Nhân dân Lào, ký hiệu là LA;
> đ) Ma-lay-xi-a, ký hiệu là MY;
> e) Cộng hòa Liên bang Mi-an-ma, ký hiệu là MM;
> g) Cộng hòa Phi-líp-pin, ký hiệu là PH;
> h) Cộng hòa Xinh-ga-po, ký hiệu là SG;
> i) Vương quốc Thái Lan, ký hiệu là TH;
> k) Cộng hòa Nhân dân Trung Hoa, ký hiệu là CN;

**Danh sách đã tách:**

| # | Tên theo nghị định | ISO |
|---|---|---|
| 1 | Bru-nây Đa-rút-xa-lam | `BN` |
| 2 | Vương quốc Cam-pu-chia | `KH` |
| 3 | Cộng hòa In-đô-nê-xi-a | `ID` |
| 4 | Cộng hòa Dân chủ Nhân dân Lào | `LA` |
| 5 | Ma-lay-xi-a | `MY` |
| 6 | Cộng hòa Liên bang Mi-an-ma | `MM` |
| 7 | Cộng hòa Phi-líp-pin | `PH` |
| 8 | Cộng hòa Xinh-ga-po | `SG` |
| 9 | Vương quốc Thái Lan | `TH` |
| 10 | Cộng hòa Nhân dân Trung Hoa | `CN` |

Tổng: **10** thành viên.

**Nguồn gốc đặc biệt (specialOrigins):**

- Hàng hóa từ khu phi thuế quan của Việt Nam nhập khẩu vào thị trường trong nước được áp dụng thuế suất thuế nhập khẩu ưu đãi đặc biệt theo Hiệp định ACFTA phải đáp ứng đủ các điều kiện quy định tại khoản 1 và khoản 3 Điều 4 Nghị định này.

- [ ] Tôi đã đối chiếu trích dẫn và 10 mã ISO của ACFTA với văn bản gốc. Người xác minh: ____________ Ngày: ____________

## AANZFTA — Nghị định 121/2022/NĐ-CP

- Link: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-121-2022-nd-cp-38728.htm
- Công báo: Công báo số 293 + 294 ngày 01/02/2023 (phần đầu)
- Điều khoản: Điều 4, khoản 2 (thành viên); Điều 5 (khu phi thuế quan)
- Mẫu C/O trong file: `AANZ`

**Trích nguyên văn:**

> 2. Được nhập khẩu từ các nước là thành viên của Hiệp định thành lập Khu vực Thương mại tự do ASEAN - Ôt-xtrây-lia - Niu Di-lân, bao gồm các nước sau:
> a) Bru-nây Đa-rút-xa-lam;
> b) Vương quốc Cam-pu-chia;
> c) Cộng hòa In-đô-nê-xi-a;
> d) Cộng hòa Dân chủ Nhân dân Lào;
> đ) Ma-lay-xi-a;
> e) Cộng hòa Liên bang Mi-an-ma;
> g) Cộng hòa Phi-líp-pin;
> h) Cộng hòa Xinh-ga-po;
> i) Vương quốc Thái Lan;
> k) Ôt-xtrây-lia;
> l) Niu Di-lân.

**Danh sách đã tách:**

| # | Tên theo nghị định | ISO |
|---|---|---|
| 1 | Bru-nây Đa-rút-xa-lam | `BN` |
| 2 | Vương quốc Cam-pu-chia | `KH` |
| 3 | Cộng hòa In-đô-nê-xi-a | `ID` |
| 4 | Cộng hòa Dân chủ Nhân dân Lào | `LA` |
| 5 | Ma-lay-xi-a | `MY` |
| 6 | Cộng hòa Liên bang Mi-an-ma | `MM` |
| 7 | Cộng hòa Phi-líp-pin | `PH` |
| 8 | Cộng hòa Xinh-ga-po | `SG` |
| 9 | Vương quốc Thái Lan | `TH` |
| 10 | Ôt-xtrây-lia | `AU` |
| 11 | Niu Di-lân | `NZ` |

Tổng: **11** thành viên.

**Nguồn gốc đặc biệt (specialOrigins):**

- Hàng hóa từ khu phi thuế quan của Việt Nam nhập khẩu vào thị trường trong nước được áp dụng thuế suất thuế nhập khẩu ưu đãi đặc biệt theo Hiệp định thành lập Khu vực Thương mại tự do ASEAN - Ôt-xtrây-lia - Niu Di-lân phải đáp ứng đủ các điều kiện quy định tại khoản 1 và khoản 3 Điều 4 Nghị định này.

- [ ] Tôi đã đối chiếu trích dẫn và 11 mã ISO của AANZFTA với văn bản gốc. Người xác minh: ____________ Ngày: ____________

## ATIGA — Nghị định 126/2022/NĐ-CP

- Link: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-126-2022-nd-cp-38868.htm
- Công báo: (Đăng từ Công báo số 461 + 462 đến số 477 + 478)
- Điều khoản: Điều 4, khoản 2 (thành viên); Điều 5 (khu phi thuế quan)
- Mẫu C/O trong file: `D`

**Trích nguyên văn:**

> 2. Được nhập khẩu vào Việt Nam từ các nước là thành viên của Hiệp định Thương mại Hàng hóa ASEAN, bao gồm các nước sau:
> a) Bru-nây Đa-rút-xa-lam;
> b) Vương quốc Cam-pu-chia;
> c) Cộng hòa In-đô-nê-xi-a;
> d) Cộng hòa Dân chủ Nhân dân Lào;
> đ) Ma-lay-xi-a;
> e) Cộng hòa Liên bang Mi-an-ma;
> g) Cộng hòa Phi-líp-pin;
> h) Cộng hòa Xinh-ga-po;
> i) Vương quốc Thái Lan.

**Danh sách đã tách:**

| # | Tên theo nghị định | ISO |
|---|---|---|
| 1 | Bru-nây Đa-rút-xa-lam | `BN` |
| 2 | Vương quốc Cam-pu-chia | `KH` |
| 3 | Cộng hòa In-đô-nê-xi-a | `ID` |
| 4 | Cộng hòa Dân chủ Nhân dân Lào | `LA` |
| 5 | Ma-lay-xi-a | `MY` |
| 6 | Cộng hòa Liên bang Mi-an-ma | `MM` |
| 7 | Cộng hòa Phi-líp-pin | `PH` |
| 8 | Cộng hòa Xinh-ga-po | `SG` |
| 9 | Vương quốc Thái Lan | `TH` |

Tổng: **9** thành viên.

**Nguồn gốc đặc biệt (specialOrigins):**

- Hàng hóa từ khu phi thuế quan của Việt Nam nhập khẩu vào thị trường trong nước được áp dụng thuế suất thuế nhập khẩu ưu đãi đặc biệt theo Hiệp định Thương mại hàng hóa ASEAN phải đáp ứng đủ các điều kiện quy định tại khoản 1 và khoản 3 Điều 4 Nghị định này.

- [ ] Tôi đã đối chiếu trích dẫn và 9 mã ISO của ATIGA với văn bản gốc. Người xác minh: ____________ Ngày: ____________

## EVFTA — Nghị định 116/2022/NĐ-CP

- Link: https://congbao.chinhphu.vn/van-ban/nghi-dinh-so-116-2022-nd-cp-38821.htm
- Công báo: (Đăng từ Công báo số 391 + 392 đến số 421 + 422); Phụ lục III tại Công báo số 421 + 422
- Điều khoản: Điều 5, khoản 3, điểm b và Phụ lục III (thành viên); Điều 6 (khu phi thuế quan)
- Mẫu C/O trong file: `EUR.1/REX`

**Trích nguyên văn:**

> b) Được nhập khẩu vào Việt Nam từ:
> - Lãnh thổ thành viên Liên minh châu Âu quy định tại Phụ lục III ban hành kèm theo Nghị định này;
> - Công quốc An-đô-ra; Cộng hòa San Ma-ri-nô; và
> - Vùng lãnh thổ Xớt-ta và Mê-li-la.
> 
> Phụ lục III
> DANH SÁCH LÃNH THỔ THÀNH VIÊN LIÊN MINH CHÂU ÂU
> (Kèm theo Nghị định số 116/2022/NĐ-CP
> ngày 30 tháng 12 năm 2022 của Chính phủ)
> 1. Cộng hòa Pháp.
> 2. Cộng hòa Liên bang Đức.
> 3. Cộng hòa I-ta-li-a.
> 4. Vương quốc Bỉ.
> 5. Cộng hòa Hà Lan.
> 6. Đại Công quốc Lúc-xăm-bua.
> 7. Cộng hòa Ai-len.
> 8. Vương quốc Đan Mạch.
> 9. Cộng hòa Hy Lạp.
> 10. Vương quốc Tây Ban Nha, không bao gồm vùng lãnh thổ Xớt-ta và Mê-li-la.
> 11. Cộng hòa Bồ Đào Nha.
> 12. Cộng hòa Áo.
> 13. Vương quốc Thụy Điển.
> 14. Cộng hòa Phần Lan.
> 15. Cộng hòa Séc.
> 16. Cộng hòa Hung-ga-ri.
> 17. Cộng hòa Ba Lan.
> 18. Cộng hòa Xlô-va-ki-a.
> 19. Cộng hòa Xlô-ven-ni-a.
> 20. Cộng hòa Lít-va.
> 21. Cộng hòa Lát-vi-a.
> 22. Cộng hòa E-xtô-ni-a.
> 23. Cộng hòa Man-ta.
> 24. Cộng hòa Síp.
> 25. Cộng hòa Bun-ga-ri.
> 26. Cộng hòa Ru-ma-ni.
> 27. Cộng hòa Crô-a-ti-a.

**Danh sách đã tách:**

| # | Tên theo nghị định | ISO |
|---|---|---|
| 1 | Cộng hòa Pháp | `FR` |
| 2 | Cộng hòa Liên bang Đức | `DE` |
| 3 | Cộng hòa I-ta-li-a | `IT` |
| 4 | Vương quốc Bỉ | `BE` |
| 5 | Cộng hòa Hà Lan | `NL` |
| 6 | Đại Công quốc Lúc-xăm-bua | `LU` |
| 7 | Cộng hòa Ai-len | `IE` |
| 8 | Vương quốc Đan Mạch | `DK` |
| 9 | Cộng hòa Hy Lạp | `GR` |
| 10 | Vương quốc Tây Ban Nha, không bao gồm vùng lãnh thổ Xớt-ta và Mê-li-la | `ES` |
| 11 | Cộng hòa Bồ Đào Nha | `PT` |
| 12 | Cộng hòa Áo | `AT` |
| 13 | Vương quốc Thụy Điển | `SE` |
| 14 | Cộng hòa Phần Lan | `FI` |
| 15 | Cộng hòa Séc | `CZ` |
| 16 | Cộng hòa Hung-ga-ri | `HU` |
| 17 | Cộng hòa Ba Lan | `PL` |
| 18 | Cộng hòa Xlô-va-ki-a | `SK` |
| 19 | Cộng hòa Xlô-ven-ni-a | `SI` |
| 20 | Cộng hòa Lít-va | `LT` |
| 21 | Cộng hòa Lát-vi-a | `LV` |
| 22 | Cộng hòa E-xtô-ni-a | `EE` |
| 23 | Cộng hòa Man-ta | `MT` |
| 24 | Cộng hòa Síp | `CY` |
| 25 | Cộng hòa Bun-ga-ri | `BG` |
| 26 | Cộng hòa Ru-ma-ni | `RO` |
| 27 | Cộng hòa Crô-a-ti-a | `HR` |
| 28 | Công quốc An-đô-ra | `AD` |
| 29 | Cộng hòa San Ma-ri-nô | `SM` |

Tổng: **29** thành viên.

**Nguồn gốc đặc biệt (specialOrigins):**

- Vùng lãnh thổ Xớt-ta và Mê-li-la.
- Hàng hóa từ khu phi thuế quan của Việt Nam nhập khẩu vào thị trường trong nước được áp dụng thuế suất thuế nhập khẩu ưu đãi đặc biệt theo Hiệp định EVFTA phải đáp ứng đủ các điều kiện quy định tại điểm a, điểm c khoản 3 Điều 5 Nghị định này.

- [ ] Tôi đã đối chiếu trích dẫn và 29 mã ISO của EVFTA với văn bản gốc. Người xác minh: ____________ Ngày: ____________

## Cần anh/chị xem kỹ

1. **ACFTA — cột “Nước không được hưởng ưu đãi” (Điều 3 khoản 5) bị thiếu trong dữ liệu đã nạp.** Biểu ACFTA có cột này; hàng nhập từ nước có ký hiệu trong cột KHÔNG được hưởng thuế suất ACFTA. `fta-acfta.ndjson` chỉ có `hs/hs_dotted/desc/rates`. Rà soát tự động 10 phần Công báo (529+530 → 547+548): khoảng **3185** dòng HS có ký hiệu nước; **510** dòng loại trừ CN, trong đó **446** dòng đang có thuế suất 0 trong seed (ví dụ `0901.11.20` loại trừ CN, MM, TH). Số dòng theo nước: BN 371, KH 1177, ID 951, LA 121, MY 692, MM 707, PH 896, SG 4, TH 856, CN 510. Nếu code chỉ kiểm tra "nước có là thành viên", bot sẽ báo 0% cho hàng Trung Quốc ở các dòng này — đúng kiểu lỗi âm thầm. Đề nghị: không dùng file thành viên cho ACFTA cho tới khi nạp cột loại trừ. Số đếm ban đầu là heuristic; **đang sửa riêng (2026-09-13 tối)**: nạp cột loại trừ vào `db/seed/data/fta-acfta.ndjson` (trường `excluded`, `excluded_sublines`) và API không trả mức ưu đãi cho nước bị loại trừ ở dòng đó — có agent đối chiếu độc lập toàn bộ dòng với nghị định.
2. **ACFTA — Hồng Kông, Ma Cao, Đài Loan:** Điều 4 khoản 2 viết “các quốc gia và vùng lãnh thổ sau” nhưng chỉ liệt kê 10 nước; không có HK/MO/TW. File không thêm các mã này.
3. **Mi-an-ma, Cam-pu-chia, Lào:** cả 3 nghị định ASEAN (118, 121, 126) liệt kê bình thường, không có điều kiện riêng ở khoản thành viên. Nhưng trong Biểu ACFTA các nước này thường nằm ở cột loại trừ (KH 1177, MM 707, LA 121 dòng).
4. **EVFTA — thành phần EU:** Phụ lục III có 27 nước, không có Anh. Tây Ban Nha “không bao gồm vùng lãnh thổ Xớt-ta và Mê-li-la”, nhưng Xớt-ta và Mê-li-la lại được hưởng riêng (điểm b) — không có mã ISO chính thức (chỉ mã bảo lưu `EA`) nên để ở specialOrigins; tờ khai có thể ghi ES. An-đô-ra (`AD`) và San Ma-ri-nô (`SM`) có trong members. Mô-na-cô và các lãnh thổ hải ngoại (Greenland, Faroe, Aruba…) không được nêu. Hy Lạp là `GR` (EU có nơi dùng `EL`). Nghị định gọi “Cộng hòa Hà Lan” — giữ nguyên.
5. **Khu phi thuế quan:** cả 4 nghị định có điều riêng; điều kiện chỉ dẫn chiếu khoản “thuộc Biểu” + “xuất xứ/chứng từ” (ACFTA/AANZFTA/ATIGA: khoản 1 và 3 Điều 4; EVFTA: điểm a, c khoản 3 Điều 5), **không** yêu cầu nhập từ nước thành viên. Đây không phải mã nước — code phải xử lý riêng.
6. **Mẫu C/O:** ACFTA/AANZFTA/ATIGA đều ghi “C/O mẫu … hoặc có chứng từ chứng nhận xuất xứ hàng hóa” (tức là cả tự chứng nhận). EVFTA không nêu tên EUR.1/REX; giá trị `coForm` lấy từ `db/seed/index.ts`.
7. **Đông Ti-mo:** không có trong nghị định nào; không thêm (ghi chú ở ATIGA).
8. **Văn bản sửa đổi:** chưa rà soát nghị định sửa đổi, bổ sung 4 nghị định này sau 30/12/2022.
9. **Phần chưa kiểm tra:** việc "không có cột loại trừ" ở AANZFTA/ATIGA dựa trên tiêu đề bảng và Điều 3 của nghị định, không quét toàn bộ các phần Công báo.
