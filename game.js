(() => {
  'use strict';

  const KEY = 'tiem-mi-cay-save-v1';
  const BROTHS = ['kimchi', 'tom yum'];
  const SPICES = ['0', '1', '2'];
  const TOPPINGS = ['nấm', 'hải sản', 'bò'];
  const NAMES = [
    ['Mai', '👩🏻'], ['Nam', '👨🏽'], ['Linh', '👩🏽'], ['An', '🧑🏻'],
    ['Hà', '👩🏼'], ['Bình', '👨🏻'], ['Minh', '🧑🏽'], ['Vy', '👩🏻']
  ];
  const $ = (id) => document.getElementById(id);
  const defaults = () => ({ day: 1, money: 0, rating: 5, totalServed: 0,
    upgrades: { stove: 0, comfort: 0, recipe: 0 }, sound: false });
  const amount = (n) => `${Math.max(0, Math.round(n)).toLocaleString('vi-VN')}đ`;
  const spiceName = (n) => ({ '0': 'Dịu nhẹ', '1': 'Cay vừa', '2': 'Cay nhiều' })[n];
  const fmtClock = (n) => `${String(Math.floor(Math.max(0, n) / 60)).padStart(2, '0')}:${String(Math.ceil(Math.max(0, n)) % 60).padStart(2, '0')}`;
  function readSave() {
    try {
      const data = JSON.parse(localStorage.getItem(KEY));
      if (!data || !Number.isInteger(data.day) || data.day < 1) return defaults();
      const base = defaults();
      return { ...base, day: Math.min(999, data.day), money: Math.max(0, Number(data.money) || 0),
        rating: Math.min(5, Math.max(1, Number(data.rating) || 5)),
        totalServed: Math.max(0, Number(data.totalServed) || 0),
        upgrades: Object.fromEntries(Object.keys(base.upgrades).map(k => [k, Math.min(5, Math.max(0, Number(data.upgrades?.[k]) || 0))])),
        sound: !!data.sound };
    } catch { return defaults(); }
  }
  let save = readSave();
  let phase = 'prep', seconds = 75, target = 6, spawned = 0, handled = 0;
  let served = 0, lost = 0, earned = 0, spawnCounter = 0, nextId = 1;
  let customers = [], selectedId = null, recipe = { broth: null, spice: null, topping: null };
  let dish = null, cooking = null, modal = null, lastFrame = 0, toastTimer = null, audioCtx = null;

  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* Storage may be disabled. */ }
  }
  function tone(frequency = 700) {
    if (!save.sound) return;
    try {
      audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
      osc.type = 'sine'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(.045, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + .13);
      osc.connect(gain).connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + .14);
    } catch { /* Sound is optional. */ }
  }
  function toast(message) {
    const el = $('toast'); el.textContent = message; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2700);
  }
  function showModal(kicker, title, text, details, actions) {
    modal = true;
    $('modalKicker').textContent = kicker;
    $('modalTitle').textContent = title;
    $('modalText').textContent = text;
    $('modalDetails').innerHTML = details;
    $('modalActions').replaceChildren();
    actions.forEach(({ label, onClick, secondary }) => {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = label;
      if (secondary) button.className = 'secondary';
      button.addEventListener('click', onClick);
      $('modalActions').append(button);
    });
    $('modalBackdrop').hidden = false;
    $('modalActions').querySelector('button')?.focus();
  }
  function closeModal() {
    modal = false; $('modalBackdrop').hidden = true;
    lastFrame = performance.now();
    $('helpButton').focus();
  }
  const rules = '<ul class="tip-list"><li><b>1</b><span>Xem phiếu gọi món và chọn một khách.</span></li><li><b>2</b><span>Chọn đúng nước dùng, độ cay, topping rồi bấm Nấu mì.</span></li><li><b>3</b><span>Khi mì chín, chọn đúng khách và bấm Phục vụ.</span></li><li><b>4</b><span>Cuối ngày dùng tiền trong game để nâng cấp quán.</span></li></ul>';
  function openIntro() {
    showModal('MỞ CỬA TIỆM MÌ', save.day === 1 ? 'Chào mừng đến quán!' : `Tiệm mì đã tới ngày ${save.day}!`,
      'Khách sẽ gọi từng tô mì cay theo ý thích. Nấu đúng và phục vụ kịp lúc để quán được yêu mến.', rules,
      [{ label: save.day === 1 ? 'Mở quán ngày 1 →' : `Tiếp tục ngày ${save.day} →`, onClick: () => { closeModal(); startDay(); } }]);
  }
  function openHelp() {
    showModal('CÁCH CHƠI', 'Một tô mì đúng ý',
      'Ngày chơi tạm dừng khi bảng này đang mở. Tiến trình qua từng ngày được lưu trên trình duyệt hiện tại.', rules,
      [{ label: 'Quay lại trò chơi', onClick: closeModal },
        { label: 'Bắt đầu lại từ ngày 1', secondary: true, onClick: confirmReset }]);
  }
  function confirmReset() {
    showModal('XÓA TIẾN TRÌNH', 'Bắt đầu quán mới?',
      'Ngày chơi, tiền và nâng cấp đã lưu trên trình duyệt này sẽ được đặt lại.', '',
      [{ label: 'Giữ tiến trình', onClick: closeModal },
        { label: 'Đặt lại trò chơi', secondary: true, onClick: () => {
          save = defaults(); persist(); phase = 'prep'; customers = []; selectedId = null;
          cooking = null; dish = null; seconds = 75; served = 0; target = 6;
          recipe = { broth: null, spice: null, topping: null };
          render(); openIntro();
        } }]);
  }
  function makeOrder() {
    const who = NAMES[Math.floor(Math.random() * NAMES.length)];
    const pick = list => list[Math.floor(Math.random() * list.length)];
    const patience = Math.max(24, 43 - Math.min(save.day - 1, 5) * 2 + save.upgrades.comfort * 8);
    return { id: nextId++, name: who[0], avatar: who[1], broth: pick(BROTHS), spice: pick(SPICES), topping: pick(TOPPINGS), patience, maxPatience: patience };
  }
  function spawnCustomer() {
    if (spawned >= target || customers.length >= 3) return;
    const customer = makeOrder(); customers.push(customer); spawned++;
    if (selectedId === null) selectedId = customer.id;
    renderCustomers(); renderKitchen();
    tone(520);
  }
  function startDay() {
    phase = 'live'; seconds = 75; target = 6 + Math.min(save.day - 1, 4);
    spawned = 0; handled = 0; served = 0; lost = 0; earned = 0;
    spawnCounter = 0; customers = []; selectedId = null; dish = null; cooking = null;
    recipe = { broth: null, spice: null, topping: null };
    spawnCustomer(); spawnCustomer(); render(); lastFrame = performance.now();
    toast('Quán đã mở cửa! Bắt đầu nhận đơn nào.');
  }
  function endDay() {
    if (phase !== 'live') return;
    phase = 'summary'; cooking = null; dish = null; customers = []; selectedId = null;
    save.totalServed += served; persist(); render(); openSummary();
  }
  function upgradeCost(type) {
    const base = { stove: 90, comfort: 80, recipe: 110 }[type];
    return base + save.upgrades[type] * 75;
  }
  function upgrade(type) {
    if (phase !== 'summary' || !['stove', 'comfort', 'recipe'].includes(type)) return;
    if (save.upgrades[type] >= 3) return;
    const cost = upgradeCost(type);
    if (save.money < cost) { toast('Chưa đủ tiền trong game để nâng cấp.'); return; }
    save.money -= cost; save.upgrades[type]++; persist(); tone(840); render(); openSummary();
    toast('Nâng cấp quán thành công!');
  }
  function openSummary() {
    const summary = `<div class="summary-grid"><div><strong>${served}</strong><span>tô đã bán</span></div><div><strong>${lost}</strong><span>khách đã rời đi</span></div><div><strong>+${amount(earned)}</strong><span>doanh thu</span></div></div><div class="upgrade-title">NÂNG CẤP QUÁN CHO NGÀY MAI</div><div class="upgrade-list" id="upgradeList"></div>`;
    showModal(`KẾT THÚC NGÀY ${save.day}`, served >= Math.ceil(target / 2) ? 'Một ngày thật nhộn nhịp!' : 'Ngày mai mình thử tiếp nhé!',
      `Quán hiện có ${amount(save.money)} và ${save.rating.toFixed(1).replace('.', ',')} sao. Chọn nâng cấp nếu bạn muốn.`, summary,
      [{ label: `Sang ngày ${save.day + 1} →`, onClick: () => { save.day++; persist(); closeModal(); startDay(); } }]);
    const upgrades = [
      ['stove', '🔥 Bếp nhanh', 'Rút ngắn thời gian nấu mỗi tô.'],
      ['comfort', '🪑 Ghế êm', 'Khách chờ lâu hơn.'],
      ['recipe', '📖 Bí quyết', 'Bán mỗi tô đúng món được thêm tiền.']
    ];
    upgrades.forEach(([key, label, detail]) => {
      const button = document.createElement('button'); button.className = 'upgrade-item';
      button.type = 'button';
      const maxed = save.upgrades[key] >= 3;
      button.disabled = maxed || save.money < upgradeCost(key);
      button.innerHTML = `<span><strong>${label} · Cấp ${save.upgrades[key]}/3</strong><small>${detail}</small></span><span class="upgrade-cost">${maxed ? 'Tối đa' : amount(upgradeCost(key))}</span>`;
      button.addEventListener('click', () => upgrade(key));
      $('upgradeList').append(button);
    });
  }
  function selectRecipe(field, value) {
    if (phase !== 'live' || cooking || dish) return false;
    if (!({ broth: BROTHS, spice: SPICES, topping: TOPPINGS })[field]?.includes(value)) return false;
    recipe[field] = value; renderRecipe(); renderKitchen(); tone(440); return true;
  }
  function cook() {
    if (phase !== 'live' || cooking || dish || Object.values(recipe).some(v => v === null)) return false;
    dish = { ...recipe };
    cooking = { elapsed: 0, total: Math.max(1.8, 4.2 - .75 * save.upgrades.stove) };
    renderKitchen(); renderRecipe(); tone(390); return true;
  }
  function serve() {
    if (phase !== 'live' || !dish || cooking) return false;
    const customer = customers.find(c => c.id === selectedId);
    if (!customer) { toast('Hãy chọn một khách để phục vụ.'); return false; }
    const correct = customer.broth === dish.broth && customer.spice === dish.spice && customer.topping === dish.topping;
    customers = customers.filter(c => c.id !== customer.id);
    handled++;
    if (correct) {
      const price = 28 + (customer.topping === 'hải sản' ? 8 : customer.topping === 'bò' ? 6 : 0) + save.upgrades.recipe * 7;
      save.money += price; earned += price; served++;
      save.rating = Math.min(5, save.rating + .07);
      toast(`Đúng món! +${amount(price)} · ${customer.name} rất vui.`); tone(900);
    } else {
      save.rating = Math.max(1, save.rating - .35); lost++;
      toast(`Chưa đúng đơn của ${customer.name}. Hãy đọc kỹ phiếu gọi món!`); tone(270);
    }
    selectedId = customers[0]?.id ?? null;
    dish = null; recipe = { broth: null, spice: null, topping: null };
    persist(); render();
    if (spawned >= target && customers.length === 0) endDay();
    return correct;
  }
  function tick(dt) {
    if (phase !== 'live' || modal) return;
    const delta = Math.min(dt, .1);
    seconds = Math.max(0, seconds - delta);
    spawnCounter += delta;
    if (spawnCounter >= 8.5 && spawned < target && customers.length < 3) {
      spawnCounter = 0; spawnCustomer();
    }
    let queueChanged = false;
    for (const c of [...customers]) {
      c.patience -= delta;
      if (c.patience <= 0) {
        customers = customers.filter(item => item.id !== c.id);
        if (selectedId === c.id) selectedId = customers[0]?.id ?? null;
        handled++; lost++; queueChanged = true; save.rating = Math.max(1, save.rating - .22);
        persist(); toast(`${c.name} đã rời quán. Hãy thử nhanh tay hơn!`);
      }
    }
    if (cooking) {
      cooking.elapsed += delta;
      if (cooking.elapsed >= cooking.total) { cooking = null; tone(780); toast('Mì đã chín! Chọn khách để phục vụ.'); renderKitchen(); renderRecipe(); }
    }
    if (seconds <= 0 || (spawned >= target && customers.length === 0 && handled >= target)) { endDay(); return; }
    renderStatus();
    if (queueChanged) renderCustomers();
    else customers.forEach(c => {
      const bar = document.querySelector(`[data-customer-id="${c.id}"] .patience`);
      if (bar) { bar.classList.toggle('low', c.patience / c.maxPatience < .3); bar.firstElementChild.style.width = `${Math.max(0, c.patience / c.maxPatience * 100)}%`; }
    });
    if (cooking) $('cookProgressFill').style.width = `${Math.min(100, cooking.elapsed / cooking.total * 100)}%`;
  }
  function renderStatus() {
    $('dayLabel').textContent = String(save.day).padStart(2, '0');
    $('footerDay').textContent = String(save.day).padStart(2, '0');
    $('moneyLabel').textContent = amount(save.money);
    $('ratingLabel').textContent = '★'.repeat(Math.round(save.rating)) + '☆'.repeat(5 - Math.round(save.rating));
    $('ratingLabel').title = `${save.rating.toFixed(1)} trên 5 sao`;
    $('servedLabel').textContent = `${served} / ${target} phần`;
    $('phaseLabel').textContent = phase === 'live' ? 'ĐANG PHỤC VỤ' : phase === 'summary' ? 'HẾT NGÀY' : 'CHUẨN BỊ MỞ QUÁN';
    $('livePip').classList.toggle('live', phase === 'live');
    $('clockLabel').textContent = fmtClock(seconds);
    $('progressFill').style.width = `${Math.max(0, (75 - seconds) / 75 * 100)}%`;
    $('footerMessage').textContent = phase === 'live' ? 'Nấu đúng món, phục vụ đúng khách.' : 'Một ngày ngon miệng đang chờ!';
    $('soundLabel').textContent = `Âm thanh: ${save.sound ? 'Bật' : 'Tắt'}`;
    $('soundButton').setAttribute('aria-label', save.sound ? 'Tắt âm thanh' : 'Bật âm thanh');
  }
  function renderCustomers() {
    $('queueCount').textContent = `${customers.length} khách`;
    const list = $('customerList');
    if (!customers.length) {
      list.innerHTML = `<div class="customer-empty"><span class="empty-icon">✳</span><strong>${phase === 'live' ? 'Sắp có khách mới...' : 'Quầy khách đang nghỉ'}</strong><p>${phase === 'live' ? 'Chuẩn bị sẵn bếp để đón khách nhé.' : 'Bấm mở quán để bắt đầu phục vụ.'}</p></div>`;
      return;
    }
    list.replaceChildren();
    for (const c of customers) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `customer-card${c.id === selectedId ? ' selected' : ''}`;
      button.dataset.customerId = c.id;
      button.setAttribute('aria-pressed', c.id === selectedId ? 'true' : 'false');
      button.setAttribute('aria-label', `${c.name}: ${c.broth}, ${spiceName(c.spice)}, ${c.topping}`);
      const safeName = c.name; // Names and ingredient values are fixed local game data.
      button.innerHTML = `<div class="customer-top"><span class="avatar">${c.avatar}</span><span><span class="customer-name">${safeName}</span><br><span class="customer-request">Cho mình một tô mì nhé!</span></span></div><div class="ticket"><span>${c.broth}</span><span>${spiceName(c.spice)}</span><span>${c.topping}</span></div><div class="patience${c.patience / c.maxPatience < .3 ? ' low' : ''}"><span style="width:${Math.max(0, c.patience / c.maxPatience * 100)}%"></span></div>`;
      button.addEventListener('click', () => { selectedId = c.id; renderCustomers(); renderKitchen(); tone(560); });
      list.append(button);
    }
  }
  function renderRecipe() {
    document.querySelectorAll('.choices').forEach(group => {
      const field = group.dataset.field;
      group.querySelectorAll('button').forEach(button => {
        const active = recipe[field] === button.dataset.value;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
        button.disabled = phase !== 'live' || !!cooking || !!dish;
      });
    });
    $('recipeHint').textContent = cooking ? 'Mì đang được nấu...' : dish ? 'Mì đã chín, hãy phục vụ đúng khách.' : 'Chọn đủ 3 phần để bắt đầu nấu.';
  }
  function renderKitchen() {
    const ready = !!dish && !cooking;
    $('kitchenState').textContent = cooking ? 'ĐANG NẤU MÌ' : ready ? 'MÌ ĐÃ CHÍN' : 'BẾP ĐANG RẢNH';
    $('bowlOverlay').hidden = !!cooking || ready;
    $('bowlOverlay').style.display = cooking || ready ? 'none' : '';
    $('bowlImage').style.opacity = cooking || ready ? '1' : '.58';
    $('bowlImage').parentElement.classList.toggle('cooking', !!cooking);
    $('bowlImage').parentElement.classList.toggle('ready', ready);
    $('cookProgressWrap').hidden = !cooking;
    if (!cooking) $('cookProgressFill').style.width = '0%';
    $('cookButton').hidden = ready;
    $('cookButton').disabled = phase !== 'live' || !!cooking || Object.values(recipe).some(v => v === null);
    $('cookButton').firstChild.textContent = cooking ? 'Đang nấu... ' : 'Nấu mì ';
    $('serveButton').hidden = !ready;
    $('serveButton').disabled = !selectedId;
    $('dishReadout').textContent = dish ? `${dish.broth} · ${spiceName(dish.spice)} · ${dish.topping}` : 'Chưa có tô mì nào được nấu.';
  }
  function render() { renderStatus(); renderCustomers(); renderRecipe(); renderKitchen(); }

  document.querySelectorAll('.choices').forEach(group => group.addEventListener('click', event => {
    const button = event.target.closest('button[data-value]');
    if (button) selectRecipe(group.dataset.field, button.dataset.value);
  }));
  $('cookButton').addEventListener('click', cook);
  $('serveButton').addEventListener('click', serve);
  $('helpButton').addEventListener('click', openHelp);
  $('soundButton').addEventListener('click', () => { save.sound = !save.sound; persist(); renderStatus(); tone(610); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && modal && phase !== 'prep' && phase !== 'summary') closeModal();
  });
  function animate(now) {
    if (lastFrame) tick((now - lastFrame) / 1000);
    lastFrame = now; requestAnimationFrame(animate);
  }
  render(); openIntro(); requestAnimationFrame(animate);

  // When supported, expose the same primary game actions to in-browser assistants.
  const context = document.modelContext;
  if (context?.registerTool) {
    const register = tool => { try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* Optional API. */ } };
    register({ name: 'read_noodle_shop_status', title: 'Read noodle shop status', description: 'Read the current day, active orders, recipe and prepared dish.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: () => ({ day: save.day, phase, money: save.money, rating: save.rating,
        customers: customers.map(c => ({ id: c.id, name: c.name, broth: c.broth, spice: c.spice, topping: c.topping })), recipe, dish, served, target }) });
    register({ name: 'stage_noodle_recipe', title: 'Choose noodle recipe', description: 'Select broth, spice and topping before cooking a bowl.',
      inputSchema: { type: 'object', properties: { broth: { type: 'string', enum: BROTHS }, spice: { type: 'string', enum: SPICES }, topping: { type: 'string', enum: TOPPINGS } }, required: ['broth', 'spice', 'topping'], additionalProperties: false },
      execute: input => { if (phase !== 'live' || cooking || dish || !BROTHS.includes(input?.broth) || !SPICES.includes(input?.spice) || !TOPPINGS.includes(input?.topping)) throw Error('Cannot select this recipe now.');
        recipe = { broth: input.broth, spice: input.spice, topping: input.topping }; renderRecipe(); renderKitchen(); return { recipe }; } });
    register({ name: 'start_noodle_day', title: 'Open the noodle shop', description: 'Start the current day and generate the first customer orders.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => { if (phase !== 'prep') throw Error('Day is already running or complete.'); closeModal(); startDay(); return { day: save.day, phase, customers: customers.map(c => c.id) }; } });
    register({ name: 'cook_noodle_bowl', title: 'Cook noodle bowl', description: 'Start cooking the selected recipe.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => { if (!cook()) throw Error('Select all three recipe parts and wait for an idle stove.'); return { cookingSeconds: cooking.total, dish }; } });
    register({ name: 'serve_noodle_order', title: 'Serve noodle order', description: 'Serve the ready bowl to a chosen customer and update shop results.',
      inputSchema: { type: 'object', properties: { customerId: { type: 'integer' } }, required: ['customerId'], additionalProperties: false },
      execute: input => { if (!dish || cooking || !customers.some(c => c.id === input?.customerId)) throw Error('Ready bowl and valid customer required.');
        selectedId = input.customerId; const correct = serve(); return { correct, money: save.money, served, rating: save.rating }; } });
  }
})();
