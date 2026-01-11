/* ==================== SETTINGS.JS (COMPLETO) ====================
   Gerenciamento de Configurações do Sistema
   - Dados da Organização
   - Chaves de API
   - Personalização de Clima (Novo)
   - Cache e Logout
*/

let currentUser = null

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = await checkAuth()
    if (!currentUser) return

    await loadSidebar('settings')
    setupEventListeners()
    await loadSettings()

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao carregar configurações', 'error')
  }
})

// ==================== CARREGAR DADOS ====================

async function loadSettings() {
  try {
    const { data: settings, error } = await apiSelect('settings', {
      eq: { user_id: currentUser.id }
    })

    if (error) throw error

    if (settings && settings.length > 0) {
      const s = settings[0]
      
      // 1. Dados da Organização
      if(document.getElementById('orgName')) document.getElementById('orgName').value = s.organization_name || ''
      if(document.getElementById('orgLogo')) document.getElementById('orgLogo').value = s.organization_logo_url || ''
      
      // 2. Cores
      if(document.getElementById('colorPrimary')) {
          document.getElementById('colorPrimary').value = s.primary_color || '#1EAF6A'
          document.getElementById('colorPrimaryText').value = s.primary_color || '#1EAF6A'
      }
      if(document.getElementById('colorSecondary')) {
          document.getElementById('colorSecondary').value = s.secondary_color || '#667EEA'
          document.getElementById('colorSecondaryText').value = s.secondary_color || '#667EEA'
      }

      // 3. APIs
      if(document.getElementById('apiWeather')) document.getElementById('apiWeather').value = s.api_weather_key || ''
      if(document.getElementById('apiNews')) document.getElementById('apiNews').value = s.api_news_key || ''

      // 4. Imagens do Clima (NOVO)
      const bg = s.weather_backgrounds || {}
      if(document.getElementById('bgDayClear')) document.getElementById('bgDayClear').value = bg.day_clear || ''
      if(document.getElementById('bgDayClouds')) document.getElementById('bgDayClouds').value = bg.day_clouds || ''
      if(document.getElementById('bgDayRain')) document.getElementById('bgDayRain').value = bg.day_rain || ''
      if(document.getElementById('bgDayStorm')) document.getElementById('bgDayStorm').value = bg.day_storm || ''
      if(document.getElementById('bgNightClear')) document.getElementById('bgNightClear').value = bg.night_clear || ''
      if(document.getElementById('bgNightRain')) document.getElementById('bgNightRain').value = bg.night_rain || ''
    }

  } catch (error) {
    console.error('❌ Erro ao carregar settings:', error)
  }
}

// ==================== SALVAR ORGANIZAÇÃO ====================

async function handleSaveOrganization(e) {
  e.preventDefault()

  const organization_name = document.getElementById('orgName').value
  const organization_logo_url = document.getElementById('orgLogo').value
  const primary_color = document.getElementById('colorPrimary').value
  const secondary_color = document.getElementById('colorSecondary').value

  setLoading('#formOrganization button[type="submit"]', true)

  try {
    const { data: existing } = await apiSelect('settings', { eq: { user_id: currentUser.id } })

    if (existing && existing.length > 0) {
      await apiUpdate('settings', existing[0].id, {
        organization_name, organization_logo_url, primary_color, secondary_color
      })
    } else {
      await apiInsert('settings', {
        organization_name, organization_logo_url, primary_color, secondary_color
      }, currentUser.id)
    }

    showNotification('Configurações salvas com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao salvar configurações', 'error')
  } finally {
    setLoading('#formOrganization button[type="submit"]', false, 'Salvar Configurações')
  }
}

// ==================== SALVAR APIS ====================

async function handleSaveAPIs(e) {
  e.preventDefault()

  const api_weather_key = document.getElementById('apiWeather').value
  const api_news_key = document.getElementById('apiNews').value

  setLoading('#formAPIs button[type="submit"]', true)

  try {
    const { data: existing } = await apiSelect('settings', { eq: { user_id: currentUser.id } })

    if (existing && existing.length > 0) {
      await apiUpdate('settings', existing[0].id, { api_weather_key, api_news_key })
    } else {
      await apiInsert('settings', { api_weather_key, api_news_key }, currentUser.id)
    }

    showNotification('Chaves de API salvas com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao salvar chaves', 'error')
  } finally {
    setLoading('#formAPIs button[type="submit"]', false, 'Salvar Chaves')
  }
}

// ==================== SALVAR IMAGENS DE CLIMA (NOVO) ====================

async function handleSaveWeatherBg(e) {
  e.preventDefault()
  
  const weather_backgrounds = {
    day_clear: document.getElementById('bgDayClear').value,
    day_clouds: document.getElementById('bgDayClouds').value,
    day_rain: document.getElementById('bgDayRain').value,
    day_storm: document.getElementById('bgDayStorm').value,
    night_clear: document.getElementById('bgNightClear').value,
    night_rain: document.getElementById('bgNightRain').value
  }

  setLoading('#formWeatherBg button[type="submit"]', true)

  try {
    const { data: existing } = await apiSelect('settings', { eq: { user_id: currentUser.id } })

    if (existing && existing.length > 0) {
      await apiUpdate('settings', existing[0].id, { weather_backgrounds })
    } else {
      await apiInsert('settings', { weather_backgrounds }, currentUser.id)
    }

    showNotification('Imagens de clima salvas!', 'success')
  } catch (error) {
    console.error(error)
    showNotification('Erro ao salvar imagens', 'error')
  } finally {
    setLoading('#formWeatherBg button[type="submit"]', false, 'Salvar Imagens')
  }
}

// ==================== UTILITÁRIOS ====================

function handleClearCache() {
  if (confirm('Tem certeza que deseja limpar o cache?')) {
    localStorage.clear()
    sessionStorage.clear()
    // Limpa cache de arquivos também se possível
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    showNotification('Cache limpo com sucesso!', 'success')
    setTimeout(() => window.location.reload(), 1000)
  }
}

function handleExportData() {
  showNotification('Exportação em desenvolvimento', 'info')
}

function handleLogout() {
  if (confirm('Tem certeza que deseja sair?')) {
    supabaseClient.auth.signOut().then(() => {
        window.location.href = '/frontend/src/auth/login.html'
    })
  }
}

// Sincronização de Inputs de Cor
function syncColorInputs(colorId, textId) {
    const colorInput = document.getElementById(colorId);
    const textInput = document.getElementById(textId);
    
    if(colorInput && textInput) {
        colorInput.addEventListener('input', (e) => textInput.value = e.target.value);
        textInput.addEventListener('change', (e) => {
            if (/^#[0-9A-F]{6}$/i.test(e.target.value)) colorInput.value = e.target.value;
        });
    }
}

// ==================== EVENT LISTENERS ====================

function setupEventListeners() {
  const formOrg = document.getElementById('formOrganization');
  if(formOrg) formOrg.addEventListener('submit', handleSaveOrganization);

  const formAPIs = document.getElementById('formAPIs');
  if(formAPIs) formAPIs.addEventListener('submit', handleSaveAPIs);

  // NOVO: Listener do formulário de Clima
  const formWeather = document.getElementById('formWeatherBg');
  if(formWeather) formWeather.addEventListener('submit', handleSaveWeatherBg);

  const btnCache = document.getElementById('btnClearCache');
  if(btnCache) btnCache.addEventListener('click', handleClearCache);

  const btnExport = document.getElementById('btnExportData');
  if(btnExport) btnExport.addEventListener('click', handleExportData);

  const btnLogout = document.getElementById('btnLogout');
  if(btnLogout) btnLogout.addEventListener('click', handleLogout);

  syncColorInputs('colorPrimary', 'colorPrimaryText');
  syncColorInputs('colorSecondary', 'colorSecondaryText');
}

console.log('✅ Settings.js Completo carregado')