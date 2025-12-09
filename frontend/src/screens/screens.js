/* ==================== SCREENS.JS ====================
   Gerenciamento completo de Telas (CRUD)
   Dependências: config.js, utils.js, api-helpers.js
*/

let currentUser = null
let searchTimeout = null

// ==================== INICIALIZAÇÃO ====================

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1. Autenticação
    currentUser = await checkAuth()
    if (!currentUser) return

    // 2. Sidebar
    await loadSidebar('screens')

    // 3. Setup
    setupEventListeners()

    // 4. Carregar dados
    await Promise.all([
      loadScreens(),
      loadLocationsForSelect(),
      loadPlaylistsForSelect()
    ])

  } catch (error) {
    console.error('❌ Erro na inicialização:', error)
    showNotification('Erro ao carregar página', 'error')
  }
})

// ==================== CARREGAR DADOS AUXILIARES ====================

async function loadLocationsForSelect() {
  try {
    const { data: locations, error } = await apiSelect('locations', {
      userId: currentUser.id,
      select: 'id, name',
      order: { field: 'name', ascending: true }
    })

    if (error) throw error

    const options = locations && locations.length > 0
      ? '<option value="">Selecione um local...</option>' + 
        locations.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join('')
      : '<option value="">Nenhum local cadastrado</option>'

    const createSelect = document.getElementById('screenLocation')
    const editSelect = document.getElementById('editScreenLocation')

    if (createSelect) createSelect.innerHTML = options
    if (editSelect) editSelect.innerHTML = options

  } catch (error) {
    console.error('❌ Erro ao carregar locais:', error)
    showNotification('Erro ao carregar locais', 'error')
  }
}

async function loadPlaylistsForSelect() {
  try {
    const { data: playlists, error } = await apiSelect('playlists', {
      userId: currentUser.id,
      select: 'id, name',
      order: { field: 'name', ascending: true }
    })

    if (error) throw error

    const options = (playlists && playlists.length > 0)
      ? '<option value="">Selecione uma playlist...</option>' + 
        playlists.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
      : '<option value="">Nenhuma playlist criada</option>'

    // Popula o select do modal de EDIÇÃO
    const editSelect = document.getElementById('editScreenPlaylist')
    if (editSelect) editSelect.innerHTML = options

    // Popula o select do modal de CRIAÇÃO (NOVO)
    const newSelect = document.getElementById('newScreenPlaylist')
    if (newSelect) newSelect.innerHTML = options

  } catch (error) {
    console.error('❌ Erro ao carregar playlists:', error)
  }
}

// ==================== CARREGAR TELAS ====================

async function loadScreens(searchTerm = '', statusFilter = 'all') {
  const tbody = document.getElementById('screensList')

  try {
    let result

    if (searchTerm.trim()) {
      result = await apiSearch(
        'screens',
        searchTerm,
        ['name', 'device_id'],
        currentUser.id
      )
    } else {
      result = await apiSelect('screens', {
        userId: currentUser.id,
        select: '*, locations (name), playlists (name)',
        order: { field: 'created_at', ascending: false }
      })
    }

    let { data: screens, error } = result

    if (error) throw error

    // Filtro de status via JavaScript
    if (statusFilter !== 'all') {
      screens = screens?.filter(s => s.status === statusFilter) || []
    }

    // Se buscou e filtrou, fazer busca nos locais também
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      screens = screens?.filter(screen => {
        const locationName = screen.locations?.name ? screen.locations.name.toLowerCase() : ''
        return locationName.includes(term)
      }) || screens
    }

    renderScreensTable(screens)

  } catch (error) {
    console.error('❌ Erro ao carregar telas:', error)
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #E53E3E; padding: 20px;">Erro ao carregar dados</td></tr>'
  }
}

function renderScreensTable(screens) {
  const tbody = document.getElementById('screensList')

  if (!screens || screens.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #718096;">Nenhuma tela encontrada</td></tr>'
    return
  }

  tbody.innerHTML = screens.map(screen => `
    <tr>
      <td><span class="status-badge ${screen.status === 'online' ? 'online' : 'offline'}">${screen.status === 'online' ? 'Online' : 'Offline'}</span></td>
      <td>
        <strong>${escapeHtml(screen.name)}</strong>
        <div style="font-size: 11px; color: #A0AEC0;">${screen.orientation === 'landscape' ? 'Horizontal' : 'Vertical'}</div>
      </td>
      <td>
        ${screen.locations?.name 
          ? `<span style="color:#2D3748; font-weight:500;">📍 ${escapeHtml(screen.locations.name)}</span>` 
          : '<span style="color:#CBD5E0;">Sem local</span>'}
      </td>
      <td><span class="device-id-tag">${screen.device_id || 'PENDENTE'}</span></td>
      <td>${screen.playlists?.name || '<span style="color: #CBD5E0;">Nenhuma</span>'}</td>
      <td style="text-align: right;">
        <button class="btn-icon" onclick="openEditModal('${screen.id}')" title="Editar Tela">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon delete" onclick="deleteScreen('${screen.id}')" title="Excluir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    </tr>
  `).join('')
}

// ==================== CRIAR TELA (COM PLAYLIST) ====================

async function handleCreateScreen(e) {
  e.preventDefault()

  const device_id = document.getElementById('screenDeviceId').value.trim().toUpperCase()
  const name = document.getElementById('screenName').value
  const location_id = document.getElementById('screenLocation').value
  const active_playlist_id = document.getElementById('newScreenPlaylist').value || null
  const orientation = document.getElementById('screenOrientation').value

  if (!device_id) {
    showNotification('Código de pareamento é obrigatório', 'warning')
    return
  }

  if (!location_id) {
    showNotification('Localização é obrigatória', 'warning')
    return
  }

  setLoading('#formNewScreen button[type="submit"]', true)

  try {
    // Verifica se ID já existe
    const { data: existing } = await apiSelect('screens', {
      eq: { device_id: device_id }
    })

    if (existing && existing.length > 0) {
      throw new Error('Este código de tela já está cadastrado!')
    }

    const { data, error } = await apiInsert('screens', {
      name,
      location_id,
      orientation,
      device_id,
      active_playlist_id, // Salva a playlist escolhida
      status: 'offline'
    }, currentUser.id)

    if (error) throw error

    document.getElementById('modalNewScreen').classList.remove('active')
    document.getElementById('formNewScreen').reset()
    loadScreens()
    showNotification('Tela vinculada e salva com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification(error.message || 'Erro ao criar tela', 'error')
  } finally {
    setLoading('#formNewScreen button[type="submit"]', false, 'Vincular Tela')
  }
}

// ==================== EDITAR TELA (SALVAR CONFIGURAÇÕES) ====================

async function openEditModal(screenId) {
  try {
    const { data: screens, error } = await apiSelect('screens', {
      eq: { id: screenId }
    })

    if (error || !screens || screens.length === 0) throw new Error('Tela não encontrada')

    const screen = screens[0]

    document.getElementById('editScreenId').value = screen.id
    document.getElementById('editScreenDeviceId').value = screen.device_id || ''
    document.getElementById('editScreenName').value = screen.name
    document.getElementById('editScreenOrientation').value = screen.orientation
    document.getElementById('editScreenLocation').value = screen.location_id || ''
    document.getElementById('editScreenPlaylist').value = screen.active_playlist_id || ''

    document.getElementById('modalEditScreen').classList.add('active')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao carregar tela', 'error')
  }
}

async function handleEditScreen(e) {
  e.preventDefault()

  const id = document.getElementById('editScreenId').value
  const name = document.getElementById('editScreenName').value
  const location_id = document.getElementById('editScreenLocation').value
  const orientation = document.getElementById('editScreenOrientation').value
  const active_playlist_id = document.getElementById('editScreenPlaylist').value || null

  if (!location_id) {
    showNotification('Localização é obrigatória', 'warning')
    return
  }

  setLoading('#formEditScreen button[type="submit"]', true)

  try {
    const { error } = await apiUpdate('screens', id, {
      name,
      location_id,
      orientation,
      active_playlist_id
    })

    if (error) throw error

    document.getElementById('modalEditScreen').classList.remove('active')
    loadScreens()
    showNotification('Configurações da tela salvas!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao atualizar tela', 'error')
  } finally {
    setLoading('#formEditScreen button[type="submit"]', false, 'Salvar Alterações')
  }
}

// ==================== DELETAR TELA ====================

async function deleteScreen(id) {
  if (!confirm('Tem certeza que deseja excluir esta tela? Esta ação é irreversível e o player será desconectado.')) return

  try {
    const { error } = await apiDelete('screens', id)

    if (error) throw error

    loadScreens()
    showNotification('Tela excluída com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao excluir tela', 'error')
  }
}

// ==================== EVENTOS ====================

function setupEventListeners() {
  // Modals
  setupModalHandlers('modalNewScreen', 'btnOpenModal', 'btnCloseModal', 'btnCancelModal')
  setupModalHandlers('modalEditScreen', null, 'btnCloseEditModal', 'btnCancelEditModal')

  // Forms
  document.getElementById('formNewScreen').addEventListener('submit', handleCreateScreen)
  document.getElementById('formEditScreen').addEventListener('submit', handleEditScreen)

  // Filtros
  const searchInput = document.getElementById('searchInput')
  const statusFilter = document.getElementById('statusFilter')

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      loadScreens(e.target.value, statusFilter.value)
    }, 500)
  })

  statusFilter.addEventListener('change', (e) => {
    loadScreens(searchInput.value, e.target.value)
  })
}

console.log('✅ Screens.js carregado')