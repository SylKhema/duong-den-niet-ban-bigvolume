(() => {
  const params = new URLSearchParams(location.hash.slice(1) || location.search);
  const field = id => document.getElementById(id);
  const series = field('series');
  const volume = field('volume');
  const language = field('language');
  const result = field('send-result');
  const form = field('submit-feedback');
  let context;
  let receipt = 'GY-' + crypto.randomUUID();

  function updateVolumes() {
    volume.replaceChildren();
    const mini = series.value === 'mini';
    for (let number = 1; number <= (mini ? 9 : 5); number++) {
      const option = new Option((mini ? 'Cuốn ' : 'Tập ') + number, String(number));
      volume.add(option);
    }
  }

  function clearContext() {
    context = undefined;
    field('location').textContent = '';
    receipt = 'GY-' + crypto.randomUUID();
  }

  series.value = params.get('series') === 'mini' ? 'mini' : 'big';
  updateVolumes();
  const incomingVolume = params.get('volume');
  if ([...volume.options].some(option => option.value === incomingVolume)) volume.value = incomingVolume;
  const incomingLanguage = params.get('language');
  if (['vi', 'en', 'bi'].includes(incomingLanguage)) language.value = incomingLanguage;
  const anchor = params.get('anchor') || '';
  if (/^M0[1-9]-[\w-]+$/.test(anchor) && anchor.startsWith('M0' + volume.value + '-') && series.value === 'mini') {
    context = {
      anchor,
      printed: (params.get('printed') || 'Bìa').slice(0, 80),
      pdfPage: Number(params.get('pdf')),
      excerpt: (params.get('excerpt') || '').slice(0, 2400),
    };
    field('location').textContent = 'Vị trí được chọn · ' + context.printed + (context.pdfPage ? ' · PDF ' + context.pdfPage : '');
  }

  series.onchange = () => { updateVolumes(); clearContext(); };
  volume.onchange = clearContext;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    result.textContent = 'Đang gửi…';
    const payload = {
      ...(context || { anchor: 'general', printed: 'Góp ý chung', pdfPage: series.value === 'mini' ? 0 : 1, excerpt: '' }),
      id: receipt,
      series: series.value,
      volume: Number(volume.value),
      language: language.value,
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
      if (!response.ok || !data.received) throw Error(data.error || 'Chưa nhận được xác nhận lưu.');
      result.textContent = 'Đã lưu góp ý. Mã tiếp nhận ' + data.id;
      field('receipt').value = data.id;
      try {
        const recent = JSON.parse(localStorage.getItem('nibbana-feedback-receipts') || '[]');
        recent.unshift({ id: data.id, at: new Date().toISOString() });
        localStorage.setItem('nibbana-feedback-receipts', JSON.stringify(recent.slice(0, 30)));
      } catch {}
      for (const name of ['message', 'suggestion', 'reference', 'name', 'email']) field(name).value = '';
      field('consent').checked = false;
      receipt = 'GY-' + crypto.randomUUID();
    } catch (error) {
      result.textContent = error.message || 'Chưa gửi được góp ý.';
    } finally {
      button.disabled = false;
    }
  };
})();
