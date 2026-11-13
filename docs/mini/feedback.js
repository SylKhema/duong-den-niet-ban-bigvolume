(() => {
  const floating = document.createElement('button');
  floating.type = 'button';
  floating.className = 'feedback-floating mini-feedback-floating';
  floating.hidden = true;
  document.body.append(floating);

  let selectedParagraph;
  let selectedText = '';

  function textBlock(node) {
    return (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)
      ?.closest('.feedback-paragraph .feedback-text');
  }

  function showSelection(block, excerpt = '') {
    const paragraph = block?.closest('.feedback-paragraph');
    if (!paragraph?.closest('[data-page]')) return;
    selectedParagraph?.classList.remove('feedback-selected');
    selectedParagraph = paragraph;
    selectedText = excerpt;
    paragraph.classList.add('feedback-selected');
    const english = paragraph.lang === 'en' || englishOnly;
    floating.textContent = english ? 'Comment on selected text' : 'Góp ý đoạn vừa chọn';
    floating.lang = english ? 'en' : 'vi';
    floating.hidden = false;
  }

  function clearSelection() {
    selectedParagraph?.classList.remove('feedback-selected');
    selectedParagraph = undefined;
    selectedText = '';
    floating.hidden = true;
  }

  function openFeedback(paragraph, excerpt = '') {
    const page = paragraph?.closest('[data-page]');
    const language = paragraph ? (paragraph.lang === 'en' || englishOnly ? 'en' : 'vi') : readingLanguage;
    const params = new URLSearchParams({ series: 'mini', volume: String(current), language });
    if (page) {
      params.set('anchor', paragraph.id || page.id);
      params.set('printed', page.dataset.printed || 'Bìa');
      params.set('pdf', page.dataset.pdf || '0');
      params.set('excerpt', (excerpt || paragraph.querySelector('.feedback-text').textContent).trim().slice(0, 2400));
    }
    window.open('/gop-y.html#' + params, '_blank', 'noopener');
  }

  document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;
    const start = textBlock(selection.anchorNode);
    const end = textBlock(selection.focusNode);
    const excerpt = selection.toString().trim();
    if (start && start === end && excerpt) showSelection(start, excerpt);
    else clearSelection();
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-open-feedback]')) {
      openFeedback();
      return;
    }
    if (event.target.closest('a, button, input, textarea, select, summary, dialog')) return;

    const block = textBlock(event.target);
    if (!block) {
      clearSelection();
      return;
    }
    if (window.getSelection()?.isCollapsed) showSelection(block);
  });

  floating.addEventListener('click', () => {
    if (selectedParagraph?.isConnected) openFeedback(selectedParagraph, selectedText);
    else clearSelection();
  });
  window.addEventListener('hashchange', clearSelection);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearSelection();
  });
})();
