// Minimal EXIF reader for JPEG photos: when it was taken and where (GPS). No dependencies.

export interface ExifInfo {
  takenAt?: string;
  lat?: number;
  lng?: number;
}

export function readExif(buf: ArrayBuffer): ExifInfo {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return {};
  let off = 2;
  while (off + 4 <= v.byteLength) {
    if (v.getUint8(off) !== 0xff) break;
    const marker = v.getUint8(off + 1);
    const len = v.getUint16(off + 2);
    if (marker === 0xe1 && off + 10 <= v.byteLength && v.getUint32(off + 4) === 0x45786966 /* "Exif" */) {
      return parseTiff(v, off + 10, Math.min(v.byteLength, off + 2 + len));
    }
    if (marker === 0xda) break; // start of image data: no EXIF before it
    off += 2 + len;
  }
  return {};
}

function parseTiff(v: DataView, start: number, end: number): ExifInfo {
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number) => v.getUint16(o, le);
  const u32 = (o: number) => v.getUint32(o, le);
  const ok = (o: number, n = 1) => o >= start && o + n <= end;
  type Entry = { tag: number; type: number; count: number; valueOff: number };
  const entries = (ifd: number): Entry[] => {
    if (!ok(ifd, 2)) return [];
    const n = u16(ifd);
    const out: Entry[] = [];
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (!ok(e, 12)) break;
      out.push({ tag: u16(e), type: u16(e + 2), count: u32(e + 4), valueOff: e + 8 });
    }
    return out;
  };
  const size = (type: number) => ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type as 1] ?? 1;
  const dataOff = (e: Entry) => (size(e.type) * e.count > 4 ? start + u32(e.valueOff) : e.valueOff);
  const ascii = (e: Entry) => {
    const o = dataOff(e);
    let s = "";
    for (let i = 0; i < e.count && ok(o + i); i++) {
      const c = v.getUint8(o + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  const rationals = (e: Entry) => {
    const o = dataOff(e);
    const r: number[] = [];
    for (let i = 0; i < e.count && ok(o + i * 8, 8); i++) {
      const d = u32(o + i * 8 + 4);
      r.push(d ? u32(o + i * 8) / d : 0);
    }
    return r;
  };

  const info: ExifInfo = {};
  const ifd0 = entries(start + u32(start + 4));
  let exifIfd: number | null = null;
  let gpsIfd: number | null = null;
  let dateTime: string | null = null;
  for (const e of ifd0) {
    if (e.tag === 0x8769) exifIfd = start + u32(e.valueOff);
    if (e.tag === 0x8825) gpsIfd = start + u32(e.valueOff);
    if (e.tag === 0x0132) dateTime = ascii(e);
  }
  let original: string | null = null;
  if (exifIfd) for (const e of entries(exifIfd)) if (e.tag === 0x9003) original = ascii(e);
  const when = original || dateTime;
  // "2026:11:19 14:03:22" (camera local time) → ISO, read as local time.
  const m = when?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (m) {
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    if (!Number.isNaN(d.getTime())) info.takenAt = d.toISOString();
  }
  if (gpsIfd) {
    let latRef = "N";
    let lngRef = "E";
    let lat: number[] | null = null;
    let lng: number[] | null = null;
    for (const e of entries(gpsIfd)) {
      if (e.tag === 1) latRef = ascii(e) || "N";
      if (e.tag === 2) lat = rationals(e);
      if (e.tag === 3) lngRef = ascii(e) || "E";
      if (e.tag === 4) lng = rationals(e);
    }
    const dms = (r: number[]) => (r[0] ?? 0) + (r[1] ?? 0) / 60 + (r[2] ?? 0) / 3600;
    if (lat && lng && (lat[0] || lng[0])) {
      info.lat = Math.round(dms(lat) * (latRef === "S" ? -1 : 1) * 1e6) / 1e6;
      info.lng = Math.round(dms(lng) * (lngRef === "W" ? -1 : 1) * 1e6) / 1e6;
    }
  }
  return info;
}
