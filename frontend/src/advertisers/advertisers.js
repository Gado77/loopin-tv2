/* ==================== ADVERTISERS.JS ====================
   Gerenciamento completo de Anunciantes (CRUD)
*/

let currentUser = null
let searchTimeout = null

document.addEventListener('DOMContentLoaded', async () => {
  try {
    currentUser = await checkAuth()
    if (!currentUser) return

    await loadSidebar('advertisers')
    setupEventListeners()
    await loadAdvertisers()

  } catch (error) {
    console.error('❌ Erro na inicialização:', error)
    showNotification('Erro ao carregar página', 'error')
  }
})

async function loadAdvertisers(searchTerm = '') {
  const tbody = document.getElementById('advertisersList')

  try {
    let result

    if (searchTerm.trim()) {
      result = await apiSearch('advertisers', searchTerm, ['name', 'contact_name', 'contact_email'], currentUser.id)
    } else {
      result = await apiSelect('advertisers', {
        userId: currentUser.id,
        select: '*',
        order: { field: 'created_at', ascending: false }
      })
    }

    const { data: advertisers, error } = result

    if (error) throw error

    if (!advertisers || advertisers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #718096;">Nenhum anunciante encontrado</td></tr>'
      return
    }

    renderAdvertisersTable(advertisers)

  } catch (error) {
    console.error('❌ Erro ao carregar anunciantes:', error)
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #E53E3E; padding: 20px;">Erro ao carregar dados</td></tr>'
  }
}

function renderAdvertisersTable(advertisers) {
  const tbody = document.getElementById('advertisersList')

  tbody.innerHTML = advertisers.map(adv => `
    <tr>
      <td><strong>${escapeHtml(adv.name)}</strong></td>
      <td>${adv.category ? escapeHtml(adv.category) : '<span style="color: #CBD5E0;">-</span>'}</td>
      <td>${adv.contact_name ? escapeHtml(adv.contact_name) : '<span style="color: #CBD5E0;">-</span>'}</td>
      <td>${adv.contact_email ? escapeHtml(adv.contact_email) : '<span style="color: #CBD5E0;">-</span>'}</td>
      <td>${adv.contact_phone ? escapeHtml(adv.contact_phone) : '<span style="color: #CBD5E0;">-</span>'}</td>
      <td style="text-align: right;">
        <button class="btn-icon" onclick="openEditModal('${adv.id}')" title="Editar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button class="btn-icon delete" onclick="deleteAdvertiser('${adv.id}')" title="Excluir">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>
    </tr>
  `).join('')
}

async function handleCreateAdvertiser(e) {
  e.preventDefault()

  const name = document.getElementById('advertiserName').value
  const category = document.getElementById('advertiserCategory').value
  const contact_name = document.getElementById('advertiserContactName').value
  const contact_email = document.getElementById('advertiserContactEmail').value
  const contact_phone = document.getElementById('advertiserContactPhone').value

  setLoading('#formNewAdvertiser button[type="submit"]', true)

  try {
    const { error } = await apiInsert('advertisers', {
      name,
      category,
      contact_name,
      contact_email,
      contact_phone
    }, currentUser.id)

    if (error) throw error

    document.getElementById('modalNewAdvertiser').classList.remove('active')
    document.getElementById('formNewAdvertiser').reset()
    loadAdvertisers()
    showNotification('Anunciante criado com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao criar anunciante', 'error')
  } finally {
    setLoading('#formNewAdvertiser button[type="submit"]', false, 'Salvar Anunciante')
  }
}

async function openEditModal(advertiserId) {
  try {
    const { data: advertisers, error } = await apiSelect('advertisers', { eq: { id: advertiserId } })

    if (error || !advertisers || advertisers.length === 0) throw new Error('Anunciante não encontrado')

    const adv = advertisers[0]

    document.getElementById('editAdvertiserId').value = adv.id
    document.getElementById('editAdvertiserName').value = adv.name
    document.getElementById('editAdvertiserCategory').value = adv.category || ''
    document.getElementById('editAdvertiserContactName').value = adv.contact_name || ''
    document.getElementById('editAdvertiserContactEmail').value = adv.contact_email || ''
    document.getElementById('editAdvertiserContactPhone').value = adv.contact_phone || ''

    document.getElementById('modalEditAdvertiser').classList.add('active')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao carregar anunciante', 'error')
  }
}

async function handleEditAdvertiser(e) {
  e.preventDefault()

  const id = document.getElementById('editAdvertiserId').value
  const name = document.getElementById('editAdvertiserName').value
  const category = document.getElementById('editAdvertiserCategory').value
  const contact_name = document.getElementById('editAdvertiserContactName').value
  const contact_email = document.getElementById('editAdvertiserContactEmail').value
  const contact_phone = document.getElementById('editAdvertiserContactPhone').value

  setLoading('#formEditAdvertiser button[type="submit"]', true)

  try {
    const { error } = await apiUpdate('advertisers', id, {
      name,
      category,
      contact_name,
      contact_email,
      contact_phone
    })

    if (error) throw error

    document.getElementById('modalEditAdvertiser').classList.remove('active')
    loadAdvertisers()
    showNotification('Anunciante atualizado com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao atualizar anunciante', 'error')
  } finally {
    setLoading('#formEditAdvertiser button[type="submit"]', false, 'Salvar Alterações')
  }
}

async function deleteAdvertiser(id) {
  if (!confirm('Tem certeza que deseja excluir este anunciante?')) return

  try {
    const { error } = await apiDelete('advertisers', id)

    if (error) throw error

    loadAdvertisers()
    showNotification('Anunciante excluído com sucesso!', 'success')

  } catch (error) {
    console.error('❌ Erro:', error)
    showNotification('Erro ao excluir anunciante', 'error')
  }
}

function setupEventListeners() {
  setupModalHandlers('modalNewAdvertiser', 'btnOpenModal', 'btnCloseModal', 'btnCancelModal')
  setupModalHandlers('modalEditAdvertiser', null, 'btnCloseEditModal', 'btnCancelEditModal')

  document.getElementById('formNewAdvertiser').addEventListener('submit', handleCreateAdvertiser)
  document.getElementById('formEditAdvertiser').addEventListener('submit', handleEditAdvertiser)

  const searchInput = document.getElementById('searchInput')

  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      loadAdvertisers(e.target.value)
    }, 500)
  })
}

console.log('✅ Advertisers.js carregado')