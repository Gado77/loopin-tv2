/* ==================== PLAYER.JS (CORRIGIDO) ====================
   Lógica Zero-Touch: Gera ID, aguarda vínculo e roda sozinho.
*/

// --- CONFIGURAÇÕES ---
const CONFIG = {
  POLL_INTERVAL: 10000,     // 10s: Checa se foi vinculado (quando na tela de setup)
  CHECK_INTERVAL: 60000,    // 1 min: Checa novas playlists (quando rodando)
  PING_INTERVAL: 30000,     // 30s: Ping de status online
  WATCHDOG_TIMEOUT: 45000,  // 45s: Reinicia se travar
  CACHE_NAME: 'loopin-v3',
  FADE_TIME: 300
};

// --- ESTADO GLOBAL ---
const State = {
  deviceId: null,
  isRegistered: false,
  playlist: [],
  nextPlaylist: null,
  currentIndex: -1,
  watchdogTimer: null,
  isOffline: !navigator.onLine,
  isPlaying: false,
  settings: {}
};

// ==================== 1. BOOTSTRAP ====================

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Player iniciando...');
  setupMouseHider();
  
  // 1. Obtém ou Gera o Device ID
  let storedId = localStorage.getItem('loopin_device_id');
  if (!storedId) {
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    storedId = `TELA-${randomSuffix}`;
    localStorage.setItem('loopin_device_id', storedId);
  }
  
  State.deviceId = storedId;
  console.log(`🆔 Device ID: ${State.deviceId}`);

  // 2. Verifica status inicial
  checkRegistrationLoop();
});

// ==================== 2. LÓGICA DE VINCULAÇÃO ====================

async function checkRegistrationLoop() {
  console.log('🔄 Verificando registro...');
  
  if (State.isOffline) {
    console.warn('⚠️ Offline - tentando usar cache');
    if (localStorage.getItem('loopin_cached_playlist')) {
      startSystem();
    } else {
      setTimeout(checkRegistrationLoop, 5000);
    }
    return;
  }

  try {
    // Pergunta ao banco: "Existe uma tela com meu ID?"
    const { data, error } = await supabaseClient
      .from('screens')
      .select('id, active_playlist_id, user_id')
      .eq('device_id', State.deviceId)
      .maybeSingle();

    if (error) {
      console.error('❌ Erro ao verificar registro:', error);
      setTimeout(checkRegistrationLoop, CONFIG.POLL_INTERVAL);
      return;
    }

    if (data && data.id) {
      console.log('✅ TELA VINCULADA!', data.id);
      State.isRegistered = true;
      State.userId = data.user_id;
      document.getElementById('setupScreen').classList.add('hidden');
      
      if (!State.isPlaying) {
        startSystem();
      }
    } else {
      console.log('❌ Tela não vinculada. Exibindo código de pareamento...');
      document.getElementById('pairingCode').innerText = State.deviceId;
      document.getElementById('setupScreen').classList.remove('hidden');
      document.getElementById('loadingScreen').classList.add('hidden');
      document.getElementById('playerContainer').classList.add('hidden');
      
      setTimeout(checkRegistrationLoop, CONFIG.POLL_INTERVAL);
    }

  } catch (err) {
    console.error('❌ Erro ao verificar registro:', err);
    setTimeout(checkRegistrationLoop, CONFIG.POLL_INTERVAL);
  }
}

// ==================== 3. SISTEMA PRINCIPAL ====================

async function startSystem() {
  if (State.isPlaying) {
    console.warn('⚠️ Sistema já está rodando');
    return;
  }
  
  State.isPlaying = true;
  console.log('🚀 Iniciando sistema de reprodução');

  showLoading('Iniciando player...');
  startClock();

  try {
    await loadSettings();
    startWeather();

    // Tenta carregar cache primeiro (Instant On)
    const cached = localStorage.getItem('loopin_cached_playlist');
    if (cached) {
      console.log('💾 Usando playlist em cache');
      State.playlist = JSON.parse(cached);
      hideLoading();
      playNext();
      // Atualiza em background
      updatePlaylist();
    } else {
      console.log('📥 Baixando playlist do servidor');
      await updatePlaylist(true);
    }

    // Loops Eternos
    setInterval(updatePlaylist, CONFIG.CHECK_INTERVAL);
    setInterval(sendPing, CONFIG.PING_INTERVAL);

  } catch (e) {
    console.error('❌ Falha no boot:', e);
    showLoading('Erro ao iniciar. Reiniciando...');
    setTimeout(() => window.location.reload(), 5000);
  }
}

// ==================== 4. PLAYLIST & CONTEÚDO ====================

async function updatePlaylist(isFirstLoad = false) {
  if (State.isOffline) {
    console.warn('⚠️ Offline - pulando atualização de playlist');
    return;
  }

  try {
    console.log('🔄 Atualizando playlist...');

    // Pega ID da Playlist ativa
    const { data: screen, error: screenError } = await supabaseClient
      .from('screens')
      .select('active_playlist_id')
      .eq('device_id', State.deviceId)
      .maybeSingle();

    if (screenError) {
      console.error('❌ Erro ao buscar tela:', screenError);
      return;
    }

    if (!screen?.active_playlist_id) {
      console.warn('⚠️ Nenhuma playlist ativa');
      if (isFirstLoad) showLoading('Aguardando Playlist...');
      return;
    }

    console.log('📋 Playlist ID:', screen.active_playlist_id);

    // Baixa itens da playlist
    const { data: items, error: itemsError } = await supabaseClient
      .from('playlist_items')
      .select(`
        duration, 
        display_order,
        widget_id,
        dynamic_contents (
          id,
          name,
          content_type, 
          configuration
        )
      `)
      .eq('playlist_id', screen.active_playlist_id)
      .order('display_order', { ascending: true });

    if (itemsError) {
      console.error('❌ Erro ao buscar items:', itemsError);
      return;
    }

    if (!items || items.length === 0) {
      console.warn('⚠️ Playlist vazia');
      return;
    }

    console.log('📦 Itens carregados:', items.length);

    // Formata lista de reprodução
    const newList = items.map((item, idx) => {
      if (item.dynamic_contents) {
        const widget = item.dynamic_contents;
        
        // Parse da configuração para extrair URL
        let mediaUrl = null;
        
        console.log(`  [Item ${idx}] Widget:`, widget.name, 'Config:', widget.configuration);
        
        if (widget.configuration) {
          try {
            const config = typeof widget.configuration === 'string' 
              ? JSON.parse(widget.configuration) 
              : widget.configuration;
            console.log(`  [Item ${idx}] Config parseada:`, config);
            mediaUrl = config.media_url || config.url;
          } catch (e) {
            console.warn(`  [Item ${idx}] ❌ Erro parsing config:`, e);
          }
        } else {
          console.warn(`  [Item ${idx}] ⚠️ Configuration vazia/nula`);
        }

        if (mediaUrl) {
          console.log(`  [Item ${idx}] ✅ URL encontrada:`, mediaUrl);
          return {
            id: widget.id,
            name: widget.name,
            type: widget.content_type,
            url: mediaUrl,
            duration: item.duration || 10
          };
        } else {
          console.warn(`  [Item ${idx}] ❌ Nenhuma URL encontrada para ${widget.name}`);
        }
      } else {
        console.warn(`  [Item ${idx}] ❌ dynamic_contents vazio`);
      }
      return null;
    }).filter(i => i !== null);

    console.log('✅ Nova lista formatada:', newList.length, 'itens');

    // Cache e Atualização
    await downloadAssets(newList, isFirstLoad);

    const listString = JSON.stringify(newList);
    if (listString !== JSON.stringify(State.playlist)) {
      console.log('📥 Nova playlist baixada e em cache');
      localStorage.setItem('loopin_cached_playlist', listString);
      
      if (State.playlist.length === 0) {
        State.playlist = newList;
        if (isFirstLoad) hideLoading();
        playNext();
      } else {
        State.nextPlaylist = newList;
        console.log('⏳ Próxima playlist agendada para o próximo loop');
      }
    }

  } catch (err) {
    console.error('❌ Update failed:', err);
  }
}

async function downloadAssets(items, updateUI) {
  console.log('⬇️ Baixando assets...');
  
  try {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    let count = 0;
    
    const promises = items.map(async (item) => {
      if (!item.url) return;
      
      try {
        const match = await cache.match(item.url);
        if (!match) {
          console.log('📥 Cacheando:', item.url);
          await cache.add(item.url);
        } else {
          console.log('✅ Já em cache:', item.url);
        }
      } catch (e) {
        console.warn('⚠️ Erro ao cachear', item.url, e);
      }
      
      if (updateUI) {
        count++;
        document.getElementById('loadingSubtext').innerText = `Baixando ${count}/${items.length}`;
      }
    });
    
    await Promise.all(promises);
    console.log('✅ Assets prontos');
  } catch (e) {
    console.error('❌ Erro ao baixar assets:', e);
  }
}

// ==================== 5. REPRODUÇÃO ====================

async function playNext() {
  resetWatchdog();

  console.log(`▶️ playNext() - Index: ${State.currentIndex}, Playlist: ${State.playlist.length}`);

  // Troca playlist no fim do loop
  if (State.currentIndex >= State.playlist.length - 1) {
    console.log('🔄 Fim da playlist - reciclando');
    if (State.nextPlaylist) {
      console.log('🆕 Usando próxima playlist');
      State.playlist = State.nextPlaylist;
      State.nextPlaylist = null;
    }
    State.currentIndex = -1;
  }

  State.currentIndex++;

  if (State.playlist.length === 0) {
    console.warn('⚠️ Playlist vazia - aguardando...');
    showLoading('Aguardando conteúdo...');
    setTimeout(playNext, 3000);
    return;
  }

  const item = State.playlist[State.currentIndex];
  console.log(`📺 Reproduzindo (${State.currentIndex}/${State.playlist.length}):`, item.name);

  const activeSlot = document.querySelector('.media-slot.active');
  const nextSlot = activeSlot.id === 'slot1' 
    ? document.getElementById('slot2') 
    : document.getElementById('slot1');

  nextSlot.innerHTML = '';

  try {
    const src = await getCachedUrl(item.url);
    let el;

    if (item.type === 'video' || item.url.match(/\.(mp4|webm|mov)$/i)) {
      console.log('🎬 Reproduzindo vídeo');
      el = document.createElement('video');
      el.src = src;
      el.muted = true;
      el.autoplay = true;
      el.playsInline = true;
      el.loop = true;
      el.style.opacity = '0';
      
      el.oncanplay = () => {
        console.log('✅ Vídeo pronto - fazendo transição');
        doTransition(activeSlot, nextSlot, item, el);
      };
      
      el.onerror = (e) => {
        console.error('❌ Erro ao carregar vídeo:', e);
        playNext();
      };

    } else {
      console.log('🖼️ Reproduzindo imagem');
      el = document.createElement('img');
      el.src = src;
      el.style.opacity = '0';
      
      el.onload = () => {
        console.log('✅ Imagem carregada - fazendo transição');
        doTransition(activeSlot, nextSlot, item, null);
      };
      
      el.onerror = (e) => {
        console.error('❌ Erro ao carregar imagem:', e);
        playNext();
      };
    }

    nextSlot.appendChild(el);

  } catch (e) {
    console.error('❌ Erro na reprodução:', e);
    setTimeout(playNext, 2000);
  }
}

function doTransition(current, next, item, videoEl) {
  console.log('✨ Transição de mídia');
  
  // Faz transição
  next.classList.add('active');
  current.classList.remove('active');

  const duration = (item.duration || 10) * 1000;
  console.log(`⏱️ Duração: ${item.duration}s`);

  if (videoEl) {
    videoEl.style.opacity = '1';
    videoEl.play().catch((e) => {
      console.warn('⚠️ Erro ao reproduzir vídeo:', e);
    });
  } else {
    // Imagem
    next.querySelector('img').style.opacity = '1';
  }

  setTimeout(() => {
    console.log('⏭️ Próxima mídia');
    playNext();
  }, duration);
}

async function getCachedUrl(url) {
  try {
    const cache = await caches.open(CONFIG.CACHE_NAME);
    const resp = await cache.match(url);
    
    if (resp) {
      console.log('✅ Usando URL em cache:', url);
      return URL.createObjectURL(await resp.blob());
    }
    
    console.log('⚠️ URL não em cache, usando original:', url);
    return url;
  } catch (e) {
    console.error('❌ Erro ao obter URL em cache:', e);
    return url;
  }
}

// ==================== 6. AUXILIARES ====================

function resetWatchdog() {
  if (State.watchdogTimer) clearTimeout(State.watchdogTimer);
  State.watchdogTimer = setTimeout(() => {
    console.warn('🐕 Watchdog ativado. Reiniciando...');
    window.location.reload();
  }, CONFIG.WATCHDOG_TIMEOUT);
}

function startClock() {
  const updateClock = () => {
    const now = new Date();
    document.getElementById('clockTime').innerText = now.toLocaleTimeString('pt-BR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    document.getElementById('clockDate').innerText = now.toLocaleDateString('pt-BR', { 
      day: '2-digit', 
      month: 'short' 
    }).replace('.', '');
  };
  
  updateClock();
  setInterval(updateClock, 1000);
}

async function startWeather() {
  if (!State.settings?.api_weather_key) {
    console.log('⚠️ Chave de API de clima não configurada');
    return;
  }
  
  const update = async () => {
    try {
      const city = State.settings?.default_city || 'Osasco';
      const res = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=metric&lang=pt_br&appid=${State.settings.api_weather_key}`
      );
      
      if (!res.ok) throw new Error('Erro na API de clima');
      
      const data = await res.json();
      if (data.main) {
        document.getElementById('weatherTemp').innerText = `${Math.round(data.main.temp)}°`;
        document.getElementById('weatherIcon').src = `https://openweathermap.org/img/wn/${data.weather[0].icon}@2x.png`;
        document.getElementById('weatherWidget').classList.remove('hidden');
        console.log('✅ Clima atualizado');
      }
    } catch (e) {
      console.warn('⚠️ Erro ao buscar clima:', e);
    }
  };
  
  update();
  setInterval(update, 1200000); // 20 min
}

async function loadSettings() {
  try {
    console.log('⚙️ Carregando configurações...');
    
    const { data: screen } = await supabaseClient
      .from('screens')
      .select('user_id')
      .eq('device_id', State.deviceId)
      .maybeSingle();
    
    if (!screen?.user_id) {
      console.warn('⚠️ Sem user_id associado');
      return;
    }

    const { data: settings } = await supabaseClient
      .from('settings')
      .select('*')
      .eq('user_id', screen.user_id)
      .maybeSingle();
    
    if (settings) {
      State.settings = settings;
      console.log('✅ Configurações carregadas');
      
      if (settings.organization_logo_url) {
        const img = document.getElementById('orgLogo');
        img.src = settings.organization_logo_url;
        img.classList.remove('hidden');
      }
    }
  } catch (e) {
    console.warn('⚠️ Erro ao carregar configurações:', e);
  }
}

async function sendPing() {
  if (!State.isOffline && State.isRegistered) {
    try {
      await supabaseClient
        .from('screens')
        .update({ 
          last_ping: new Date().toISOString(), 
          status: 'online' 
        })
        .eq('device_id', State.deviceId);
      console.log('📡 Ping enviado');
    } catch (e) {
      console.warn('⚠️ Erro ao enviar ping:', e);
    }
  }
}

function showLoading(text) {
  console.log('⏳ Exibindo loading:', text);
  document.getElementById('loadingText').innerText = text;
  document.getElementById('loadingScreen').classList.remove('hidden');
  document.getElementById('playerContainer').classList.add('hidden');
}

function hideLoading() {
  console.log('✅ Ocultando loading');
  document.getElementById('loadingScreen').classList.add('hidden');
  document.getElementById('playerContainer').classList.remove('hidden');
}

function setupMouseHider() {
  let t;
  window.addEventListener('mousemove', () => {
    document.body.classList.add('mouse-visible');
    clearTimeout(t);
    t = setTimeout(() => document.body.classList.remove('mouse-visible'), 3000);
  });
}

// ==================== TRATAMENTO DE CONEXÃO ====================

window.addEventListener('online', () => {
  console.log('🌐 Voltou online');
  State.isOffline = false;
  if (!State.isRegistered) {
    checkRegistrationLoop();
  } else {
    updatePlaylist();
  }
});

window.addEventListener('offline', () => {
  console.log('📴 Ficou offline');
  State.isOffline = true;
  showLoading('Offline - usando cache...');
});

console.log('✅ Player.js carregado');