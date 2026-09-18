let toastTimer = null;
let undoAction = null;
let els = null;

export function initToast() {
  els = {
    toast: document.getElementById('toast'),
    message: document.getElementById('toast-message'),
    undoBtn: document.getElementById('toast-undo'),
  };
  els.undoBtn.addEventListener('click', () => {
    if (undoAction) undoAction();
    hideToast();
  });
}

export function showToast(message, { undo } = {}) {
  clearTimeout(toastTimer);
  els.message.textContent = message;
  undoAction = undo || null;
  els.undoBtn.classList.toggle('hide', !undo);
  els.toast.classList.remove('hide');
  toastTimer = setTimeout(hideToast, undo ? 6000 : 3500);
}

export function hideToast() {
  els.toast.classList.add('hide');
  undoAction = null;
}
