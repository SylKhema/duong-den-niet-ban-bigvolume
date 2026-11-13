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

  function updateVolumes(selected = volume.value) {
    volume.replaceChildren();
    const mini = series.value === 'mini';
    for (let number = 1; number <= (mini ? 9 : 5); number++) {
      const option = document.createElement('option');
      option.value = String(number);
      option.textContent = label(mini ? 'Cuốn' : 'Tập', 'Volume') + ' ' + number;
      volume.append(option);
    }
    volume.value = [...volume.options].some(option => option.value === selected) ? selected : '1';
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

  function renderStatus() {
    let sendText = '';
    if (sendState?.pending) sendText = label('Đang gửi…', 'Sending…');
    else if (sendState?.id) sendText = label('Đã lưu góp ý. Mã tiếp nhận ', 'Feedback saved. Receipt code ') + sendState.id;
    else if (sendState) {
      if (displayLanguage === 'vi' && sendState.detail) sendText = sendState.detail;
      else if (sendState.code === 429) sendText = label('Hệ thống đang nhận nhiều góp ý. Vui lòng thử lại sau một phút.', 'Too many submissions. Please try again in a minute.');
      else if (sendState.code === 400 || sendState.code === 413) sendText = label('Vui lòng kiểm tra các trường trong biểu mẫu.', 'Please check the form fields and their length limits.');
      else sendText = label('Chưa gửi được góp ý. Vui lòng thử lại.', 'Your feedback could not be saved. Please try again.');
    }
    field('send-result').textContent = sendText;

    let lookupText = '';
    if (lookupState?.pending) lookupText = label('Đang tra cứu…', 'Checking status…');
    else if (lookupState?.data) {
      const data = lookupState.data;
      lookupText = data.id + '\n' + label('Trạng thái: ', 'Status: ') + (statusLabels[displayLanguage][data.status] || data.status) +
        '\n' + label('Cập nhật: ', 'Updated: ') + new Date(data.updated_at).toLocaleString(label('vi-VN', 'en'));
    } else if (lookupState?.code === 404) lookupText = label('Không tìm thấy mã này.', 'No feedback was found for this receipt code.');
    else if (lookupState?.code === 400) lookupText = label('Mã tra cứu chưa đúng.', 'Please enter a valid receipt code.');
    else if (lookupState) lookupText = label('Chưa thể tra cứu. Vui lòng thử lại sau.', 'Status is unavailable. Please try again.');
    field('answer').textContent = lookupText;
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
    lookupState = { pending: true };
    renderStatus();
    try {
      const response = await fetch('/api/feedback?id=' + encodeURIComponent(field('receipt').value.trim()));
      const data = await response.json();
      if (sequence === lookupSequence) lookupState = response.ok ? { data } : { code: response.status };
    } catch {
      if (sequence === lookupSequence) lookupState = {};
    }
    renderStatus();
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
  updateVolumes(incomingVolume);
  choices.forEach(button => button.onclick = () => setDisplayLanguage(button.dataset.displayLanguage));
  series.onchange = () => { updateVolumes('1'); clearContext(); };
  volume.onchange = clearContext;
  field('lookup').onsubmit = event => { event.preventDefault(); lookup(); };
  if (query.has('id')) {
    field('receipt').value = query.get('id');
    lookup();
  }

  form.onsubmit = async event => {
    event.preventDefault();
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
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.received) {
        sendState = { code: response.status, detail: data.error };
        return;
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
    } catch {
      sendState = {};
    } finally {
      renderStatus();
      button.disabled = false;
    }
  };
})();
