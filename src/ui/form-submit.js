// Shared submit handling for desktop forms: disables the submit button while
// the request runs and shows a failure in the form's .form-error, else a toast.
export function formSubmitter(toast) {
  return async function submitForm(form, run, { onError, onDone } = {}) {
    const submit = form.querySelector('[type="submit"]');
    if (submit) submit.disabled = true;
    try { await run(); }
    catch (error) {
      onError?.(error);
      const target = document.querySelector(`#${form.getAttribute('id')} .form-error`);
      if (target) target.textContent = error.message; else toast(error.message, true);
    } finally {
      onDone?.(submit);
      if (submit?.isConnected) submit.disabled = false;
    }
  };
}
