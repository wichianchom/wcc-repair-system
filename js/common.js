/* ฟังก์ชันที่ใช้ร่วมกันทุกหน้า (โหลดหลัง config.js) */
(function () {
  const CFG = window.APP_CONFIG || {};

  const STATUS = {
    'รอการตรวจสอบ': { cls: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-500', icon: '⏳' },
    'ดำเนินการ':    { cls: 'bg-blue-100 text-blue-800 ring-blue-200',   dot: 'bg-blue-500',  icon: '🛠️' },
    'เสร็จสิ้น':     { cls: 'bg-green-100 text-green-800 ring-green-200', dot: 'bg-green-500', icon: '✅' },
    'ยกเลิก':       { cls: 'bg-red-100 text-red-700 ring-red-200',      dot: 'bg-red-500',   icon: '❌' }
  };
  const STATUS_LIST = Object.keys(STATUS);
  const DEFAULT_STATUS = 'รอการตรวจสอบ';

  const TYPES = {
    General: { label: 'งานทั่วไป', icon: '🏗️', cls: 'bg-teal-100 text-teal-700', hint: 'อาคาร / ประปา / ไฟฟ้า' },
    IT:      { label: 'งานไอที',   icon: '🖥️', cls: 'bg-indigo-100 text-indigo-700', hint: 'คอมพิวเตอร์ / เครื่องพิมพ์ / อินเทอร์เน็ต' }
  };

  // กันการฝังโค้ด HTML/JS จากข้อความที่ผู้ใช้กรอก — ใช้ทุกครั้งที่ใส่ข้อมูลลง innerHTML
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function statusOf(t) { return STATUS[t && t.status] ? t.status : DEFAULT_STATUS; }

  function statusBadge(status, extra) {
    const s = STATUS[status] ? status : DEFAULT_STATUS;
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ring-inset ${STATUS[s].cls} ${extra || ''}">` +
      `<span class="w-1.5 h-1.5 rounded-full ${STATUS[s].dot}"></span>${esc(s)}</span>`;
  }

  function typeBadge(type) {
    const t = TYPES[type] || TYPES.General;
    return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${t.cls}">${t.icon} ${t.label}</span>`;
  }

  function padNo(n) { return n ? String(n).padStart(4, '0') : '----'; }

  function toDate(ts) {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    const d = new Date(ts);
    return isNaN(d) ? null : d;
  }

  // "2 พ.ย. 69 14:30"
  function formatDate(ts) {
    const d = toDate(ts);
    if (!d) return '-';
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' +
      d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  // { day: '2', month: 'พฤศจิกายน', year: '2569' }
  function thaiDateParts(ts) {
    const d = toDate(ts) || new Date();
    const parts = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const get = type => (parts.find(p => p.type === type) || {}).value || '';
    return { day: get('day'), month: get('month'), year: get('year').replace(/[^\d]/g, '') };
  }

  function driveThumb(id, size) { return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w${size || 800}` : ''; }
  function driveView(id) { return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : ''; }

  // ย่อรูปในเครื่องก่อนส่ง: ด้านยาวไม่เกิน maxSide px, บีบเป็น JPEG
  async function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 1600;
    quality = quality || 0.75;
    if (!file || !/^image\//.test(file.type)) throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error('เปิดรูปนี้ไม่ได้ ลองถ่ายใหม่หรือเลือกรูปอื่น'));
        i.src = url;
      });
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      return { dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', bytes: Math.round((dataUrl.length - 23) * 0.75) };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // อัปโหลดรูปไป Apps Script → Google Drive (ไม่ใส่ Content-Type เพื่อไม่ให้ติด CORS)
  async function uploadImage(img) {
    if (!configReady().appsScript) throw new Error('ยังไม่ได้ตั้งค่า appsScriptUrl ใน js/config.js');
    const res = await fetch(CFG.appsScriptUrl, {
      method: 'POST',
      body: JSON.stringify({ action: 'uploadImage', data: img.base64, mimeType: img.mimeType })
    });
    const text = await res.text();
    let out;
    try { out = JSON.parse(text); } catch (e) { throw new Error('Apps Script ตอบกลับผิดรูปแบบ (ตรวจการ Deploy ว่าเปิดให้ Anyone ใช้งาน)'); }
    if (out.status !== 'success') throw new Error(out.message || 'อัปโหลดรูปไม่สำเร็จ');
    return out.fileId;
  }

  function configReady() {
    const f = CFG.firebase || {};
    const filled = v => typeof v === 'string' && v.length > 0 && !/^ใส่/.test(v);
    return {
      firebase: filled(f.apiKey) && filled(f.projectId) && filled(f.appId),
      appsScript: filled(CFG.appsScriptUrl) && /^https:\/\/script\.google\.com\//.test(CFG.appsScriptUrl)
    };
  }

  function toast(msg, type) {
    let box = document.getElementById('toast-box');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toast-box';
      box.className = 'fixed z-[2000] top-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none';
      document.body.appendChild(box);
    }
    const color = type === 'error' ? 'bg-red-600' : type === 'warn' ? 'bg-amber-600' : 'bg-gray-900';
    const el = document.createElement('div');
    el.className = `${color} text-white text-sm px-4 py-3 rounded-xl shadow-lg transition-opacity duration-300`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, type === 'error' ? 6000 : 3500);
  }

  function firestoreErrorText(err) {
    const code = err && err.code || '';
    if (code === 'permission-denied') return 'ไม่มีสิทธิ์เข้าถึงข้อมูล (ตรวจว่า Publish ไฟล์ firestore.rules แล้ว)';
    if (code === 'unavailable') return 'เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจสอบอินเทอร์เน็ต';
    if (code === 'failed-precondition') return 'ฐานข้อมูลยังไม่พร้อม (ตรวจว่าสร้าง Firestore Database แล้ว)';
    return (err && err.message) || String(err);
  }

  // ป้องกันสูตรอันตรายเมื่อเปิด CSV ใน Excel/Sheets
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function storageGet(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; } }
  function storageSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* ignore */ } }

  // ---------- ผู้ลงนามในบันทึกข้อความ ----------
  // ลำดับช่องลงนาม (ตำแหน่งและหัวข้อมาจาก CFG.approvers / ชื่อแก้ได้ที่หน้าเจ้าหน้าที่ > ผู้ลงนาม)
  const SIGNER_SLOTS = ['generalHead', 'generalDeputy', 'supplyOfficer', 'supplyHead', 'budgetHead', 'budgetDeputy', 'director'];

  // วันที่แบบ YYYY-MM-DD ตามเวลาไทย
  function ymd(d) {
    d = toDate(d) || new Date();
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  }

  function defaultSubNote(slot) {
    const a = (CFG.approvers || {})[slot] || {};
    if (slot === 'director') return 'รักษาราชการแทน' + (a.sign || '');
    return 'ปฏิบัติหน้าที่แทน' + ((a.heading || '').replace(/^ความคิดเห็นของ/, '') || a.sign || '');
  }

  function subActiveOn(sub, day) {
    if (!sub || !sub.on || !sub.name) return false;
    if (sub.from && day < sub.from) return false;
    if (sub.to && day > sub.to) return false;
    return true;
  }

  // ชื่อที่ใช้จริงในช่องลงนาม: เปลี่ยนเฉพาะใบ > ผู้ปฏิบัติหน้าที่แทน (ตามวันที่ของใบ) > ชื่อปกติ
  function resolveSigner(slot, settings, ticket) {
    const base = (CFG.approvers || {})[slot] || {};
    const s = (settings && settings.slots && settings.slots[slot]) || {};
    const own = ticket && ticket.signers && ticket.signers[slot];
    if (own && own.name) return Object.assign({}, base, { name: own.name, note: own.note || '', source: 'ticket' });
    if (subActiveOn(s.sub, ymd(ticket && ticket.createdAt))) {
      return Object.assign({}, base, { name: s.sub.name, note: s.sub.note || '', source: 'sub' });
    }
    return Object.assign({}, base, { name: s.name || base.name || '', note: '', source: 'default' });
  }

  window.App = {
    CFG, STATUS, STATUS_LIST, DEFAULT_STATUS, TYPES,
    esc, statusOf, statusBadge, typeBadge, padNo, toDate, formatDate, thaiDateParts,
    driveThumb, driveView, compressImage, uploadImage, configReady, toast, firestoreErrorText,
    csvCell, storageGet, storageSet,
    SIGNER_SLOTS, ymd, defaultSubNote, subActiveOn, resolveSigner
  };
})();
