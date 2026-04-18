<script>
  let b64 = null, mime = null, pStyle = 'midjourney', activeTab = 'full', promptData = {};

  const elements = {
    provider: document.getElementById('provider'),
    apiKey: document.getElementById('apiKey'),
    providerLink: document.getElementById('providerLink'),
    dz: document.getElementById('dz'),
    fileIn: document.getElementById('fileIn'),
    prevBox: document.getElementById('prevBox'),
    prevImg: document.getElementById('prevImg'),
    genBtn: document.getElementById('genBtn'),
    errBox: document.getElementById('errBox'),
    loading: document.getElementById('loadingState'),
    empty: document.getElementById('emptyState'),
    result: document.getElementById('resultBox'),
    copy: document.getElementById('copyBtn')
  };

  const providers = {
    anthropic: { 
      link: 'https://console.anthropic.com', 
      placeholder: 'sk-ant-api...',
      model: 'claude-3-5-sonnet-20240620'
    },
    openai: { 
      link: 'https://platform.openai.com', 
      placeholder: 'sk-proj-...',
      model: 'gpt-4o'
    },
    google: { 
      link: 'https://aistudio.google.com', 
      placeholder: 'AIzaSy...',
      model: 'gemini-1.5-pro'
    }
  };

  elements.provider.addEventListener('change', () => {
    const p = providers[elements.provider.value];
    elements.providerLink.href = p.link;
    elements.providerLink.textContent = p.link.replace('https://', '');
    elements.apiKey.placeholder = p.placeholder;
  });

  document.getElementById('eyeBtn').addEventListener('click', () => {
    elements.apiKey.type = elements.apiKey.type === 'password' ? 'text' : 'password';
  });

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = e => {
      b64 = e.target.result.split(',')[1];
      mime = f.type;
      elements.prevImg.src = e.target.result;
      elements.dz.style.display = 'none';
      elements.prevBox.classList.add('show');
      checkReady();
    };
    reader.readAsDataURL(f);
  }

  elements.fileIn.addEventListener('change', e => handleFile(e.target.files[0]));
  elements.dz.addEventListener('dragover', e => { e.preventDefault(); elements.dz.classList.add('over'); });
  elements.dz.addEventListener('dragleave', () => elements.dz.classList.remove('over'));
  elements.dz.addEventListener('drop', e => { e.preventDefault(); elements.dz.classList.remove('over'); handleFile(e.dataTransfer.files[0]); });
  
  document.getElementById('clearBtn').addEventListener('click', () => {
    b64 = null; elements.prevBox.classList.remove('show'); elements.dz.style.display = 'flex'; checkReady();
  });

  function checkReady() { elements.genBtn.disabled = !(b64 && elements.apiKey.value.trim()); }
  elements.apiKey.addEventListener('input', checkReady);

  document.getElementById('chips').addEventListener('click', e => {
    if (!e.target.classList.contains('chip')) return;
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
    e.target.classList.add('on');
    pStyle = e.target.dataset.v;
  });

  document.getElementById('tabs').addEventListener('click', e => {
    if (!e.target.classList.contains('tab')) return;
    activeTab = e.target.dataset.t;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
    e.target.classList.add('on');
    ['pFull', 'pShort', 'pTags', 'pNeg'].forEach(id => document.getElementById(id).style.display = 'none');
    const map = { full: 'pFull', short: 'pShort', tags: 'pTags', negative: 'pNeg' };
    document.getElementById(map[activeTab]).style.display = activeTab === 'tags' ? 'flex' : 'block';
  });

  elements.genBtn.addEventListener('click', async () => {
    const key = elements.apiKey.value.trim();
    const provider = elements.provider.value;
    const detail = document.getElementById('detail').value;
    
    elements.errBox.classList.remove('show');
    elements.empty.style.display = 'none';
    elements.result.classList.remove('show');
    elements.loading.classList.add('show');
    elements.genBtn.disabled = true;

    const systemPrompt = `Analyze the image and return ONLY a JSON object: {"full":"...","short":"...","tags":["tag1","tag2"],"negative":"..."}. Style: ${pStyle}. Detail level: ${detail}. Ensure the response is valid JSON.`;

    try {
      let response, resultText;

      if (provider === 'anthropic') {
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: providers.anthropic.model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }, { type: 'text', text: "Generate prompt JSON." }] }]
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Anthropic API Error');
        resultText = data.content[0].text;

      } else if (provider === 'openai') {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
          body: JSON.stringify({
            model: providers.openai.model,
            messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: [{ type: 'text', text: "Describe this image for an AI generator in the requested JSON format." }, { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }] }]
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'OpenAI API Error');
        resultText = data.choices[0].message.content;

      } else if (provider === 'google') {
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: systemPrompt + " Analyze this image." }, { inline_data: { mime_type: mime, data: b64 } }] }]
          })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Gemini API Error');
        if (!data.candidates || data.candidates.length === 0) throw new Error('Gemini blocked the response (Safety Filters). Try a different image.');
        resultText = data.candidates[0].content.parts[0].text;
      }

      // Cleanup JSON backticks if present
      const cleanJson = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) throw new Error("AI did not return valid JSON. Try again.");
      
      const parsed = JSON.parse(jsonMatch[0]);
      promptData = parsed;

      document.getElementById('pFull').textContent = parsed.full || '';
      document.getElementById('pShort').textContent = parsed.short || '';
      document.getElementById('pNeg').textContent = parsed.negative || '';
      const tagsBox = document.getElementById('pTags');
      tagsBox.innerHTML = '';
      (parsed.tags || []).forEach(t => {
        const span = document.createElement('span'); span.className = 'tag'; span.textContent = t; tagsBox.appendChild(span);
      });

      elements.loading.classList.remove('show');
      elements.result.classList.add('show');
    } catch (err) {
      console.error(err);
      elements.loading.classList.remove('show');
      elements.empty.style.display = 'flex';
      elements.errBox.textContent = err.message;
      elements.errBox.classList.add('show');
    } finally {
      elements.genBtn.disabled = false;
      checkReady();
    }
  });

  elements.copy.addEventListener('click', () => {
    let text = activeTab === 'tags' ? (promptData.tags || []).join(', ') : promptData[activeTab];
    if (!text) return;
    navigator.clipboard.writeText(text);
    elements.copy.textContent = '✓';
    elements.copy.classList.add('ok');
    setTimeout(() => { elements.copy.textContent = 'copy'; elements.copy.classList.remove('ok'); }, 2000);
  });
</script>