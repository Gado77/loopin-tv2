/* ==================== PLAYER.JS V2 ====================
   Reprodutor de mídia para Loopin TV
   Suporta: Campanhas (imagens/vídeos)
   Status: FOCO EM MÍDIAS APENAS
*/

// ==================== CONFIGURAÇÃO ====================
const CONFIG = {
  POLL_INTERVAL: 10000,      // 10s: Verifica se foi vinculado
  CHECK_INTERVAL: 60000,     // 1 min: Atualiza playlist
  PING_INTERVAL: 30000,      // 30s: Ping de status
  WATCHDOG_TIMEOUT: 45000,   // 45s: Reinicia se travar
  CACHE_NAME: 'loopin-v3'
};

// ==================== ESTADO GLOBAL ====================
const State = {
  deviceId: null,
  isRegistered: false,
  isPlaying: false,
  isOffline: !navigator.onLine,
  playlist: [],
  currentIndex: -1,
  watchdogTimer: null,
  settings: {}
};

// ==================== BOOTSTRAP ====================
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Player iniciando...');
  setupMouseHider();
  
  // Gera Device ID
  let storedId = localStorage.getItem('loopin_device_id');
  if (!storedId) {
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    storedId = `TELA-${randomSuffix}`;
    localStorage.setItem('loopin_device_id', storedId);
  }
  
  State.deviceId = storedId;
  console.log(`🆔 Device ID: ${State.deviceId}`);

  // Inicia verificação de registro
  checkAndStart();
});

// ==================== VERIFICAÇÃO E INÍCIO ====================
async function checkAndStart() {
  console.log('🔄 Verificando se tela está vinculada...');
  
  if (State.isOffline) {
    console.warn('⚠️ Offline - tentando usar cache');
    const cached = localStorage.getItem('loopin_cached_playlist');
    if (cached) {
      State.playlist = JSON.parse(cached);
      startPlayback();
    } else {
      setTimeout(checkAndStart, 5000);
    }
    return;
  }

  try {
    const { data: screen } = await supabaseClient
      .from('screens')
      .select('id, active_playlist_id')
      .eq('device_id', State.deviceId)
      .maybeSingle();

    if (!screen) {
      console.log('❌ Tela não vinculada. Exibindo código de pareamento.');
      showPairingScreen();
      setTimeout(checkAndStart, CONFIG.POLL_INTERVAL);
      return;
    }

    console.log('✅ TELA VINCULADA!');
    State.isRegistered = true;
    hidePairingScreen();
    startPlayback();

  } catch (err) {
    console.error('❌ Erro ao verificar tela:', err);
    setTimeout(checkAndStart, CONFIG.POLL_INTERVAL);
  }
}

// ==================== INICIAR REPRODUÇÃO ====================
async function startPlayback() {
  if (State.isPlaying) return;
  
  State.isPlaying = true;
  console.log('🚀 Iniciando reprodução');
  
  showLoading('Carregando...');
  startClock();

  try {
    // Carrega configurações
    await loadSettings();

    // Carrega playlist do servidor
    await fetchPlaylist();
    
    // Se não tem playlist, espera
    if (State.playlist.length === 0) {
      console.warn('⚠️ Nenhuma campanha para reproduzir');
      showLoading('Aguardando conteúdo...');
      setTimeout(() => fetchPlaylist(), CONFIG.CHECK_INTERVAL);
      return;
    }

    hideLoading();
    playNext();

    // Loops de atualização
    setInterval(fetchPlaylist, CONFIG.CHECK_INTERVAL);
    setInterval(sendPing, CONFIG.PING_INTERVAL);

  } catch (err) {
    console.error('❌ Erro ao iniciar:', err);
    showLoading('Erro. Reiniciando...');
    setTimeout(() => window.location.reload(), 5000);
  }
}

// ==================== BUSCAR PLAYLIST ====================
async function fetchPlaylist() {
  if (State.isOffline) return;

  try {
    console.log('🔄 Atualizando playlist...');

    // 1. Busca screen com playlist ativa
    const { data: screen, error: screenErr } = await supabaseClient
      .from('screens')
      .select('active_playlist_id')
      .eq('device_id', State.deviceId)
      .maybeSingle();

    if (screenErr || !screen?.active_playlist_id) {
      console.warn('⚠️ Nenhuma playlist ativa');
      return;
    }

    // 2. Busca items da playlist com JOIN
    const { data: items, error: itemsErr } = await supabaseClient
      .from('playlist_items')
      .select(`
        id,
        campaign_id,
        duration,
        display_order,
        campaigns!campaign_id (
          id,
          name,
          media_url,
          media_type,
          duration_seconds
        )
      `)
      .eq('playlist_id', screen.active_playlist_id)
      .order('display_order', { ascending: true });

    if (itemsErr) {
      console.error('❌ Erro ao buscar items:', itemsErr);
      return;
    }

    if (!items || items.length === 0) {
      console.log('⚠️ Playlist vazia');
      return;
    }

    // 3. Busca widgets também
    const { data: widgets, error: widgetsErr } = await supabaseClient
      .from('playlist_items')
      .select(`
        id,
        widget_id,
        duration,
        display_order,
        dynamic_contents!widget_id (
          id,
          name,
          content_type,
          configuration
        )
      `)
      .eq('playlist_id', screen.active_playlist_id)
      .order('display_order', { ascending: true });

    // 4. Formata lista (CAMPANHAS + WIDGETS)
    const newList = [];

    // Processa todos os items em ordem
    for (const item of items) {
      // Campanha
      if (item.campaign_id && item.campaigns && item.campaigns.media_url) {
        newList.push({
          id: item.campaigns.id,
          name: item.campaigns.name,
          type: item.campaigns.media_type || 'image',
          url: item.campaigns.media_url,
          duration: item.duration || item.campaigns.duration_seconds || 10,
          renderType: 'media'
        });
      }
    }

    // Processa widgets separadamente
    if (widgets && !widgetsErr) {
      for (const item of widgets) {
        if (!item.widget_id || !item.dynamic_contents) continue;

        const widget = item.dynamic_contents;
        let config = {};

        try {
          config = typeof widget.configuration === 'string'
            ? JSON.parse(widget.configuration)
            : (widget.configuration || {});
        } catch (e) {
          console.warn(`⚠️ Config inválida para ${widget.name}`);
          continue;
        }

        const type = widget.content_type?.toLowerCase() || '';

        // Widget de Texto
        if (type === 'ticker' || type === 'text') {
          if (config.text) {
            newList.push({
              id: widget.id,
              name: widget.name,
              type: 'text',
              text: config.text,
              duration: item.duration || 15,
              renderType: 'text',
              bgColor: config.bg_color || '#000',
              textColor: config.text_color || '#fff',
              speed: config.speed || 50
            });
          }
        }

        // Widget de Clima
        if (type === 'weather' || type === 'clima' || type === 'medias') {
          newList.push({
            id: widget.id,
            name: widget.name,
            type: 'weather',
            city: config.city || 'São Paulo',
            duration: item.duration || 15,
            renderType: 'weather'
          });
        }
      }
    }

    // Ordena por display_order original
    newList.sort((a, b) => {
      const aOrder = items.concat(widgets || []).find(i => i.id === a.id)?.display_order || 0;
      const bOrder = items.concat(widgets || []).find(i => i.id === b.id)?.display_order || 0;
      return aOrder - bOrder;
    });

    console.log(`✅ ${newList.length} campanhas carregadas`);

    if (JSON.stringify(newList) !== JSON.stringify(State.playlist)) {
      State.playlist = newList;
      localStorage.setItem('loopin_cached_playlist', JSON.stringify(newList));
      console.log('💾 Playlist em cache');
    }

  } catch (err) {
    console.error('❌ Erro ao buscar playlist:', err);
  }
}

// ==================== REPRODUÇÃO ====================
async function playNext() {
  resetWatchdog();

  // Se chegou no fim, recicla
  if (State.currentIndex >= State.playlist.length - 1) {
    State.currentIndex = -1;
  }

  State.currentIndex++;

  // Se lista vazia
  if (State.playlist.length === 0) {
    console.warn('⚠️ Playlist vazia');
    setTimeout(playNext, 3000);
    return;
  }

  const item = State.playlist[State.currentIndex];
  console.log(`▶️ Reproduzindo (${State.currentIndex}/${State.playlist.length}): ${item.name}`);

  // Alterna slots
  const activeSlot = document.querySelector('.media-slot.active');
  const nextSlot = activeSlot.id === 'slot1' ? document.getElementById('slot2') : document.getElementById('slot1');
  nextSlot.innerHTML = '';

  try {
    const item = State.playlist[State.currentIndex];
    console.log(`▶️ Reproduzindo (${State.currentIndex}/${State.playlist.length}): ${item.name}`);

    // Alterna slots
    const activeSlot = document.querySelector('.media-slot.active');
    const nextSlot = activeSlot.id === 'slot1' ? document.getElementById('slot2') : document.getElementById('slot1');
    nextSlot.innerHTML = '';

    // Renderiza baseado no tipo
    if (item.renderType === 'media') {
      renderMedia(item, nextSlot, activeSlot);
    } else if (item.renderType === 'text') {
      renderText(item, nextSlot, activeSlot);
    } else if (item.renderType === 'weather') {
      renderWeather(item, nextSlot, activeSlot);
    } else {
      console.warn('⚠️ Tipo desconhecido:', item.renderType);
      setTimeout(playNext, 2000);
    }

  } catch (err) {
    console.error('❌ Erro na reprodução:', err);
    setTimeout(playNext, 2000);
  }
}

// ==================== RENDERIZAÇÃO ====================

async function renderMedia(item, nextSlot, activeSlot) {
  const src = await getCachedUrl(item.url);

  if (item.type === 'video' || item.url.match(/\.(mp4|webm|mov)$/i)) {
    console.log('🎬 Vídeo');
    const video = document.createElement('video');
    video.src = src;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.style.opacity = '0';

    video.oncanplay = () => doTransition(activeSlot, nextSlot, item, video);
    video.onerror = () => {
      console.error('❌ Erro vídeo');
      playNext();
    };

    nextSlot.appendChild(video);

  } else {
    console.log('🖼️ Imagem');
    const img = document.createElement('img');
    img.src = src;
    img.style.opacity = '0';

    img.onload = () => doTransition(activeSlot, nextSlot, item, null);
    img.onerror = () => {
      console.error('❌ Erro imagem');
      playNext();
    };

    nextSlot.appendChild(img);
  }
}

function renderText(item, nextSlot, activeSlot) {
  console.log('📝 Texto');
  
  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    height: 100%;
    background: ${item.bgColor || '#000'};
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 60px;
    box-sizing: border-box;
    opacity: 0;
  `;

  const text = document.createElement('div');
  text.style.cssText = `
    color: ${item.textColor || '#fff'};
    font-size: 3.5rem;
    text-align: center;
    font-weight: 700;
    line-height: 1.3;
    word-wrap: break-word;
    max-width: 90%;
  `;
  text.innerText = item.text;

  container.appendChild(text);
  nextSlot.appendChild(container);
  
  doTransition(activeSlot, nextSlot, item, null);
}

function renderWeather(item, nextSlot, activeSlot) {
  console.log('🌤️ Clima');
  
  const container = document.createElement('div');
  container.style.cssText = `
    width: 100%;
    height: 100%;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    font-family: 'Inter', sans-serif;
    padding: 40px;
    box-sizing: border-box;
    opacity: 0;
  `;

  const title = document.createElement('h1');
  title.style.cssText = `
    font-size: 2.5rem;
    margin: 0 0 20px 0;
    text-transform: uppercase;
    letter-spacing: 2px;
  `;
  title.innerText = 'Previsão do Tempo';

  const city = document.createElement('h2');
  city.style.cssText = `
    font-size: 2rem;
    margin: 0 0 30px 0;
    font-weight: 400;
  `;
  city.innerText = item.city;

  const info = document.createElement('p');
  info.style.cssText = `
    font-size: 1.2rem;
    margin: 0;
    opacity: 0.9;
  `;
  info.innerText = '🔄 Carregando...';

  container.appendChild(title);
  container.appendChild(city);
  container.appendChild(info);
  nextSlot.appendChild(container);
  
  doTransition(activeSlot, nextSlot, item, null);

  // Carrega clima real em background
  if (State.settings?.api_weather_key) {
    fetch(`https://api.openweathermap.org/data/2.5/weather?q=${item.city}&units=metric&lang=pt_br&appid=${State.settings.api_weather_key}`)
      .then(r => r.json())
      .then(data => {
        if (data.main) {
          info.innerText = `🌡️ ${Math.round(data.main.temp)}°C | 💨 ${data.wind.speed.toFixed(1)}m/s | 💧 ${data.main.humidity}% | ${data.weather[0].main}`;
        }
      })
      .catch(() => {});
  }
}

async function getCachedUrl(url) {
  try {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    const resp = await cache.match(url);
    
    if (resp) {
      console.log('✅ Usando cache:', url);
      return URL.createObjectURL(await resp.blob());
    }
    
    console.log('⬇️ Baixando:', url);
    return url;
  } catch (err) {
    console.error('⚠️ Erro no cache:', err);
    return url;
  }
}

// ==================== UI ====================
function showPairingScreen() {
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('pairingCode').innerText = State.deviceId;
  document.getElementById('playerContainer').classList.add('hidden');
}

function hidePairingScreen() {
  document.getElementById('setupScreen').classList.add('hidden');
}

function showLoading(text) {
  document.getElementById('loadingText').innerText = text;
  document.getElementById('loadingScreen').classList.remove('hidden');
  document.getElementById('playerContainer').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('playerContainer').classList.remove('hidden');
}

function startClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('clockTime').innerText = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
    document.getElementById('clockDate').innerText = now.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short'
    }).replace('.', '');
  }, 1000);
}

function setupMouseHider() {
  let timeout;
  window.addEventListener('mousemove', () => {
    document.body.classList.add('mouse-visible');
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      document.body.classList.remove('mouse-visible');
    }, 3000);
  });
}

// ==================== UTILITÁRIOS ====================
function resetWatchdog() {
  if (State.watchdogTimer) clearTimeout(State.watchdogTimer);
  State.watchdogTimer = setTimeout(() => {
    console.warn('🐕 Watchdog: Reiniciando...');
    window.location.reload();
  }, CONFIG.WATCHDOG_TIMEOUT);
}

async function sendPing() {
  if (State.isOffline || !State.isRegistered) return;

  try {
    await supabaseClient
      .from('screens')
      .update({
        last_ping: new Date().toISOString(),
        status: 'online'
      })
      .eq('device_id', State.deviceId);
  } catch (err) {
    console.warn('⚠️ Erro ao enviar ping:', err);
  }
}

// ==================== CONEXÃO ====================
window.addEventListener('online', () => {
  console.log('🌐 Voltou online');
  State.isOffline = false;
  if (State.isRegistered) fetchPlaylist();
});

window.addEventListener('offline', () => {
  console.log('📴 Ficou offline');
  State.isOffline = true;
});

console.log('✅ Player.js v2 carregado');