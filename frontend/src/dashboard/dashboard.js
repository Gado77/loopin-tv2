/* ==================== DASHBOARD.JS ====================
   Lógica principal do Dashboard
   Dependências: config.js, utils.js, api-helpers.js
*/

let currentUser = null

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Autenticação
    currentUser = await checkAuth()
    if (!currentUser) return

    // 2. Sidebar
    await loadSidebar('dashboard')

    // 3. Carrega dados em paralelo
    Promise.all([
      loadKPIs(),
      loadRecentScreens(),
      loadUpcomingCampaigns(),
      loadRealtimeStatus()
    ])

    // 4. Setup eventos
    setupEventListeners()

  } catch (error) {
    console.error('❌ Erro na inicialização:', error)
    showNotification('Erro ao carregar dashboard', 'error')
  }
})

// ==================== KPIs ====================

async function loadKPIs() {
  try {
    // Telas (Total e Online)
    const { data: screensTotal } = await apiSelect('screens', {
      userId: currentUser.id,
      select: 'id'
    })

    const { data: screensOnline } = await apiSelect('screens', {
      userId: currentUser.id,
      select: 'id',
      eq: { status: 'online' }
    })

    updateKPI('totalScreens', screensTotal?.length || 0)
    updateElement('screensStatus', `${screensOnline?.length || 0} online agora`)

    // Playlists
    const { data: playlists } = await apiSelect('playlists', {
      userId: currentUser.id,
      select: 'id'
    })

    updateKPI('totalPlaylists', playlists?.length || 0)
    updateElement('playlistsStatus', 'Ativas')

    // Campanhas
    const { data: campaigns } = await apiSelect('campaigns', {
      userId: currentUser.id,
      select: 'id',
      eq: { status: 'active' }
    })

    updateKPI('totalCampaigns', campaigns?.length || 0)
    updateElement('campaignsStatus', 'Em exibição')

    // Locais
    const { data: locations } = await apiSelect('locations', {
      userId: currentUser.id,
      select: 'id'
    })

    updateKPI('totalLocations', locations?.length || 0)
    updateElement('locationsStatus', 'Cadastrados')

  } catch (error) {
    console.error('❌ Erro ao carregar KPIs:', error)
  }
}

// ==================== TELAS RECENTES ====================

async function loadRecentScreens() {
  const tbody = document.getElementById('screensTable')

  try {
    const { data: screens, error } = await apiSelect('screens', {
      userId: currentUser.id,
      select: `
        id, 
        name, 
        status, 
        locations (name),
        playlists (name)
      `,
      order: { field: 'created_at', ascending: false },
      limit: 5
    })

    if (error) throw error

    if (!screens || screens.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #718096;">Nenhuma tela encontrada</td></tr>'
      return
    }

    tbody.innerHTML = screens.map(screen => `
      <tr>
        <td><strong>${escapeHtml(screen.name)}</strong></td>
        <td>${screen.locations?.name ? escapeHtml(screen.locations.name) : '<span style="color: #CBD5E0;">-</span>'}</td>
        <td>
          <span class="status-badge ${screen.status === 'online' ? 'online' : 'offline'}">
            ${screen.status === 'online' ? 'Online' : 'Offline'}
          </span>
        </td>
        <td>${screen.playlists?.name ? escapeHtml(screen.playlists.name) : '<span style="color: #CBD5E0;">-</span>'}</td>
      </tr>
    `).join('')

  } catch (error) {
    console.error('❌ Erro em Telas Recentes:', error)
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #E53E3E;">Erro ao carregar dados</td></tr>'
  }
}

// ==================== CAMPANHAS PRÓXIMAS ====================

async function loadUpcomingCampaigns() {
  const tbody = document.getElementById('campaignsTable')

  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: campaigns, error } = await apiSelect('campaigns', {
      userId: currentUser.id,
      select: `
        id,
        priority,
        start_date,
        end_date,
        advertisers (name),
        medias (name)
      `,
      order: { field: 'start_date', ascending: true },
      limit: 5
    })

    if (error) throw error

    // Filtra apenas campanhas que ainda não terminaram
    const filtered = campaigns?.filter(c => c.end_date >= today) || []

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: #718096;">Nenhuma campanha programada</td></tr>'
      return
    }

    tbody.innerHTML = filtered.map(camp => `
      <tr>
        <td><strong>${camp.medias?.name || 'Campanha sem nome'}</strong></td>
        <td>${camp.advertisers?.name || '-'}</td>
        <td>${formatDate(camp.start_date)}</td>
        <td>
          <span class="priority-badge ${camp.priority}">
            ${translatePriority(camp.priority)}
          </span>
        </td>
      </tr>
    `).join('')

  } catch (error) {
    console.error('❌ Erro em Campanhas:', error)
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #E53E3E;">Erro ao carregar dados</td></tr>'
  }
}

// ==================== STATUS REALTIME ====================

async function loadRealtimeStatus() {
  const container = document.getElementById('statusContainer')

  try {
    const { data: screens, error } = await apiSelect('screens', {
      userId: currentUser.id,
      select: 'id, name, status, last_ping',
      order: { field: 'name', ascending: true }
    })

    if (error) throw error

    if (!screens || screens.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #718096;">Nenhuma tela monitorada</div>'
      return
    }

    container.innerHTML = screens.map(screen => `
      <div class="status-item">
        <div class="status-indicator ${screen.status === 'online' ? 'online' : 'offline'}"></div>
        <div class="status-info">
          <div class="status-name">${escapeHtml(screen.name)}</div>
          <div class="status-time">
            ${screen.last_ping ? 'Visto: ' + new Date(screen.last_ping).toLocaleTimeString() : 'Nunca acessado'}
          </div>
        </div>
      </div>
    `).join('')

  } catch (error) {
    console.error('❌ Erro no Status:', error)
    container.innerHTML = '<div style="text-align: center; color: #E53E3E;">Erro ao atualizar status</div>'
  }
}

// ==================== EVENTOS ====================

function setupEventListeners() {
  const btnRefresh = document.getElementById('btnRefreshStatus')
  if (btnRefresh) {
    btnRefresh.addEventListener('click', async () => {
      setLoading('#btnRefreshStatus', true, 'Atualizando...')
      await loadRealtimeStatus()
      setLoading('#btnRefreshStatus', false, '🔄 Atualizar')
    })
  }
}

// ==================== HELPERS ====================

function updateKPI(elementId, value) {
  const el = document.getElementById(elementId)
  if (el) el.innerText = value
}

function updateElement(elementId, text) {
  const el = document.getElementById(elementId)
  if (el) el.innerText = text
}

function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('pt-BR')
}

function translatePriority(priority) {
  const map = {
    'gold': 'Alta',
    'silver': 'Média',
    'bronze': 'Baixa'
  }
  return map[priority] || priority
}

console.log('✅ Dashboard.js carregado')  