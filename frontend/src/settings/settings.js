/* ==================== SETTINGS.JS ====================
   Gerenciamento de Configurações do Sistema
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

async function loadSettings() {
  try {
    const { data: settings, error } = await apiSelect('settings', {
      eq: { user_id: currentUser.id }
    })

    if (error) throw error

    if (settings && settings.length > 0) {
      const setting = settings[0]
      
      document.getElementById('orgName').value = setting.organization_name || ''
      document.getElementById('orgLogo').value = setting.organization_logo_url || ''
      document.getElementById('colorPrimary').value = setting.primary_color || '#1EAF6A'
      document.getElementById('colorPrimaryText').value = setting.primary_color || '#1EAF6A'
      document.getElementById('colorSecondary').value = setting.secondary_color || '#667EEA'
      document.getElementById('colorSecondaryText').value = setting.secondary_color || '#667EEA'
      document.getElementById('apiWeather').value = setting.api_weather_key || ''
      document.getElementById('apiNews').value = setting.api_news_key || ''
    }

  } catch (error) {
    console.error('❌ Erro ao carregar settings:', error)
  }
}

async function handleSaveOrganization(e) {
  e.preventDefault()

  const organization_name = document.getElementById('orgName').value
  const organization_logo_url = document.getElementById('orgLogo').value
  const primary_color = document.getElementById('colorPrimary').value
  const secondary_color = document.getElementById('colorSecondary').value

  setLoading('#formOrganization button[type="submit"]', true)

  try {
    const { data: existing } = await apiSelect('settings', {
      eq: { user_id: currentUser.id }
    })

    if (existing && existing.length > 0) {
      // Atualizar
      const { error } = await apiUpdate('settings', existing[0].id, {
        organization_name,
        organization_logo_url,
        primary_color,
        secondary_color
      })

      if (error) throw error
    } else {
      // Criar
      const { error } = await apiInsert('settings', {
        organization_name,
        organization_logo_url,
        primary_color,
        secondary_color
      }, currentUser.id)

      if (error) throw error
    }

    showNotification('Configurações salvas com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao salvar configurações', 'error')
  } finally {
    setLoading('#formOrganization button[type="submit"]', false, 'Salvar Configurações')
  }
}

async function handleSaveAPIs(e) {
  e.preventDefault()

  const api_weather_key = document.getElementById('apiWeather').value
  const api_news_key = document.getElementById('apiNews').value

  setLoading('#formAPIs button[type="submit"]', true)

  try {
    const { data: existing } = await apiSelect('settings', {
      eq: { user_id: currentUser.id }
    })

    if (existing && existing.length > 0) {
      const { error } = await apiUpdate('settings', existing[0].id, {
        api_weather_key,
        api_news_key
      })

      if (error) throw error
    } else {
      const { error } = await apiInsert('settings', {
        api_weather_key,
        api_news_key
      }, currentUser.id)

      if (error) throw error
    }

    showNotification('Chaves de API salvas com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao salvar chaves de API', 'error')
  } finally {
    setLoading('#formAPIs button[type="submit"]', false, 'Salvar Chaves')
  }
}

function handleClearCache() {
  if (confirm('Tem certeza que deseja limpar o cache?')) {
    localStorage.clear()
    sessionStorage.clear()
    showNotification('Cache limpo com sucesso!', 'success')
  }
}

function handleExportData() {
  showNotification('Exportação em desenvolvimento', 'info')
}

function handleLogout() {
  if (confirm('Tem certeza que deseja sair?')) {
    handleLogout()
  }
}

// Sincronizar cores
document.getElementById('colorPrimary').addEventListener('change', (e) => {
  document.getElementById('colorPrimaryText').value = e.target.value
})

document.getElementById('colorPrimaryText').addEventListener('change', (e) => {
  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
    document.getElementById('colorPrimary').value = e.target.value
  }
})

document.getElementById('colorSecondary').addEventListener('change', (e) => {
  document.getElementById('colorSecondaryText').value = e.target.value
})

document.getElementById('colorSecondaryText').addEventListener('change', (e) => {
  if (/^#[0-9A-F]{6}$/i.test(e.target.value)) {
    document.getElementById('colorSecondary').value = e.target.value
  }
})

function setupEventListeners() {
  document.getElementById('formOrganization').addEventListener('submit', handleSaveOrganization)
  document.getElementById('formAPIs').addEventListener('submit', handleSaveAPIs)
  document.getElementById('btnClearCache').addEventListener('click', handleClearCache)
  document.getElementById('btnExportData').addEventListener('click', handleExportData)
  document.getElementById('btnLogout').addEventListener('click', handleLogout)
}

console.log('✅ Settings.js carregado')