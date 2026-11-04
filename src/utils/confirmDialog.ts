// In-page replacement for window.confirm(), which some in-app browsers (KakaoTalk,
// the Claude desktop app) block or auto-cancel, making delete buttons appear to do nothing.
export function confirmDialog(message: string, confirmLabel = '삭제'): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px';
    const box = document.createElement('div');
    box.style.cssText = 'background:#fff;color:#1c1917;border-radius:16px;max-width:360px;width:100%;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.2);font-size:14px;line-height:1.5';
    const text = document.createElement('p');
    text.textContent = message;
    text.style.cssText = 'margin:0 0 16px;white-space:pre-wrap';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px';
    const button = (label: string, primary: boolean) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = primary
        ? 'padding:8px 16px;border-radius:10px;border:0;background:#e11d48;color:#fff;font-weight:600'
        : 'padding:8px 16px;border-radius:10px;border:1px solid #d6d3d1;background:#fff;color:#44403c';
      return b;
    };
    const cancel = button('취소', false);
    const ok = button(confirmLabel, true);
    const close = (value: boolean) => { document.removeEventListener('keydown', onKey); overlay.remove(); resolve(value); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(false); };
    cancel.onclick = () => close(false);
    ok.onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    document.addEventListener('keydown', onKey);
    row.append(cancel, ok);
    box.append(text, row);
    overlay.append(box);
    document.body.append(overlay);
    ok.focus();
  });
}
