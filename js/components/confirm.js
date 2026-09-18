export function confirmAction({ title = '¿Confirmar?', message = '', confirmText = 'Confirmar', danger = true } = {}) {
  return new Promise(resolve => {
    const dialog = document.getElementById('confirm-dialog');
    dialog.querySelector('#confirm-title').textContent = title;
    dialog.querySelector('#confirm-message').textContent = message;
    const btn = dialog.querySelector('#confirm-accept');
    btn.textContent = confirmText;
    btn.className = danger ? 'btn btn-danger' : 'btn btn-primary';

    // Any dismissal path (accept button, cancel button via data-close, Escape/backdrop)
    // ends up firing the dialog's native 'close' event exactly once — resolve there so
    // every path is handled uniformly instead of duplicating close logic per trigger.
    let accepted = false;
    const onAccept = () => {
      accepted = true;
      dialog.close();
    };
    const onClose = () => {
      btn.removeEventListener('click', onAccept);
      dialog.removeEventListener('close', onClose);
      resolve(accepted);
    };

    btn.addEventListener('click', onAccept);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}
