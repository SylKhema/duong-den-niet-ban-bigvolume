(() => {
  const query = new URLSearchParams(location.search);
  const params = new URLSearchParams(location.hash.slice(1) || location.search);
  const field = id => document.getElementById(id);
  const series = field('series');
  const volume = field('volume');
  const language = field('language');
  const form = field('submit-feedback');
  const choices = document.querySelectorAll('[data-display-language]');
  const optionLabels = {
    en: {
      series: { big: 'Complete Edition', mini: 'Abridged Edition' },
      language: { vi: 'Vietnamese', en: 'English', bi: 'Vietnamese–English' },
      category: { translation: 'Possible translation error or omission', typo: 'Typo or formatting issue', terminology: 'Terminology', question: 'Question', other: 'Other feedback' },
    },
    vi: {
      series: { big: 'Bộ Đại', mini: 'Bộ Tóm Lược' },
      language: { vi: 'Việt', en: 'English', bi: 'Việt–Anh' },
      category: { translation: 'Nghi dịch sai hoặc thiếu', typo: 'Lỗi chữ hoặc trình bày', terminology: 'Thuật ngữ', question: 'Câu hỏi', other: 'Góp ý khác' },
    },
  };
  const statusLabels = {
    en: { new: 'Received', reviewing: 'Under review', approved: 'Correction approved', 'needs-info': 'More information needed', resolved: 'Corrected', unchanged: 'Wording kept with explanation', duplicate: 'Duplicate' },
    vi: { new: 'Mới nhận', reviewing: 'Đang đối chiếu', approved: 'Đã duyệt bản sửa', 'needs-info': 'Cần thêm căn cứ', resolved: 'Đã sửa', unchanged: 'Giữ nguyên và giải thích', duplicate: 'Góp ý trùng' },
  };
  let displayLanguage;
  let context;
  let receipt = 'GY-' + crypto.randomUUID();
  let sendState;
  let lookupState;
  let lookupSequence = 0;

  function label(vi, en) {
    return displayLanguage === 'en' ? en : vi;
  }

  function validateVolume() {
    const volNum = Number(volume.value);
    if (series.value === 'big' && (!Number.isInteger(volNum) || volNum < 1 || volNum > 5)) {
      const msg = label(
        'Bộ Đại chỉ có Tập 1–5. Vui lòng chọn Tập 1–5 hoặc chuyển sang Bộ Tóm Lược.',
        'Complete Edition only has Volumes 1–5. Please choose Volume 1–5 or switch to Abridged Edition.'
      );
      if (typeof volume.setCustomValidity === 'function') volume.setCustomValidity(msg);
      if (typeof volume.setAttribute === 'function') volume.setAttribute('aria-invalid', 'true');
      return msg;
    }
    if (typeof volume.setCustomValidity === 'function') volume.setCustomValidity('');
    if (typeof volume.removeAttribute === 'function') volume.removeAttribute('aria-invalid');
    return '';
  }

  function updateVolumes(selected = volume.value) {
    volume.replaceChildren();
    const mini = series.value === 'mini';
    // Keep options 1–9 present and enabled so declarative WebMCP schemas expose all Mini volumes
    for (let number = 1; number <= 9; number++) {
      const option = document.createElement('option');
      option.value = String(number);
      if (mini) {
        option.textContent = label('Cuốn', 'Volume') + ' ' + number;
      } else if (number <= 5) {
        option.textContent = label('Tập', 'Volume') + ' ' + number;
      } else {
        option.textContent = label('Cuốn ' + number + ' (chỉ Bộ Tóm Lược)', 'Volume ' + number + ' (Abridged only)');
      }
      volume.append(option);
    }
    volume.value = [...volume.options].some(option => option.value === selected) ? selected : '1';
    validateVolume();
  }

  function renderContext() {
    field('location').hidden = !context;
    field('feedback-excerpt').textContent = context?.excerpt || '';
    field('feedback-excerpt').lang = context && ['vi', 'en'].includes(context.language) ? context.language : '';
    field('feedback-selection').hidden = !context?.excerpt;
    if (!context) return;
    const cover = context.anchor.includes('-cover-');
    const locationText = cover ? label('Bìa rời, không số', 'Unnumbered cover') :
      label('Trang Miến ', 'Burmese page ') + context.printed;
    field('location').textContent = label('Vị trí được chọn', 'Selected location') + ' · ' +
      locationText + (context.pdfPage ? ' · PDF ' + context.pdfPage : '');
  }

  function formatSendText(state) {
    if (!state) return '';
    if (state.pending) return label('Đang gửi…', 'Sending…');
    if (state.id) return label('Đã lưu góp ý. Mã tiếp nhận ', 'Feedback saved. Receipt code ') + state.id;
    if (state.localizedDetail) return state.localizedDetail;
    if (displayLanguage === 'vi' && state.detail) return state.detail;
    if (state.code === 429) return label('Hệ thống đang nhận nhiều góp ý. Vui lòng thử lại sau một phút.', 'Too many submissions. Please try again in a minute.');
    if (state.code === 400 || state.code === 413) return label('Vui lòng kiểm tra các trường trong biểu mẫu.', 'Please check the form fields and their length limits.');
    return label('Chưa gửi được góp ý. Vui lòng thử lại.', 'Your feedback could not be saved. Please try again.');
  }

  function formatLookupText(state) {
    if (!state) return '';
    if (state.pending) return label('Đang tra cứu…', 'Checking status…');
    if (state.data) {
      const data = state.data;
      return data.id + '\n' + label('Trạng thái: ', 'Status: ') + (statusLabels[displayLanguage][data.status] || data.status) +
        '\n' + label('Cập nhật: ', 'Updated: ') + new Date(data.updated_at).toLocaleString(label('vi-VN', 'en'));
    }
    if (state.code === 404) return label('Không tìm thấy mã này.', 'No feedback was found for this receipt code.');
    if (state.code === 400) return label('Mã tra cứu chưa đúng.', 'Please enter a valid receipt code.');
    return label('Chưa thể tra cứu. Vui lòng thử lại sau.', 'Status is unavailable. Please try again.');
  }

  function renderStatus() {
    field('send-result').textContent = formatSendText(sendState);
    field('answer').textContent = formatLookupText(lookupState);
  }

  function renderRecent() {
    const box = field('local');
    box.replaceChildren();
    try {
      const recent = JSON.parse(localStorage.getItem('nibbana-feedback-receipts') || '[]');
      if (!recent.length) return;
      const row = document.createElement('p');
      row.append(label('Mã gần đây trên thiết bị này: ', 'Recent receipt codes on this device: '));
      for (const item of recent) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = item.id;
        button.onclick = () => { field('receipt').value = item.id; lookup(); };
        row.append(button, ' ');
      }
      box.append(row);
    } catch {}
  }

  function setDisplayLanguage(value) {
    displayLanguage = value;
    document.documentElement.lang = value;
    document.title = label('Góp ý và tra cứu — Đường Đến Niết-bàn', 'Translation feedback — The Way to Nibbāna');
    choices.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.displayLanguage === value)));
    for (const [id, labels] of Object.entries(optionLabels[value])) {
      for (const option of field(id).options) option.textContent = labels[option.value];
    }
    updateVolumes();
    renderContext();
    renderStatus();
    renderRecent();
    field('feedback-back').href = value === 'en' ? '/?lang=en' : '/';
  }

  function clearContext() {
    context = undefined;
    receipt = 'GY-' + crypto.randomUUID();
    renderContext();
  }

  async function lookup() {
    const sequence = ++lookupSequence;
    const receiptId = field('receipt').value.trim();
    lookupState = { pending: true };
    renderStatus();
    let result;
    try {
      const data = await window.nibbanaFeedback.lookupFeedback(receiptId);
      const nextState = { data };
      if (sequence === lookupSequence) lookupState = nextState;
      result = {
        ok: true,
        id: data.id,
        status: data.status,
        statusLabel: statusLabels[displayLanguage][data.status] || data.status,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (err) {
      const nextState = { code: err?.status };
      if (sequence === lookupSequence) lookupState = nextState;
      result = {
        ok: false,
        id: receiptId,
        status: err?.status || 500,
        error: formatLookupText(nextState),
      };
    }
    renderStatus();
    return result;
  }

  async function submitFeedbackForm(agentInvoked = false) {
    const volumeError = validateVolume();
    if (volumeError) {
      sendState = { code: 400, localizedDetail: volumeError };
      renderStatus();
      if (!agentInvoked && typeof volume.reportValidity === 'function') volume.reportValidity();
      return { received: false, status: 400, error: volumeError };
    }
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    sendState = { pending: true };
    renderStatus();
    const payload = {
      anchor: context?.anchor || 'general',
      printed: context?.printed || 'Góp ý chung',
      pdfPage: context?.pdfPage ?? (series.value === 'mini' ? 0 : 1),
      excerpt: context?.excerpt || '',
      id: receipt, series: series.value, volume: Number(volume.value), language: language.value,
      consent: field('consent').checked,
    };
    for (const name of ['category', 'message', 'suggestion', 'reference', 'name', 'email', 'website']) {
      payload[name] = field(name).value;
    }
    let result;
    try {
      const data = await window.nibbanaFeedback.submitFeedback(payload);
      if (!data || !data.received) {
        sendState = { detail: 'Chưa nhận được xác nhận lưu.' };
        result = { received: false, status: 500, error: formatSendText(sendState) };
        return result;
      }
      sendState = { id: data.id };
      field('receipt').value = data.id;
      try {
        const recent = JSON.parse(localStorage.getItem('nibbana-feedback-receipts') || '[]');
        recent.unshift({ id: data.id, at: new Date().toISOString() });
        localStorage.setItem('nibbana-feedback-receipts', JSON.stringify(recent.slice(0, 30)));
      } catch {}
      for (const name of ['message', 'suggestion', 'reference', 'name', 'email']) field(name).value = '';
      field('consent').checked = false;
      receipt = 'GY-' + crypto.randomUUID();
      renderRecent();
      result = {
        received: true,
        id: data.id,
        status: data.status || 'new',
        message: formatSendText(sendState),
      };
    } catch (err) {
      sendState = { code: err?.status, detail: err?.message };
      result = {
        received: false,
        status: err?.status || 500,
        error: formatSendText(sendState),
      };
    } finally {
      renderStatus();
      button.disabled = false;
    }
    return result;
  }

  series.value = params.get('series') === 'mini' ? 'mini' : 'big';
  const incomingLanguage = params.get('language');
  if (['vi', 'en', 'bi'].includes(incomingLanguage)) language.value = incomingLanguage;
  const anchor = params.get('anchor') || '';
  const incomingVolume = params.get('volume');
  if (/^M0[1-9]-[\w-]+$/.test(anchor) && anchor.startsWith('M0' + incomingVolume + '-') && series.value === 'mini') {
    context = {
      anchor,
      printed: (params.get('printed') || 'Bìa').slice(0, 80),
      pdfPage: Number(params.get('pdf')),
      excerpt: (params.get('excerpt') || '').slice(0, 2400),
      language: incomingLanguage,
    };
  }
  const requested = query.get('ui');
  setDisplayLanguage(['vi', 'en'].includes(requested) ? requested : incomingLanguage === 'en' ? 'en' : 'vi');
  const maxInitialVolume = series.value === 'mini' ? 9 : 5;
  const validInitialVolume = incomingVolume && Number.isInteger(Number(incomingVolume)) &&
    Number(incomingVolume) >= 1 && Number(incomingVolume) <= maxInitialVolume ? incomingVolume : '1';
  updateVolumes(validInitialVolume);
  choices.forEach(button => button.onclick = () => setDisplayLanguage(button.dataset.displayLanguage));
  series.onchange = () => { updateVolumes(volume.value); clearContext(); };
  volume.onchange = () => { validateVolume(); clearContext(); };
  field('lookup').onsubmit = event => {
    event.preventDefault();
    const resultPromise = lookup();
    if (event.agentInvoked && typeof event.respondWith === 'function') {
      event.respondWith(resultPromise);
    }
  };
  if (query.has('id')) {
    field('receipt').value = query.get('id');
    lookup();
  }

  form.onsubmit = event => {
    event.preventDefault();
    const resultPromise = submitFeedbackForm(Boolean(event.agentInvoked));
    if (event.agentInvoked && typeof event.respondWith === 'function') {
      event.respondWith(resultPromise);
    }
  };
})();
